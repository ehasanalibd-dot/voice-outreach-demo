import { Router, Request, Response } from 'express';
import db from '../database';
import { generateTwiml } from '../services/voiceCall';

const router = Router();

// GET /api/calls
router.get('/', async (req: Request, res: Response) => {
  const { campaign_id, status, limit = 50 } = req.query;
  let sql = `
    SELECT ca.*, co.name as contact_name, co.phone as contact_phone, co.company as contact_company,
           s.content as script_content
    FROM calls ca
    LEFT JOIN contacts co ON co.id = ca.contact_id
    LEFT JOIN scripts s ON s.id = ca.script_id
  `;
  const conditions: string[] = [];
  const params: any[] = [];

  if (campaign_id) { conditions.push('ca.campaign_id = $' + (params.length + 1)); params.push(campaign_id); }
  if (status) { conditions.push('ca.status = $' + (params.length + 1)); params.push(status); }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY ca.started_at DESC LIMIT $' + (params.length + 1);
  params.push(Number(limit));

  const calls = await db.query(sql, params);
  res.json(calls);
});

// GET /api/calls/:id
router.get('/:id', async (req: Request, res: Response) => {
  const call = await db.queryOne(`
    SELECT ca.*, co.name as contact_name, co.phone as contact_phone, co.company as contact_company,
           s.content as script_content
    FROM calls ca
    LEFT JOIN contacts co ON co.id = ca.contact_id
    LEFT JOIN scripts s ON s.id = ca.script_id
    WHERE ca.id = $1
  `, [req.params.id]);
  
  if (!call) return res.status(404).json({ error: 'Call not found' });
  const transcript = await db.queryOne('SELECT * FROM transcripts WHERE call_id = $1', [req.params.id]);
  res.json({ ...call, transcript });
});

// GET /api/twiml/:callId — Serve TwiML for Twilio calls
router.get('/twiml/:callId', async (req: Request, res: Response) => {
  const call = await db.queryOne('SELECT s.content FROM calls ca JOIN scripts s ON s.id = ca.script_id WHERE ca.id = $1', [req.params.callId]);
  const scriptContent = call?.content || 'Hello, this is a call from our outreach team. Thank you for your time.';
  
  res.type('text/xml');
  res.send(generateTwiml(scriptContent));
});

// POST /api/calls/status-callback — Twilio status callback
router.post('/status-callback', async (req: Request, res: Response) => {
  const { CallSid, CallStatus } = req.body;
  console.log(`[Twilio Callback] SID=${CallSid} Status=${CallStatus}`);
  
  if (CallSid) {
    const statusMap: Record<string, string> = {
      'initiated': 'calling',
      'ringing': 'calling',
      'in-progress': 'connected',
      'completed': 'completed',
      'failed': 'failed',
      'busy': 'failed',
      'no-answer': 'failed',
      'canceled': 'failed'
    };
    
    const mappedStatus = statusMap[CallStatus] || CallStatus;
    await db.run(`UPDATE calls SET status = $1, ended_at = CASE WHEN $1 IN ('completed','failed') THEN NOW() ELSE ended_at END WHERE twilio_sid = $2`, [mappedStatus, CallSid]);
  }
  
  res.send('OK');
});

// POST /api/calls/recording-callback — Twilio recording callback
router.post('/recording-callback', async (req: Request, res: Response) => {
  const { CallSid, RecordingUrl } = req.body;
  console.log(`[Twilio Recording] SID=${CallSid} URL=${RecordingUrl}`);
  if (CallSid && RecordingUrl) {
    await db.run(`UPDATE calls SET transcript_url = $1 WHERE twilio_sid = $2`, [RecordingUrl, CallSid]);
  }
  res.send('OK');
});

export default router;
