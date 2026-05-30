import { Resend } from 'resend';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Ensure .env is loaded before reading env vars
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';

let resend: Resend | null = null;
if (RESEND_API_KEY) {
  resend = new Resend(RESEND_API_KEY);
  console.log('[Resend] Initialized with key: ' + RESEND_API_KEY.slice(0, 10) + '...');
} else {
  console.log('[Resend] No RESEND_API_KEY — outbound emails disabled');
}

// Send an outbound email (for post-call summaries, etc.)
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  from?: string;
}): Promise<{ id: string } | null> {
  if (!resend) {
    console.log('[Resend] No API key — skipping sendEmail (mock mode)');
    return null;
  }

  try {
    const from = opts.from || 'Outreach <onboarding@resend.dev>';
    console.log(`[Resend] Sending to ${opts.to}: ${opts.subject}`);
    const { data, error } = await resend.emails.send({
      from,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
    });
    if (error) {
      console.error('[Resend] Send error:', error.message);
      return null;
    }
    console.log(`[Resend] ✅ Sent: ${opts.subject} → ${opts.to} (id: ${data?.id})`);
    return data;
  } catch (err: any) {
    console.error('[Resend] Send error:', err.message);
    return null;
  }
}

// Retrieve full received-email content by ID
export async function getReceivedEmail(emailId: string): Promise<any | null> {
  if (!resend) return null;
  try {
    const { data, error } = await resend.emails.receiving.get(emailId);
    if (error) {
      console.error('[Resend] Retrieve error:', error.message);
      return null;
    }
    return data;
  } catch (err: any) {
    console.error('[Resend] Retrieve error:', err.message);
    return null;
  }
}

// Send post-call summary email to the attendee
export async function sendPostCallSummary(
  attendeeEmail: string,
  attendeeName: string,
  contact: { role: string; company: string },
  scriptContent: string,
  campaignName: string
): Promise<void> {
  console.log(`[Resend] Preparing post-call summary for ${attendeeEmail}`);
  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #6366f1;">📞 Call Summary</h2>
      <p>Hi ${attendeeName},</p>
      <p>Thanks for connecting with the <strong>${campaignName}</strong> team! Here's a summary of your recent call:</p>
      <hr style="border: 1px solid #e5e7eb;" />
      <h3 style="color: #374151;">What was discussed</h3>
      <blockquote style="border-left: 3px solid #6366f1; padding-left: 12px; color: #6b7280; margin: 16px 0;">
        ${scriptContent}
      </blockquote>
      <hr style="border: 1px solid #e5e7eb;" />
      <p style="color: #6b7280; font-size: 14px;">
        This message was sent from our AI-powered outreach demo. If you have any questions, just reply to this email!
      </p>
      <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">
        Powered by Voice Outreach Demo
      </p>
    </div>
  `;

  await sendEmail({
    to: attendeeEmail,
    subject: `Summary of your call from ${campaignName}`,
    html,
  });
}

export function isEnabled(): boolean {
  return !!resend;
}
