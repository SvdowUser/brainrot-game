import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js';

const SERVER_URL = window.location.hostname.includes('github.io')
  ? 'http://89.167.75.175:3000'
  : window.location.origin;

const GRID = 70;
const CELL = 2;
const HALF = (GRID * CELL) / 2;
const TOTAL = GRID * GRID;
const NONE = -1;
const LOBBY_LIMIT = 30;
const PROFILE_KEY = 'tralala_profile_v2';

const SKINS = [
  { id: 'sun', name: 'Sun', color: 0xf4c91b, trail: 0xffe86f, unlock: { type: 'free', label: 'Starter' } },
  { id: 'mint', name: 'Mint', color: 0x3cdf98, trail: 0x8cffc8, unlock: { type: 'area', value: 10, label: 'Cover 10% of map' } },
  { id: 'sky', name: 'Sky', color: 0x4aa9ff, trail: 0x8fcdff, unlock: { type: 'area', value: 20, label: 'Cover 20% of map' } },
  { id: 'rose', name: 'Rose', color: 0xff5e94, trail: 0xffa3bf, unlock: { type: 'area', value: 30, label: 'Cover 30% of map' } },
  { id: 'violet', name: 'Violet', color: 0x9d6bff, trail: 0xc8abff, unlock: { type: 'score', value: 100, label: 'Score 100+' } },
  { id: 'aqua', name: 'Aqua', color: 0x1de2d3, trail: 0x8cf7ee, unlock: { type: 'score', value: 300, label: 'Score 300+' } },
];

const ui = {
  scene: document.getElementById('scene'),
  coinIcon: document.getElementById('coinIcon'),
  coinFallback: document.getElementById('coinFallback'),
  coinValue: document.getElementById('coinValue'),
  menuCoins: document.getElementById('menuCoins'),
  killsValue: document.getElementById('killsValue'),
  deathsValue: document.getElementById('deathsValue'),
  livesValue: document.getElementById('livesValue'),
  areaValue: document.getElementById('areaValue'),
  playerName: document.getElementById('playerName'),
  lobbyValue: document.getElementById('lobbyValue'),
  leaderboardList: document.getElementById('leaderboardList'),
  miniMap: document.getElementById('miniMap'),
  startOverlay: document.getElementById('startOverlay'),
  startBtn: document.getElementById('startBtn'),
  skinsBtn: document.getElementById('skinsBtn'),
  skinCloseBtn: document.getElementById('skinCloseBtn'),
  nameInput: document.getElementById('nameInput'),
  skinOverlay: document.getElementById('skinOverlay'),
  skinRow: document.getElementById('skinRow'),
  heroCube: document.getElementById('heroCube'),
  bestFill: document.getElementById('bestFill'),
  bestAreaText: document.getElementById('bestAreaText'),
  joyBase: document.getElementById('joyBase'),
  joyStick: document.getElementById('joyStick'),
};

ui.coinIcon.addEventListener('error', () => {
  ui.coinIcon.style.display = 'none';
  ui.coinFallback.style.display = 'inline';
});

const mmCtx = ui.miniMap.getContext('2d');

const state = {
  keys: new Set(),
  joy: new THREE.Vector2(0, 0),
  socket: null,
  started: false,
  myId: null,
  myName: 'Guest',
  skinIndex: 0,
  players: new Map(),
  remotes: new Map(),
  leaderboard: [],
  entities: [],
  local: null,
  owners: new Int16Array(TOTAL).fill(NONE),
  trailOwners: new Int16Array(TOTAL).fill(NONE),
  gridMesh: null,
  trailMeshes: new Map(),
  dirtyColors: true,
  dirtyTrails: true,
  lastStatsEmit: 0,
  profile: loadProfile(),
};

function loadProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return { bestArea: 0, bestScore: 0, selectedSkin: 0, totalCoins: 0 };
    const p = JSON.parse(raw);
    return {
      bestArea: Number(p.bestArea || 0),
      bestScore: Number(p.bestScore || 0),
      selectedSkin: Number.isInteger(p.selectedSkin) ? p.selectedSkin : 0,
      totalCoins: Number(p.totalCoins || 0),
    };
  } catch {
    return { bestArea: 0, bestScore: 0, selectedSkin: 0, totalCoins: 0 };
  }
}

function saveProfile() {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(state.profile));
}

state.skinIndex = Math.min(state.profile.selectedSkin || 0, SKINS.length - 1);

function skinUnlocked(index) {
  const skin = SKINS[index];
  if (!skin || skin.unlock.type === 'free') return true;
  if (skin.unlock.type === 'area') return state.profile.bestArea >= skin.unlock.value;
  if (skin.unlock.type === 'score') return state.profile.bestScore >= skin.unlock.value;
  return false;
}

function sanitizeName(name) {
  const clean = String(name || '').replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 16);
  return clean || 'Guest';
}

function idx(x, y) { return y * GRID + x; }
function inBounds(x, y) { return x >= 0 && y >= 0 && x < GRID && y < GRID; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function cellCenter(x, y) {
  return new THREE.Vector3(-HALF + x * CELL + CELL / 2, 0, -HALF + y * CELL + CELL / 2);
}

function worldToCell(pos) {
  return {
    x: clamp(Math.floor((pos.x + HALF) / CELL), 0, GRID - 1),
    y: clamp(Math.floor((pos.z + HALF) / CELL), 0, GRID - 1),
  };
}

function createAvatar(skin, scale = 1) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: skin.color, roughness: 0.25, metalness: 0.1 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.25 * scale, 1.25 * scale, 1.25 * scale), mat);
  body.position.y = 0.9 * scale;
  const shadow = new THREE.Mesh(new THREE.CylinderGeometry(0.54 * scale, 0.54 * scale, 0.06 * scale, 18), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 }));
  shadow.position.y = 0.02;
  g.add(body, shadow);
  scene.add(g);
  return g;
}

function makeEntity(data) {
  const skin = SKINS[data.skinIndex % SKINS.length];
  return {
    id: data.id,
    name: data.name,
    skinIndex: data.skinIndex,
    skin,
    isPlayer: !!data.isPlayer,
    npc: !!data.npc,
    speed: data.isPlayer ? 9.2 : 8.0 + Math.random() * 1.4,
    dir: Math.random() * Math.PI * 2,
    kills: 0,
    deaths: 0,
    coins: 0,
    lives: 3,
    area: 0,
    trail: [],
    body: createAvatar(skin, data.isPlayer ? 1 : 0.9),
    home: { x: 0, y: 0 },
    aiTick: 0,
  };
}

function clearTrailsAndTerritory(id) {
  for (let i = 0; i < TOTAL; i++) {
    if (state.owners[i] === id) state.owners[i] = NONE;
    if (state.trailOwners[i] === id) state.trailOwners[i] = NONE;
  }
}

function spawnArea(entity, cx, cy, radius = 2) {
  entity.home.x = cx;
  entity.home.y = cy;
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      if (!inBounds(x, y)) continue;
      state.owners[idx(x, y)] = entity.id;
    }
  }
  const p = cellCenter(cx, cy);
  entity.body.position.set(p.x, 0, p.z);
}

function setupRound() {
  state.entities.forEach((e) => scene.remove(e.body));
  state.entities.length = 0;
  state.owners.fill(NONE);
  state.trailOwners.fill(NONE);

  const me = makeEntity({ id: 0, name: state.myName, skinIndex: state.skinIndex, isPlayer: true });
  state.local = me;
  state.entities.push(me);

  const npcNames = ['Nova', 'Echo', 'Flux', 'Astra', 'Vex', 'Blitz', 'Kiro', 'Zen'];
  for (let i = 0; i < 8; i++) {
    state.entities.push(makeEntity({ id: i + 1, name: npcNames[i], skinIndex: i + 1, npc: true }));
  }

  const anchors = [[35, 35], [10, 10], [60, 10], [10, 60], [60, 60], [20, 35], [50, 35], [35, 18], [35, 55]];
  state.entities.forEach((e, i) => spawnArea(e, anchors[i][0], anchors[i][1], e.isPlayer ? 3 : 2));
  state.dirtyColors = true;
  state.dirtyTrails = true;
}

function buildGridMesh() {
  const geo = new THREE.BoxGeometry(CELL * 0.95, 0.44, CELL * 0.95);
  const mat = new THREE.MeshStandardMaterial({ color: 0x2f787c, roughness: 0.74, metalness: 0.03 });
  const mesh = new THREE.InstancedMesh(geo, mat, TOTAL);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const tmp = new THREE.Object3D();
  let i = 0;
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const p = cellCenter(x, y);
      tmp.position.set(p.x, 0, p.z);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
      mesh.setColorAt(i, new THREE.Color(0x2f787c));
      i++;
    }
  }
  scene.add(mesh);
  return mesh;
}

function paintGrid() {
  if (!state.dirtyColors) return;
  for (let i = 0; i < TOTAL; i++) {
    const owner = state.owners[i];
    const c = owner === NONE ? 0x2f787c : (state.entities[owner]?.skin.color || 0x2f787c);
    state.gridMesh.setColorAt(i, new THREE.Color(c));
  }
  state.gridMesh.instanceColor.needsUpdate = true;
  state.dirtyColors = false;
}

function paintTrails() {
  if (!state.dirtyTrails) return;
  state.trailMeshes.forEach((m) => scene.remove(m));
  state.trailMeshes.clear();
  for (let i = 0; i < TOTAL; i++) {
    const owner = state.trailOwners[i];
    if (owner === NONE) continue;
    const x = i % GRID;
    const y = Math.floor(i / GRID);
    const p = cellCenter(x, y);
    const color = state.entities[owner].skin.trail;
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(CELL * 0.48, 0.8, CELL * 0.48),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.36 })
    );
    m.position.set(p.x, 0.72, p.z);
    state.trailMeshes.set(i, m);
    scene.add(m);
  }
  state.dirtyTrails = false;
}

function closeLoop(entity) {
  if (entity.trail.length < 2) {
    entity.trail.forEach((i) => { state.owners[i] = entity.id; state.trailOwners[i] = NONE; });
    entity.trail.length = 0;
    state.dirtyColors = true;
    state.dirtyTrails = true;
    return;
  }

  const points = entity.trail.map((cellIdx) => ({ x: cellIdx % GRID + 0.5, y: Math.floor(cellIdx / GRID) + 0.5 }));
  let minX = GRID - 1, minY = GRID - 1, maxX = 0, maxY = 0;
  points.forEach((p) => {
    minX = Math.min(minX, Math.floor(p.x));
    minY = Math.min(minY, Math.floor(p.y));
    maxX = Math.max(maxX, Math.floor(p.x));
    maxY = Math.max(maxY, Math.floor(p.y));
  });

  function inside(px, py) {
    let insidePoly = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = points[i].x; const yi = points[i].y;
      const xj = points[j].x; const yj = points[j].y;
      const hit = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / ((yj - yi) || 0.0001) + xi);
      if (hit) insidePoly = !insidePoly;
    }
    return insidePoly;
  }

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (inside(x + 0.5, y + 0.5)) state.owners[idx(x, y)] = entity.id;
    }
  }

  entity.trail.forEach((i) => { state.owners[i] = entity.id; state.trailOwners[i] = NONE; });
  entity.trail.length = 0;
  state.dirtyColors = true;
  state.dirtyTrails = true;
}

function respawn(entity) {
  clearTrailsAndTerritory(entity.id);
  entity.trail.length = 0;
  const rx = Math.floor(6 + Math.random() * (GRID - 12));
  const ry = Math.floor(6 + Math.random() * (GRID - 12));
  spawnArea(entity, rx, ry, entity.isPlayer ? 2 : 1);
  state.dirtyColors = true;
  state.dirtyTrails = true;
}

function endRunToMenu() {
  state.started = false;
  ui.startOverlay.style.display = 'grid';
  ui.skinOverlay.classList.add('hidden');
  state.profile.totalCoins += state.local?.coins || 0;
  ui.menuCoins.textContent = `${state.profile.totalCoins}`;
  saveProfile();
  if (state.socket) state.socket.emit('leave_game');
}

function killEntity(victim, killer) {
  if (!victim || !killer) return;
  if (killer.isPlayer) {
    killer.coins += 8;
    killer.kills += 1;
  }
  victim.deaths += 1;

  if (victim.isPlayer) {
    victim.lives -= 1;
    if (victim.lives <= 0) {
      endRunToMenu();
      return;
    }
  }
  respawn(victim);
}

function stepEntity(entity) {
  const c = worldToCell(entity.body.position);
  const i = idx(c.x, c.y);

  const owner = state.owners[i];
  if (owner !== entity.id) {
    if (state.trailOwners[i] !== entity.id) {
      state.trailOwners[i] = entity.id;
      const prev = entity.trail[entity.trail.length - 1];
      if (prev !== i) entity.trail.push(i);
      state.dirtyTrails = true;
    }
  } else if (entity.trail.length > 0) {
    closeLoop(entity);
  }

  const trailOwner = state.trailOwners[i];
  if (trailOwner !== NONE && trailOwner !== entity.id) killEntity(state.entities[trailOwner], entity);
}

function nearestEnemyTrail(entity, radius = 10) {
  const c = worldToCell(entity.body.position);
  let best = null;
  let dist = Infinity;
  for (let y = c.y - radius; y <= c.y + radius; y++) {
    for (let x = c.x - radius; x <= c.x + radius; x++) {
      if (!inBounds(x, y)) continue;
      const i = idx(x, y);
      const owner = state.trailOwners[i];
      if (owner === NONE || owner === entity.id) continue;
      const p = cellCenter(x, y);
      const d = p.distanceToSquared(entity.body.position);
      if (d < dist) { dist = d; best = p; }
    }
  }
  return best;
}

function updateNpc(npc, dt, t) {
  const c = worldToCell(npc.body.position);
  const home = cellCenter(npc.home.x, npc.home.y);
  const inOwn = state.owners[idx(c.x, c.y)] === npc.id;

  if (t > npc.aiTick) {
    npc.aiTick = t + 0.35 + Math.random() * 0.8;
    if (!inOwn && npc.trail.length > 10) {
      npc.dir = Math.atan2(home.x - npc.body.position.x, home.z - npc.body.position.z) + (Math.random() - 0.5) * 0.2;
    } else {
      const enemy = nearestEnemyTrail(npc, 9);
      if (enemy) npc.dir = Math.atan2(enemy.x - npc.body.position.x, enemy.z - npc.body.position.z);
      else npc.dir += (Math.random() - 0.5) * 1.2;
    }
  }

  npc.body.position.x += Math.sin(npc.dir) * npc.speed * dt;
  npc.body.position.z += Math.cos(npc.dir) * npc.speed * dt;
  if (Math.abs(npc.body.position.x) > HALF - 1 || Math.abs(npc.body.position.z) > HALF - 1) npc.dir += Math.PI * 0.66;
  npc.body.position.x = clamp(npc.body.position.x, -HALF + 1, HALF - 1);
  npc.body.position.z = clamp(npc.body.position.z, -HALF + 1, HALF - 1);
  npc.body.rotation.y = npc.dir;
  stepEntity(npc);
}

function getInput() {
  const m = new THREE.Vector2(0, 0);
  if (state.keys.has('w') || state.keys.has('arrowup')) m.y -= 1;
  if (state.keys.has('s') || state.keys.has('arrowdown')) m.y += 1;
  if (state.keys.has('a') || state.keys.has('arrowleft')) m.x -= 1;
  if (state.keys.has('d') || state.keys.has('arrowright')) m.x += 1;
  m.add(state.joy);
  return m.lengthSq() > 0 ? m.normalize() : m;
}

function updatePlayer(dt) {
  const p = state.local;
  const inVec = getInput();
  if (inVec.lengthSq() > 0) p.dir = Math.atan2(inVec.x, inVec.y);
  p.body.position.x += Math.sin(p.dir) * p.speed * dt;
  p.body.position.z += Math.cos(p.dir) * p.speed * dt;
  p.body.position.x = clamp(p.body.position.x, -HALF + 1, HALF - 1);
  p.body.position.z = clamp(p.body.position.z, -HALF + 1, HALF - 1);
  p.body.rotation.y = p.dir;
  stepEntity(p);

  if (state.socket?.connected) state.socket.emit('move', { x: p.body.position.x, z: p.body.position.z, rot: p.dir });
}

function updateArea() {
  state.entities.forEach((e) => (e.area = 0));
  for (let i = 0; i < TOTAL; i++) {
    const owner = state.owners[i];
    if (owner !== NONE && state.entities[owner]) state.entities[owner].area += 1;
  }
}

function drawMinimap() {
  const w = ui.miniMap.width;
  const h = ui.miniMap.height;
  mmCtx.clearRect(0, 0, w, h);
  mmCtx.fillStyle = '#143a3d';
  mmCtx.fillRect(0, 0, w, h);

  const pixel = w / GRID;
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const owner = state.owners[idx(x, y)];
      if (owner === NONE) continue;
      const color = `#${state.entities[owner].skin.color.toString(16).padStart(6, '0')}`;
      mmCtx.fillStyle = color;
      mmCtx.fillRect(x * pixel, y * pixel, Math.ceil(pixel), Math.ceil(pixel));
    }
  }

  state.players.forEach((p) => {
    const x = ((p.x + HALF) / (GRID * CELL)) * w;
    const y = ((p.z + HALF) / (GRID * CELL)) * h;
    mmCtx.fillStyle = p.id === state.myId ? '#ffffff' : '#ffd76a';
    mmCtx.beginPath();
    mmCtx.arc(x, y, p.id === state.myId ? 3.2 : 2.3, 0, Math.PI * 2);
    mmCtx.fill();
  });
}

function updateRemoteVisuals() {
  state.players.forEach((p, id) => {
    if (id === state.myId) return;
    let v = state.remotes.get(id);
    if (!v) {
      const skin = SKINS[p.skinIndex % SKINS.length];
      v = createAvatar(skin, 0.95);
      state.remotes.set(id, v);
    }
    v.position.lerp(new THREE.Vector3(p.x, 0, p.z), 0.28);
    v.rotation.y = THREE.MathUtils.lerp(v.rotation.y, p.rot || 0, 0.22);
  });

  state.remotes.forEach((mesh, id) => {
    if (!state.players.has(id)) {
      scene.remove(mesh);
      state.remotes.delete(id);
    }
  });
}

function localLeaderboardRows() {
  return state.entities
    .map((e) => ({
      id: e.id === 0 ? state.myId : `npc-${e.id}`,
      name: e.id === 0 ? state.myName : e.name,
      area: (e.area / TOTAL) * 100,
      kills: e.kills,
      coins: e.coins,
    }))
    .sort((a, b) => b.area - a.area)
    .slice(0, 8);
}

function renderHUD() {
  const me = state.local;
  updateArea();

  const areaPct = (me.area / TOTAL) * 100;
  const score = me.kills * 50 + me.coins;
  state.profile.bestArea = Math.max(state.profile.bestArea, areaPct);
  state.profile.bestScore = Math.max(state.profile.bestScore, score);

  ui.playerName.textContent = state.myName;
  ui.coinValue.textContent = `${me.coins}`;
  ui.killsValue.textContent = `${me.kills}`;
  ui.deathsValue.textContent = `${me.deaths}`;
  ui.livesValue.textContent = `${me.lives}`;
  ui.areaValue.textContent = `${areaPct.toFixed(1)}%`;
  ui.lobbyValue.textContent = `${state.players.size || 1}/${LOBBY_LIMIT}`;

  const rows = state.leaderboard.length > 0 ? state.leaderboard.slice(0, 8) : localLeaderboardRows();
  ui.leaderboardList.innerHTML = '';
  rows.forEach((r) => {
    const li = document.createElement('li');
    li.textContent = `${r.name}${r.id === state.myId ? ' (You)' : ''} · ${r.area.toFixed(1)}% · ${r.kills}K`;
    ui.leaderboardList.appendChild(li);
  });

  ui.bestFill.style.width = `${clamp(state.profile.bestArea, 0, 100)}%`;
  ui.bestAreaText.textContent = `${state.profile.bestArea.toFixed(1)}%`;
  saveProfile();
}

function emitStats(t) {
  if (!state.socket?.connected || t - state.lastStatsEmit < 0.35) return;
  state.lastStatsEmit = t;
  const me = state.local;
  state.socket.emit('stats', {
    kills: me.kills,
    coins: me.coins,
    area: (me.area / TOTAL) * 100,
    lives: me.lives,
  });
}

function connectSocket() {
  state.socket = io(SERVER_URL, { transports: ['websocket', 'polling'] });

  state.socket.on('connect', () => {
    state.myId = state.socket.id;
    state.socket.emit('join_game', { name: state.myName, skinIndex: state.skinIndex });
  });

  state.socket.on('server_full', () => {
    alert('Lobby is full (30/30). Please retry in a moment.');
    state.started = false;
    ui.startOverlay.style.display = 'grid';
  });

  state.socket.on('snapshot', ({ players }) => {
    state.players.clear();
    players.forEach((p) => state.players.set(p.id, p));
  });

  state.socket.on('leaderboard', ({ rows }) => { state.leaderboard = rows; });
  state.socket.on('room_info', ({ count }) => { ui.lobbyValue.textContent = `${count}/${LOBBY_LIMIT}`; });
}

function updateHeroPreview() {
  const s = SKINS[state.skinIndex];
  ui.heroCube.style.background = `linear-gradient(140deg, #ffffff70, #${s.color.toString(16).padStart(6, '0')})`;
}

function buildSkinButtons() {
  ui.skinRow.innerHTML = '';
  SKINS.forEach((s, i) => {
    const unlocked = skinUnlocked(i);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `skinBtn${i === state.skinIndex ? ' active' : ''}${unlocked ? '' : ' locked'}`;
    b.innerHTML = `<span class="skinSwatch" style="background:#${s.color.toString(16).padStart(6, '0')}"></span>${s.name}<span class="skinReq">${unlocked ? 'Unlocked' : s.unlock.label}</span>`;
    b.onclick = () => {
      if (!unlocked) return;
      state.skinIndex = i;
      state.profile.selectedSkin = i;
      saveProfile();
      updateHeroPreview();
      buildSkinButtons();
    };
    ui.skinRow.appendChild(b);
  });
}

function setupJoystick() {
  const maxR = 38;
  let activeId = null;
  const rectPos = () => ui.joyBase.getBoundingClientRect();

  function reset() {
    state.joy.set(0, 0);
    ui.joyStick.style.transform = 'translate(0px, 0px)';
    activeId = null;
  }

  ui.joyBase.addEventListener('pointerdown', (e) => {
    activeId = e.pointerId;
    ui.joyBase.setPointerCapture(e.pointerId);
  });

  ui.joyBase.addEventListener('pointermove', (e) => {
    if (activeId !== e.pointerId) return;
    const rect = rectPos();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const len = Math.hypot(dx, dy) || 1;
    const clamped = Math.min(maxR, len);
    const nx = dx / len;
    const ny = dy / len;
    state.joy.set(nx * (clamped / maxR), ny * (clamped / maxR));
    ui.joyStick.style.transform = `translate(${nx * clamped}px, ${ny * clamped}px)`;
  });

  ui.joyBase.addEventListener('pointerup', reset);
  ui.joyBase.addEventListener('pointercancel', reset);
}

ui.skinsBtn.addEventListener('click', () => {
  buildSkinButtons();
  ui.skinOverlay.classList.remove('hidden');
});
ui.skinCloseBtn.addEventListener('click', () => ui.skinOverlay.classList.add('hidden'));

ui.startBtn.addEventListener('click', () => {
  if (!skinUnlocked(state.skinIndex)) {
    state.skinIndex = 0;
    state.profile.selectedSkin = 0;
  }
  state.myName = sanitizeName(ui.nameInput.value);
  state.started = true;
  ui.startOverlay.style.display = 'none';
  setupRound();
  if (!state.socket) connectSocket();
  else if (state.socket.connected) state.socket.emit('join_game', { name: state.myName, skinIndex: state.skinIndex });
});

window.addEventListener('keydown', (e) => state.keys.add(e.key.toLowerCase()));
window.addEventListener('keyup', (e) => state.keys.delete(e.key.toLowerCase()));

const renderer = new THREE.WebGLRenderer({ canvas: ui.scene, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x4b7f81);
scene.fog = new THREE.Fog(0x4b7f81, 70, 190);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 34, 19);

scene.add(new THREE.HemisphereLight(0xf1f8ff, 0x1c3e40, 1.08));
const sun = new THREE.DirectionalLight(0xffffff, 1.28);
sun.position.set(45, 70, 26);
scene.add(sun);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(GRID * CELL + 70, GRID * CELL + 70), new THREE.MeshStandardMaterial({ color: 0x0f2324, roughness: 1 }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const ring = new THREE.Mesh(new THREE.RingGeometry(HALF + 1, HALF + 18, 128), new THREE.MeshBasicMaterial({ color: 0x030507, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
ring.rotation.x = -Math.PI / 2;
ring.position.y = 0.03;
scene.add(ring);

state.gridMesh = buildGridMesh();
setupJoystick();
updateHeroPreview();
buildSkinButtons();
ui.menuCoins.textContent = `${state.profile.totalCoins}`;
ui.bestFill.style.width = `${clamp(state.profile.bestArea, 0, 100)}%`;
ui.bestAreaText.textContent = `${state.profile.bestArea.toFixed(1)}%`;

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

const clock = new THREE.Clock();
let colorTimer = 0;
let trailTimer = 0;
let hudTimer = 0;
let mapTimer = 0;

function animate() {
  const dt = Math.min(clock.getDelta(), 0.033);
  const t = clock.elapsedTime;

  if (state.started && state.local) {
    updatePlayer(dt);
    state.entities.forEach((e) => {
      if (e.npc) updateNpc(e, dt, t);
      e.body.position.y = Math.sin(t * 6 + e.id) * 0.03;
    });

    updateRemoteVisuals();

    const p = state.local.body.position;
    const camTarget = new THREE.Vector3(p.x + 10, 36, p.z + 10);
    camera.position.lerp(camTarget, 0.08);
    camera.lookAt(p.x, 0, p.z);

    colorTimer += dt;
    trailTimer += dt;
    hudTimer += dt;
    mapTimer += dt;

    if (colorTimer > 0.15) { colorTimer = 0; paintGrid(); }
    if (trailTimer > 0.2) { trailTimer = 0; paintTrails(); }
    if (hudTimer > 0.18) { hudTimer = 0; renderHUD(); emitStats(t); }
    if (mapTimer > 0.2) { mapTimer = 0; drawMinimap(); }
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();
