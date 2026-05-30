import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const MODEL = 'google/gemini-2.5-flash';

interface ScriptInput {
  contactName: string;
  contactRole: string;
  contactCompany: string;
  campaignName: string;
  campaignAudience: string;
}

export async function generateScript(input: ScriptInput, voiceStyle: string): Promise<string> {
  if (!OPENROUTER_API_KEY) {
    console.log('[ScriptGenerator] No API key — using template script');
    return templateScript(input);
  }

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: `You are a professional voice outreach script writer. Write a short, warm, personalized phone call script.
The script should:
- Greet the person by name
- Mention their role/company to show personalization
- Reference the campaign context
- Be ${voiceStyle} in tone
- Be concise — max 30 seconds of speaking time (~75 words)
- End with a clear next step or call-to-action
Output ONLY the script text, no headers or labels.`
          },
          {
            role: 'user',
            content: `Contact: ${input.contactName}, ${input.contactRole} at ${input.contactCompany}
Campaign: ${input.campaignName} — targeting ${input.campaignAudience}
Tone: ${voiceStyle}`
          }
        ],
        temperature: 0.7,
        max_tokens: 300
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://voice-outreach-demo.app',
          'X-Title': 'Voice Outreach Demo'
        }
      }
    );

    return response.data.choices[0].message.content.trim();
  } catch (error: any) {
    console.error('[ScriptGenerator] Error:', error.message);
    return templateScript(input);
  }
}

function templateScript(input: ScriptInput): string {
  return `Hi ${input.contactName}, this is a call from the ${input.campaignName} team. We noticed you as a valued ${input.campaignAudience} at ${input.contactCompany}. We'd love to connect and discuss how we can support your goals as ${input.contactRole}. Let's schedule a brief follow-up — looking forward to speaking with you soon. Thank you!`;
}
