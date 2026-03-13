const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── CONFIG ──
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@brainrotbattle.io';
const BASE_URL = process.env.BASE_URL || 'http://brainrotbattle.io';

// ── RESEND EMAIL ──
async function sendEmail(to, subject, html) {
  if (!RESEND_API_KEY) { console.log('[EMAIL SKIPPED] No API key. Would send to:', to); return true; }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer '+RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, html })
    });
    const d = await r.json();
    if (d.id) { console.log('[EMAIL OK]', d.id); return true; }
    console.error('[EMAIL FAIL]', d); return false;
  } catch(e) { console.error('[EMAIL ERROR]', e.message); return false; }
}

const emailVerify = (name, url) => `
<div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#f0f9ff;padding:32px;border-radius:16px;">
  <h1 style="color:#1e3a5f">🧠 BrainRotBattle.io</h1>
  <div style="background:white;border-radius:12px;padding:24px;margin-top:16px;">
    <h2 style="color:#1e3a5f">Ciao ${name}! 👋</h2>
    <p style="color:#475569;margin-bottom:20px">Clicca il bottone per confermare la tua email e attivare l'account.</p>
    <a href="${url}" style="background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:white;padding:14px 32px;border-radius:100px;text-decoration:none;font-weight:700;display:inline-block">✅ Conferma Email</a>
    <p style="color:#94a3b8;font-size:.8rem;margin-top:16px">Il link scade tra 24 ore.</p>
  </div>
</div>`;

const emailReset = (name, url) => `
<div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#f0f9ff;padding:32px;border-radius:16px;">
  <h1 style="color:#1e3a5f">🧠 BrainRotBattle.io</h1>
  <div style="background:white;border-radius:12px;padding:24px;margin-top:16px;">
    <h2 style="color:#1e3a5f">Reset Password</h2>
    <p style="color:#475569;margin-bottom:20px">Ciao ${name}, hai richiesto il reset della password.</p>
    <a href="${url}" style="background:linear-gradient(135deg,#ef4444,#dc2626);color:white;padding:14px 32px;border-radius:100px;text-decoration:none;font-weight:700;display:inline-block">🔑 Reset Password</a>
    <p style="color:#94a3b8;font-size:.8rem;margin-top:16px">Il link scade tra 1 ora. Se non hai richiesto il reset, ignora questa email.</p>
  </div>
</div>`;

// ── DATABASE ──
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
    verified INTEGER DEFAULT 0,
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    coins INTEGER DEFAULT 100,
    wins INTEGER DEFAULT 0,
    games INTEGER DEFAULT 0,
    best_score REAL DEFAULT 0,
    skin INTEGER DEFAULT 0,
    avatar INTEGER DEFAULT 0,
    unlocked_skins TEXT DEFAULT '0',
    created_at INTEGER DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS temp_tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
`);

// ── SECURITY ──
function hashPass(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 210000, 64, 'sha512').toString('hex');
}
function genToken(n=32) { return crypto.randomBytes(n).toString('hex'); }
function safeCompare(a, b) {
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(a,'hex'), Buffer.from(b,'hex')); }
  catch { return false; }
}

// Rate limiter
const rl = new Map();
function rateLimit(key, max, ms) {
  const now = Date.now();
  let e = rl.get(key) || { n:0, r:now+ms };
  if (now > e.r) e = { n:0, r:now+ms };
  e.n++; rl.set(key, e);
  return e.n > max;
}

// Auth helpers
function getSessionUser(req) {
  const tok = (req.headers.authorization||'').replace('Bearer ','').trim();
  if (!tok) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE token=? AND expires_at>?').get(tok, ts());
  if (!s) return null;
  return db.prepare('SELECT * FROM users WHERE id=?').get(s.user_id);
}
function auth(req, res, next) {
  req.user = getSessionUser(req);
  if (!req.user) return res.status(401).json({ error: 'Non autenticato' });
  next();
}
function ts() { return Math.floor(Date.now()/1000); }

// XP / Level
function xpForLevel(l) { return Math.floor(100 * Math.pow(l, 1.5)); }
function levelFromXp(xp) { let l=1; while(xpForLevel(l+1)<=xp) l++; return l; }
function safe(u) {
  const l = u.level||1;
  return {
    id:u.id, username:u.username, email:u.email, verified:!!u.verified,
    xp:u.xp, level:l, coins:u.coins, wins:u.wins, games:u.games,
    best_score:parseFloat(u.best_score||0).toFixed(1), skin:u.skin||0,
    avatar:u.avatar||0,
    unlocked_skins: u.unlocked_skins ? u.unlocked_skins.split(',').map(Number) : [0],
    created_at:u.created_at,
    xpForNextLevel:xpForLevel(l+1),
    xpProgress:u.xp-xpForLevel(l),
    xpNeeded:xpForLevel(l+1)-xpForLevel(l),
  };
}
// ─────────────────────────────────────────
// AUTH ROUTES
// ─────────────────────────────────────────

// REGISTER
app.post('/api/auth/register', async (req,res) => {
  const ip = req.ip;
  if (rateLimit('reg:'+ip, 5, 3600000)) return res.status(429).json({ error: 'Troppi tentativi. Riprova tra un\'ora.' });
  const { username, email, password } = req.body||{};
  if (!username?.trim()||!email?.trim()||!password) return res.status(400).json({ error: 'Tutti i campi sono obbligatori' });
  if (username.length<3||username.length>16) return res.status(400).json({ error: 'Username: 3–16 caratteri' });
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.status(400).json({ error: 'Username: solo lettere, numeri e _' });
  if (password.length<6) return res.status(400).json({ error: 'Password: minimo 6 caratteri' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Email non valida' });

  const salt = crypto.randomBytes(32).toString('hex');
  const hash = hashPass(password, salt);
  try {
    const r = db.prepare('INSERT INTO users (username,email,password_hash,salt) VALUES (?,?,?,?)').run(username.trim(), email.toLowerCase().trim(), hash, salt);
    const tok = genToken(); const exp = ts()+30*86400;
    db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(tok, r.lastInsertRowid, exp);
    // Email verify token
    const vtok = genToken();
    db.prepare('INSERT INTO temp_tokens VALUES (?,?,?,?)').run(vtok, r.lastInsertRowid, 'verify', ts()+86400);
    await sendEmail(email, '✅ Conferma il tuo account BrainRotBattle.io', emailVerify(username, `${BASE_URL}/api/auth/verify/${vtok}`));
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(r.lastInsertRowid);
    res.json({ ok:true, token:tok, user:safe(user), needVerify:true });
  } catch(e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: e.message.includes('username') ? 'Username già in uso' : 'Email già in uso' });
    console.error(e); res.status(500).json({ error: 'Errore del server' });
  }
});

// VERIFY EMAIL
app.get('/api/auth/verify/:token', (req,res) => {
  const row = db.prepare('SELECT * FROM temp_tokens WHERE token=? AND type=? AND expires_at>?').get(req.params.token,'verify',ts());
  if (!row) return res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#fef2f2"><h1>🧠 BrainRotBattle.io</h1><h2 style="color:#ef4444">❌ Link non valido o scaduto</h2><a href="${BASE_URL}">Torna al gioco</a></body></html>`);
  db.prepare('UPDATE users SET verified=1 WHERE id=?').run(row.user_id);
  db.prepare('DELETE FROM temp_tokens WHERE token=?').run(req.params.token);
  res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#f0fdf4"><h1>🧠 BrainRotBattle.io</h1><h2 style="color:#22c55e">✅ Email confermata!</h2><p>Il tuo account è ora attivo. Puoi chiudere questa finestra.</p><a href="${BASE_URL}" style="display:inline-block;margin-top:20px;background:#3b82f6;color:white;padding:12px 28px;border-radius:100px;text-decoration:none;font-weight:700">Gioca ora! 🍕</a></body></html>`);
});

// RESEND VERIFY
app.post('/api/auth/resend-verify', auth, async (req,res) => {
  if (req.user.verified) return res.json({ ok:true });
  db.prepare('DELETE FROM temp_tokens WHERE user_id=? AND type=?').run(req.user.id,'verify');
  const vtok=genToken();
  db.prepare('INSERT INTO temp_tokens VALUES (?,?,?,?)').run(vtok, req.user.id, 'verify', ts()+86400);
  await sendEmail(req.user.email, '✅ Conferma il tuo account', emailVerify(req.user.username, `${BASE_URL}/api/auth/verify/${vtok}`));
  res.json({ ok:true });
});

// LOGIN
app.post('/api/auth/login', (req,res) => {
  const ip = req.ip;
  if (rateLimit('login:'+ip, 10, 900000)) return res.status(429).json({ error: 'Troppi tentativi. Riprova tra 15 minuti.' });
  const { login, password } = req.body||{};
  if (!login||!password) return res.status(400).json({ error: 'Inserisci username e password' });
  const u = db.prepare('SELECT * FROM users WHERE username=? OR email=?').get(login.trim(), login.trim().toLowerCase());
  if (!u) return res.status(401).json({ error: 'Utente non trovato' });
  const h = hashPass(password, u.salt);
  if (!safeCompare(h, u.password_hash)) return res.status(401).json({ error: 'Password errata' });
  const tok=genToken(); const exp=ts()+30*86400;
  db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(tok, u.id, exp);
  res.json({ ok:true, token:tok, user:safe(u) });
});

// FORGOT PASSWORD
app.post('/api/auth/forgot', async (req,res) => {
  const { email } = req.body||{};
  res.json({ ok:true }); // always ok - don't reveal if email exists
  if (!email) return;
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(email.toLowerCase().trim());
  if (!u) return;
  db.prepare('DELETE FROM temp_tokens WHERE user_id=? AND type=?').run(u.id,'reset');
  const rtok=genToken();
  db.prepare('INSERT INTO temp_tokens VALUES (?,?,?,?)').run(rtok, u.id, 'reset', ts()+3600);
  await sendEmail(u.email, '🔑 Reset Password BrainRotBattle.io', emailReset(u.username, `${BASE_URL}/reset-password?token=${rtok}`));
});

// RESET PASSWORD PAGE
app.get('/reset-password', (req,res) => {
  const { token } = req.query;
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Reset Password</title>
  <style>body{font-family:sans-serif;background:linear-gradient(150deg,#e0f2fe,#f0fdf4);min-height:100vh;display:flex;align-items:center;justify-content:center;}
  .c{background:white;padding:32px;border-radius:20px;box-shadow:0 8px 32px rgba(0,0,0,.1);width:360px;}
  h1{font-size:1.5rem;color:#1e3a5f;margin-bottom:16px}
  input{width:100%;padding:12px;border:2px solid #e2e8f0;border-radius:10px;font-size:.95rem;margin-bottom:10px;box-sizing:border-box;outline:none}
  input:focus{border-color:#3b82f6}
  button{width:100%;padding:13px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:white;border:none;border-radius:10px;font-size:1rem;cursor:pointer;font-weight:700}
  .m{font-size:.85rem;font-weight:700;margin-bottom:10px;min-height:20px}</style></head>
  <body><div class="c"><h1>🧠 Nuova Password</h1>
  <div class="m" id="m"></div>
  <input type="password" id="a" placeholder="Nuova password (min. 6 caratteri)"/>
  <input type="password" id="b" placeholder="Ripeti la password"/>
  <button onclick="go()">Salva Password</button></div>
  <script>
  async function go(){
    const a=document.getElementById('a').value,b=document.getElementById('b').value,m=document.getElementById('m');
    if(a.length<6){m.style.color='#ef4444';m.textContent='Password troppo corta';return}
    if(a!==b){m.style.color='#ef4444';m.textContent='Le password non coincidono';return}
    const r=await fetch('/api/auth/reset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'${token}',password:a})});
    const d=await r.json();
    if(d.ok){m.style.color='#22c55e';m.textContent='✅ Password cambiata!';setTimeout(()=>location.href='/',2000)}
    else{m.style.color='#ef4444';m.textContent=d.error||'Errore'}
  }
  </script></body></html>`);
});

// RESET PASSWORD API
app.post('/api/auth/reset', (req,res) => {
  const { token, password } = req.body||{};
  if (!token||!password) return res.status(400).json({ error: 'Dati mancanti' });
  if (password.length<6) return res.status(400).json({ error: 'Password troppo corta' });
  const row = db.prepare('SELECT * FROM temp_tokens WHERE token=? AND type=? AND expires_at>?').get(token,'reset',ts());
  if (!row) return res.status(400).json({ error: 'Link non valido o scaduto' });
  const salt = crypto.randomBytes(32).toString('hex');
  const hash = hashPass(password, salt);
  db.prepare('UPDATE users SET password_hash=?,salt=? WHERE id=?').run(hash, salt, row.user_id);
  db.prepare('DELETE FROM temp_tokens WHERE token=?').run(token);
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(row.user_id);
  res.json({ ok:true });
});

// ME / LOGOUT
app.get('/api/auth/me', auth, (req,res) => res.json({ user:safe(req.user) }));
app.post('/api/auth/logout', (req,res) => {
  const tok=(req.headers.authorization||'').replace('Bearer ','').trim();
  if(tok) db.prepare('DELETE FROM sessions WHERE token=?').run(tok);
  res.json({ ok:true });
});

// PROFILE
app.patch('/api/profile/skin', auth, (req,res) => {
  db.prepare('UPDATE users SET skin=? WHERE id=?').run(parseInt(req.body.skin)||0, req.user.id);
  res.json({ ok:true });
});
app.patch('/api/profile/avatar', auth, (req,res) => {
  db.prepare('UPDATE users SET avatar=? WHERE id=?').run(parseInt(req.body.avatar)||0, req.user.id);
  res.json({ ok:true });
});
// Unlock a skin for a user (called when they purchase/unlock)
app.post('/api/profile/unlock-skin', auth, (req,res) => {
  const skinIdx = parseInt(req.body.skin)||0;
  const u = req.user;
  const cur = u.unlocked_skins ? u.unlocked_skins.split(',').map(Number) : [0];
  if (!cur.includes(skinIdx)) cur.push(skinIdx);
  db.prepare('UPDATE users SET unlocked_skins=? WHERE id=?').run(cur.join(','), u.id);
  res.json({ ok:true, unlocked_skins:cur });
});
app.get('/api/profile/:username', (req,res) => {
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(req.params.username);
  if(!u) return res.status(404).json({ error:'Utente non trovato' });
  res.json({ user:safe(u) });
});

// GAME RESULT
app.post('/api/game/result', (req,res) => {
  const { token, territory, won } = req.body||{};
  const s = db.prepare('SELECT * FROM sessions WHERE token=? AND expires_at>?').get(token||'', ts());
  if(!s) return res.status(401).json({ error:'Non autenticato' });
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(s.user_id);
  if(!u) return res.status(401).json({ error:'Utente non trovato' });
  const xp = Math.floor(10+(territory||0)*2+(won?50:0));
  const coins = Math.floor(5+(territory||0)+(won?20:0));
  const newXp = u.xp+xp;
  const newLevel = levelFromXp(newXp);
  db.prepare('UPDATE users SET xp=?,level=?,coins=coins+?,games=games+1,wins=wins+?,best_score=? WHERE id=?')
    .run(newXp, newLevel, coins, won?1:0, Math.max(u.best_score,territory||0), u.id);
  res.json({ ok:true, xpGained:xp, coinsGained:coins, newXp, newCoins:u.coins+coins, levelUp:newLevel>u.level, newLevel });
});

// LEADERBOARD
app.get('/api/leaderboard', (req,res) => {
  res.json(db.prepare('SELECT username,level,xp,wins,best_score FROM users ORDER BY xp DESC LIMIT 50').all());
});

// GAME SERVERS
const gameServers = new Map();
app.post('/api/register', (req,res) => {
  const { id,ip,port,lobbies,maxLobbies } = req.body;
  gameServers.set(id, { id,ip,port,lobbies:lobbies||0,maxLobbies:maxLobbies||10,lastSeen:Date.now() });
  res.json({ ok:true });
});
app.post('/api/heartbeat', (req,res) => {
  const { id,lobbies,players } = req.body;
  if(gameServers.has(id)){ const s=gameServers.get(id); s.lobbies=lobbies; s.players=players; s.lastSeen=Date.now(); }
  res.json({ ok:true });
});
app.get('/api/best-server', (req,res) => {
  const now=Date.now();
  for(const [id,s] of gameServers) if(now-s.lastSeen>30000) gameServers.delete(id);
  let best=null;
  for(const s of gameServers.values()) if(s.lobbies<s.maxLobbies&&(!best||s.lobbies>best.lobbies)) best=s;
  if(!best) return res.json({ ip:process.env.GAME_SERVER_IP||'89.167.75.175', port:3000 });
  res.json({ ip:best.ip, port:best.port });
});
app.get('/api/servers', (req,res) => {
  res.json(Array.from(gameServers.values()).map(s=>({...s,online:Date.now()-s.lastSeen<30000})));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🍕 BrainRotBattle Auth+Lobby on port ${PORT}`));
    <a href="${url}" style="background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:white;padding:14px 32px;border-radius:100px;text-decoration:none;font-weight:700;display:inline-block">✅ Conferma Email</a>
    <p style="color:#94a3b8;font-size:.8rem;margin-top:16px">Il link scade tra 24 ore.</p>
  </div>
</div>`;

const emailReset = (name, url) => `
<div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#f0f9ff;padding:32px;border-radius:16px;">
  <h1 style="color:#1e3a5f">🧠 BrainRotBattle.io</h1>
  <div style="background:white;border-radius:12px;padding:24px;margin-top:16px;">
    <h2 style="color:#1e3a5f">Reset Password</h2>
    <p style="color:#475569;margin-bottom:20px">Ciao ${name}, hai richiesto il reset della password.</p>
    <a href="${url}" style="background:linear-gradient(135deg,#ef4444,#dc2626);color:white;padding:14px 32px;border-radius:100px;text-decoration:none;font-weight:700;display:inline-block">🔑 Reset Password</a>
    <p style="color:#94a3b8;font-size:.8rem;margin-top:16px">Il link scade tra 1 ora. Se non hai richiesto il reset, ignora questa email.</p>
  </div>
</div>`;

// ── DATABASE ──
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
    verified INTEGER DEFAULT 0,
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    coins INTEGER DEFAULT 100,
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
  CREATE TABLE IF NOT EXISTS temp_tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
`);

// ── SECURITY ──
function hashPass(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 210000, 64, 'sha512').toString('hex');
}
function genToken(n=32) { return crypto.randomBytes(n).toString('hex'); }
function safeCompare(a, b) {
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(a,'hex'), Buffer.from(b,'hex')); }
  catch { return false; }
}

// Rate limiter
const rl = new Map();
function rateLimit(key, max, ms) {
  const now = Date.now();
  let e = rl.get(key) || { n:0, r:now+ms };
  if (now > e.r) e = { n:0, r:now+ms };
  e.n++; rl.set(key, e);
  return e.n > max;
}

// Auth helpers
function getSessionUser(req) {
  const tok = (req.headers.authorization||'').replace('Bearer ','').trim();
  if (!tok) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE token=? AND expires_at>?').get(tok, ts());
  if (!s) return null;
  return db.prepare('SELECT * FROM users WHERE id=?').get(s.user_id);
}
function auth(req, res, next) {
  req.user = getSessionUser(req);
  if (!req.user) return res.status(401).json({ error: 'Non autenticato' });
  next();
}
function ts() { return Math.floor(Date.now()/1000); }

// XP / Level
function xpForLevel(l) { return Math.floor(100 * Math.pow(l, 1.5)); }
function levelFromXp(xp) { let l=1; while(xpForLevel(l+1)<=xp) l++; return l; }
function safe(u) {
  const l = u.level||1;
  return {
    id:u.id, username:u.username, email:u.email, verified:!!u.verified,
    xp:u.xp, level:l, coins:u.coins, wins:u.wins, games:u.games,
    best_score:parseFloat(u.best_score||0).toFixed(1), skin:u.skin||0,
    created_at:u.created_at,
    xpForNextLevel:xpForLevel(l+1),
    xpProgress:u.xp-xpForLevel(l),
    xpNeeded:xpForLevel(l+1)-xpForLevel(l),
  };
}

// ─────────────────────────────────────────
// AUTH ROUTES
// ─────────────────────────────────────────

// REGISTER
app.post('/api/auth/register', async (req,res) => {
  const ip = req.ip;
  if (rateLimit('reg:'+ip, 5, 3600000)) return res.status(429).json({ error: 'Troppi tentativi. Riprova tra un\'ora.' });
  const { username, email, password } = req.body||{};
  if (!username?.trim()||!email?.trim()||!password) return res.status(400).json({ error: 'Tutti i campi sono obbligatori' });
  if (username.length<3||username.length>16) return res.status(400).json({ error: 'Username: 3–16 caratteri' });
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.status(400).json({ error: 'Username: solo lettere, numeri e _' });
  if (password.length<6) return res.status(400).json({ error: 'Password: minimo 6 caratteri' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Email non valida' });

  const salt = crypto.randomBytes(32).toString('hex');
  const hash = hashPass(password, salt);
  try {
    const r = db.prepare('INSERT INTO users (username,email,password_hash,salt) VALUES (?,?,?,?)').run(username.trim(), email.toLowerCase().trim(), hash, salt);
    const tok = genToken(); const exp = ts()+30*86400;
    db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(tok, r.lastInsertRowid, exp);
    // Email verify token
    const vtok = genToken();
    db.prepare('INSERT INTO temp_tokens VALUES (?,?,?,?)').run(vtok, r.lastInsertRowid, 'verify', ts()+86400);
    await sendEmail(email, '✅ Conferma il tuo account BrainRotBattle.io', emailVerify(username, `${BASE_URL}/api/auth/verify/${vtok}`));
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(r.lastInsertRowid);
    res.json({ ok:true, token:tok, user:safe(user), needVerify:true });
  } catch(e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: e.message.includes('username') ? 'Username già in uso' : 'Email già in uso' });
    console.error(e); res.status(500).json({ error: 'Errore del server' });
  }
});

// VERIFY EMAIL
app.get('/api/auth/verify/:token', (req,res) => {
  const row = db.prepare('SELECT * FROM temp_tokens WHERE token=? AND type=? AND expires_at>?').get(req.params.token,'verify',ts());
  if (!row) return res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#fef2f2"><h1>🧠 BrainRotBattle.io</h1><h2 style="color:#ef4444">❌ Link non valido o scaduto</h2><a href="${BASE_URL}">Torna al gioco</a></body></html>`);
  db.prepare('UPDATE users SET verified=1 WHERE id=?').run(row.user_id);
  db.prepare('DELETE FROM temp_tokens WHERE token=?').run(req.params.token);
  res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#f0fdf4"><h1>🧠 BrainRotBattle.io</h1><h2 style="color:#22c55e">✅ Email confermata!</h2><p>Il tuo account è ora attivo. Puoi chiudere questa finestra.</p><a href="${BASE_URL}" style="display:inline-block;margin-top:20px;background:#3b82f6;color:white;padding:12px 28px;border-radius:100px;text-decoration:none;font-weight:700">Gioca ora! 🍕</a></body></html>`);
});

// RESEND VERIFY
app.post('/api/auth/resend-verify', auth, async (req,res) => {
  if (req.user.verified) return res.json({ ok:true });
  db.prepare('DELETE FROM temp_tokens WHERE user_id=? AND type=?').run(req.user.id,'verify');
  const vtok=genToken();
  db.prepare('INSERT INTO temp_tokens VALUES (?,?,?,?)').run(vtok, req.user.id, 'verify', ts()+86400);
  await sendEmail(req.user.email, '✅ Conferma il tuo account', emailVerify(req.user.username, `${BASE_URL}/api/auth/verify/${vtok}`));
  res.json({ ok:true });
});

// LOGIN
app.post('/api/auth/login', (req,res) => {
  const ip = req.ip;
  if (rateLimit('login:'+ip, 10, 900000)) return res.status(429).json({ error: 'Troppi tentativi. Riprova tra 15 minuti.' });
  const { login, password } = req.body||{};
  if (!login||!password) return res.status(400).json({ error: 'Inserisci username e password' });
  const u = db.prepare('SELECT * FROM users WHERE username=? OR email=?').get(login.trim(), login.trim().toLowerCase());
  if (!u) return res.status(401).json({ error: 'Utente non trovato' });
  const h = hashPass(password, u.salt);
  if (!safeCompare(h, u.password_hash)) return res.status(401).json({ error: 'Password errata' });
  const tok=genToken(); const exp=ts()+30*86400;
  db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(tok, u.id, exp);
  res.json({ ok:true, token:tok, user:safe(u) });
});

// FORGOT PASSWORD
app.post('/api/auth/forgot', async (req,res) => {
  const { email } = req.body||{};
  res.json({ ok:true }); // always ok - don't reveal if email exists
  if (!email) return;
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(email.toLowerCase().trim());
  if (!u) return;
  db.prepare('DELETE FROM temp_tokens WHERE user_id=? AND type=?').run(u.id,'reset');
  const rtok=genToken();
  db.prepare('INSERT INTO temp_tokens VALUES (?,?,?,?)').run(rtok, u.id, 'reset', ts()+3600);
  await sendEmail(u.email, '🔑 Reset Password BrainRotBattle.io', emailReset(u.username, `${BASE_URL}/reset-password?token=${rtok}`));
});

// RESET PASSWORD PAGE
app.get('/reset-password', (req,res) => {
  const { token } = req.query;
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Reset Password</title>
  <style>body{font-family:sans-serif;background:linear-gradient(150deg,#e0f2fe,#f0fdf4);min-height:100vh;display:flex;align-items:center;justify-content:center;}
  .c{background:white;padding:32px;border-radius:20px;box-shadow:0 8px 32px rgba(0,0,0,.1);width:360px;}
  h1{font-size:1.5rem;color:#1e3a5f;margin-bottom:16px}
  input{width:100%;padding:12px;border:2px solid #e2e8f0;border-radius:10px;font-size:.95rem;margin-bottom:10px;box-sizing:border-box;outline:none}
  input:focus{border-color:#3b82f6}
  button{width:100%;padding:13px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:white;border:none;border-radius:10px;font-size:1rem;cursor:pointer;font-weight:700}
  .m{font-size:.85rem;font-weight:700;margin-bottom:10px;min-height:20px}</style></head>
  <body><div class="c"><h1>🧠 Nuova Password</h1>
  <div class="m" id="m"></div>
  <input type="password" id="a" placeholder="Nuova password (min. 6 caratteri)"/>
  <input type="password" id="b" placeholder="Ripeti la password"/>
  <button onclick="go()">Salva Password</button></div>
  <script>
  async function go(){
    const a=document.getElementById('a').value,b=document.getElementById('b').value,m=document.getElementById('m');
    if(a.length<6){m.style.color='#ef4444';m.textContent='Password troppo corta';return}
    if(a!==b){m.style.color='#ef4444';m.textContent='Le password non coincidono';return}
    const r=await fetch('/api/auth/reset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'${token}',password:a})});
    const d=await r.json();
    if(d.ok){m.style.color='#22c55e';m.textContent='✅ Password cambiata!';setTimeout(()=>location.href='/',2000)}
    else{m.style.color='#ef4444';m.textContent=d.error||'Errore'}
  }
  </script></body></html>`);
});

// RESET PASSWORD API
app.post('/api/auth/reset', (req,res) => {
  const { token, password } = req.body||{};
  if (!token||!password) return res.status(400).json({ error: 'Dati mancanti' });
  if (password.length<6) return res.status(400).json({ error: 'Password troppo corta' });
  const row = db.prepare('SELECT * FROM temp_tokens WHERE token=? AND type=? AND expires_at>?').get(token,'reset',ts());
  if (!row) return res.status(400).json({ error: 'Link non valido o scaduto' });
  const salt = crypto.randomBytes(32).toString('hex');
  const hash = hashPass(password, salt);
  db.prepare('UPDATE users SET password_hash=?,salt=? WHERE id=?').run(hash, salt, row.user_id);
  db.prepare('DELETE FROM temp_tokens WHERE token=?').run(token);
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(row.user_id);
  res.json({ ok:true });
});

// ME / LOGOUT
app.get('/api/auth/me', auth, (req,res) => res.json({ user:safe(req.user) }));
app.post('/api/auth/logout', (req,res) => {
  const tok=(req.headers.authorization||'').replace('Bearer ','').trim();
  if(tok) db.prepare('DELETE FROM sessions WHERE token=?').run(tok);
  res.json({ ok:true });
});

// PROFILE
app.patch('/api/profile/skin', auth, (req,res) => {
  db.prepare('UPDATE users SET skin=? WHERE id=?').run(parseInt(req.body.skin)||0, req.user.id);
  res.json({ ok:true });
});
app.get('/api/profile/:username', (req,res) => {
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(req.params.username);
  if(!u) return res.status(404).json({ error:'Utente non trovato' });
  res.json({ user:safe(u) });
});

// GAME RESULT
app.post('/api/game/result', (req,res) => {
  const { token, territory, won } = req.body||{};
  const s = db.prepare('SELECT * FROM sessions WHERE token=? AND expires_at>?').get(token||'', ts());
  if(!s) return res.status(401).json({ error:'Non autenticato' });
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(s.user_id);
  if(!u) return res.status(401).json({ error:'Utente non trovato' });
  const xp = Math.floor(10+(territory||0)*2+(won?50:0));
  const coins = Math.floor(5+(territory||0)+(won?20:0));
  const newXp = u.xp+xp;
  const newLevel = levelFromXp(newXp);
  db.prepare('UPDATE users SET xp=?,level=?,coins=coins+?,games=games+1,wins=wins+?,best_score=? WHERE id=?')
    .run(newXp, newLevel, coins, won?1:0, Math.max(u.best_score,territory||0), u.id);
  res.json({ ok:true, xpGained:xp, coinsGained:coins, levelUp:newLevel>u.level, newLevel });
});

// LEADERBOARD
app.get('/api/leaderboard', (req,res) => {
  res.json(db.prepare('SELECT username,level,xp,wins,best_score FROM users ORDER BY xp DESC LIMIT 50').all());
});

// GAME SERVERS
const gameServers = new Map();
app.post('/api/register', (req,res) => {
  const { id,ip,port,lobbies,maxLobbies } = req.body;
  gameServers.set(id, { id,ip,port,lobbies:lobbies||0,maxLobbies:maxLobbies||10,lastSeen:Date.now() });
  res.json({ ok:true });
});
app.post('/api/heartbeat', (req,res) => {
  const { id,lobbies,players } = req.body;
  if(gameServers.has(id)){ const s=gameServers.get(id); s.lobbies=lobbies; s.players=players; s.lastSeen=Date.now(); }
  res.json({ ok:true });
});
app.get('/api/best-server', (req,res) => {
  const now=Date.now();
  for(const [id,s] of gameServers) if(now-s.lastSeen>30000) gameServers.delete(id);
  let best=null;
  for(const s of gameServers.values()) if(s.lobbies<s.maxLobbies&&(!best||s.lobbies>best.lobbies)) best=s;
  if(!best) return res.json({ ip:process.env.GAME_SERVER_IP||'89.167.75.175', port:3000 });
  res.json({ ip:best.ip, port:best.port });
});
app.get('/api/servers', (req,res) => {
  res.json(Array.from(gameServers.values()).map(s=>({...s,online:Date.now()-s.lastSeen<30000})));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🍕 BrainRotBattle Auth+Lobby on port ${PORT}`));
