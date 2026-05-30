import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import { getAgent } from './agentService';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const DEFAULT_MODEL = 'google/gemini-2.5-flash';

interface ExtractedContact {
  name: string | null;
  role: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  seniority?: string | null;
}

/**
 * Extract contact details from email body + subject.
 * Pulls the agent prompt from DB; falls back to regex extraction if AI fails.
 */
export async function extractContact(emailBody: string, emailSubject: string): Promise<ExtractedContact> {
  // Fetch agent config from DB
  const agent = await getAgent('contact_extractor');
  if (!agent) {
    console.warn('[ContactExtractor] Agent not found in DB — using regex fallback');
    return mockExtract(emailBody, emailSubject);
  }

  if (!OPENROUTER_API_KEY) {
    console.log('[ContactExtractor] No API key — using regex fallback');
    return mockExtract(emailBody, emailSubject);
  }

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: agent.model || DEFAULT_MODEL,
        messages: [
          { role: 'system', content: agent.system_prompt },
          { role: 'user', content: `Subject: ${emailSubject}\n\n${emailBody}` }
        ],
        temperature: agent.temperature ?? 0.1,
        max_tokens: agent.max_tokens ?? 500,
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
    if (!content) throw new Error('Empty response from LLM');
    const jsonStr = content.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    const contact: ExtractedContact = JSON.parse(jsonStr);
    console.log(`[ContactExtractor] Extracted: ${contact.name}, seniority=${contact.seniority}`);
    return contact;
  } catch (error: any) {
    console.error('[ContactExtractor] Error:', error.message);
    return mockExtract(emailBody, emailSubject);
  }
}

function mockExtract(body: string, subject: string): ExtractedContact {
  const phoneMatch = body.match(/(\+?[\d\s\-()]{7,})/);
  const emailMatch = body.match(/([\w.-]+@[\w.-]+\.\w+)/);
  const nameMatch = subject.match(/^(?:From:?\s*)?([A-Z][a-z]+\s[A-Z][a-z]+)/) || body.match(/^([A-Z][a-z]+\s[A-Z][a-z]+)/m);
  return {
    name: nameMatch ? nameMatch[1].trim() : 'Unknown',
    role: 'Unknown',
    company: 'Unknown',
    phone: phoneMatch ? phoneMatch[1].trim() : null,
    email: emailMatch ? emailMatch[1].trim() : null,
    seniority: 'unknown',
  };
}
