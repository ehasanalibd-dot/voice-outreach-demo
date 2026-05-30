import { Router, Request, Response } from 'express';
import db from '../database';

const router = Router();

// GET /api/analytics/overview — High-level metrics
router.get('/overview', async (_req: Request, res: Response) => {
  try {
    const totalEmails = await db.queryOne('SELECT COUNT(*) as c FROM emails');
    const totalCalls = await db.queryOne('SELECT COUNT(*) as c FROM calls');
    const completedCalls = await db.queryOne("SELECT COUNT(*) as c FROM calls WHERE status = 'completed'");
    const totalReplies = await db.queryOne('SELECT COUNT(*) as c FROM replies');
    const inboundReplies = await db.queryOne("SELECT COUNT(*) as c FROM replies WHERE direction = 'inbound'");
    const outboundReplies = await db.queryOne("SELECT COUNT(*) as c FROM replies WHERE direction = 'outbound'");

    const totalC = parseInt(totalEmails?.c || '0');
    const callsC = parseInt(totalCalls?.c || '0');
    const completedC = parseInt(completedCalls?.c || '0');

    res.json({
      total_emails: totalC,
      total_calls: callsC,
      completed_calls: completedC,
      success_rate: callsC > 0 ? Math.round((completedC / callsC) * 100) : 0,
      total_replies: parseInt(totalReplies?.c || '0'),
      inbound_replies: parseInt(inboundReplies?.c || '0'),
      outbound_replies: parseInt(outboundReplies?.c || '0'),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/personas — Performance by persona
router.get('/personas', async (_req: Request, res: Response) => {
  try {
    const rows = await db.query(`
      SELECT 
        p.slug as persona_slug,
        p.name as persona_name,
        p.tone,
        COUNT(s.id) as scripts_generated,
        COUNT(DISTINCT c.id) as calls_made,
        COUNT(DISTINCT CASE WHEN c.status = 'completed' THEN c.id END) as calls_completed
      FROM personas p
      LEFT JOIN scripts s ON s.persona_id = p.id
      LEFT JOIN calls c ON c.id IN (SELECT id FROM calls WHERE script_id = s.id)
      GROUP BY p.id, p.slug, p.name, p.tone
      ORDER BY scripts_generated DESC
    `);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/versions — Prompt version performance
router.get('/versions', async (_req: Request, res: Response) => {
  try {
    const rows = await db.query(`
      SELECT 
        pv.agent_slug,
        pv.version,
        pv.is_active,
        pv.created_at,
        COUNT(s.id) as scripts_generated,
        LEFT(pv.system_prompt, 100) as prompt_preview
      FROM prompt_versions pv
      LEFT JOIN scripts s ON s.prompt_version_id = pv.id
      GROUP BY pv.id, pv.agent_slug, pv.version, pv.is_active, pv.created_at, pv.system_prompt
      ORDER BY pv.agent_slug, pv.version DESC
    `);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/ab-test — A/B test results
router.get('/ab-test', async (_req: Request, res: Response) => {
  try {
    const rows = await db.query(`
      SELECT 
        s.ab_group,
        COUNT(s.id) as scripts_generated,
        COUNT(DISTINCT c.id) as calls_made,
        COUNT(DISTINCT CASE WHEN c.status = 'completed' THEN c.id END) as calls_completed,
        AVG(LENGTH(s.content)) as avg_script_length
      FROM scripts s
      LEFT JOIN calls c ON c.script_id = s.id
      WHERE s.ab_group IS NOT NULL
      GROUP BY s.ab_group
      ORDER BY s.ab_group
    `);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/campaigns — Per-campaign metrics
router.get('/campaigns', async (_req: Request, res: Response) => {
  try {
    const rows = await db.query(`
      SELECT 
        ca.id, ca.name, ca.persona_override,
        COUNT(DISTINCT e.id) as emails_received,
        COUNT(DISTINCT c.id) as calls_made,
        COUNT(DISTINCT CASE WHEN c.status = 'completed' THEN c.id END) as calls_completed,
        ca.created_at
      FROM campaigns ca
      LEFT JOIN emails e ON e.campaign_id = ca.id
      LEFT JOIN calls c ON c.campaign_id = ca.id
      GROUP BY ca.id, ca.name, ca.persona_override, ca.created_at
      ORDER BY ca.created_at DESC
    `);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
