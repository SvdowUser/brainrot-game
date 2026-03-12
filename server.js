const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingTimeout: 10000,
  pingInterval: 5000
});

app.use(express.static(path.join(__dirname, 'public')));

// ── CONFIG ──
const COLS = 100;
const ROWS = 100;
const MAX_PLAYERS = 30;
const STEP_MS = 280;
const PLAYER_COLORS = [
  '#3b82f6','#ef4444','#22c55e','#f59e0b','#a855f7','#ec4899',
  '#06b6d4','#84cc16','#f97316','#6366f1','#14b8a6','#e11d48',
  '#0ea5e9','#d946ef','#10b981','#fbbf24','#f43f5e','#8b5cf6',
  '#0891b2','#65a30d','#ea580c','#7c3aed','#0d9488','#be123c'
];

// ── LOBBIES ──
const lobbies = new Map();
let lobbyCounter = 0;

function createLobby() {
  const id = `room-${++lobbyCounter}`;
  const lobby = {
    id,
    players: new Map(),
    grid: new Int16Array(COLS * ROWS).fill(-1),
    interval: null,
    colorIndex: 0
  };
  lobbies.set(id, lobby);
  console.log(`Created lobby: ${id}`);
  return lobby;
}

function getAvailableLobby() {
  for (const lobby of lobbies.values()) {
    if (lobby.players.size < MAX_PLAYERS) return lobby;
  }
  return createLobby();
}

// ── GRID HELPERS ──
function gIdx(x, y) { return y * COLS + x; }

function claimStart(grid, ownerId, cx, cy, r = 3) {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const gx = cx + dx, gy = cy + dy;
      if (gx >= 0 && gx < COLS && gy >= 0 && gy < ROWS) {
        grid[gIdx(gx, gy)] = ownerId;
      }
    }
  }
}

function getSpawnPoint(existingPlayers) {
  let best = null, bestDist = 0;
  for (let tries = 0; tries < 80; tries++) {
    const x = 8 + Math.floor(Math.random() * (COLS - 16));
    const y = 8 + Math.floor(Math.random() * (ROWS - 16));
    let minDist = Infinity;
    for (const p of existingPlayers) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < minDist) minDist = d;
    }
    if (minDist > bestDist) { bestDist = minDist; best = { x, y }; }
  }
  return best || { x: Math.floor(COLS / 2), y: Math.floor(ROWS / 2) };
}

function floodFill(grid, ownerId) {
  const owned = new Set();
  for (let i = 0; i < grid.length; i++) if (grid[i] === ownerId) owned.add(i);
  const vis = new Uint8Array(COLS * ROWS);
  const q = [];
  for (let x = 0; x < COLS; x++) { q.push(gIdx(x, 0)); q.push(gIdx(x, ROWS - 1)); }
  for (let y = 0; y < ROWS; y++) { q.push(gIdx(0, y)); q.push(gIdx(COLS - 1, y)); }
  while (q.length) {
    const idx = q.pop();
    if (vis[idx] || owned.has(idx)) continue;
    vis[idx] = 1;
    const x = idx % COLS, y = Math.floor(idx / COLS);
    if (x > 0) q.push(gIdx(x-1,y)); if (x < COLS-1) q.push(gIdx(x+1,y));
    if (y > 0) q.push(gIdx(x,y-1)); if (y < ROWS-1) q.push(gIdx(x,y+1));
  }
  const newTiles = [];
  for (let i = 0; i < grid.length; i++) {
    if (!vis[i] && !owned.has(i)) {
      grid[i] = ownerId;
      newTiles.push({ x: i % COLS, y: Math.floor(i / COLS) });
    }
  }
  return newTiles;
}

// ── GAME LOOP ──
function stepLobby(lobby) {
  if (lobby.players.size === 0) return;

  const tileUpdates = [];
  const deathList = [];
  const trailUpdates = [];

  for (const [sid, p] of lobby.players) {
    if (!p.alive) continue;

    const nx = p.x + p.dx;
    const ny = p.y + p.dy;

    // Wall collision
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
      killPlayer(lobby, sid, p, tileUpdates, deathList);
      continue;
    }

    // Self trail collision
    if (p.trail.some(t => t.x === nx && t.y === ny)) {
      killPlayer(lobby, sid, p, tileUpdates, deathList);
      continue;
    }

    // Check cross other trails
    for (const [oid, op] of lobby.players) {
      if (oid === sid || !op.alive) continue;
      if (op.trail.some(t => t.x === nx && t.y === ny)) {
        // Kill the trail owner
        killPlayer(lobby, oid, op, tileUpdates, deathList);
      }
    }

    if (!p.alive) continue;

    p.x = nx; p.y = ny;
    const cell = lobby.grid[gIdx(nx, ny)];

    if (cell === p.numId && p.trail.length > 0) {
      // Back in own territory - fill trail
      const filled = [];
      p.trail.forEach(t => {
        lobby.grid[gIdx(t.x, t.y)] = p.numId;
        filled.push({ x: t.x, y: t.y });
        tileUpdates.push({ x: t.x, y: t.y, color: p.color });
      });
      const enclosed = floodFill(lobby.grid, p.numId);
      enclosed.forEach(t => tileUpdates.push({ x: t.x, y: t.y, color: p.color }));
      p.trail = [];
      trailUpdates.push({ sid, trail: [], clear: true });
    } else if (cell !== p.numId) {
      p.trail.push({ x: nx, y: ny });
      trailUpdates.push({ sid, trail: p.trail.slice() });
    }
  }

  // Calculate scores
  const tot = COLS * ROWS;
  const counts = {};
  for (let i = 0; i < lobby.grid.length; i++) {
    const o = lobby.grid[i];
    if (o >= 0) counts[o] = (counts[o] || 0) + 1;
  }

  const playerStates = [];
  for (const [sid, p] of lobby.players) {
    p.score = ((counts[p.numId] || 0) / tot * 100);
    playerStates.push({
      sid, x: p.x, y: p.y, score: p.score, alive: p.alive,
      dx: p.dx, dy: p.dy
    });
  }

  io.to(lobby.id).emit('step', {
    players: playerStates,
    tiles: tileUpdates,
    deaths: deathList,
    trails: trailUpdates
  });
}

function killPlayer(lobby, sid, p, tileUpdates, deathList) {
  if (!p.alive) return;
  p.alive = false;
  // Clear trail from grid
  p.trail.forEach(t => {
    if (lobby.grid[gIdx(t.x, t.y)] === p.numId) {
      lobby.grid[gIdx(t.x, t.y)] = -1;
      tileUpdates.push({ x: t.x, y: t.y, color: null });
    }
  });
  p.trail = [];
  deathList.push(sid);
}

// ── SOCKET ──
io.on('connection', (socket) => {
  console.log(`+ Connected: ${socket.id}`);

  socket.on('join', ({ name, skin }) => {
    const lobby = getAvailableLobby();
    const existingPlayers = Array.from(lobby.players.values());
    const spawn = getSpawnPoint(existingPlayers);
    const numId = lobby.colorIndex++;
    const color = PLAYER_COLORS[numId % PLAYER_COLORS.length];

    const player = {
      numId, x: spawn.x, y: spawn.y,
      dx: 1, dy: 0,
      trail: [], alive: true,
      name: (name || 'Anonimo').substring(0, 16),
      color,
      skin: skin || 0,
      score: 0
    };

    claimStart(lobby.grid, numId, spawn.x, spawn.y);
    lobby.players.set(socket.id, player);
    socket.join(lobby.id);
    socket.data.lobbyId = lobby.id;

    // Build initial grid state
    const gridTiles = [];
    const colorMap = {};
    for (const p of lobby.players.values()) colorMap[p.numId] = p.color;
    for (let i = 0; i < lobby.grid.length; i++) {
      const o = lobby.grid[i];
      if (o >= 0 && colorMap[o]) {
        gridTiles.push({ x: i % COLS, y: Math.floor(i / COLS), color: colorMap[o] });
      }
    }

    // Build player list
    const playerList = Array.from(lobby.players.entries()).map(([sid, p]) => ({
      sid, numId: p.numId, name: p.name, x: p.x, y: p.y,
      color: p.color, skin: p.skin, alive: p.alive, score: p.score, trail: p.trail
    }));

    socket.emit('init', {
      mySid: socket.id,
      myNumId: numId,
      myColor: color,
      lobbyId: lobby.id,
      cols: COLS, rows: ROWS,
      grid: gridTiles,
      players: playerList
    });

    // Notify others
    socket.to(lobby.id).emit('playerJoined', {
      sid: socket.id, numId, name: player.name,
      x: player.x, y: player.y, color, skin: player.skin,
      alive: true, score: 0, trail: []
    });

    // Start loop
    if (!lobby.interval) {
      lobby.interval = setInterval(() => stepLobby(lobby), STEP_MS);
      console.log(`Started game loop for ${lobby.id}`);
    }

    console.log(`${player.name} joined ${lobby.id} (${lobby.players.size}/${MAX_PLAYERS})`);
  });

  socket.on('dir', ({ dx, dy }) => {
    const lobby = lobbies.get(socket.data.lobbyId);
    if (!lobby) return;
    const p = lobby.players.get(socket.id);
    if (!p || !p.alive) return;
    // Prevent 180 reversal
    if (dx === -p.dx && dy === 0) return;
    if (dy === -p.dy && dx === 0) return;
    p.dx = dx; p.dy = dy;
  });

  socket.on('respawn', ({ skin }) => {
    const lobby = lobbies.get(socket.data.lobbyId);
    if (!lobby) return;
    const p = lobby.players.get(socket.id);
    if (!p || p.alive) return;
    const spawn = getSpawnPoint(Array.from(lobby.players.values()).filter(x => x.alive));
    p.x = spawn.x; p.y = spawn.y;
    p.dx = 1; p.dy = 0;
    p.trail = []; p.alive = true;
    if (skin !== undefined) p.skin = skin;
    claimStart(lobby.grid, p.numId, p.x, p.y);

    const colorMap = {};
    for (const pl of lobby.players.values()) colorMap[pl.numId] = pl.color;
    const gridTiles = [];
    for (let i = 0; i < lobby.grid.length; i++) {
      const o = lobby.grid[i];
      if (o >= 0 && colorMap[o]) gridTiles.push({ x: i % COLS, y: Math.floor(i / COLS), color: colorMap[o] });
    }
    socket.emit('respawned', { x: p.x, y: p.y, grid: gridTiles });
    io.to(lobby.id).emit('playerRespawned', { sid: socket.id, x: p.x, y: p.y, skin: p.skin });
  });

  socket.on('disconnect', () => {
    const lobby = lobbies.get(socket.data.lobbyId);
    if (!lobby) return;
    const p = lobby.players.get(socket.id);
    if (p) console.log(`${p.name} left ${lobby.id}`);
    lobby.players.delete(socket.id);
    io.to(lobby.id).emit('playerLeft', socket.id);
    if (lobby.players.size === 0) {
      clearInterval(lobby.interval);
      lobby.interval = null;
      lobbies.delete(lobby.id);
      console.log(`Closed empty lobby ${lobby.id}`);
    }
  });
});

// API
app.get('/api/lobbies', (req, res) => {
  res.json(Array.from(lobbies.values()).map(l => ({
    id: l.id, players: l.players.size, max: MAX_PLAYERS
  })));
});

app.get('/health', (req, res) => res.json({ status: 'ok', lobbies: lobbies.size }));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🍕 Tralaleritos server on port ${PORT}`));
