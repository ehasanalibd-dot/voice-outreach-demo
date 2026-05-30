import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

import db, { initDatabase } from './database';
import campaignsRouter from './routes/campaigns';
import emailsRouter from './routes/emails';
import callsRouter from './routes/calls';
import dashboardRouter from './routes/dashboard';
import webhooksRouter from './routes/webhooks';
import agentsRouter from './routes/agents';
import personasRouter from './routes/personas';
import { setBroadcast } from './services/orchestrator';
import { pollInbox } from './services/emailListener';
import { processEmail } from './services/orchestrator';

const app = express();
const server = http.createServer(app);
const PORT = parseInt(process.env.PORT || '3001');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve generated audio files (for Twilio to fetch)
app.use('/audio', express.static(path.join(__dirname, '..', 'audio')));

// Initialize database on startup
initDatabase().catch(err => {
  console.error('[Database] Init failed:', err.message);
  process.exit(1);
});

// WebSocket server for real-time updates
const wss = new WebSocketServer({ server, path: '/ws' });
const clients = new Set<WebSocket>();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('[WebSocket] Client connected');
  ws.on('close', () => { clients.delete(ws); console.log('[WebSocket] Client disconnected'); });
});

function broadcast(event: any) {
  const message = JSON.stringify(event);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Connect broadcast to orchestrator
setBroadcast(broadcast);

// API Routes
app.use('/api/campaigns', campaignsRouter);
app.use('/api/emails', emailsRouter);
app.use('/api/calls', callsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/webhooks/resend', webhooksRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/personas', personasRouter);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// IMAP polling (if configured)
let pollInterval: NodeJS.Timeout | null = null;
if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
  let lastUid = 0;
  pollInterval = setInterval(async () => {
    try {
      const { emails, newLastUid } = await pollInbox(lastUid);
      lastUid = newLastUid;
      
      // Get default campaign
      const campaign = await db.queryOne('SELECT id FROM campaigns ORDER BY created_at DESC LIMIT 1');
      if (!campaign) return;
      
      for (const email of emails) {
        processEmail(campaign.id, email).catch(err => console.error('[Poll] Error:', err));
      }
    } catch (err) {
      console.error('[Poll] Error:', err);
    }
  }, 10000);
  console.log('[IMAP] Polling enabled — checking every 10s');
} else {
  console.log('[IMAP] No credentials — polling disabled. Use POST /api/emails/mock to simulate.');
}

// Start server
server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n🎙️  Voice Outreach Demo API running on http://localhost:${PORT}`);
  console.log(`📊 Dashboard API: http://localhost:${PORT}/api/dashboard`);
  console.log(`📧 Mock email:    POST http://localhost:${PORT}/api/emails/mock`);
  console.log(`🔌 WebSocket:     ws://localhost:${PORT}/ws\n`);
});
