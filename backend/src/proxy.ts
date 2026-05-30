// Reverse proxy: serves Next.js frontend + proxies /api and /ws to backend
import http from 'http';
import httpProxy from 'http-proxy';

const BACKEND = 'http://localhost:4001';
const FRONTEND = 'http://localhost:3000';
const PORT = parseInt(process.env.PROXY_PORT || '4002');

// Create proxy server
const proxy = httpProxy.createProxyServer({ ws: true });

const server = http.createServer((req, res) => {
  if (req.url?.startsWith('/api/') || req.url === '/health') {
    proxy.web(req, res, { target: BACKEND }, (_err: any) => {
      res.writeHead(502);
      res.end('Backend unavailable');
    });
  } else {
    proxy.web(req, res, { target: FRONTEND }, (_err: any) => {
      res.writeHead(502);
      res.end('Frontend unavailable');
    });
  }
});

// Handle WebSocket upgrades
server.on('upgrade', (req, socket, head) => {
  if (req.url === '/ws') {
    proxy.ws(req, socket, head, { target: BACKEND }, (_err: any) => {
      console.error('[Proxy] WS error:', _err.message);
    });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`\n🎙️  Voice Outreach Demo: http://localhost:${PORT}`);
  console.log(`   /api/* → ${BACKEND}`);
  console.log(`   /ws    → ${BACKEND}/ws`);
  console.log(`   /*     → ${FRONTEND}\n`);
});
