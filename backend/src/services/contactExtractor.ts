import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const MODEL = 'google/gemini-2.5-flash';

interface ExtractedContact {
  name: string | null;
  role: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
}

export async function extractContact(emailBody: string, emailSubject: string): Promise<ExtractedContact> {
  if (!OPENROUTER_API_KEY) {
    console.log('[ContactExtractor] No API key — using mock extraction');
    return mockExtract(emailBody, emailSubject);
  }

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: `You are a contact extraction assistant. Extract the following fields from the email as a JSON object only (no markdown, no backticks):
{
  "name": "Full name of the person",
  "role": "Their job title or role",
  "company": "Their company name",
  "phone": "Phone number if present",
  "email": "Email address if present"
}
If a field is not found, use null. Only output valid JSON.`
          },
          {
            role: 'user',
            content: `Subject: ${emailSubject}\n\n${emailBody}`
          }
        ],
        temperature: 0.1,
        max_tokens: 500
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

    const content = response.data.choices[0].message.content.trim();
    // Parse JSON from response - strip markdown code blocks if present
    const jsonStr = content.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    const contact: ExtractedContact = JSON.parse(jsonStr);
    return contact;
  } catch (error: any) {
    console.error('[ContactExtractor] Error:', error.message);
    return mockExtract(emailBody, emailSubject);
  }
}

function mockExtract(body: string, subject: string): ExtractedContact {
  // Simple regex-based fallback extraction
  const phoneMatch = body.match(/(\+?[\d\s\-()]{7,})/);
  const emailMatch = body.match(/([\w.-]+@[\w.-]+\.\w+)/);
  const nameMatch = subject.match(/^(?:From:?\s*)?([A-Z][a-z]+\s[A-Z][a-z]+)/) || body.match(/^([A-Z][a-z]+\s[A-Z][a-z]+)/m);

  return {
    name: nameMatch ? nameMatch[1].trim() : 'Unknown',
    role: 'Unknown',
    company: 'Unknown',
    phone: phoneMatch ? phoneMatch[1].trim() : null,
    email: emailMatch ? emailMatch[1].trim() : null
  };
}
