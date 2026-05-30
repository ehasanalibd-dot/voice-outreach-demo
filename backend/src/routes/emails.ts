import { Router, Request, Response } from 'express';
import db from '../database';
import { processEmail } from '../services/orchestrator';
import { createMockEmail } from '../services/emailListener';

const router = Router();

// GET /api/emails
router.get('/', async (req: Request, res: Response) => {
  const { campaign_id, status, limit = 50 } = req.query;
  let sql = 'SELECT e.*, c.name as contact_name, c.phone as contact_phone FROM emails e LEFT JOIN contacts c ON c.email_id = e.id';
  const conditions: string[] = [];
  const params: any[] = [];

  if (campaign_id) { conditions.push('e.campaign_id = $' + (params.length + 1)); params.push(campaign_id); }
  if (status) { conditions.push('e.status = $' + (params.length + 1)); params.push(status); }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY e.received_at DESC LIMIT $' + (params.length + 1);
  params.push(Number(limit));

  const emails = await db.query(sql, params);
  res.json(emails);
});

// GET /api/emails/:id
router.get('/:id', async (req: Request, res: Response) => {
  const email = await db.queryOne('SELECT * FROM emails WHERE id = $1', [req.params.id]);
  if (!email) return res.status(404).json({ error: 'Email not found' });
  const contact = await db.queryOne('SELECT * FROM contacts WHERE email_id = $1', [req.params.id]);
  res.json({ ...email, contact });
});

// POST /api/emails/mock — simulate an inbound email (for demo/testing)
router.post('/mock', async (req: Request, res: Response) => {
  const { campaign_id, name, email, phone } = req.body;
  if (!campaign_id) return res.status(400).json({ error: 'campaign_id is required' });

  const campaign = await db.queryOne('SELECT * FROM campaigns WHERE id = $1', [campaign_id]);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  const mockName = name || 'Thomas Sepp';
  const mockEmail = email || 'thomas.sepp@allianz.com';
  const mockPhone = phone || '+49 170 555 1234';

  const parsedEmail = createMockEmail(mockName, mockEmail, mockPhone);
  
  // Process asynchronously
  processEmail(campaign_id, parsedEmail).catch(err => console.error('[Mock] Error:', err));

  res.json({ message: 'Mock email queued for processing', email: parsedEmail });
});

// POST /api/emails/simulate — batch simulate multiple emails
router.post('/simulate', async (req: Request, res: Response) => {
  const { campaign_id, count = 3 } = req.body;
  if (!campaign_id) return res.status(400).json({ error: 'campaign_id is required' });

  const contacts = [
    { name: 'Thomas Sepp', email: 'thomas.sepp@allianz.com', phone: '+49 170 555 1234' },
    { name: 'Maria Chen', email: 'maria.chen@microsoft.com', phone: '+1 425 555 0142' },
    { name: 'James Wilson', email: 'j.wilson@amazon.com', phone: '+1 206 555 0198' },
    { name: 'Sophie Laurent', email: 'sophie@startup.io', phone: '+33 6 12 34 56 78' },
    { name: 'Raj Patel', email: 'raj.patel@infosys.com', phone: '+91 98765 43210' },
  ];

  const queued: string[] = [];
  const toSend = contacts.slice(0, Math.min(count, contacts.length));

  for (const contact of toSend) {
    const parsedEmail = createMockEmail(contact.name, contact.email, contact.phone);
    processEmail(campaign_id, parsedEmail).catch(err => console.error('[Simulate] Error:', err));
    queued.push(contact.name);
  }

  res.json({ message: `${queued.length} mock emails queued`, queued });
});

export default router;
