// ── Canvas background ──────────────────────────────────────────
const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');

// ── UI elements ────────────────────────────────────────────────
const menuScreen      = document.getElementById('menuScreen');
const skinsScreen     = document.getElementById('skinsScreen');
const settingsSheet   = document.getElementById('settingsSheet');
const settingsBtn     = document.getElementById('settingsBtn');
const settingsCloseBtn= document.getElementById('settingsCloseBtn');
const playBtn         = document.getElementById('playBtn');
const openSkinsBtn    = document.getElementById('openSkinsBtn');
const skinsBackBtn    = document.getElementById('skinsBackBtn');
const skinPrevBtn     = document.getElementById('skinPrevBtn');
const skinNextBtn     = document.getElementById('skinNextBtn');
const skinSelectBtn   = document.getElementById('skinSelectBtn');
const nameInput       = document.getElementById('nameInput');
const menuCoins       = document.getElementById('menuCoins');
const bestScore       = document.getElementById('bestScore');
const skinName        = document.getElementById('skinName');
const skinRequirement = document.getElementById('skinRequirement');
const heroCube        = document.getElementById('heroCube');
const skinPreviewCube = document.getElementById('skinPreviewCube');
const playerNameEl    = document.getElementById('playerName');
const livesEl         = document.getElementById('livesValue');

// ── Config ─────────────────────────────────────────────────────
const SERVER_URL  = 'http://89.167.75.175:3000';
const PROFILE_KEY = 'tralala-profile-v1';
const SKINS = [
  { name: 'Sun',   colorA: '#f5da5a', colorB: '#f2cf2a', req: 0   },
  { name: 'Coral', colorA: '#ff9f9f', colorB: '#ff6f8e', req: 120 },
  { name: 'Mint',  colorA: '#93f6dc', colorB: '#4dd9b8', req: 260 },
];

// ── State ──────────────────────────────────────────────────────
const profile = loadProfile();
let skinIndex    = profile.skinIndex || 0;
let previewIndex = skinIndex;
let socket       = null;
let inGame       = false;

const keys = new Set();
let playerX = 0, playerZ = 0, playerRot = 0;
let otherPlayers = new Map();

// ── Init UI ────────────────────────────────────────────────────
nameInput.value = profile.name || '';
menuCoins.textContent = String(profile.coins || 0);
bestScore.textContent = String(profile.best || 0);
applySkin(heroCube, SKINS[skinIndex]);
renderSkinCard();
if (playerNameEl) playerNameEl.textContent = profile.name || 'Guest';
if (livesEl) livesEl.textContent = '❤❤❤';

// ── Button listeners ───────────────────────────────────────────
settingsBtn.addEventListener('click', () => settingsSheet.classList.remove('hidden'));
settingsCloseBtn.addEventListener('click', () => settingsSheet.classList.add('hidden'));

openSkinsBtn.addEventListener('click', () => {
  menuScreen.classList.add('hidden');
  skinsScreen.classList.remove('hidden');
});
skinsBackBtn.addEventListener('click', () => {
  skinsScreen.classList.add('hidden');
  menuScreen.classList.remove('hidden');
});
skinPrevBtn.addEventListener('click', () => {
  previewIndex = (previewIndex - 1 + SKINS.length) % SKINS.length;
  renderSkinCard();
});
skinNextBtn.addEventListener('click', () => {
  previewIndex = (previewIndex + 1) % SKINS.length;
  renderSkinCard();
});
skinSelectBtn.addEventListener('click', () => {
  if ((profile.best || 0) < SKINS[previewIndex].req) return;
  skinIndex = previewIndex;
  profile.skinIndex = skinIndex;
  applySkin(heroCube, SKINS[skinIndex]);
  saveProfile(profile);
});

playBtn.addEventListener('click', () => {
  const name = String(nameInput.value || '').trim().slice(0, 16) || 'Guest';
  profile.name = name;
  saveProfile(profile);
  joinGame(name, skinIndex);
});

// ── Keyboard ───────────────────────────────────────────────────
window.addEventListener('keydown', e => keys.add(e.key));
window.addEventListener('keyup',   e => keys.delete(e.key));

// ── Socket.io ─────────────────────────────────────────────────
function joinGame(name, skin) {
  if (socket) socket.disconnect();
  socket = io(SERVER_URL, { transports: ['websocket', 'polling'] });

  socket.on('connect', () => {
    socket.emit('join_game', { name, skinIndex: skin });
    inGame = true;
    menuScreen.classList.add('hidden');
    if (playerNameEl) playerNameEl.textContent = name;
    playerX = 0; playerZ = 0;
  });

  socket.on('connect_error', () => {
    alert('Konnte nicht verbinden! Ist der Server online?');
  });

  socket.on('server_full', () => {
    alert('Server ist voll (30/30)!');
    inGame = false;
    menuScreen.classList.remove('hidden');
  });

  socket.on('snapshot', ({ players }) => {
    otherPlayers.clear();
    players.forEach(p => {
      if (p.id !== socket.id) otherPlayers.set(p.id, p);
    });
  });

  socket.on('leaderboard', ({ rows }) => {
    const el = document.getElementById('leaderboardList');
    if (!el) return;
    el.innerHTML = rows.map((r, i) =>
      `<li>${i + 1}. ${r.name}</li>`
    ).join('');
  });

  socket.on('room_info', ({ count, limit }) => {
    const el = document.getElementById('serverBadge');
    if (el) el.textContent = `${count}/${limit} online`;
  });

  socket.on('disconnect', () => {
    inGame = false;
    otherPlayers.clear();
    menuScreen.classList.remove('hidden');
  });
}

// ── Game loop ──────────────────────────────────────────────────
const SPEED = 3;
let lastTime = 0;

function gameLoop(ts) {
  const dt = Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;

  if (inGame && socket) {
    let moved = false;
    if (keys.has('ArrowLeft')  || keys.has('a') || keys.has('A')) { playerX -= SPEED * dt; playerRot = Math.PI;       moved = true; }
    if (keys.has('ArrowRight') || keys.has('d') || keys.has('D')) { playerX += SPEED * dt; playerRot = 0;             moved = true; }
    if (keys.has('ArrowUp')    || keys.has('w') || keys.has('W')) { playerZ -= SPEED * dt; playerRot = Math.PI * 1.5; moved = true; }
    if (keys.has('ArrowDown')  || keys.has('s') || keys.has('S')) { playerZ += SPEED * dt; playerRot = Math.PI * 0.5; moved = true; }
    if (moved) socket.emit('move', { x: playerX, z: playerZ, rot: playerRot });
  }

  drawFrame(ts / 1000);
  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
window.addEventListener('resize', resize);
resize();

// ── Drawing ────────────────────────────────────────────────────
function drawFrame(time) {
  const w = canvas.width;
  const h = canvas.height;

  // Background gradient
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#357f85');
  g.addColorStop(1, '#2e7478');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const horizon = h * 0.64;
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(0, horizon, w, h - horizon);

  // Grid lines - scroll with player position
  const cellSize = Math.floor(w / 20);
  const ox = ((playerX * cellSize) % cellSize + cellSize) % cellSize;
  const oz = ((playerZ * cellSize) % cellSize + cellSize) % cellSize;
  ctx.strokeStyle = 'rgba(8, 55, 62, 0.55)';
  ctx.lineWidth = 1;
  for (let x = -cellSize + (w/2 - ox) % cellSize - cellSize; x < w * 2; x += cellSize) {
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(w / 2 + (x - w / 2) * 0.05, horizon);
    ctx.stroke();
  }
  for (let i = 0; i < 22; i++) {
    const p = ((i / 22) + oz / cellSize / 22) % 1;
    const y = horizon + (p * p) * (h - horizon);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(w * 0.5, horizon - 8, 330 + Math.sin(time) * 16, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  if (!inGame) return;

  // Draw players
  const cx = w / 2, cy = h / 2;
  const scale = Math.min(w, h) / 12;

  otherPlayers.forEach(p => {
    const dx = (p.x - playerX) * scale + cx;
    const dy = (p.z - playerZ) * scale + cy;
    const skin = SKINS[p.skinIndex % SKINS.length];
    ctx.save();
    ctx.translate(dx, dy);
    ctx.rotate(p.rot || 0);
    ctx.fillStyle = skin.colorA;
    ctx.beginPath();
    ctx.roundRect(-18, -18, 36, 36, 8);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'white';
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p.name || '', dx, dy - 26);
  });

  // Own player (center, white border)
  const mySkin = SKINS[skinIndex];
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(playerRot);
  ctx.fillStyle = mySkin.colorA;
  ctx.beginPath();
  ctx.roundRect(-22, -22, 44, 44, 10);
  ctx.fill();
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}

// ── Helpers ────────────────────────────────────────────────────
function renderSkinCard() {
  const skin = SKINS[previewIndex];
  applySkin(skinPreviewCube, skin);
  skinName.textContent = skin.name;
  if ((profile.best || 0) >= skin.req) {
    skinRequirement.textContent = 'Unlocked';
    skinSelectBtn.disabled = false;
  } else {
    skinRequirement.textContent = `Requires best score ${skin.req}`;
    skinSelectBtn.disabled = true;
  }
}

function applySkin(el, skin) {
  if (!el) return;
  el.style.background = `linear-gradient(135deg, ${skin.colorA}, ${skin.colorB})`;
}

function loadProfile() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}');
    return {
      name: parsed.name || '',
      best: Number(parsed.best || 0),
      coins: Number(parsed.coins || 0),
      skinIndex: Number(parsed.skinIndex || 0),
    };
  } catch {
    return { name: '', best: 0, coins: 0, skinIndex: 0 };
  }
}

function saveProfile(next) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
}

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width  = Math.floor(window.innerWidth  * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width  = '100%';
  canvas.style.height = '100%';
}
