import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../database';
import { getAllPersonas, getPersona } from '../services/agentService';

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

// GET /api/campaigns/:id/personas — Get campaign's persona assignment + all available personas
router.get('/:id/personas', async (req: Request, res: Response) => {
  const campaign = await db.queryOne('SELECT * FROM campaigns WHERE id = $1', [req.params.id]);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  const allPersonas = await getAllPersonas();
  let assignedPersona = null;
  if (campaign.persona_override && campaign.persona_override !== 'auto') {
    assignedPersona = await getPersona(campaign.persona_override);
  }

  res.json({
    campaign_id: campaign.id,
    current_override: campaign.persona_override || 'auto',
    assigned_persona: assignedPersona,
    available_personas: allPersonas,
  });
});

// POST /api/campaigns
router.post('/', async (req: Request, res: Response) => {
  const { name, audience, voice_style, inbox_config, persona_override } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const id = uuid();
  await db.run(`
    INSERT INTO campaigns (id, name, audience, voice_style, inbox_config, persona_override)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [id, name, audience || '', voice_style || 'professional', JSON.stringify(inbox_config || {}), persona_override || 'auto']);

  const campaign = await db.queryOne('SELECT * FROM campaigns WHERE id = $1', [id]);
  res.status(201).json(campaign);
});

// PATCH /api/campaigns/:id — Update campaign (name, audience, voice_style, persona_override)
router.patch('/:id', async (req: Request, res: Response) => {
  const { name, audience, voice_style, persona_override } = req.body;
  const sets: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (name !== undefined) { sets.push(`name = $${idx++}`); params.push(name); }
  if (audience !== undefined) { sets.push(`audience = $${idx++}`); params.push(audience); }
  if (voice_style !== undefined) { sets.push(`voice_style = $${idx++}`); params.push(voice_style); }
  if (persona_override !== undefined) { sets.push(`persona_override = $${idx++}`); params.push(persona_override); }

  if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' });

  params.push(req.params.id);
  await db.run(`UPDATE campaigns SET ${sets.join(', ')} WHERE id = $${idx}`, params);
  
  const campaign = await db.queryOne('SELECT * FROM campaigns WHERE id = $1', [req.params.id]);
  res.json(campaign);
});

// DELETE /api/campaigns/:id
router.delete('/:id', async (req: Request, res: Response) => {
  await db.run('DELETE FROM campaigns WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

export default router;
