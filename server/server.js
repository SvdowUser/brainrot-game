cat > ~/brainrot-game/server/server.js << 'EOF'
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

const rooms = new Map();

function getRoom() {
  if (!rooms.has(ROOM_ID)) rooms.set(ROOM_ID, new Map());
  return rooms.get(ROOM_ID);
}

io.on('connection', (socket) => {
  const room = getRoom();

  socket.on('join_game', ({ name, skinIndex }) => {
    if (room.size >= ROOM_LIMIT) { socket.emit('server_full'); return; }
    room.set(socket.id, { id: socket.id, name, skinIndex, x: 0, z: 0, rot: 0 });
    socket.join(ROOM_ID);
    socket.emit('room_info', { count: room.size, limit: ROOM_LIMIT });
  });

  socket.on('move', ({ x, z, rot }) => {
    if (room.has(socket.id)) {
      const p = room.get(socket.id);
      p.x = x; p.z = z; p.rot = rot;
    }
  });

  socket.on('stats', ({ score, area, lives }) => {
    if (room.has(socket.id)) {
      const p = room.get(socket.id);
      p.score = score; p.area = area; p.lives = lives;
    }
  });

  socket.on('leave_game', () => { room.delete(socket.id); });

  socket.on('disconnect', () => {
    room.delete(socket.id);
    io.to(ROOM_ID).emit('leaderboard', { rows: getLeaderboard() });
  });
});

function getLeaderboard() {
  const room = getRoom();
  return [...room.values()]
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 10)
    .map(p => ({ name: p.name, score: p.score || 0, area: p.area || '0' }));
}

setInterval(() => {
  const room = getRoom();
  if (room.size === 0) return;
  io.to(ROOM_ID).emit('snapshot', { players: [...room.values()] });
  io.to(ROOM_ID).emit('leaderboard', { rows: getLeaderboard() });
}, 100);

server.listen(3000, () => console.log('tralala.io server running on 3000'));
EOF
