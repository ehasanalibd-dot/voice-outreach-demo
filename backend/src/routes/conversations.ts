import { Router, Request, Response } from 'express';
import db from '../database';
import { v4 as uuid } from 'uuid';
import { generateReply } from '../services/replyAgent';
import { matchPersona } from '../services/agentService';
import { sendWhatsAppText } from '../services/whatsappService';

const router = Router();

// GET /api/conversations — List all conversations (grouped by contact)
router.get('/', async (_req: Request, res: Response) => {
  try {
    const conversations = await db.query(`
      SELECT 
        c.id as contact_id,
        c.name, c.role, c.company, c.phone, c.email,
        COUNT(r.id) as message_count,
        COUNT(CASE WHEN r.direction = 'inbound' THEN 1 END) as inbound_count,
        COUNT(CASE WHEN r.direction = 'outbound' THEN 1 END) as outbound_count,
        MAX(r.created_at) as last_message_at,
        (SELECT content FROM replies WHERE contact_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_preview,
        (SELECT direction FROM replies WHERE contact_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_direction
      FROM contacts c
      LEFT JOIN replies r ON r.contact_id = c.id
      GROUP BY c.id, c.name, c.role, c.company, c.phone, c.email
      HAVING COUNT(r.id) > 0
      ORDER BY last_message_at DESC
    `);
    res.json(conversations);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/conversations/:contactId — Full message thread
router.get('/:contactId', async (req: Request, res: Response) => {
  try {
    const contact = await db.queryOne('SELECT * FROM contacts WHERE id = $1', [req.params.contactId]);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    const messages = await db.query(
      `SELECT r.*, 
        CASE WHEN r.direction = 'outbound' THEN 'us' ELSE 'them' END as sender 
       FROM replies r 
       WHERE r.contact_id = $1 
       ORDER BY r.created_at ASC`,
      [req.params.contactId]
    );

    res.json({ contact, messages });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/conversations/:contactId/reply — Send a reply
router.post('/:contactId/reply', async (req: Request, res: Response) => {
  try {
    const contact = await db.queryOne('SELECT * FROM contacts WHERE id = $1', [req.params.contactId]);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    let replyText = req.body.message;

    // If no message provided, generate one with AI
    if (!replyText) {
      const persona = await matchPersona(contact.role);
      replyText = await generateReply(
        {
          contactName: contact.name || 'there',
          contactRole: contact.role || 'contact',
          contactCompany: contact.company || '',
          inboundMessage: '',
          channel: req.body.channel || 'whatsapp',
          campaignName: 'Voice Outreach',
        },
        persona,
        { contactId: contact.id, persist: true }
      );
    }

    // Send via WhatsApp
    if (contact.phone) {
      await sendWhatsAppText(contact.phone, replyText);
    }

    // Save to replies if not already persisted by generateReply
    if (req.body.message) {
      const latestCall = await db.queryOne(
        "SELECT * FROM calls WHERE contact_id = $1 ORDER BY started_at DESC LIMIT 1",
        [contact.id]
      );
      const replyId = uuid();
      await db.run(
        `INSERT INTO replies (id, call_id, contact_id, direction, channel, content, delivered)
         VALUES ($1, $2, $3, 'outbound', $4, $5, TRUE)`,
        [replyId, latestCall?.id || null, contact.id, req.body.channel || 'whatsapp', replyText]
      );
    }

    res.json({ success: true, reply: replyText });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
