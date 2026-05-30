import { Router, Request, Response } from 'express';
import db from '../database';

const router = Router();

// GET /api/dashboard — aggregated stats for the dashboard
router.get('/', async (req: Request, res: Response) => {
  const { campaign_id } = req.query;
  const whereClause = campaign_id ? 'WHERE campaign_id = $1' : '';
  const param = campaign_id ? [campaign_id] : [];

  // Stats
  const totalEmails = (await db.queryOne(`SELECT COUNT(*)::int as count FROM emails ${whereClause}`, param))?.count || 0;
  
  const activeCallsWhere = campaign_id ? `WHERE campaign_id = $1` : '';
  const activeCalls = (await db.queryOne(`SELECT COUNT(*)::int as count FROM calls WHERE status IN ('pending','calling','connected') ${activeCallsWhere}`, param))?.count || 0;
  
  const totalCalls = (await db.queryOne(`SELECT COUNT(*)::int as count FROM calls ${whereClause}`, param))?.count || 0;
  const completedCalls = (await db.queryOne(`SELECT COUNT(*)::int as count FROM calls WHERE status = 'completed' ${activeCallsWhere}`, param))?.count || 0;
  const successRate = totalCalls > 0 ? Math.round((completedCalls / totalCalls) * 100) : 0;
  
  const avgDuration = (await db.queryOne(`SELECT ROUND(AVG(duration))::int as avg FROM calls WHERE duration IS NOT NULL ${activeCallsWhere}`, param))?.avg || 0;

  // Recent emails
  const recentEmails = await db.query(`
    SELECT e.*, c.name as contact_name, c.phone as contact_phone
    FROM emails e LEFT JOIN contacts c ON c.email_id = e.id
    ${whereClause} ORDER BY e.received_at DESC LIMIT 20
  `, param);

  // Active calls
  const activeCallList = await db.query(`
    SELECT ca.*, co.name as contact_name, co.phone as contact_phone, co.company as contact_company
    FROM calls ca LEFT JOIN contacts co ON co.id = ca.contact_id
    WHERE ca.status IN ('pending','calling','connected') ${campaign_id ? 'AND ca.campaign_id = $1' : ''}
    ORDER BY ca.started_at DESC LIMIT 10
  `, param);

  // Recent completed calls
  const recentCalls = await db.query(`
    SELECT ca.*, co.name as contact_name, co.phone as contact_phone, co.company as contact_company,
           s.content as script_content
    FROM calls ca
    LEFT JOIN contacts co ON co.id = ca.contact_id
    LEFT JOIN scripts s ON s.id = ca.script_id
    WHERE ca.status IN ('completed','failed') ${campaign_id ? 'AND ca.campaign_id = $1' : ''}
    ORDER BY ca.ended_at DESC LIMIT 10
  `, param);

  // Recent transcripts
  const recentTranscripts = await db.query(`
    SELECT t.*, ca.id as call_id, co.name as contact_name
    FROM transcripts t
    JOIN calls ca ON ca.id = t.call_id
    LEFT JOIN contacts co ON co.id = ca.contact_id
    ${campaign_id ? 'WHERE ca.campaign_id = $1' : ''}
    ORDER BY t.created_at DESC LIMIT 10
  `, param);

  const campaigns = await db.query('SELECT * FROM campaigns ORDER BY created_at DESC');

  res.json({
    total_emails: totalEmails,
    active_calls: activeCalls,
    success_rate: successRate,
    avg_duration: avgDuration,
    total_calls: totalCalls,
    completed_calls: completedCalls,
    recent_emails: recentEmails,
    active_call_list: activeCallList,
    recent_calls: recentCalls,
    recent_transcripts: recentTranscripts,
    campaigns
  });
});

export default router;
