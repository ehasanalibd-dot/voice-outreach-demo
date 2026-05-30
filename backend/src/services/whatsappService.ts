import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER || '';

interface WhatsAppResult {
  sid: string | null;
  status: 'sent' | 'failed';
  mock: boolean;
}

/**
 * Send a WhatsApp voice message with the AI-generated audio
 */
export async function sendWhatsAppVoiceMessage(
  toPhone: string,
  audioFilePath: string,
  contactName: string,
  company: string
): Promise<WhatsAppResult> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_NUMBER) {
    console.log('[WhatsApp] No Twilio credentials — mock mode');
    return { sid: null, status: 'sent', mock: true };
  }

  try {
    const from = `whatsapp:${TWILIO_WHATSAPP_NUMBER}`;
    const to = `whatsapp:${toPhone}`;

    // First send a text intro message
    const introMessage = `Hi ${contactName || 'there'}! 👋\n\nI received your inquiry and wanted to reach out personally. Here's a quick voice message for you from our team.`;

    console.log(`[WhatsApp] Sending intro to ${to} from ${from}`);
    
    const introResponse = await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      new URLSearchParams({
        From: from,
        To: to,
        Body: introMessage,
      }),
      {
        auth: {
          username: TWILIO_ACCOUNT_SID,
          password: TWILIO_AUTH_TOKEN,
        },
      }
    );

    console.log(`[WhatsApp] Intro message sent: SID=${introResponse.data.sid}`);

    // Now send the audio file as a media message
    // The audio is already saved to disk by ElevenLabs, we need to serve it via URL
    // For WhatsApp, we need to upload or provide a URL Twilio can access
    const audioUrl = getAudioUrl(audioFilePath);
    
    if (audioUrl) {
      console.log(`[WhatsApp] Sending voice audio from ${audioUrl}`);
      
      const audioResponse = await axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
        new URLSearchParams({
          From: from,
          To: to,
          MediaUrl: audioUrl,
        }),
        {
          auth: {
            username: TWILIO_ACCOUNT_SID,
            password: TWILIO_AUTH_TOKEN,
          },
        }
      );

      console.log(`[WhatsApp] Voice audio sent: SID=${audioResponse.data.sid}`);
    } else {
      console.warn('[WhatsApp] Could not get audio URL — only intro text sent');
    }

    return { sid: introResponse.data.sid, status: 'sent', mock: false };
  } catch (error: any) {
    console.error('[WhatsApp] Twilio error:', error.response?.data || error.message);
    return { sid: null, status: 'failed', mock: false };
  }
}

/**
 * Convert local audio file path to a publicly accessible URL
 * The backend serves /audio/* files, so we construct the URL
 */
function getAudioUrl(filePath: string): string | null {
  try {
    const filename = path.basename(filePath);
    const baseUrl = process.env.APP_BASE_URL || 'http://localhost:4001';
    return `${baseUrl}/audio/${filename}`;
  } catch {
    return null;
  }
}
