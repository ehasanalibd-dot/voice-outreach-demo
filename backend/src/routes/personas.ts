import { Router, Request, Response } from 'express';
import { getAllPersonas, getPersona, updatePersona, createPersona } from '../services/agentService';

const router = Router();

// GET /api/personas — List all personas
router.get('/', async (_req: Request, res: Response) => {
  const personas = await getAllPersonas();
  res.json(personas);
});

// GET /api/personas/:slug — Get one persona by slug
router.get('/:slug', async (req: Request, res: Response) => {
  const persona = await getPersona(req.params.slug);
  if (!persona) return res.status(404).json({ error: 'Persona not found' });
  res.json(persona);
});

// POST /api/personas — Create a new persona
router.post('/', async (req: Request, res: Response) => {
  const { slug, name, tone, description, system_prompt_addition, role_patterns, enabled } = req.body;
  if (!slug || !name || !tone) {
    return res.status(400).json({ error: 'slug, name, and tone are required' });
  }
  const existing = await getPersona(slug);
  if (existing) return res.status(409).json({ error: 'Persona slug already exists' });

  const persona = await createPersona({
    slug, name, description: description || '', tone,
    system_prompt_addition: system_prompt_addition || '',
    role_patterns: role_patterns || '',
    enabled: enabled !== false,
  });
  res.status(201).json(persona);
});

// PATCH /api/personas/:slug — Update a persona
router.patch('/:slug', async (req: Request, res: Response) => {
  const updated = await updatePersona(req.params.slug, req.body);
  if (!updated) return res.status(404).json({ error: 'Persona not found' });
  res.json(updated);
});

// POST /api/personas/match — Test persona matching for a given role
router.post('/match', async (req: Request, res: Response) => {
  const { role } = req.body;
  const { matchPersona } = await import('../services/agentService');
  const persona = await matchPersona(role);
  res.json({ matched: persona, input_role: role });
});

export default router;
