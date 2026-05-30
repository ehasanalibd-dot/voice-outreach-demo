import { Router, Request, Response } from 'express';
import { getAllAgents, getAgent, updateAgentPrompt } from '../services/agentService';

const router = Router();

// GET /api/agents — List all agents
router.get('/', async (_req: Request, res: Response) => {
  const agents = await getAllAgents();
  res.json(agents);
});

// GET /api/agents/:slug — Get one agent by slug
router.get('/:slug', async (req: Request, res: Response) => {
  const agent = await getAgent(req.params.slug);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json(agent);
});

// PATCH /api/agents/:slug — Update agent's system prompt + settings
router.patch('/:slug', async (req: Request, res: Response) => {
  const { system_prompt, name, description, temperature, max_tokens, model, enabled } = req.body;
  if (!system_prompt && !name && name !== undefined) {
    return res.status(400).json({ error: 'Nothing to update' });
  }

  const updated = await updateAgentPrompt(req.params.slug, system_prompt, {
    name, description, temperature, max_tokens, model, enabled,
  });

  if (!updated) return res.status(404).json({ error: 'Agent not found' });
  res.json(updated);
});

export default router;
