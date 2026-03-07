import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDir = path.resolve(__dirname, '../client');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(clientDir));
app.get('/', (_req, res) => res.sendFile(path.join(clientDir, 'index.html')));

const ROOM_ID = 'beach-01';
const ROOM_LIMIT = 20;
const roomPlayers = new Map();

function roomCount() {
  return roomPlayers.size;
}

function snapshot() {
  return Array.from(roomPlayers.values()).map((p) => ({
    id: p.id,
    name: p.name,
    skinId: p.skinId,
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
}

io.on('connection', (socket) => {
  socket.on('join_hub', ({ roomId, name, skinId }) => {
    if (roomId !== ROOM_ID) return;
    if (roomCount() >= ROOM_LIMIT) {
      socket.emit('server_full');
      return;
    }

    socket.join(ROOM_ID);
    roomPlayers.set(socket.id, {
      id: socket.id,
      name: (name || 'Guest').slice(0, 16),
      skinId: skinId || 'blue',
      x: (Math.random() - 0.5) * 8,
      y: 0,
      z: 10 + (Math.random() - 0.5) * 8,
      rot: 0,
      jumping: false,
      vx: 0,
      vz: 0,
    });

    emitRoomInfo();
    io.to(ROOM_ID).emit('snapshot', { players: snapshot() });
    io.to(ROOM_ID).emit('chat_message', { fromId: socket.id, name: roomPlayers.get(socket.id).name, text: 'joined the hub.' });
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
  });

  socket.on('chat_message', ({ text }) => {
    const player = roomPlayers.get(socket.id);
    if (!player) return;
    const clean = String(text || '').trim().slice(0, 120);
    if (!clean) return;
    io.to(ROOM_ID).emit('chat_message', { fromId: socket.id, name: player.name, text: clean });
  });

  socket.on('disconnect', () => {
    if (!roomPlayers.has(socket.id)) return;
    const player = roomPlayers.get(socket.id);
    roomPlayers.delete(socket.id);
    io.to(ROOM_ID).emit('chat_message', { fromId: socket.id, name: player.name, text: 'left the hub.' });
    emitRoomInfo();
    io.to(ROOM_ID).emit('snapshot', { players: snapshot() });
  });
});

setInterval(() => {
  io.to(ROOM_ID).emit('snapshot', { players: snapshot() });
}, 50);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Los Tralaleritos Hub server running on ${PORT}`);
});
