
import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 2567;
const DATA_DIR = path.join(__dirname, "../data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "[]", "utf8");

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const rooms = {
  "beach-01": { id: "beach-01", name: "Azure Beach", maxPlayers: 20, players: new Map() },
  "beach-02": { id: "beach-02", name: "Coral Coast", maxPlayers: 20, players: new Map() },
  "beach-03": { id: "beach-03", name: "Sunset Bay", maxPlayers: 20, players: new Map() }
};

const sessions = new Map();
const npcState = new Map();

function readUsers() {
  return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
}
function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
}
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const attempt = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(attempt, "hex"));
}
function issueToken(user) {
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, { userId: user.id, email: user.email, username: user.username });
  return token;
}
function publicServers() {
  return Object.values(rooms).map((room) => ({
    id: room.id,
    name: room.name,
    players: room.players.size,
    maxPlayers: room.maxPlayers
  }));
}
function ensureNPCs(roomId) {
  if (npcState.has(roomId)) return;
  npcState.set(roomId, [
    { id: `${roomId}-npc-1`, username: "Guide", x: 1900, y: 580 },
    { id: `${roomId}-npc-2`, username: "Dock Bot", x: 2280, y: 690 }
  ]);
}
function roomSnapshot(roomId) {
  const room = rooms[roomId];
  ensureNPCs(roomId);
  return {
    players: Array.from(room.players.values()),
    npcs: npcState.get(roomId)
  };
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/api/servers", (_req, res) => res.json(publicServers()));

app.post("/api/register", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Invalid email." });
  }
  if (!/^[a-zA-Z0-9_ -]{3,16}$/.test(username)) {
    return res.status(400).json({ error: "Username must be 3-16 valid characters." });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }

  const users = readUsers();
  if (users.some((u) => u.email === email)) {
    return res.status(409).json({ error: "Email already exists." });
  }
  if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(409).json({ error: "Username already taken." });
  }

  const user = {
    id: crypto.randomUUID(),
    email,
    username,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString()
  };
  users.push(user);
  writeUsers(users);

  const token = issueToken(user);
  res.json({ token, profile: { email: user.email, username: user.username } });
});

app.post("/api/login", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const users = readUsers();
  const user = users.find((u) => u.email === email);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: "Invalid login." });
  }

  const token = issueToken(user);
  res.json({ token, profile: { email: user.email, username: user.username } });
});

io.on("connection", (socket) => {
  const { token, serverId = "beach-01" } = socket.handshake.auth || {};
  const session = sessions.get(token);
  const room = rooms[serverId];

  if (!session || !room) {
    socket.emit("error_message", { error: "Unauthorized or unknown server." });
    return socket.disconnect(true);
  }
  if (room.players.size >= room.maxPlayers) {
    socket.emit("error_message", { error: "Server is full." });
    return socket.disconnect(true);
  }

  const player = {
    id: socket.id,
    username: session.username,
    x: 760,
    y: 980,
    direction: "down"
  };

  room.players.set(socket.id, player);
  socket.join(serverId);
  socket.emit("room_joined", { server: publicServers().find((s) => s.id === serverId), self: player, snapshot: roomSnapshot(serverId) });
  io.to(serverId).emit("room_state", roomSnapshot(serverId));

  socket.on("move", (payload = {}) => {
    const current = room.players.get(socket.id);
    if (!current) return;
    current.x = Number(payload.x ?? current.x);
    current.y = Number(payload.y ?? current.y);
    current.direction = payload.direction || current.direction;
    room.players.set(socket.id, current);
    socket.to(serverId).emit("player_moved", current);
  });

  socket.on("disconnect", () => {
    room.players.delete(socket.id);
    io.to(serverId).emit("room_state", roomSnapshot(serverId));
  });
});

setInterval(() => {
  Object.values(rooms).forEach((room) => {
    ensureNPCs(room.id);
    const npcs = npcState.get(room.id);
    npcs.forEach((npc, idx) => {
      npc.x += Math.sin(Date.now() / 900 + idx) * 6;
      npc.y += Math.cos(Date.now() / 1100 + idx) * 5;
    });
    io.to(room.id).emit("npc_state", npcs);
  });
}, 1200);

server.listen(PORT, () => {
  console.log(`Los Tralaleritos server starter running on http://localhost:${PORT}`);
});
