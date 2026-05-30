# 🎙️ Voice Outreach Demo App

AI-powered outreach platform that receives inbound emails, extracts contact details, makes AI voice calls, and displays all activity in a live dashboard.

## Architecture

```
Internet (Cloudflare Tunnel)
     ↓  HTTPS
Reverse Proxy (port 4002)
     ↓  /api/*, /ws, /health → backend
     ↓  /*                    → frontend
Frontend (Next.js 14 dev, port 3000)
Backend (Express + TypeScript, port 4001)
     ↓
├── Email Listener (Resend webhook + IMAP polling)
├── Contact Extractor (OpenRouter / google/gemini-2.5-flash)
├── Script Generator (OpenRouter / google/gemini-2.5-flash)
├── Voice Provider (ElevenLabs TTS + Twilio calls)
└── PostgreSQL Database
```

## Deployment (Production)

The app runs as four systemd services that auto-start on boot:

```bash
# Check status
./manage.sh status

# View logs
./manage.sh logs backend
./manage.sh logs frontend
./manage.sh logs proxy
./manage.sh logs tunnel

# Restart all
./manage.sh restart

# Stop all
./manage.sh stop

# Start all
./manage.sh start
```

### Systemd Services

| Service | Description |
|---------|-------------|
| `voice-outreach-backend` | Express API (port 4001) |
| `voice-outreach-frontend` | Next.js UI (port 3000) |
| `voice-outreach-proxy` | Reverse proxy (port 4002) |
| `voice-outreach-tunnel` | Cloudflare tunnel |

## Accessing the App

Get the current tunnel URL:
```bash
tail /var/log/voice-outreach-tunnel.log | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1
```

The URL changes on service restart. For a permanent URL, see **Named Tunnel** section below.

## Database

PostgreSQL stores all data (campaigns, emails, contacts, calls, transcripts).

```bash
# Connect to database
sudo -u postgres psql voice_outreach

# Quick stats
sudo -u postgres psql voice_outreach -c "\dt"
sudo -u postgres psql voice_outreach -c "SELECT count(*) FROM emails;"

# View recent emails
sudo -u postgres psql voice_outreach -c "SELECT from_name, status, received_at FROM emails ORDER BY received_at DESC LIMIT 10;"
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard` | Aggregated stats |
| GET/POST | `/api/campaigns` | List/create campaigns |
| GET | `/api/emails` | List emails |
| POST | `/api/emails/mock` | Simulate inbound email |
| POST | `/api/emails/simulate` | Simulate 5 emails |
| GET | `/api/calls` | List calls |
| POST | `/api/webhooks/resend` | Resend inbound webhook |
| WebSocket | `/ws` (port 4001) | Real-time updates |

## Testing the Pipeline

```bash
# 1. Create a campaign
curl -X POST http://localhost:4001/api/campaigns \
  -H 'Content-Type: application/json' \
  -d '{"name":"My Demo","audience":"Insurers","voice_style":"professional"}'

# 2. Simulate an email (use the campaign ID from step 1)
curl -X POST http://localhost:4001/api/emails/mock \
  -H 'Content-Type: application/json' \
  -d '{"campaign_id":"YOUR_ID","name":"John Doe","email":"john@test.com","phone":"+1 555 123 4567"}'

# 3. Check dashboard
curl http://localhost:4001/api/dashboard
```

## Environment Variables

Edit `backend/.env`:

```bash
# PostgreSQL
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=voice_outreach
PG_USER=outreach
PG_PASSWORD=outreach123

# Resend (inbound emails + summaries)
RESEND_API_KEY=re_xxxxx

# OpenRouter (AI/LLM)
OPENROUTER_API_KEY=sk-or-v1-xxxxx

# Twilio (voice calls)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# ElevenLabs (TTS)
ELEVENLABS_API_KEY=
```

## Resend Webhook Setup

1. Go to [Resend Dashboard → Webhooks](https://resend.com/webhooks)
2. Add webhook:
   - URL: `https://YOUR-TUNNEL-URL.trycloudflare.com/api/webhooks/resend`
   - Events: `email.received`
3. Send emails to your `@xxx.resend.app` address

When the tunnel URL changes, update the webhook URL in the Resend dashboard.

## Named Cloudflare Tunnel (Permanent URL)

To get a permanent URL that never changes:

```bash
# Login (opens browser)
cloudflared tunnel login

# Create named tunnel
cloudflared tunnel create voice-outreach

# Configure routing (~/.cloudflared/config.yml):
# tunnel: <TUNNEL_ID>
# ingress:
#   - hostname: outreach.yourdomain.com
#     service: http://localhost:4002
#   - service: http_status:404

# Enable the tunnel service
cloudflared service install
systemctl enable cloudflared@voice-outreach
systemctl start cloudflared@voice-outreach
```

## Tech Stack

- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Backend:** Express, TypeScript, pg (PostgreSQL)
- **Database:** PostgreSQL 15
- **AI:** OpenRouter API (google/gemini-2.5-flash)
- **Voice:** ElevenLabs TTS, Twilio Voice
- **Email:** Resend API (webhooks), IMAP (backup)
- **Real-time:** WebSocket (ws library)
- **Hosting:** systemd + Cloudflare Tunnel on Hostinger VPS
