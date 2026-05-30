import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import { getAgent, Persona } from './agentService';
import db from '../database';
import { v4 as uuid } from 'uuid';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const DEFAULT_MODEL = 'google/gemini-2.5-flash';

interface ReplyInput {
  contactName: string;
  contactRole: string;
  contactCompany: string;
  inboundMessage: string;      // What the contact said (empty for outbound-only)
  channel: 'whatsapp' | 'email';
  campaignName: string;
}

/**
 * Generate a contextual reply using the reply_agent + matched persona.
 * Persists the generated reply to the `replies` table for audit trail.
 */
export async function generateReply(
  input: ReplyInput,
  persona: Persona,
  options: {
    callId?: string;
    contactId?: string;
    persist?: boolean;
  } = {}
): Promise<string> {
  const agent = await getAgent('reply_agent');
  if (!agent) {
    console.warn('[ReplyAgent] Agent not found — using template reply');
    return templateReply(input);
  }
  if (!OPENROUTER_API_KEY) {
    return templateReply(input);
  }

  const userPrompt = [
    `Contact: ${input.contactName}, ${input.contactRole} at ${input.contactCompany}`,
    `Campaign: ${input.campaignName}`,
    `Channel: ${input.channel}`,
    `Persona tone: ${persona.tone}`,
    `Persona instructions: ${persona.system_prompt_addition}`,
    input.inboundMessage ? `Inbound message from contact: "${input.inboundMessage}"` : 'This is an outbound follow-up (no inbound message).',
  ].join('\n');

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: agent.model || DEFAULT_MODEL,
        messages: [
          { role: 'system', content: agent.system_prompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: agent.temperature ?? 0.7,
        max_tokens: agent.max_tokens ?? 400,
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://voice-outreach-demo.app',
          'X-Title': 'Voice Outreach Demo',
        },
      }
    );

    const content = response.data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error('Empty response');
    console.log(`[ReplyAgent] Generated ${content.length}-char reply (persona: ${persona.slug})`);

    // Persist to DB if requested
    if (options.persist && options.contactId) {
      await db.run(
        `INSERT INTO replies (id, call_id, contact_id, agent_id, persona_id, direction, channel, content)
         VALUES ($1,$2,$3,$4,$5,'outbound',$6,$7)`,
        [uuid(), options.callId || null, options.contactId, agent.id, persona.id, input.channel, content]
      );
    }
    return content;
  } catch (error: any) {
    console.error('[ReplyAgent] Error:', error.message);
    return templateReply(input);
  }
}

function templateReply(input: ReplyInput): string {
  if (input.inboundMessage) {
    return `Hi ${input.contactName}, thanks for reaching out! I'd love to connect about the ${input.campaignName} initiative. Would a 15-minute call this week work for you?`;
  }
  return `Hi ${input.contactName}, following up on our outreach about ${input.campaignName}. As ${input.contactRole} at ${input.contactCompany}, I think there's a great fit — would you be open to a quick call?`;
}
