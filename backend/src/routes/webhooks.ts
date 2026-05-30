import { Router, Request, Response } from 'express';
import db from '../database';
import { processEmail } from '../services/orchestrator';
import { getReceivedEmail } from '../services/resendService';

const router = Router();

// POST /api/webhooks/resend — Receive email.received webhook events
router.post('/', async (req: Request, res: Response) => {
  const event = req.body;

  if (!event?.type || event.type !== 'email.received') {
    return res.json({ ok: true });
  }

  const { data } = event;
  if (!data?.email_id) {
    console.warn('[Resend Webhook] Missing email_id in event');
    return res.json({ ok: true });
  }

  console.log('[Resend Webhook] Raw payload:', JSON.stringify(event, null, 2));
  
  console.log(`[Resend Webhook] email.received: ${data.email_id} from=${data.from} to=${JSON.stringify(data.to)}`);

  // Fetch full email content from Resend API
  let fullEmail = await getReceivedEmail(data.email_id);
  if (!fullEmail) {
    console.warn('[Resend Webhook] Could not retrieve full email — using webhook metadata');
    fullEmail = {
      from: data.from,
      to: data.to,
      subject: data.subject || '',
      text: data.text || '',
      html: data.html || '',
      created_at: data.created_at,
    };
  }

  // Extract "to" address to match against campaigns
  const toAddresses: string[] = (data.to || fullEmail.to || []);
  const toLower = toAddresses.map((a: string) => a.toLowerCase());

  // Find campaign by matching inbox_config.email_address against "to" field
  let campaignId: string | null = null;
  const campaigns = await db.query('SELECT id, inbox_config FROM campaigns');
  for (const c of campaigns) {
    try {
      const cfg = JSON.parse(c.inbox_config || '{}');
      const campEmail = (cfg.email_address || '').toLowerCase();
      if (!campEmail || !toLower.length) {
        if (!campaignId) campaignId = c.id;
        continue;
      }
      if (toLower.some((a: string) => a.includes(campEmail) || campEmail.includes(a.replace(/^[^@]+@/, '')))) {
        campaignId = c.id;
        break;
      }
    } catch {}
  }

  // Fallback: use the most recently created campaign
  if (!campaignId) {
    const latest = await db.queryOne('SELECT id FROM campaigns ORDER BY created_at DESC LIMIT 1');
    campaignId = latest?.id || null;
  }

  if (!campaignId) {
    console.warn('[Resend Webhook] No campaign found — ignoring email');
    return res.json({ ok: true, warning: 'no_campaign' });
  }

  // Trigger the pipeline asynchronously
  processEmail(campaignId, {
    fromName: data.from?.split('<')[0].trim() || '',
    fromEmail: data.from?.match(/<([^>]+)>/)?.[1] || data.from || '',
    subject: fullEmail.subject || data.subject || '',
    body: fullEmail.text || fullEmail.html || '',
    raw: JSON.stringify(fullEmail),
    date: fullEmail.created_at || data.created_at || new Date().toISOString(),
  }).catch(err => console.error('[Resend Webhook] Pipeline error:', err));

  res.json({ ok: true, campaign_id: campaignId });
});

export default router;
