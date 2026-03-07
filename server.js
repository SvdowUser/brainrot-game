
import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const GRID_W = 72;
const GRID_H = 42;
const TICK_MS = 120;
const PLAYER_LIMIT = 20;
const BOT_COUNT = 4;

const SKINS = [
  { id: "aqua", name: "Aqua", color: "#39B8FF", accent: "#8EDCFF", unlocked: true },
  { id: "lime", name: "Lime", color: "#5EDB2A", accent: "#A7FF8A", unlocked: true },
  { id: "sunset", name: "Sunset", color: "#FF8B3D", accent: "#FFD06B", unlocked: true },
  { id: "void-1", name: "Coming Soon", color: "#1E2430", accent: "#FFFFFF", unlocked: false },
  { id: "void-2", name: "Coming Soon", color: "#1E2430", accent: "#FFFFFF", unlocked: false },
  { id: "void-3", name: "Coming Soon", color: "#1E2430", accent: "#FFFFFF", unlocked: false }
];

const directions = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};
const oppositeDir = { up:"down", down:"up", left:"right", right:"left" };

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static(path.join(__dirname, "public")));

const players = new Map();

function key(x, y) { return `${x},${y}`; }
function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function safeName(v) {
  const s = String(v || "Guest").replace(/[^a-zA-Z0-9 _-]/g, "").trim().slice(0, 14);
  return s || "Guest";
}
function getSkin(id) { return SKINS.find(s => s.id === id && s.unlocked) || SKINS[0]; }

function createBaseTerritory(cx, cy) {
  const set = new Set();
  for (let y = cy - 2; y <= cy + 2; y++) {
    for (let x = cx - 2; x <= cx + 2; x++) {
      if (x >= 1 && x < GRID_W - 1 && y >= 1 && y < GRID_H - 1) set.add(key(x, y));
    }
  }
  return set;
}

function randomSpawn() {
  return choice([
    { x: 8, y: 8 }, { x: GRID_W - 9, y: 8 }, { x: 8, y: GRID_H - 9 },
    { x: GRID_W - 9, y: GRID_H - 9 }, { x: Math.floor(GRID_W / 2), y: 8 },
    { x: Math.floor(GRID_W / 2), y: GRID_H - 9 }
  ]);
}

function resetPlayer(p) {
  const spawn = randomSpawn();
  p.x = spawn.x;
  p.y = spawn.y;
  p.dir = choice(["up", "down", "left", "right"]);
  p.nextDir = p.dir;
  p.alive = true;
  p.respawnAt = 0;
  p.trail = [];
  p.trailSet = new Set();
  p.territory = createBaseTerritory(spawn.x, spawn.y);
  p.score = p.territory.size;
  p.bubble = "";
  p.bubbleUntil = 0;
}

function createPlayer(id, name, skinId, isBot = false) {
  const skin = getSkin(skinId);
  const p = {
    id,
    name: safeName(name),
    skinId: skin.id,
    color: skin.color,
    accent: skin.accent,
    isBot,
    x: 0,
    y: 0,
    dir: "right",
    nextDir: "right",
    territory: new Set(),
    trail: [],
    trailSet: new Set(),
    alive: true,
    respawnAt: 0,
    score: 0,
    coins: 0,
    kills: 0,
    bubble: "",
    bubbleUntil: 0,
    botTurnAt: 0
  };
  resetPlayer(p);
  return p;
}

function setBubble(p, txt) {
  p.bubble = String(txt || "").slice(0, 70);
  p.bubbleUntil = Date.now() + 5000;
}
function systemMessage(text) {
  io.emit("systemMessage", { text, at: Date.now() });
}

function claimTrailArea(p) {
  if (!p.trail.length) return;
  let minX = GRID_W, minY = GRID_H, maxX = 0, maxY = 0;
  for (const step of p.trail) {
    minX = Math.min(minX, step.x);
    minY = Math.min(minY, step.y);
    maxX = Math.max(maxX, step.x);
    maxY = Math.max(maxY, step.y);
    p.territory.add(key(step.x, step.y));
  }
  for (let y = clamp(minY, 1, GRID_H - 2); y <= clamp(maxY, 1, GRID_H - 2); y++) {
    for (let x = clamp(minX, 1, GRID_W - 2); x <= clamp(maxX, 1, GRID_W - 2); x++) {
      p.territory.add(key(x, y));
    }
  }
  p.trail = [];
  p.trailSet.clear();
  p.score = p.territory.size;
}

function killPlayer(victim, killer = null) {
  if (!victim.alive) return;
  victim.alive = false;
  victim.respawnAt = Date.now() + 2500;
  victim.trail = [];
  victim.trailSet.clear();
  setBubble(victim, "💥");
  if (killer && killer.id !== victim.id) {
    killer.kills += 1;
    killer.coins += 5;
    setBubble(killer, "+5 coins");
  }
}

function trailOwnerAt(x, y) {
  const k = key(x, y);
  for (const p of players.values()) if (p.trailSet.has(k)) return p;
  return null;
}

function movePlayer(p) {
  if (!p.alive) {
    if (Date.now() >= p.respawnAt) resetPlayer(p);
    return;
  }
  if (p.nextDir && p.nextDir !== oppositeDir[p.dir]) p.dir = p.nextDir;
  const v = directions[p.dir];
  const nx = p.x + v.x;
  const ny = p.y + v.y;
  if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) {
    killPlayer(p);
    return;
  }
  p.x = nx;
  p.y = ny;

  const owner = trailOwnerAt(nx, ny);
  if (owner) {
    if (owner.id === p.id) {
      if (!p.territory.has(key(nx, ny))) {
        killPlayer(p);
        return;
      }
    } else {
      killPlayer(owner, p);
    }
  }

  const k = key(nx, ny);
  const inside = p.territory.has(k);
  if (!inside) {
    if (!p.trailSet.has(k)) {
      p.trail.push({ x: nx, y: ny });
      p.trailSet.add(k);
    }
  } else if (p.trail.length) {
    claimTrailArea(p);
  }
  p.score = p.territory.size;
}

function updateBots() {
  const dirs = ["up", "down", "left", "right"];
  for (const p of players.values()) {
    if (!p.isBot || !p.alive) continue;
    if (Date.now() >= p.botTurnAt) {
      p.nextDir = choice(dirs.filter(d => d !== oppositeDir[p.dir]));
      p.botTurnAt = Date.now() + 600 + Math.random() * 1000;
    }
    const ahead = directions[p.dir];
    const tx = p.x + ahead.x * 2;
    const ty = p.y + ahead.y * 2;
    if (tx < 1 || ty < 1 || tx > GRID_W - 2 || ty > GRID_H - 2) {
      p.nextDir = choice(dirs.filter(d => d !== oppositeDir[p.dir]));
    }
  }
}

function serialisePlayer(p) {
  return {
    id: p.id, name: p.name, x: p.x, y: p.y, dir: p.dir,
    color: p.color, accent: p.accent, skinId: p.skinId,
    territory: [...p.territory], trail: p.trail,
    alive: p.alive, score: p.score, kills: p.kills, coins: p.coins,
    bubble: Date.now() < p.bubbleUntil ? p.bubble : "",
    isBot: p.isBot
  };
}

function currentState() {
  const list = [...players.values()].map(serialisePlayer);
  const leaderboard = list.slice().sort((a, b) => (b.score + b.kills * 10) - (a.score + a.kills * 10)).slice(0, 8)
    .map((p, i) => ({ rank: i + 1, id: p.id, name: p.name, score: p.score, kills: p.kills, coins: p.coins, color: p.color }));
  return { t: Date.now(), grid: { w: GRID_W, h: GRID_H }, players: list, leaderboard };
}

io.on("connection", (socket) => {
  socket.emit("config", { title: "tralala.io", grid: { w: GRID_W, h: GRID_H }, skins: SKINS, playerLimit: PLAYER_LIMIT });

  socket.on("join", ({ name, skinId }) => {
    if ([...players.values()].filter(p => !p.isBot).length >= PLAYER_LIMIT) {
      socket.emit("joinError", { message: "Server is full." });
      return;
    }
    const p = createPlayer(socket.id, name, skinId, false);
    players.set(socket.id, p);
    socket.emit("joined", { id: socket.id });
    systemMessage(`${p.name} joined tralala.io`);
  });

  socket.on("input", ({ dir }) => {
    const p = players.get(socket.id);
    if (p && directions[dir]) p.nextDir = dir;
  });

  socket.on("chat", ({ text }) => {
    const p = players.get(socket.id);
    if (!p) return;
    const clean = String(text || "").trim().slice(0, 70);
    if (!clean) return;
    setBubble(p, clean);
    io.emit("chatMessage", { from: p.name, text: clean, id: p.id, at: Date.now() });
  });

  socket.on("disconnect", () => {
    const p = players.get(socket.id);
    if (p) {
      systemMessage(`${p.name} left`);
      players.delete(socket.id);
    }
  });
});

for (let i = 0; i < BOT_COUNT; i++) {
  const bot = createPlayer(`bot-${i+1}`, ["Nova","Kai","Luma","Pixel"][i] || `Bot${i+1}`, SKINS[i % 3].id, true);
  players.set(bot.id, bot);
}

setInterval(() => {
  updateBots();
  for (const p of players.values()) movePlayer(p);
  io.emit("state", currentState());
}, TICK_MS);

server.listen(PORT, () => {
  console.log(`tralala.io listening on http://0.0.0.0:${PORT}`);
});
