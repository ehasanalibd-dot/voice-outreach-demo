import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import { getAgent, Persona } from './agentService';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const DEFAULT_MODEL = 'google/gemini-2.5-flash';

interface ScriptInput {
  contactName: string;
  contactRole: string;
  contactCompany: string;
  campaignName: string;
  campaignAudience: string;
}

/**
 * Generate a personalized voice call script.
 * Pulls the agent prompt from DB and appends persona-specific tone instructions.
 */
export async function generateScript(
  input: ScriptInput,
  voiceStyle: string,
  persona?: Persona | null
): Promise<string> {
  // Fetch agent config from DB
  const agent = await getAgent('script_generator');
  const systemPrompt = agent?.system_prompt || defaultSystemPrompt();
  const temperature = agent?.temperature ?? 0.7;
  const maxTokens = agent?.max_tokens ?? 300;
  if (!agent) {
    console.warn('[ScriptGenerator] Agent not found in DB — using hardcoded prompt');
  }

  // Build the user prompt with persona tone instructions baked in
  const userPrompt = buildUserPrompt(input, voiceStyle, persona);

  if (!OPENROUTER_API_KEY) {
    console.log('[ScriptGenerator] No API key — using template script');
    return templateScript(input);
  }

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: agent?.model || DEFAULT_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature,
        max_tokens: maxTokens,
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

    const script = response.data.choices?.[0]?.message?.content?.trim();
    console.log(`[ScriptGenerator] Generated ${script?.length || 0}-char script (persona: ${persona?.slug || 'none'})`);
    return script || templateScript(input);
  } catch (error: any) {
    console.error('[ScriptGenerator] Error:', error.message);
    return templateScript(input);
  }
}

function buildUserPrompt(input: ScriptInput, voiceStyle: string, persona?: Persona | null): string {
  let prompt = `Contact: ${input.contactName}, ${input.contactRole} at ${input.contactCompany}
Campaign: ${input.campaignName} — targeting ${input.campaignAudience}
Voice style: ${voiceStyle}`;

  if (persona) {
    prompt += `\nPersona tone: ${persona.tone}
Persona instructions: ${persona.system_prompt_addition}`;
  }

  return prompt;
}

function defaultSystemPrompt(): string {
  return `You are a professional voice outreach script writer. Write a short, warm, personalized phone call script.
Greet the person by name, reference their role/company, be concise (~75 words), end with a call-to-action.`;
}

function templateScript(input: ScriptInput): string {
  return `Hi ${input.contactName}, this is a call from the ${input.campaignName} team. We noticed you as a valued ${input.campaignAudience} at ${input.contactCompany}. We'd love to connect and discuss how we can support your goals as ${input.contactRole}. Let's schedule a brief follow-up — looking forward to speaking with you soon. Thank you!`;
}
