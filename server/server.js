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
const io = new Server(server, {
  cors: { origin: '*' }
});
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(clientDir));
app.get('/', (_req, res) => res.sendFile(path.join(clientDir, 'index.html')));

const ROOM_ID = 'beach-01';
const ROOM_LIMIT = 20;
const roomPlayers = new Map();

function roomCount() {
  return roomPlayers.size;
}
const players = new Map();

function snapshot() {
  return Array.from(roomPlayers.values()).map((p) => ({
  return [...players.values()].map((p) => ({
    id: p.id,
    name: p.name,
    skinId: p.skinId,
    skinIndex: p.skinIndex,
    x: p.x,
    y: p.y,
    z: p.z,
    rot: p.rot,
    jumping: p.jumping,
    vx: p.vx || 0,
    vz: p.vz || 0,
  }));
}

function emitRoomInfo() {
  io.to(ROOM_ID).emit('room_info', { roomId: ROOM_ID, count: roomCount() });
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
      skinIndex: p.skinIndex,
    }))
    .sort((a, b) => (b.area - a.area) || (b.kills - a.kills) || (b.coins - a.coins))
    .slice(0, 10);

  io.to(ROOM_ID).emit('leaderboard', { rows });
}

io.on('connection', (socket) => {
  socket.on('join_hub', ({ roomId, name, skinId }) => {
    if (roomId !== ROOM_ID) return;
    if (roomCount() >= ROOM_LIMIT) {
  socket.on('join_game', ({ name, skinIndex }) => {
    if (!players.has(socket.id) && players.size >= ROOM_LIMIT) {
      socket.emit('server_full');
      return;
    }

    socket.join(ROOM_ID);
    roomPlayers.set(socket.id, {
    players.set(socket.id, {
      id: socket.id,
      name: (name || 'Guest').slice(0, 16),
      skinId: skinId || 'blue',
      x: (Math.random() - 0.5) * 8,
      y: 0,
      z: 10 + (Math.random() - 0.5) * 8,
      name: String(name || 'Guest').slice(0, 16),
      skinIndex: Number.isFinite(skinIndex) ? skinIndex : 0,
      x: (Math.random() - 0.5) * 10,
      z: (Math.random() - 0.5) * 10,
      rot: 0,
      jumping: false,
      vx: 0,
      vz: 0,
      kills: 0,
      coins: 0,
      area: 0,
      lives: 3,
    });

    emitRoomInfo();
    io.to(ROOM_ID).emit('snapshot', { players: snapshot() });
    io.to(ROOM_ID).emit('chat_message', { fromId: socket.id, name: roomPlayers.get(socket.id).name, text: 'joined the hub.' });
    emitBoard();
  });

  socket.on('leave_game', () => {
    if (!players.has(socket.id)) return;
    players.delete(socket.id);
    emitRoomInfo();
    emitBoard();
  });

  socket.on('move', ({ x, y, z, rot, jumping }) => {
    const player = roomPlayers.get(socket.id);
    if (!player) return;
    player.vx = x - player.x;
    player.vz = z - player.z;
    player.x = Number.isFinite(x) ? x : player.x;
    player.y = Number.isFinite(y) ? y : player.y;
    player.z = Number.isFinite(z) ? z : player.z;
    player.rot = Number.isFinite(rot) ? rot : player.rot;
    player.jumping = !!jumping;
  socket.on('move', ({ x, z, rot }) => {
    const p = players.get(socket.id);
    if (!p) return;
    if (Number.isFinite(x)) p.x = x;
    if (Number.isFinite(z)) p.z = z;
    if (Number.isFinite(rot)) p.rot = rot;
  });

  socket.on('chat_message', ({ text }) => {
    const player = roomPlayers.get(socket.id);
    if (!player) return;
    const clean = String(text || '').trim().slice(0, 120);
    if (!clean) return;
    io.to(ROOM_ID).emit('chat_message', { fromId: socket.id, name: player.name, text: clean });
  socket.on('stats', ({ kills, coins, area, lives }) => {
    const p = players.get(socket.id);
    if (!p) return;
    if (Number.isFinite(kills)) p.kills = Math.max(0, Math.floor(kills));
    if (Number.isFinite(coins)) p.coins = Math.max(0, Math.floor(coins));
    if (Number.isFinite(area)) p.area = Math.max(0, Math.min(100, Number(area)));
    if (Number.isFinite(lives)) p.lives = Math.max(0, Math.min(3, Math.floor(lives)));
  });

  socket.on('disconnect', () => {
    if (!roomPlayers.has(socket.id)) return;
    const player = roomPlayers.get(socket.id);
    roomPlayers.delete(socket.id);
    io.to(ROOM_ID).emit('chat_message', { fromId: socket.id, name: player.name, text: 'left the hub.' });
    if (!players.has(socket.id)) return;
    players.delete(socket.id);
    emitRoomInfo();
    io.to(ROOM_ID).emit('snapshot', { players: snapshot() });
    emitBoard();
  });
});

setInterval(() => {
  io.to(ROOM_ID).emit('snapshot', { players: snapshot() });
}, 50);
  emitBoard();
}, 100);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Los Tralaleritos Hub server running on ${PORT}`);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`tralala.io server running on ${PORT}`);
});
