import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../database';

const router = Router();

// GET /api/campaigns
router.get('/', async (_req: Request, res: Response) => {
  const campaigns = await db.query('SELECT * FROM campaigns ORDER BY created_at DESC');
  res.json(campaigns);
});

// GET /api/campaigns/:id
router.get('/:id', async (req: Request, res: Response) => {
  const campaign = await db.queryOne('SELECT * FROM campaigns WHERE id = $1', [req.params.id]);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  res.json(campaign);
});

// POST /api/campaigns
router.post('/', async (req: Request, res: Response) => {
  const { name, audience, voice_style, inbox_config } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const id = uuid();
  await db.run(`
    INSERT INTO campaigns (id, name, audience, voice_style, inbox_config)
    VALUES ($1, $2, $3, $4, $5)
  `, [id, name, audience || '', voice_style || 'professional', JSON.stringify(inbox_config || {})]);

  const campaign = await db.queryOne('SELECT * FROM campaigns WHERE id = $1', [id]);
  res.status(201).json(campaign);
});

// DELETE /api/campaigns/:id
router.delete('/:id', async (req: Request, res: Response) => {
  await db.run('DELETE FROM campaigns WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

export default router;
