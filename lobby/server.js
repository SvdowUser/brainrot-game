const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── DATABASE (SQLite) ──
const Database = require('better-sqlite3');
const db = new Database('/var/www/tralaleritos/brainrot.db');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL COLLATE NOCASE,
    email TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    coins INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    games INTEGER DEFAULT 0,
    best_score REAL DEFAULT 0,
    skin INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
`);

// ── AUTH HELPERS ──
function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}
function getUser(token) {
  if (!token) return null;
  const t = token.replace('Bearer ', '');
  const session = db.prepare('SELECT * FROM sessions WHERE token=? AND expires_at>?').get(t, Math.floor(Date.now()/1000));
  if (!session) return null;
  return db.prepare('SELECT * FROM users WHERE id=?').get(session.user_id);
}

// ── XP / LEVEL ──
function xpForLevel(level) { return Math.floor(100 * Math.pow(level, 1.5)); }
function getLevelFromXp(xp) {
  let level = 1;
  while (xpForLevel(level+1) <= xp) level++;
  return level;
}

// ── AUTH ROUTES ──
app.post('/api/auth/register', (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: 'Tutti i campi sono obbligatori' });
  if (username.length < 3 || username.length > 16)
    return res.status(400).json({ error: 'Username: 3-16 caratteri' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password: minimo 6 caratteri' });
  if (!/^[a-zA-Z0-9_]+$/.test(username))
    return res.status(400).json({ error: 'Username: solo lettere, numeri, _' });

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);
  try {
    const stmt = db.prepare('INSERT INTO users (username,email,password_hash,salt) VALUES (?,?,?,?)');
    const result = stmt.run(username, email.toLowerCase(), hash, salt);
    const token = generateToken();
    const expires = Math.floor(Date.now()/1000) + 30*24*3600; // 30 days
    db.prepare('INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)').run(token, result.lastInsertRowid, expires);
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(result.lastInsertRowid);
    res.json({ ok: true, token, user: safeUser(user) });
  } catch(e) {
    if (e.message.includes('UNIQUE')) {
      if (e.message.includes('username')) return res.status(400).json({ error: 'Username già in uso' });
      return res.status(400).json({ error: 'Email già in uso' });
    }
    res.status(500).json({ error: 'Errore del server' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { login, password } = req.body; // login = username or email
  if (!login || !password) return res.status(400).json({ error: 'Inserisci username e password' });
  const user = db.prepare('SELECT * FROM users WHERE username=? OR email=?').get(login, login.toLowerCase());
  if (!user) return res.status(401).json({ error: 'Utente non trovato' });
  const hash = hashPassword(password, user.salt);
  if (hash !== user.password_hash) return res.status(401).json({ error: 'Password errata' });
  const token = generateToken();
  const expires = Math.floor(Date.now()/1000) + 30*24*3600;
  db.prepare('INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)').run(token, user.id, expires);
  res.json({ ok: true, token, user: safeUser(user) });
});

app.post('/api/auth/logout', (req, res) => {
  const token = (req.headers.authorization||'').replace('Bearer ','');
  if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(token);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const user = getUser(req.headers.authorization);
  if (!user) return res.status(401).json({ error: 'Non autenticato' });
  res.json({ user: safeUser(user) });
});

// ── PROFILE ROUTES ──
app.patch('/api/profile/skin', (req, res) => {
  const user = getUser(req.headers.authorization);
  if (!user) return res.status(401).json({ error: 'Non autenticato' });
  const { skin } = req.body;
  db.prepare('UPDATE users SET skin=? WHERE id=?').run(skin||0, user.id);
  res.json({ ok: true });
});

app.get('/api/profile/:username', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE username=?').get(req.params.username);
  if (!user) return res.status(404).json({ error: 'Utente non trovato' });
  res.json({ user: safeUser(user) });
});

// ── GAME RESULT (called by game server after match) ──
app.post('/api/game/result', (req, res) => {
  const { token, score, won, territory } = req.body;
  const user = getUser('Bearer '+token);
  if (!user) return res.status(401).json({ error: 'Non autenticato' });

  // XP formula: base 10 + territory bonus + win bonus
  const xpGained = Math.floor(10 + territory*2 + (won ? 50 : 0));
  const coinsGained = Math.floor(5 + territory + (won ? 20 : 0));
  const newXp = user.xp + xpGained;
  const newLevel = getLevelFromXp(newXp);
  const newBest = Math.max(user.best_score, territory);

  db.prepare(`UPDATE users SET
    xp=?, level=?, coins=coins+?, games=games+1,
    wins=wins+?, best_score=?
    WHERE id=?`).run(newXp, newLevel, coinsGained, won?1:0, newBest, user.id);

  const levelUp = newLevel > user.level;
  res.json({ ok: true, xpGained, coinsGained, levelUp, newLevel, newXp });
});

// ── LEADERBOARD ──
app.get('/api/leaderboard', (req, res) => {
  const top = db.prepare('SELECT username,level,xp,wins,best_score FROM users ORDER BY xp DESC LIMIT 50').all();
  res.json(top);
});

function safeUser(u) {
  return {
    id: u.id, username: u.username, email: u.email,
    xp: u.xp, level: u.level, coins: u.coins,
    wins: u.wins, games: u.games, best_score: u.best_score,
    skin: u.skin, created_at: u.created_at,
    xpForNextLevel: xpForLevel(u.level+1),
    xpProgress: u.xp - xpForLevel(u.level),
    xpNeeded: xpForLevel(u.level+1) - xpForLevel(u.level),
  };
}

// ── GAME SERVERS REGISTRY ──
const gameServers = new Map();

app.post('/api/register', (req, res) => {
  const { id, ip, port, lobbies, maxLobbies } = req.body;
  gameServers.set(id, { id, ip, port, lobbies:lobbies||0, maxLobbies:maxLobbies||10, lastSeen:Date.now() });
  res.json({ ok: true });
});

app.post('/api/heartbeat', (req, res) => {
  const { id, lobbies, players } = req.body;
  if (gameServers.has(id)) { const s=gameServers.get(id); s.lobbies=lobbies; s.players=players; s.lastSeen=Date.now(); }
  res.json({ ok: true });
});

app.get('/api/best-server', (req, res) => {
  const now = Date.now();
  for (const [id,s] of gameServers) { if (now-s.lastSeen>30000) gameServers.delete(id); }
  let best = null;
  for (const s of gameServers.values()) { if (s.lobbies<s.maxLobbies&&(!best||s.lobbies>best.lobbies)) best=s; }
  if (!best) return res.json({ ip: process.env.GAME_SERVER_IP||'89.167.75.175', port:3000 });
  res.json({ ip: best.ip, port: best.port });
});

app.get('/api/servers', (req, res) => {
  const list = Array.from(gameServers.values()).map(s=>({...s, online:Date.now()-s.lastSeen<30000}));
  res.json(list);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🍕 Lobby+Auth server on port ${PORT}`));
