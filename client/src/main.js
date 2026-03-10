// ── tralala.io — 3D Paper.io Game ──────────────────────────────
const SERVER_URL  = 'http://89.167.75.175:3000';
const PROFILE_KEY = 'tralala-profile-v2';
const GRID = 60;
const NONE = -1;
const TOTAL = GRID * GRID;

const SKINS = [
  { name: 'Sun',    colorA: '#f5da5a', colorB: '#f2cf2a', req: 0   },
  { name: 'Coral',  colorA: '#ff9f9f', colorB: '#ff6f8e', req: 120 },
  { name: 'Mint',   colorA: '#93f6dc', colorB: '#4dd9b8', req: 260 },
  { name: 'Sky',    colorA: '#7ec8f7', colorB: '#45aff7', req: 500 },
];
const NPC_COLORS = [
  ['#e74c3c','#c0392b'],['#3498db','#2980b9'],['#2ecc71','#27ae60'],
  ['#9b59b6','#8e44ad'],['#e67e22','#d35400'],['#1abc9c','#16a085'],
  ['#e91e63','#c2185b'],['#00bcd4','#0097a7'],
];

// ── Canvas ─────────────────────────────────────────────────────
const canvas = document.getElementById('scene');
const ctx    = canvas.getContext('2d');

// ── UI refs ────────────────────────────────────────────────────
const menuScreen    = document.getElementById('menuScreen');
const skinsScreen   = document.getElementById('skinsScreen');
const settingsSheet = document.getElementById('settingsSheet');
const settingsBtn   = document.getElementById('settingsBtn');
const settingsCloseBtn = document.getElementById('settingsCloseBtn');
const playBtn       = document.getElementById('playBtn');
const openSkinsBtn  = document.getElementById('openSkinsBtn');
const skinsBackBtn  = document.getElementById('skinsBackBtn');
const skinPrevBtn   = document.getElementById('skinPrevBtn');
const skinNextBtn   = document.getElementById('skinNextBtn');
const skinSelectBtn = document.getElementById('skinSelectBtn');
const nameInput     = document.getElementById('nameInput');
const menuCoins     = document.getElementById('menuCoins');
const bestScore     = document.getElementById('bestScore');
const skinName      = document.getElementById('skinName');
const skinRequirement = document.getElementById('skinRequirement');
const heroCube      = document.getElementById('heroCube');
const skinPreviewCube = document.getElementById('skinPreviewCube');
const playerNameEl  = document.getElementById('playerName');
const livesEl       = document.getElementById('livesValue');
const gameHud       = document.getElementById('gameHud');
const tutorialCard  = document.getElementById('tutorialCard');
const closeTutorialBtn = document.getElementById('closeTutorialBtn');
const leaderboardToggle = document.getElementById('leaderboardToggle');
const leaderboardPanel  = document.getElementById('leaderboardPanel');

// ── Profile ────────────────────────────────────────────────────
function loadProfile() {
  try { return { name:'', best:0, coins:0, skinIndex:0, ...JSON.parse(localStorage.getItem(PROFILE_KEY)||'{}') }; }
  catch { return { name:'', best:0, coins:0, skinIndex:0 }; }
}
function saveProfile() { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); }

const profile = loadProfile();
let skinIndex = profile.skinIndex || 0;
let previewIndex = skinIndex;

nameInput.value = profile.name || '';
menuCoins.textContent = profile.coins || 0;
bestScore.textContent = profile.best || 0;
applySkin(heroCube, SKINS[skinIndex]);
renderSkinCard();
if (playerNameEl) playerNameEl.textContent = profile.name || 'Guest';

// ── Game State ─────────────────────────────────────────────────
const owners     = new Int16Array(TOTAL).fill(NONE);
const trailCells = new Uint8Array(TOTAL);
let inGame = false, tutShown = false;
let px = 30, pz = 30, pdir = 0, pendingDir = 0;
let score = 0, lives = 3, coins = 0;
let moveTimer = 0;
const MOVE_SPEED = 0.12;
let socket = null, myId = null;
let remotePlayers = new Map();
let npcs = [];

// ── Button Listeners ───────────────────────────────────────────
settingsBtn.addEventListener('click', () => settingsSheet.classList.remove('hidden'));
settingsCloseBtn.addEventListener('click', () => settingsSheet.classList.add('hidden'));
openSkinsBtn.addEventListener('click', () => { menuScreen.classList.add('hidden'); skinsScreen.classList.remove('hidden'); });
skinsBackBtn.addEventListener('click', () => { skinsScreen.classList.add('hidden'); menuScreen.classList.remove('hidden'); });
skinPrevBtn.addEventListener('click', () => { previewIndex = (previewIndex - 1 + SKINS.length) % SKINS.length; renderSkinCard(); });
skinNextBtn.addEventListener('click', () => { previewIndex = (previewIndex + 1) % SKINS.length; renderSkinCard(); });
skinSelectBtn.addEventListener('click', selectSkin);
playBtn.addEventListener('click', startGame);
closeTutorialBtn?.addEventListener('click', () => tutorialCard?.classList.add('hidden'));
leaderboardToggle?.addEventListener('click', () => leaderboardPanel?.classList.toggle('hidden'));

// ── Keyboard ───────────────────────────────────────────────────
window.addEventListener('keydown', e => {
  if (!inGame) return;
  const map = { ArrowRight:0, d:0, D:0, ArrowDown:1, s:1, S:1, ArrowLeft:2, a:2, A:2, ArrowUp:3, w:3, W:3 };
  if (map[e.key] !== undefined) { e.preventDefault(); pendingDir = map[e.key]; }
});

// ── Start Game ─────────────────────────────────────────────────
function startGame() {
  const name = (nameInput.value || '').trim().slice(0,16) || 'Guest';
  profile.name = name; saveProfile();

  // Reset state
  owners.fill(NONE); trailCells.fill(0);
  remotePlayers.clear(); npcs = [];
  score = 0; lives = 3; coins = 0;
  px = 30; pz = 30; pdir = 0; pendingDir = 0; moveTimer = 0;

  // Starting territory 5x5
  for (let dz=-2; dz<=2; dz++)
    for (let dx=-2; dx<=2; dx++)
      owners[(pz+dz)*GRID+(px+dx)] = 0;

  // Spawn NPCs
  [[10,10],[50,10],[10,50],[50,50],[30,5],[5,30],[55,30],[30,55]].forEach((pos,i) => {
    const [cx,cz] = pos;
    const npc = { id:-(i+1), x:cx, z:cz, dir:i%4, colors:NPC_COLORS[i%NPC_COLORS.length] };
    for (let dz=-2;dz<=2;dz++) for(let dx=-2;dx<=2;dx++) {
      const gx=cx+dx,gz=cz+dz;
      if (gx>=0&&gx<GRID&&gz>=0&&gz<GRID) owners[gz*GRID+gx]=npc.id;
    }
    npcs.push(npc);
  });

  menuScreen.classList.add('hidden');
  gameHud.classList.remove('hidden');
  if (!tutShown) { tutorialCard?.classList.remove('hidden'); tutShown=true; }
  inGame = true;
  refreshHUD();

  // Connect server
  connectServer(name);
}

// ── Server ─────────────────────────────────────────────────────
function connectServer(name) {
  if (typeof io === 'undefined') return;
  try {
    socket = io(SERVER_URL, { transports:['websocket','polling'], timeout:3000 });
    socket.on('connect', () => {
      myId = socket.id;
      socket.emit('join_game', { name, skinIndex });
    });
    socket.on('snapshot', ({ players }) => {
      remotePlayers.clear();
      players.forEach(p => { if (p.id !== myId) remotePlayers.set(p.id, p); });
    });
    socket.on('leaderboard', ({ rows }) => {
      const el = document.getElementById('leaderboardList');
      if (el) el.innerHTML = rows.map((r,i) => `<li>${i+1}. ${r.name} — ${r.score||0}</li>`).join('');
    });
    socket.on('room_info', ({ count, limit }) => {
      const el = document.getElementById('serverBadge');
      if (el) el.textContent = `${count}/${limit} online`;
    });
    socket.on('connect_error', () => { socket = null; });
    socket.on('disconnect', () => { remotePlayers.clear(); });
  } catch { socket = null; }
}

// ── Game Loop ──────────────────────────────────────────────────
let lastT = 0;
function loop(ts) {
  const dt = Math.min((ts - lastT)/1000, 0.05); lastT = ts;
  if (inGame) { moveTimer -= dt; if (moveTimer <= 0) { moveTimer = MOVE_SPEED; tick(); } }
  render(ts/1000);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
window.addEventListener('resize', resize); resize();

// ── Game Tick ──────────────────────────────────────────────────
function tick() {
  // No 180° reversal
  const opp = [2,3,0,1];
  if (pendingDir !== opp[pdir]) pdir = pendingDir;

  const DX=[1,0,-1,0], DZ=[0,1,0,-1];
  const nx=px+DX[pdir], nz=pz+DZ[pdir];
  if (nx<0||nx>=GRID||nz<0||nz>=GRID) return;

  const idx = nz*GRID+nx;
  const onOwn = owners[idx]===0;

  // Stepped on own trail = die
  if (trailCells[idx]) { die(); return; }

  // Leaving own territory: mark trail
  if (owners[pz*GRID+px]===0 && !onOwn) trailCells[pz*GRID+px]=1;
  if (!onOwn) trailCells[idx]=1;

  px=nx; pz=nz;

  // Returned to own territory = capture loop
  if (onOwn && hasTrail()) capture();

  // Check NPC collision
  for (const npc of npcs) {
    if (npc.x===px && npc.z===pz) { die(); return; }
    if (trailCells[npc.z*GRID+npc.x]) { die(); return; }
  }

  if (socket) socket.emit('move', { x:px, z:pz, rot:pdir });

  // Move NPCs
  const DirDX=[1,0,-1,0], DirDZ=[0,1,0,-1];
  npcs.forEach(npc => {
    if (Math.random()<0.18) npc.dir=(npc.dir+(Math.random()<0.5?1:3))%4;
    const nnx=npc.x+DirDX[npc.dir], nnz=npc.z+DirDZ[npc.dir];
    if (nnx<0||nnx>=GRID||nnz<0||nnz>=GRID) { npc.dir=(npc.dir+2)%4; return; }
    if (trailCells[nnz*GRID+nnx]) { die(); return; }
    npc.x=nnx; npc.z=nnz;
    if (Math.random()<0.04) owners[nnz*GRID+nnx]=npc.id;
  });
}

function hasTrail() { return trailCells.some(v=>v===1); }

function capture() {
  // Trail → territory
  for (let i=0;i<TOTAL;i++) if (trailCells[i]) { owners[i]=0; trailCells[i]=0; }

  // Flood fill from borders to find outside
  const outside = new Uint8Array(TOTAL);
  const q = [];
  for (let x=0;x<GRID;x++) { q.push(x); q.push((GRID-1)*GRID+x); }
  for (let z=0;z<GRID;z++) { q.push(z*GRID); q.push(z*GRID+GRID-1); }

  while (q.length) {
    const i=q.pop();
    if (outside[i]||owners[i]===0) continue;
    outside[i]=1;
    const x=i%GRID, z=Math.floor(i/GRID);
    if (x>0)      q.push(i-1);
    if (x<GRID-1) q.push(i+1);
    if (z>0)      q.push(i-GRID);
    if (z<GRID-1) q.push(i+GRID);
  }

  // Everything not outside and not already mine → mine
  for (let i=0;i<TOTAL;i++) if (!outside[i] && owners[i]!==0) owners[i]=0;

  score += 10;
  coins += 5;
  profile.coins = (profile.coins||0) + 5;
  if (score > profile.best) { profile.best = score; }
  saveProfile();
  refreshHUD();
  if (socket) socket.emit('stats', { score, area:(countMine()/TOTAL*100).toFixed(1), lives });
}

function countMine() { let c=0; for(let i=0;i<TOTAL;i++) if(owners[i]===0)c++; return c; }

function die() {
  lives--;
  for (let i=0;i<TOTAL;i++) trailCells[i]=0;
  if (lives<=0) {
    inGame=false;
    saveProfile();
    gameHud.classList.add('hidden');
    menuScreen.classList.remove('hidden');
    bestScore.textContent = profile.best;
    menuCoins.textContent = profile.coins;
    if (socket) { socket.emit('leave_game'); socket.disconnect(); socket=null; }
  } else refreshHUD();
}

function refreshHUD() {
  const areaStr = (countMine()/TOTAL*100).toFixed(1)+'%';
  const si = document.getElementById('scoreValue'); if(si) si.textContent=score;
  const ai = document.getElementById('areaValue');  if(ai) ai.textContent=areaStr;
  const ci = document.getElementById('coinValue');  if(ci) ci.textContent=coins;
  if (livesEl) livesEl.textContent='❤'.repeat(lives)+'♡'.repeat(Math.max(0,3-lives));
}

// ── 3D Perspective Renderer ────────────────────────────────────
function project(wx, wz, W, H) {
  const rx = (wx - px) * 36;
  const rz = (wz - pz) * 36;
  const horizon = H * 0.44;
  const fov = H * 0.9;
  const dist = fov + rz * 0.55;
  if (dist < 5) return null;
  const sc = fov / dist;
  return { x: W/2 + rx*sc, y: horizon + rz*0.4*sc*3, sc };
}

function drawGridCell(gx, gz, color, W, H) {
  const c = [
    project(gx,   gz,   W, H),
    project(gx+1, gz,   W, H),
    project(gx+1, gz+1, W, H),
    project(gx,   gz+1, W, H),
  ];
  if (c.some(p=>!p)) return;
  if (c[0].y > H+20 || c[2].y < -20) return;

  ctx.beginPath();
  ctx.moveTo(c[0].x, c[0].y);
  ctx.lineTo(c[1].x, c[1].y);
  ctx.lineTo(c[2].x, c[2].y);
  ctx.lineTo(c[3].x, c[3].y);
  ctx.closePath();

  if (color) {
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(0,50,60,0.28)';
  ctx.lineWidth = 0.5;
  ctx.stroke();
}

function drawCube(gx, gz, colorA, colorB, W, H) {
  const cx = gx+0.5, cz = gz+0.5;
  const base = project(cx, cz, W, H);
  if (!base) return;
  const s = Math.max(4, base.sc * 14);
  const topY = base.y - s * 1.8;

  // Shadow
  ctx.save(); ctx.globalAlpha = 0.14;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(base.x, base.y, s*1.3, s*0.42, 0,0,Math.PI*2); ctx.fill();
  ctx.restore();

  // Top face
  ctx.fillStyle = colorB || colorA;
  ctx.beginPath(); ctx.roundRect(base.x-s*0.9, topY, s*1.8, s*0.65, s*0.18); ctx.fill();

  // Front face
  ctx.fillStyle = colorA;
  ctx.beginPath(); ctx.roundRect(base.x-s*0.9, topY+s*0.55, s*1.8, s*1.35, s*0.15); ctx.fill();

  // Shine
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath(); ctx.roundRect(base.x-s*0.56, topY+s*0.08, s*0.44, s*0.32, s*0.1); ctx.fill();
}

function render(time) {
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);

  // Sky gradient
  const sky = ctx.createLinearGradient(0,0,0,H*0.46);
  sky.addColorStop(0,'#1a6b72'); sky.addColorStop(1,'#2e9da8');
  ctx.fillStyle=sky; ctx.fillRect(0,0,W,H*0.46);

  // Horizon shadow
  ctx.fillStyle='rgba(0,0,0,0.14)';
  ctx.beginPath(); ctx.ellipse(W*0.5, H*0.44, 360+Math.sin(time*0.8)*12, 18,0,0,Math.PI*2); ctx.fill();

  // Draw grid + territory
  const view = 20;
  for (let gz=pz-view; gz<=pz+view; gz++) {
    for (let gx=px-view; gx<=px+view; gx++) {
      if (gz<0||gz>=GRID||gx<0||gx>=GRID) continue;
      const i = gz*GRID+gx;
      let color = null;
      if (owners[i]===0) color = SKINS[skinIndex].colorA+'cc';
      else if (owners[i]!==NONE) {
        const npc = npcs.find(n=>n.id===owners[i]);
        if (npc) color = npc.colors[0]+'88';
      }
      if (trailCells[i]) color = SKINS[skinIndex].colorB;
      drawGridCell(gx, gz, color, W, H);
    }
  }

  if (!inGame) return;

  // Draw NPCs
  npcs.forEach(n => drawCube(n.x, n.z, n.colors[0], n.colors[1], W, H));

  // Draw remote players
  remotePlayers.forEach(p => {
    const skin = SKINS[(p.skinIndex||0) % SKINS.length];
    drawCube(p.x||30, p.z||30, skin.colorA, skin.colorB, W, H);
  });

  // Draw own player (center)
  drawCube(px, pz, SKINS[skinIndex].colorA, SKINS[skinIndex].colorB, W, H);

  // Minimap
  drawMinimap(W, H);
}

function drawMinimap(W, H) {
  const ms = Math.min(130, W*0.18);
  const mx = W - ms - 12, my = H - ms - 12;
  ctx.save(); ctx.globalAlpha = 0.88;
  ctx.fillStyle = '#0c3b45';
  ctx.beginPath(); ctx.roundRect(mx,my,ms,ms,10); ctx.fill();
  const cs = ms/GRID;
  for (let z=0;z<GRID;z++) for(let x=0;x<GRID;x++) {
    const i=z*GRID+x;
    if (owners[i]===0) ctx.fillStyle=SKINS[skinIndex].colorA;
    else if (owners[i]!==NONE) { const n=npcs.find(n=>n.id===owners[i]); ctx.fillStyle=n?n.colors[0]:'#777'; }
    else if (trailCells[i]) ctx.fillStyle=SKINS[skinIndex].colorB;
    else continue;
    ctx.fillRect(mx+x*cs, my+z*cs, cs+0.5, cs+0.5);
  }
  npcs.forEach(n=>{ ctx.fillStyle=n.colors[0]; ctx.beginPath(); ctx.arc(mx+n.x*cs,my+n.z*cs,2,0,Math.PI*2); ctx.fill(); });
  remotePlayers.forEach(p=>{ const s=SKINS[(p.skinIndex||0)%SKINS.length]; ctx.fillStyle=s.colorA; ctx.beginPath(); ctx.arc(mx+(p.x||30)*cs,my+(p.z||30)*cs,2,0,Math.PI*2); ctx.fill(); });
  ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(mx+px*cs, my+pz*cs, 3,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

// ── Skin Helpers ───────────────────────────────────────────────
function applySkin(el, skin) {
  if (!el) return;
  el.style.background = `linear-gradient(135deg, ${skin.colorA}, ${skin.colorB})`;
}
function renderSkinCard() {
  const skin = SKINS[previewIndex];
  applySkin(skinPreviewCube, skin);
  if (skinName) skinName.textContent = skin.name;
  const unlocked = (profile.best||0) >= skin.req;
  if (skinRequirement) skinRequirement.textContent = unlocked ? 'Unlocked' : `Requires best score ${skin.req}`;
  if (skinSelectBtn) skinSelectBtn.disabled = !unlocked;
}
function selectSkin() {
  const skin = SKINS[previewIndex];
  if ((profile.best||0) < skin.req) return;
  skinIndex = previewIndex;
  profile.skinIndex = skinIndex;
  applySkin(heroCube, skin);
  saveProfile();
}

// ── Resize ─────────────────────────────────────────────────────
function resize() {
  const dpr = Math.min(window.devicePixelRatio||1, 2);
  canvas.width  = Math.floor(innerWidth  * dpr);
  canvas.height = Math.floor(innerHeight * dpr);
  canvas.style.width='100%'; canvas.style.height='100%';
}
