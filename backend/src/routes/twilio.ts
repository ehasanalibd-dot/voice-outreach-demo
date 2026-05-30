import { Router, Request, Response } from 'express';
import db from '../database';
import { v4 as uuid } from 'uuid';
import { generateReply } from '../services/replyAgent';
import { matchPersona, getPersona } from '../services/agentService';
import { sendWhatsAppText } from '../services/whatsappService';

const router = Router();

// POST /api/webhooks/twilio — Handle inbound WhatsApp messages
router.post('/', async (req: Request, res: Response) => {
  try {
    const { From, Body, MessageSid, ProfileName } = req.body;
    
    if (!From || !Body) {
      console.log('[Twilio Webhook] Missing From or Body — ignoring');
      return res.type('text/xml').send('<Response></Response>');
    }

    // Normalize phone number (whatsapp:+1234567890 → +1234567890)
    const phone = From.replace('whatsapp:', '');
    console.log(`[Twilio Webhook] Inbound from ${ProfileName || 'unknown'} (${phone}): ${Body}`);

    // Look up contact by phone
    let contact = await db.queryOne(
      'SELECT * FROM contacts WHERE phone = $1 ORDER BY extracted_at DESC LIMIT 1',
      [phone]
    );

    // If no contact found, try matching by name
    if (!contact && ProfileName) {
      contact = await db.queryOne(
        "SELECT * FROM contacts WHERE LOWER(name) = LOWER($1) ORDER BY extracted_at DESC LIMIT 1",
        [ProfileName]
      );
    }

    // Save inbound message to replies table
    const inboundId = uuid();
    if (contact) {
      // Find latest call for this contact to link to
      const latestCall = await db.queryOne(
        "SELECT * FROM calls WHERE contact_id = $1 ORDER BY started_at DESC LIMIT 1",
        [contact.id]
      );

      await db.run(
        `INSERT INTO replies (id, call_id, contact_id, direction, channel, content, delivered, created_at)
         VALUES ($1, $2, $3, 'inbound', 'whatsapp', $4, TRUE, NOW())`,
        [inboundId, latestCall?.id || null, contact.id, Body]
      );

      // Get persona for this contact
      let persona = await matchPersona(contact.role);

      // Check if the campaign has a persona override
      if (latestCall) {
        const campaign = await db.queryOne('SELECT * FROM campaigns WHERE id = $1', [latestCall.campaign_id]);
        if (campaign?.persona_override && campaign.persona_override !== 'auto') {
          const overridePersona = await getPersona(campaign.persona_override);
          if (overridePersona) persona = overridePersona;
        }
      }

      // Generate AI reply
      console.log(`[Twilio Webhook] Generating reply for ${contact.name} (persona: ${persona.slug})`);
      const replyText = await generateReply(
        {
          contactName: contact.name || ProfileName || 'there',
          contactRole: contact.role || 'contact',
          contactCompany: contact.company || '',
          inboundMessage: Body,
          channel: 'whatsapp',
          campaignName: 'Voice Outreach',
        },
        persona,
        { contactId: contact.id, callId: latestCall?.id, persist: true }
      );

      // Send reply via WhatsApp
      await sendWhatsAppText(phone, replyText);
      console.log(`[Twilio Webhook] Reply sent to ${phone}`);

      // Return TwiML acknowledgment
      res.type('text/xml').send(`<Response><Message>${replyText.replace(/</g, '&lt;')}</Message></Response>`);
    } else {
      // No matching contact — save as anonymous
      await db.run(
        `INSERT INTO replies (id, direction, channel, content, delivered, created_at)
         VALUES ($1, 'inbound', 'whatsapp', $2, TRUE, NOW())`,
        [inboundId, `[Unknown: ${phone}] ${Body}`]
      );
      console.log(`[Twilio Webhook] No matching contact for ${phone} — message logged`);
      res.type('text/xml').send('<Response><Message>Thanks for reaching out! We will get back to you soon.</Message></Response>');
    }
  } catch (err: any) {
    console.error('[Twilio Webhook] Error:', err.message);
    res.type('text/xml').send('<Response><Message>Sorry, something went wrong. Please try again later.</Message></Response>');
  }
});

export default router;
