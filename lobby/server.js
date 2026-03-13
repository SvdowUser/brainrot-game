const express = require('express');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── GAME SERVERS REGISTRY ──
// Game servers register themselves here
const gameServers = new Map();

// Game server registers itself
app.post('/api/register', (req, res) => {
  const { id, ip, port, lobbies, maxLobbies } = req.body;
  gameServers.set(id, {
    id, ip, port,
    lobbies: lobbies || 0,
    maxLobbies: maxLobbies || 10,
    lastSeen: Date.now()
  });
  console.log(`Game server registered: ${id} at ${ip}:${port}`);
  res.json({ ok: true });
});

// Game server updates its status
app.post('/api/heartbeat', (req, res) => {
  const { id, lobbies, players } = req.body;
  if (gameServers.has(id)) {
    const s = gameServers.get(id);
    s.lobbies = lobbies;
    s.players = players;
    s.lastSeen = Date.now();
  }
  res.json({ ok: true });
});

// Client asks: which game server should I connect to?
app.get('/api/best-server', (req, res) => {
  const now = Date.now();
  // Remove dead servers (no heartbeat for 30s)
  for (const [id, s] of gameServers) {
    if (now - s.lastSeen > 30000) gameServers.delete(id);
  }

  // Find server with most players but not full
  let best = null;
  for (const s of gameServers.values()) {
    if (s.lobbies < s.maxLobbies) {
      if (!best || s.lobbies > best.lobbies) best = s;
    }
  }

  if (!best) {
    // No game server available - fallback to hardcoded
    return res.json({
      ip: process.env.GAME_SERVER_IP || '89.167.75.175',
      port: 3000
    });
  }

  res.json({ ip: best.ip, port: best.port });
});

// List all servers (for admin)
app.get('/api/servers', (req, res) => {
  const list = Array.from(gameServers.values()).map(s => ({
    id: s.id,
    ip: s.ip,
    port: s.port,
    lobbies: s.lobbies || 0,
    maxLobbies: s.maxLobbies,
    players: s.players || 0,
    online: Date.now() - s.lastSeen < 30000
  }));
  res.json(list);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🍕 Lobby server on port ${PORT}`);
  console.log(`Game server IP: ${process.env.GAME_SERVER_IP || '89.167.75.175'}`);
});
