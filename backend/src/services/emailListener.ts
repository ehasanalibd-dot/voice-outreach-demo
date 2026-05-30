import { simpleParser } from 'mailparser';
import axios from 'axios';

const EMAIL_HOST = process.env.EMAIL_HOST || 'imap.gmail.com';
const EMAIL_PORT = parseInt(process.env.EMAIL_PORT || '993');
const EMAIL_USER = process.env.EMAIL_USER || '';
const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD || '';

// We use a simple HTTP-based approach for MVP: poll via Gmail/IMAP
// For demo purposes, we'll also support a webhook endpoint

export interface ParsedEmail {
  fromName: string;
  fromEmail: string;
  subject: string;
  body: string;
  raw: string;
  date: string;
}

// Poll IMAP server for new emails
export async function pollInbox(lastUid: number): Promise<{ emails: ParsedEmail[], newLastUid: number }> {
  if (!EMAIL_USER || !EMAIL_PASSWORD) {
    console.log('[EmailListener] No IMAP credentials — mock mode (use POST /api/emails/mock to simulate)');
    return { emails: [], newLastUid: lastUid };
  }

  try {
    const imap = await import('imap-simple');
    const connection = await imap.connect({
      imap: {
        user: EMAIL_USER,
        password: EMAIL_PASSWORD,
        host: EMAIL_HOST,
        port: EMAIL_PORT,
        tls: true,
        tlsOptions: { rejectUnauthorized: false },
        authTimeout: 10000
      }
    });

    await connection.openBox('INBOX');

    const searchCriteria = lastUid > 0 ? [['UID', `${lastUid + 1}:*`]] : ['UNSEEN'];
    
    let messages;
    try {
      messages = await connection.search(searchCriteria, {
        bodies: ['HEADER.FIELDS (FROM SUBJECT DATE)', 'TEXT', ''],
        struct: true
      });
    } catch {
      messages = [];
    }

    const parsedEmails: ParsedEmail[] = [];

    for (const msg of messages) {
      try {
        const allPart = msg.parts.find((p: any) => p.which === '');
        if (!allPart) continue;
        
        const raw = allPart.body as string;
        const parsed = await simpleParser(raw);
        
        const from = parsed.from?.value?.[0] || { name: '', address: '' };
        
        parsedEmails.push({
          fromName: from.name || '',
          fromEmail: from.address || '',
          subject: parsed.subject || '',
          body: parsed.text || '',
          raw: raw,
          date: parsed.date?.toISOString() || new Date().toISOString()
        });
      } catch (e) {
        console.error('[EmailListener] Parse error:', e);
      }
    }

    const newLastUid = messages.length > 0 
      ? Math.max(...messages.map((m: any) => m.attributes?.uid || lastUid)) 
      : lastUid;

    connection.end();
    return { emails: parsedEmails, newLastUid };
  } catch (error: any) {
    console.error('[EmailListener] IMAP error:', error.message);
    return { emails: [], newLastUid: lastUid };
  }
}

// Create a mock email (for demo/testing)
export function createMockEmail(name: string, email: string, phone?: string): ParsedEmail {
  const body = phone 
    ? `${name}\n\nI'm interested in your outreach demo. My role is Senior Executive at Example Corp. You can reach me at ${phone} or ${email}. Looking forward to hearing from you.`
    : `${name}\n\nI'm interested in your outreach demo. My role is Senior Executive at Example Corp. You can reach me at ${email}. Looking forward to hearing from you.`;

  return {
    fromName: name,
    fromEmail: email,
    subject: `Introduction - ${name}`,
    body,
    raw: body,
    date: new Date().toISOString()
  };
}
