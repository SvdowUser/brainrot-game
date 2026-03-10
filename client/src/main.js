// tralala.io - 3D Paper.io style game
// ── Constants ──────────────────────────────────────────────────
const GRID = 60;
const CELL = 1;
const NONE = -1;
const SERVER_URL = 'http://89.167.75.175:3000';

const SKINS = [
  { id: 'SUN',    color: '#f7cd1e', trail: '#ffea85' },
  { id: 'MINT',   color: '#45de90', trail: '#9df5c7' },
  { id: 'SKY',    color: '#45aff7', trail: '#9dd6ff' },
  { id: 'BERRY',  color: '#ff6b8f', trail: '#ffabc0' },
  { id: 'VIOLET', color: '#9d75ff', trail: '#d0bcff' },
  { id: 'LAVA',   color: '#ff8f3e', trail: '#ffc28f' },
];
const NPC_COLORS = ['#e74c3c','#3498db','#2ecc71','#9b59b6','#e67e22','#1abc9c','#e91e63','#00bcd4'];

// ── Canvas ─────────────────────────────────────────────────────
const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');

// ── UI ─────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const menuScreen    = $('menuScreen');
const skinsScreen   = $('skinsScreen');
const settingsSheet = $('settingsSheet');
const gameHud       = $('gameHud');
const tutorialCard  = $('tutorialCard');

// ── Profile ────────────────────────────────────────────────────
let profile = { name: '', best: 0, skinIdx: 0 };
try { profile = { ...profile, ...JSON.parse(localStorage.getItem('tralala-v3') || '{}') }; } catch {}
const saveProfile = () => localStorage.setItem('tralala-v3', JSON.stringify(profile));

let skinIdx = profile.skinIdx || 0;
let previewIdx = skinIdx;
$('nameInput').value = profile.name || '';
updateHeroCube();
renderSkinCard();

// ── Game State ─────────────────────────────────────────────────
const TOTAL = GRID * GRID;
const owners      = new Int16Array(TOTAL).fill(NONE);
const trailCells  = new Uint8Array(TOTAL); // 1 = my trail

let inGame = false, tutShown = false;
let px = 30, pz = 30, pdir = 0, pendingDir = 0;
let score = 0, lives = 3;
let moveTimer = 0;
const MOVE_SPEED = 0.1;
let socket = null, myId = null;
let remotePlayers = new Map();
let npcs = [];

// ── Buttons ────────────────────────────────────────────────────
$('settingsBtn').addEventListener('click', () => settingsSheet.classList.remove('hidden'));
$('settingsCloseBtn').addEventListener('click', () => settingsSheet.classList.add('hidden'));
$('openSkinsBtn').addEventListener('click', () => { menuScreen.classList.add('hidden'); skinsScreen.classList.remove('hidden'); });
$('skinsBackBtn').addEventListener('click', () => { skinsScreen.classList.add('hidden'); menuScreen.classList.remove('hidden'); });
$('skinPrevBtn').addEventListener('click', () => { previewIdx = (previewIdx - 1 + SKINS.length) % SKINS.length; renderSkinCard(); });
$('skinNextBtn').addEventListener('click', () => { previewIdx = (previewIdx + 1) % SKINS.length; renderSkinCard(); });
$('skinSelectBtn').addEventListener('click', () => { skinIdx = previewIdx; profile.skinIdx = skinIdx; saveProfile(); updateHeroCube(); });
$('playBtn').addEventListener('click', startGame);
$('closeTutorialBtn')?.addEventListener('click', () => tutorialCard?.classList.add('hidden'));

// ── Keys ───────────────────────────────────────────────────────
window.addEventListener('keydown', e => {
  if (!inGame) return;
  const map = { ArrowRight: 0, d: 0, D: 0, ArrowDown: 1, s: 1, S: 1, ArrowLeft: 2, a: 2, A: 2, ArrowUp: 3, w: 3, W: 3 };
  if (map[e.key] !== undefined) { e.preventDefault(); pendingDir = map[e.key]; }
});

// ── Start ──────────────────────────────────────────────────────
function startGame() {
  const name = ($('nameInput').value || '').trim().slice(0, 16) || 'Guest';
  profile.name = name; saveProfile();

  owners.fill(NONE); trailCells.fill(0);
  remotePlayers.clear(); npcs = [];
  score = 0; lives = 3;
  px = 30; pz = 30; pdir = 0; pendingDir = 0; moveTimer = 0;

  // Starting territory (5x5)
  for (let dz = -2; dz <= 2; dz++)
    for (let dx = -2; dx <= 2; dx++)
      owners[(pz+dz)*GRID+(px+dx)] = 0;

  // Spawn NPCs
  [[10,10],[50,10],[10,50],[50,50],[30,5],[5,30],[55,30],[30,55]].forEach((pos, i) => {
    const npc = { id: -(i+1), x: pos[0], z: pos[1], dir: i%4, color: NPC_COLORS[i%NPC_COLORS.length], timer: 0 };
    for (let dz=-2;dz<=2;dz++) for(let dx=-2;dx<=2;dx++) owners[(pos[1]+dz)*GRID+(pos[0]+dx)] = npc.id;
    npcs.push(npc);
  });

  menuScreen.classList.add('hidden');
  gameHud.classList.remove('hidden');
  if (!tutShown) { tutorialCard?.classList.remove('hidden'); tutShown = true; }
  inGame = true;
  refreshHUD();
  connectServer(name);
}

// ── Server ─────────────────────────────────────────────────────
function connectServer(name) {
  if (typeof io === 'undefined') return;
  try {
    socket = io(SERVER_URL, { transports: ['websocket','polling'], timeout: 3000 });
    socket.on('connect', () => { myId = socket.id; socket.emit('join_game', { name, skinIndex: skinIdx }); });
    socket.on('snapshot', ({ players }) => {
      remotePlayers.clear();
      players.forEach(p => { if (p.id !== myId) remotePlayers.set(p.id, p); });
    });
    socket.on('connect_error', () => { socket = null; });
  } catch { socket = null; }
}

// ── Game Loop ──────────────────────────────────────────────────
let lastT = 0;
function loop(ts) {
  const dt = Math.min((ts - lastT) / 1000, 0.05); lastT = ts;
  if (inGame) { moveTimer -= dt; if (moveTimer <= 0) { moveTimer = MOVE_SPEED; tick(); } }
  render(ts / 1000);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
window.addEventListener('resize', resize); resize();

// ── Tick ───────────────────────────────────────────────────────
function tick() {
  // No 180 turn
  const opp = [2,3,0,1];
  if (pendingDir !== opp[pdir]) pdir = pendingDir;

  const DX = [1,0,-1,0], DZ = [0,1,0,-1];
  const nx = px + DX[pdir], nz = pz + DZ[pdir];
  if (nx < 0 || nx >= GRID || nz < 0 || nz >= GRID) return;

  const idx = nz*GRID+nx;
  const myOwn = owners[idx] === 0;

  // Stepped on own trail = die
  if (trailCells[idx] === 1) { die(); return; }

  // If leaving own territory, leave trail
  if (owners[pz*GRID+px] === 0 && !myOwn) trailCells[pz*GRID+px] = 1;
  if (!myOwn) trailCells[idx] = 1;

  px = nx; pz = nz;

  // Returned to own territory = capture
  if (myOwn && hasTrail()) { capture(); }

  // NPC collision
  for (const npc of npcs) {
    if (npc.x === px && npc.z === pz) { die(); return; }
    if (trailCells[npc.z*GRID+npc.x] === 1) { die(); return; }
  }

  if (socket) socket.emit('move', { x: px, z: pz, rot: pdir });

  // Move NPCs
  npcs.forEach(npc => {
    if (Math.random() < 0.2) npc.dir = (npc.dir + (Math.random()<0.5?1:3)) % 4;
    const nnx = npc.x + DX[npc.dir], nnz = npc.z + DZ[npc.dir];
    if (nnx < 0 || nnx >= GRID || nnz < 0 || nnz >= GRID) { npc.dir = (npc.dir+2)%4; return; }
    // NPC kills player trail
    if (trailCells[nnz*GRID+nnx] === 1) die();
    npc.x = nnx; npc.z = nnz;
    // NPC captures small territory
    if (Math.random() < 0.05) owners[nnz*GRID+nnx] = npc.id;
  });
}

function hasTrail() { return trailCells.some(v => v === 1); }

function capture() {
  // Convert trail to territory
  for (let i = 0; i < TOTAL; i++) if (trailCells[i]) { owners[i] = 0; trailCells[i] = 0; }

  // Flood fill enclosed area
  const outside = new Uint8Array(TOTAL);
  const q = [];
  for (let x = 0; x < GRID; x++) { q.push(x); q.push((GRID-1)*GRID+x); }
  for (let z = 0; z < GRID; z++) { q.push(z*GRID); q.push(z*GRID+GRID-1); }
  while (q.length) {
    const i = q.pop(); if (outside[i] || owners[i]===0) continue;
    outside[i] = 1;
    const x=i%GRID, z=Math.floor(i/GRID);
    if (x>0) q.push(i-1); if (x<GRID-1) q.push(i+1);
    if (z>0) q.push(i-GRID); if (z<GRID-1) q.push(i+GRID);
  }
  for (let i = 0; i < TOTAL; i++) if (!outside[i] && owners[i]!==0) owners[i] = 0;

  score += 10;
  const areaCount = [...owners].filter(v=>v===0).length;
  const areaPct = (areaCount/TOTAL*100).toFixed(1);
  refreshHUD();
  if (socket) socket.emit('stats', { score, area: areaPct, lives });
}

function die() {
  lives--;
  for (let i = 0; i < TOTAL; i++) trailCells[i] = 0;
  if (lives <= 0) {
    inGame = false;
    if (score > profile.best) { profile.best = score; saveProfile(); }
    gameHud.classList.add('hidden');
    menuScreen.classList.remove('hidden');
    $('bestScore').textContent = profile.best;
    if (socket) { socket.emit('leave_game'); socket.disconnect(); socket = null; }
  } else refreshHUD();
}

function refreshHUD() {
  const areaCount = [...owners].filter(v=>v===0).length;
  $('scoreValue').textContent = score;
  $('areaValue').textContent = (areaCount/TOTAL*100).toFixed(1)+'%';
  $('livesValue').textContent = '♥'.repeat(lives)+'♡'.repeat(Math.max(0,3-lives));
  $('coinValue').textContent = score;
}

// ── Render ─────────────────────────────────────────────────────
// 3D perspective projection
function project(wx, wz, W, H) {
  const rx = (wx - px) * 32;
  const rz = (wz - pz) * 32;
  const horizon = H * 0.42;
  const fov = H * 0.85;
  const dist = fov + rz * 0.6;
  if (dist < 1) return null;
  const sc = fov / dist;
  return { x: W/2 + rx*sc, y: horizon + rz*0.38*sc*3.2, sc };
}

function drawCell(gx, gz, color, W, H) {
  const corners = [
    project(gx,   gz,   W, H),
    project(gx+1, gz,   W, H),
    project(gx+1, gz+1, W, H),
    project(gx,   gz+1, W, H),
  ];
  if (corners.some(c=>!c)) return;
  if (corners[0].y > H+10 || corners[2].y < -10) return;
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i=1;i<4;i++) ctx.lineTo(corners[i].x, corners[i].y);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,50,60,0.3)';
  ctx.lineWidth = 0.5;
  ctx.stroke();
}

function drawCube(gx, gz, color, W, H) {
  const cx = gx+0.5, cz = gz+0.5;
  const base = project(cx, cz, W, H);
  if (!base) return;
  const s = base.sc * 12;

  // Shadow
  ctx.save(); ctx.globalAlpha = 0.15;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(base.x, base.y, s*1.2, s*0.4, 0, 0, Math.PI*2); ctx.fill();
  ctx.restore();

  // Cube body
  const top = base.y - s*1.7;
  ctx.fillStyle = lighten(color, 30);
  ctx.beginPath(); ctx.roundRect(base.x-s*0.9, top, s*1.8, s*0.6, s*0.15); ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.roundRect(base.x-s*0.9, top+s*0.5, s*1.8, s*1.3, s*0.15); ctx.fill();

  // Shine
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.beginPath(); ctx.roundRect(base.x-s*0.55, top+s*0.1, s*0.45, s*0.3, s*0.08); ctx.fill();
}

function render(time) {
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Sky
  const sky = ctx.createLinearGradient(0,0,0,H*0.45);
  sky.addColorStop(0,'#1a6b72'); sky.addColorStop(1,'#2a9da8');
  ctx.fillStyle = sky; ctx.fillRect(0,0,W,H*0.45);

  // Horizon glow
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath(); ctx.ellipse(W*0.5, H*0.42, 350+Math.sin(time)*10, 18, 0, 0, Math.PI*2); ctx.fill();

  // Draw ground cells
  const vr = 18;
  for (let gz = pz-vr; gz <= pz+vr; gz++) {
    for (let gx = px-vr*1.5; gx <= px+vr*1.5; gx++) {
      if (gz<0||gz>=GRID||gx<0||gx>=GRID) continue;
      const i = gz*GRID+gx;
      let color = null;
      if (owners[i]===0) color = SKINS[skinIdx].color+'cc';
      else if (owners[i]!==NONE) { const n=npcs.find(n=>n.id===owners[i]); if(n) color=n.color+'99'; }
      if (trailCells[i]) color = SKINS[skinIdx].trail;
      if (color) drawCell(gx, gz, color, W, H);
      else drawCell(gx, gz, 'rgba(0,0,0,0)', W, H); // grid lines only
    }
  }

  if (!inGame) return;

  // NPCs
  npcs.forEach(n => drawCube(n.x, n.z, n.color, W, H));

  // Remote players
  remotePlayers.forEach(p => drawCube(p.x||30, p.z||30, SKINS[(p.skinIndex||0)%SKINS.length].color, W, H));

  // Player (always center)
  drawCube(px, pz, SKINS[skinIdx].color, W, H);

  // Minimap
  drawMinimap(W, H);
}

function drawMinimap(W, H) {
  const ms = Math.min(120, W*0.18), mx = W-ms-12, my = H-ms-12;
  ctx.save(); ctx.globalAlpha = 0.85;
  ctx.fillStyle = '#0c3b45';
  ctx.beginPath(); ctx.roundRect(mx,my,ms,ms,10); ctx.fill();
  const cs = ms/GRID;
  for (let z=0;z<GRID;z++) for(let x=0;x<GRID;x++) {
    const i=z*GRID+x;
    if (owners[i]===0) ctx.fillStyle=SKINS[skinIdx].color;
    else if (owners[i]!==NONE) { const n=npcs.find(n=>n.id===owners[i]); ctx.fillStyle=n?n.color:'#888'; }
    else if (trailCells[i]) ctx.fillStyle=SKINS[skinIdx].trail;
    else continue;
    ctx.fillRect(mx+x*cs, my+z*cs, cs+0.5, cs+0.5);
  }
  // NPCs
  npcs.forEach(n => { ctx.fillStyle=n.color; ctx.beginPath(); ctx.arc(mx+n.x*cs, my+n.z*cs, 2,0,Math.PI*2); ctx.fill(); });
  // Player
  ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(mx+px*cs, my+pz*cs, 3,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

// ── Skin helpers ───────────────────────────────────────────────
function lighten(hex, amt) {
  if (!hex.startsWith('#')) return hex;
  const r=Math.min(255,parseInt(hex.slice(1,3),16)+amt);
  const g=Math.min(255,parseInt(hex.slice(3,5),16)+amt);
  const b=Math.min(255,parseInt(hex.slice(5,7),16)+amt);
  return `rgb(${r},${g},${b})`;
}
function updateHeroCube() {
  const el=$('heroCube'); if(!el) return;
  el.style.background=`linear-gradient(135deg, ${SKINS[skinIdx].color}, ${lighten(SKINS[skinIdx].color,-20)})`;
}
function renderSkinCard() {
  const s=SKINS[previewIdx];
  const el=$('skinPreviewCube'); if(el) el.style.background=`linear-gradient(135deg,${s.color},${lighten(s.color,-20)})`;
  const n=$('skinName'); if(n) n.textContent=s.id;
}

// ── Resize ─────────────────────────────────────────────────────
function resize() {
  const dpr=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.floor(innerWidth*dpr); canvas.height=Math.floor(innerHeight*dpr);
  canvas.style.width='100%'; canvas.style.height='100%';
}
