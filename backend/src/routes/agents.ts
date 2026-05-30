import { Router, Request, Response } from 'express';
import { getAllAgents, getAgent, updateAgentPrompt, getAgentVersions, activateVersion, testAgent } from '../services/agentService';

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

// PATCH /api/agents/:slug — Update agent's system prompt + settings (saves old version)
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

// GET /api/agents/:slug/versions — List version history
router.get('/:slug/versions', async (req: Request, res: Response) => {
  const versions = await getAgentVersions(req.params.slug);
  res.json(versions);
});

// POST /api/agents/:slug/versions/:versionId/activate — Rollback to a previous version
router.post('/:slug/versions/:versionId/activate', async (req: Request, res: Response) => {
  const agent = await activateVersion(req.params.slug, req.params.versionId);
  if (!agent) return res.status(404).json({ error: 'Agent or version not found' });
  res.json({ message: `Rolled back to version ${agent.version}`, agent });
});

// POST /api/agents/:slug/test — Test agent with input text
router.post('/:slug/test', async (req: Request, res: Response) => {
  const { test_input } = req.body;
  if (!test_input) return res.status(400).json({ error: 'test_input is required' });
  
  try {
    const result = await testAgent(req.params.slug, test_input);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
