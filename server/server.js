import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDir = path.resolve(__dirname, '../client');

const ROOM_ID = 'tralala-main';
const ROOM_LIMIT = 30;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(clientDir));
app.get('/', (_req, res) => res.sendFile(path.join(clientDir, 'index.html')));

const players = new Map();

function snapshot() {
  return [...players.values()].map((p) => ({
    id: p.id,
    name: p.name,
    skinIndex: p.skinIndex,
    x: p.x,
    z: p.z,
    rot: p.rot,
  }));
}

function emitRoomInfo() {
  io.to(ROOM_ID).emit('room_info', { roomId: ROOM_ID, count: players.size, limit: ROOM_LIMIT });
}

function emitBoard() {
  const rows = [...players.values()]
    .map((p) => ({
      id: p.id,
      name: p.name,
      kills: p.kills,
      coins: p.coins,
      area: p.area,
      lives: p.lives,
    }))
    .sort((a, b) => (b.area - a.area) || (b.kills - a.kills) || (b.coins - a.coins))
    .slice(0, 10);

  io.to(ROOM_ID).emit('leaderboard', { rows });
}

io.on('connection', (socket) => {
  socket.on('join_game', ({ name, skinIndex }) => {
    if (!players.has(socket.id) && players.size >= ROOM_LIMIT) {
      socket.emit('server_full');
      return;
    }

    socket.join(ROOM_ID);
    players.set(socket.id, {
      id: socket.id,
      name: String(name || 'Guest').slice(0, 16),
      skinIndex: Number.isFinite(skinIndex) ? skinIndex : 0,
      x: (Math.random() - 0.5) * 10,
      z: (Math.random() - 0.5) * 10,
      rot: 0,
      kills: 0,
      coins: 0,
      area: 0,
      lives: 3,
    });

    emitRoomInfo();
    emitBoard();
  });

  socket.on('leave_game', () => {
    if (!players.has(socket.id)) return;
    players.delete(socket.id);
    emitRoomInfo();
    emitBoard();
  });

  socket.on('move', ({ x, z, rot }) => {
    const p = players.get(socket.id);
    if (!p) return;
    if (Number.isFinite(x)) p.x = x;
    if (Number.isFinite(z)) p.z = z;
    if (Number.isFinite(rot)) p.rot = rot;
  });

  socket.on('stats', ({ kills, coins, area, lives }) => {
    const p = players.get(socket.id);
    if (!p) return;
    if (Number.isFinite(kills)) p.kills = Math.max(0, Math.floor(kills));
    if (Number.isFinite(coins)) p.coins = Math.max(0, Math.floor(coins));
    if (Number.isFinite(area)) p.area = Math.max(0, Math.min(100, Number(area)));
    if (Number.isFinite(lives)) p.lives = Math.max(0, Math.min(3, Math.floor(lives)));
  });

  socket.on('disconnect', () => {
    if (!players.has(socket.id)) return;
    players.delete(socket.id);
    emitRoomInfo();
    emitBoard();
  });
});

setInterval(() => {
  io.to(ROOM_ID).emit('snapshot', { players: snapshot() });
  emitBoard();
}, 100);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`tralala.io server running on ${PORT}`);
});
