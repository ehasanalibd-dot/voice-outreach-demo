import * as fs from "fs";
import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || '';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3001';

interface CallResult {
  sid: string | null;
  status: 'calling' | 'completed' | 'failed';
  mock: boolean;
}

// Generate TTS audio using ElevenLabs
export async function generateAudio(text: string, voiceStyle: string): Promise<string | null> {
  if (!ELEVENLABS_API_KEY) {
    console.log('[VoiceCall] No ElevenLabs key — skipping TTS (mock mode)');
    return null;
  }

  try {
    // Use a professional voice ID (Rachel - clear, warm)
    const voiceId = voiceStyle === 'professional' ? '21m00Tcm4TlvDq8ikWAM' : 'EXAVITQu4vr4xnSDxMaL';
    
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        text,
        model_id: 'eleven_turbo_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true
        }
      },
      {
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg'
        },
        responseType: 'arraybuffer'
      }
    );

    console.log(`[VoiceCall] Generated ${response.data.byteLength} bytes of audio`);
    // Save audio file to disk
    const audioDir = path.join(__dirname, '..', '..', 'audio');
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
    }
    const filename = `call-${Date.now()}.mp3`;
    const filepath = path.join(audioDir, filename);
    fs.writeFileSync(filepath, Buffer.from(response.data));
    console.log(`[VoiceCall] Audio saved: ${filepath}`);
    
    // Return URL for Twilio to access
    const audioUrl = `${process.env.APP_BASE_URL}/audio/${filename}`;
    return audioUrl;
  } catch (error: any) {
    console.error('[VoiceCall] ElevenLabs error:', error.message);
    return null;
  }
}

// Make outbound call using Twilio
export async function makeCall(phoneNumber: string, scriptContent: string, callId: string): Promise<CallResult> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.log('[VoiceCall] No Twilio credentials — mock mode');
    return mockCall(callId);
  }

  try {
    // Twilio TwiML URL — in production, this would point to an endpoint that serves TTS audio
    const twimlUrl = `${APP_BASE_URL}/api/twiml/${callId}`;
    
    const response = await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`,
      new URLSearchParams({
        To: phoneNumber,
        From: TWILIO_PHONE_NUMBER,
        Url: twimlUrl,
        Record: 'true',
        RecordingStatusCallback: `${APP_BASE_URL}/api/calls/recording-callback`,
        StatusCallback: `${APP_BASE_URL}/api/calls/status-callback`,
        StatusCallbackEvent: 'initiated ringing answered completed',
        StatusCallbackMethod: 'POST'
      }),
      {
        auth: {
          username: TWILIO_ACCOUNT_SID,
          password: TWILIO_AUTH_TOKEN
        }
      }
    );

    console.log(`[VoiceCall] Call initiated: SID=${response.data.sid}`);
    return { sid: response.data.sid, status: 'calling', mock: false };
  } catch (error: any) {
    console.error('[VoiceCall] Twilio error:', error.message);
    return mockCall(callId);
  }
}

// Simulate a call for demo/mock mode
async function mockCall(callId: string): Promise<CallResult> {
  // Simulate call progress
  setTimeout(() => broadcastCallStatus(callId, 'connected'), 2000);
  setTimeout(() => broadcastCallStatus(callId, 'completed'), 8000);
  return { sid: `mock-${callId}`, status: 'calling', mock: true };
}

// Broadcast status via WebSocket (imported from index)
let broadcastCallStatus: (callId: string, status: string) => void = () => {};
export function setBroadcastFn(fn: (callId: string, status: string) => void) {
  broadcastCallStatus = fn;
}

export function generateTwiml(scriptContent: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="en-US">${escapeXml(scriptContent)}</Say>
  <Pause length="2"/>
  <Say>Thank you for your time. Goodbye.</Say>
</Response>`;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
