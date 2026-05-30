import { v4 as uuid } from 'uuid';
import * as path from 'path';
import db from '../database';
import { extractContact } from './contactExtractor';
import { generateScript } from './scriptGenerator';
import { makeCall, generateAudio } from './voiceCall';
import { sendWhatsAppVoiceMessage } from './whatsappService';
import { sendPostCallSummary } from './resendService';
import { matchPersona, getPersona } from './agentService';
import { ParsedEmail } from './emailListener';

// Broadcast function — set by index.ts
let broadcastEvent: (event: any) => void = () => {};
export function setBroadcast(ev: (event: any) => void) {
  broadcastEvent = ev;
}

function emit(type: string, data: any) {
  broadcastEvent({ type, data, timestamp: new Date().toISOString() });
}

// Main orchestrator pipeline: email → extract → script → call
export async function processEmail(campaignId: string, emailData: ParsedEmail): Promise<void> {
  const emailId = uuid();
  
  try {
    // 1. Save email
    await db.run(`
      INSERT INTO emails (id, campaign_id, from_name, from_email, subject, body, raw, received_at, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'new')
    `, [emailId, campaignId, emailData.fromName, emailData.fromEmail, emailData.subject, emailData.body, emailData.raw, emailData.date]);

    const campaign = await db.queryOne('SELECT * FROM campaigns WHERE id = $1', [campaignId]);
    
    emit('email_received', { emailId, from: emailData.fromName || emailData.fromEmail, subject: emailData.subject });
    console.log(`[Orchestrator] Email saved: ${emailId} from ${emailData.fromEmail}`);

    // 2. Extract contact
    const contact = await extractContact(emailData.body, emailData.subject);
    const contactId = uuid();

    await db.run(`
      INSERT INTO contacts (id, email_id, name, role, company, phone, email)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [contactId, emailId, contact.name, contact.role, contact.company, contact.phone, contact.email]);

    await db.run(`UPDATE emails SET status = 'processed' WHERE id = $1`, [emailId]);

    emit('contact_extracted', { contactId, emailId, ...contact });
    console.log(`[Orchestrator] Contact extracted: ${contact.name}, ${contact.phone}, seniority=${contact.seniority}`);

    // Phase 4: Check campaign persona override before auto-matching
    let persona;
    let personaSource = 'auto-match';
    if (campaign?.persona_override && campaign.persona_override !== 'auto') {
      const overridePersona = await getPersona(campaign.persona_override);
      if (overridePersona) {
        persona = overridePersona;
        personaSource = `campaign-override (${campaign.persona_override})`;
      }
    }
    if (!persona) {
      persona = await matchPersona(contact.role);
      personaSource = `auto-match (${contact.role})`;
    }
    console.log(`[Orchestrator] Persona: ${persona.name} [source: ${personaSource}]`);

    // Check if we have a phone number — if not, mark as failed
    if (!contact.phone) {
      console.log('[Orchestrator] No phone number found — cannot call');
      await db.run(`UPDATE emails SET status = 'failed' WHERE id = $1`, [emailId]);
      emit('call_failed', { emailId, reason: 'No phone number found' });
      return;
    }

    // 3. Generate script (with persona-aware tone + version tracking)
    const scriptContent = await generateScript(
      {
        contactName: contact.name || emailData.fromName,
        contactRole: contact.role || 'contact',
        contactCompany: contact.company || '',
        campaignName: campaign?.name || 'Demo',
        campaignAudience: campaign?.audience || 'prospects'
      },
      campaign?.voice_style || 'professional',
      persona
    );

    const scriptId = uuid();
    
    // Phase 3: Track A/B group (alternating based on agent version)
    // Get the script generator agent to find current version
    const scriptAgent = await db.queryOne("SELECT * FROM agents WHERE slug = 'script_generator'");
    const abGroup = scriptAgent && scriptAgent.version % 2 === 1 ? 'A' : 'B';
    
    // Find active prompt version for this agent
    const activeVersion = await db.queryOne(
      "SELECT id FROM prompt_versions WHERE agent_slug = 'script_generator' AND is_active = TRUE ORDER BY version DESC LIMIT 1"
    );

    await db.run(`
      INSERT INTO scripts (id, contact_id, campaign_id, content, agent_id, persona_id, prompt_version_id, ab_group)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [scriptId, contactId, campaignId, scriptContent, 'script_generator', persona.id, activeVersion?.id || null, abGroup]);

    console.log(`[Orchestrator] Script generated (${scriptContent.length} chars, persona: ${persona.slug}, version: ${activeVersion?.id?.substring(0, 8) || 'n/a'}, A/B: ${abGroup})`);

    // 3.5. Generate TTS audio and send via WhatsApp
    const callId = uuid();
    await db.run(`
      INSERT INTO calls (id, contact_id, script_id, campaign_id, status, started_at)
      VALUES ($1, $2, $3, $4, 'pending', NOW())
    `, [callId, contactId, scriptId, campaignId]);

    const callContactName = contact.name;
    const callEmailId = emailId;
    const callScriptContent = scriptContent;
    const callCampaignId = campaignId;

    try {
      // Generate audio first
      console.log('[Orchestrator] Generating AI voice audio...');
      const audioUrl = await generateAudio(scriptContent, campaign?.voice_style || 'professional');
      
      if (!audioUrl) {
        throw new Error('Failed to generate audio');
      }

      // Extract filename from URL to get local path
      const filename = audioUrl.split('/').pop();
      const audioFilePath = path.join(__dirname, '..', '..', 'audio', filename || '');

      console.log(`[Orchestrator] Sending WhatsApp voice message to ${contact.phone}...`);
      await db.run(`UPDATE calls SET status = 'calling' WHERE id = $1`, [callId]);
      
      const whatsappResult = await sendWhatsAppVoiceMessage(
        contact.phone,
        audioFilePath,
        contact.name || 'there',
        contact.company || ''
      );

      if (whatsappResult.status === 'sent') {
        console.log(`[Orchestrator] WhatsApp message sent successfully`);
        
        // Mark as completed
        await db.run(`UPDATE calls SET status = 'completed', twilio_sid = $1, ended_at = NOW() WHERE id = $2`, [whatsappResult.sid, callId]);
        await db.run(`UPDATE emails SET status = 'called' WHERE id = $1`, [emailId]);
        
        // Save transcript
        const transcriptId = uuid();
        await db.run(`
          INSERT INTO transcripts (id, call_id, content, summary)
          VALUES ($1, $2, $3, $4)
        `, [transcriptId, callId, scriptContent, `WhatsApp voice message sent to ${contact.name}.`]);
        
        emit('call_completed', { callId, contact: contact.name, method: 'whatsapp', persona: persona.name, persona_source: personaSource });

        // Send post-call summary email
        if (emailData.fromEmail) {
          sendPostCallSummary(
            emailData.fromEmail,
            callContactName || 'Contact',
            { role: contact.role || 'contact', company: contact.company || '' },
            callScriptContent,
            campaign?.name || 'Outreach'
          ).catch(err => console.error('[Resend] Post-call summary error:', err.message));
        }
      } else {
        throw new Error('WhatsApp message failed to send');
      }
    } catch (error: any) {
      console.error('[Orchestrator] WhatsApp/Audio error:', error.message);
      await db.run(`UPDATE calls SET status = 'failed', ended_at = NOW() WHERE id = $1`, [callId]);
      emit('call_failed', { emailId, callId, reason: error.message });
    }

  } catch (error: any) {
    console.error('[Orchestrator] Pipeline error:', error.message);
    await db.run(`UPDATE emails SET status = 'failed' WHERE id = $1`, [emailId]).catch(() => {});
    emit('call_failed', { emailId, reason: error.message });
  }
}
