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

const SKINS = [
  { id: 'sun', color: 0xf5cb1e, trail: 0xffe87a, requirement: { type: 'none', text: 'Default' } },
  { id: 'mint', color: 0x34e58f, trail: 0x95ffca, requirement: { type: 'area', value: 10, text: 'Cover 10% of the map' } },
  { id: 'sky', color: 0x3eb2ff, trail: 0x93d6ff, requirement: { type: 'area', value: 20, text: 'Cover 20% of the map' } },
  { id: 'berry', color: 0xff5d94, trail: 0xff9bbf, requirement: { type: 'area', value: 30, text: 'Cover 30% of the map' } },
  { id: 'violet', color: 0x9f6fff, trail: 0xd0b9ff, requirement: { type: 'score', value: 100, text: 'Reach score 100' } },
  { id: 'lava', color: 0xff8a3e, trail: 0xffbe8d, requirement: { type: 'score', value: 300, text: 'Reach score 300' } },
];

const ui = {
  scene: document.getElementById('scene'),
  coinIcon: document.getElementById('coinIcon'),
  coinFallback: document.getElementById('coinFallback'),
  coinValue: document.getElementById('coinValue'),
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
  nameInput: document.getElementById('nameInput'),
  skinRow: document.getElementById('skinRow'),
  heroCube: document.getElementById('heroCube'),
  skinsOverlay: document.getElementById('skinsOverlay'),
  openSkinsBtn: document.getElementById('openSkinsBtn'),
  closeSkinsBtn: document.getElementById('closeSkinsBtn'),
  selectSkinBtn: document.getElementById('selectSkinBtn'),
  skinRequirement: document.getElementById('skinRequirement'),
  mobileJoystick: document.getElementById('mobileJoystick'),
  joyBase: document.getElementById('joyBase'),
  joyKnob: document.getElementById('joyKnob'),
};

ui.coinIcon.addEventListener('load', () => {
  ui.coinIcon.classList.add('visible');
  ui.coinFallback.classList.remove('visible');
});
ui.coinIcon.addEventListener('error', () => {
  ui.coinIcon.classList.remove('visible');
  ui.coinFallback.classList.add('visible');
});
if (ui.coinIcon.complete && ui.coinIcon.naturalWidth > 0) ui.coinIcon.classList.add('visible');
else ui.coinFallback.classList.add('visible');

const mmCtx = ui.miniMap.getContext('2d');
const isTouch = matchMedia('(pointer: coarse)').matches;

const state = {
  keys: new Set(),
  socket: null,
  started: false,
  myId: null,
  myName: 'Guest',
  skinIndex: 0,
  previewSkinIndex: 0,
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
  profile: { bestArea: 0, bestScore: 0 },
  joystick: { active: false, x: 0, y: 0 },
};

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

function isSkinUnlocked(i) {
  const req = SKINS[i].requirement;
  if (req.type === 'none') return true;
  if (req.type === 'area') return state.profile.bestArea >= req.value;
  if (req.type === 'score') return state.profile.bestScore >= req.value;
  return false;
}

function scoreOf(entity) {
  return entity.kills * 30 + entity.coins + Math.floor((entity.area / TOTAL) * 100 * 3);
}

function createAvatar(skin, scale = 1) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: skin.color, roughness: 0.34, metalness: 0.1 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.2 * scale, 1.2 * scale, 1.2 * scale), mat);
  body.position.y = 0.86 * scale;
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34 * scale, 0.4 * scale, 0.25 * scale, 8),
    new THREE.MeshStandardMaterial({ color: 0x11323f })
  );
  base.position.y = 0.15 * scale;
  g.add(body, base);
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
    speed: data.isPlayer ? 9.5 : 8.1 + Math.random() * 1.6,
    dir: Math.random() * Math.PI * 2,
    kills: 0,
    coins: 0,
    deaths: 0,
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
  const geo = new THREE.BoxGeometry(CELL * 0.92, 0.45, CELL * 0.92);
  const mat = new THREE.MeshStandardMaterial({ color: 0x5e9093, roughness: 0.82, metalness: 0.04 });
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
      mesh.setColorAt(i, new THREE.Color(0x5e9093));
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
    const c = owner === NONE ? 0x5e9093 : (state.entities[owner]?.skin.color || 0x5e9093);
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
    const skin = state.entities[owner].skin;
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(CELL * 0.42, 0.85, CELL * 0.42),
      new THREE.MeshStandardMaterial({ color: skin.trail, emissive: skin.trail, emissiveIntensity: 0.45 })
    );
    m.position.set(p.x, 0.8, p.z);
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
  let minX = GRID - 1; let minY = GRID - 1; let maxX = 0; let maxY = 0;
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

function killEntity(victim, killer) {
  if (!victim || !killer) return;
  if (killer.isPlayer) {
    killer.coins += 8;
    killer.kills += 1;
  }
  if (victim.isPlayer) {
    victim.deaths += 1;
    victim.lives -= 1;
    if (victim.lives <= 0) {
      state.started = false;
      ui.startOverlay.style.display = 'grid';
      if (state.socket) state.socket.emit('leave_game');
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
  if (trailOwner !== NONE && trailOwner !== entity.id) {
    killEntity(state.entities[trailOwner], entity);
  }
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
  const meHome = cellCenter(npc.home.x, npc.home.y);
  const inOwn = state.owners[idx(c.x, c.y)] === npc.id;

  if (t > npc.aiTick) {
    npc.aiTick = t + 0.35 + Math.random() * 0.8;
    if (!inOwn && npc.trail.length > 10) {
      npc.dir = Math.atan2(meHome.x - npc.body.position.x, meHome.z - npc.body.position.z) + (Math.random() - 0.5) * 0.2;
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

function joystickInput() {
  const v = new THREE.Vector2(state.joystick.x, state.joystick.y);
  return v.lengthSq() > 0.01 ? v.normalize() : new THREE.Vector2(0, 0);
}

function getInput() {
  const m = new THREE.Vector2(0, 0);
  if (state.keys.has('w') || state.keys.has('arrowup')) m.y -= 1;
  if (state.keys.has('s') || state.keys.has('arrowdown')) m.y += 1;
  if (state.keys.has('a') || state.keys.has('arrowleft')) m.x -= 1;
  if (state.keys.has('d') || state.keys.has('arrowright')) m.x += 1;
  const j = joystickInput();
  m.add(j);
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

  if (state.socket?.connected) {
    state.socket.emit('move', { x: p.body.position.x, z: p.body.position.z, rot: p.dir });
  }
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
  mmCtx.fillStyle = '#0c1c20';
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
    mmCtx.fillStyle = p.id === state.myId ? '#ffffff' : '#ffd35f';
    mmCtx.beginPath();
    mmCtx.arc(x, y, p.id === state.myId ? 3.8 : 2.5, 0, Math.PI * 2);
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

function renderHUD() {
  const me = state.local;
  updateArea();

  const areaPct = (me.area / TOTAL) * 100;
  const score = scoreOf(me);
  state.profile.bestArea = Math.max(state.profile.bestArea, areaPct);
  state.profile.bestScore = Math.max(state.profile.bestScore, score);

  ui.playerName.textContent = state.myName;
  ui.coinValue.textContent = `${me.coins}`;
  ui.killsValue.textContent = `${me.kills}`;
  ui.deathsValue.textContent = `${me.deaths}`;
  ui.livesValue.textContent = `${me.lives}`;
  ui.areaValue.textContent = `${areaPct.toFixed(1)}%`;
  ui.lobbyValue.textContent = `${state.players.size}/${LOBBY_LIMIT}`;

  const rows = [...state.leaderboard].slice(0, 8);
  ui.leaderboardList.innerHTML = '';
  rows.forEach((r) => {
    const color = SKINS[r.skinIndex % SKINS.length]?.color || 0xffffff;
    const li = document.createElement('li');
    li.innerHTML = `<span style="color:#${color.toString(16).padStart(6, '0')}">■</span> ${r.name}${r.id === state.myId ? ' (You)' : ''} · ${r.area.toFixed(1)}%`;
    ui.leaderboardList.appendChild(li);
  });
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
    state.socket.emit('join_game', {
      name: state.myName,
      skinIndex: state.skinIndex,
    });
  });

  state.socket.on('server_full', () => {
    alert('Lobby is full (30/30). Try again in a second.');
    state.started = false;
    ui.startOverlay.style.display = 'grid';
  });

  state.socket.on('snapshot', ({ players }) => {
    state.players.clear();
    players.forEach((p) => state.players.set(p.id, p));
  });

  state.socket.on('leaderboard', ({ rows }) => {
    state.leaderboard = rows;
  });

  state.socket.on('room_info', ({ count }) => {
    ui.lobbyValue.textContent = `${count}/${LOBBY_LIMIT}`;
  });
}

function paintHeroPreview() {
  const s = SKINS[state.previewSkinIndex];
  ui.heroCube.style.background = `linear-gradient(140deg, #fff8b7, #${s.color.toString(16).padStart(6, '0')})`;
}

function buildSkinButtons() {
  ui.skinRow.innerHTML = '';
  SKINS.forEach((s, i) => {
    const unlocked = isSkinUnlocked(i);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `skinBtn${i === state.previewSkinIndex ? ' active' : ''}${unlocked ? '' : ' locked'}`;
    b.style.background = `linear-gradient(135deg, #${s.color.toString(16).padStart(6, '0')}, #243840)`;
    b.innerHTML = `<strong>${s.id.toUpperCase()}</strong><span>${unlocked ? 'Unlocked' : 'Locked'}</span>`;
    b.onclick = () => {
      state.previewSkinIndex = i;
      ui.skinRequirement.textContent = unlocked ? 'Ready to select.' : s.requirement.text;
      buildSkinButtons();
      paintHeroPreview();
    };
    ui.skinRow.appendChild(b);
  });
}

function ensureUnlockedSelection() {
  if (!isSkinUnlocked(state.skinIndex)) state.skinIndex = 0;
  if (!isSkinUnlocked(state.previewSkinIndex)) state.previewSkinIndex = state.skinIndex;
}

ui.openSkinsBtn.addEventListener('click', () => {
  ensureUnlockedSelection();
  ui.skinsOverlay.classList.remove('hidden');
  buildSkinButtons();
  ui.skinRequirement.textContent = SKINS[state.previewSkinIndex].requirement.text;
});

ui.closeSkinsBtn.addEventListener('click', () => ui.skinsOverlay.classList.add('hidden'));
ui.selectSkinBtn.addEventListener('click', () => {
  if (isSkinUnlocked(state.previewSkinIndex)) {
    state.skinIndex = state.previewSkinIndex;
    ui.skinsOverlay.classList.add('hidden');
    paintHeroPreview();
  }
});

ui.startBtn.addEventListener('click', () => {
  state.myName = sanitizeName(ui.nameInput.value);
  ensureUnlockedSelection();
  state.started = true;
  ui.startOverlay.style.display = 'none';
  setupRound();
  if (!state.socket) connectSocket();
  else if (state.socket.connected) state.socket.emit('join_game', { name: state.myName, skinIndex: state.skinIndex });
});

window.addEventListener('keydown', (e) => state.keys.add(e.key.toLowerCase()));
window.addEventListener('keyup', (e) => state.keys.delete(e.key.toLowerCase()));

if (isTouch) {
  ui.mobileJoystick.classList.add('visible');
  const center = { x: 64, y: 64 };
  const maxDist = 36;

  function setKnob(dx, dy) {
    const len = Math.hypot(dx, dy);
    let nx = dx;
    let ny = dy;
    if (len > maxDist) {
      nx = (dx / len) * maxDist;
      ny = (dy / len) * maxDist;
    }
    ui.joyKnob.style.left = `${37 + nx}px`;
    ui.joyKnob.style.top = `${37 + ny}px`;
    state.joystick.x = nx / maxDist;
    state.joystick.y = ny / maxDist;
  }

  ui.joyBase.addEventListener('pointerdown', (e) => {
    state.joystick.active = true;
    const rect = ui.joyBase.getBoundingClientRect();
    setKnob(e.clientX - rect.left - center.x, e.clientY - rect.top - center.y);
    ui.joyBase.setPointerCapture(e.pointerId);
  });

  ui.joyBase.addEventListener('pointermove', (e) => {
    if (!state.joystick.active) return;
    const rect = ui.joyBase.getBoundingClientRect();
    setKnob(e.clientX - rect.left - center.x, e.clientY - rect.top - center.y);
  });

  function resetJoystick() {
    state.joystick.active = false;
    state.joystick.x = 0;
    state.joystick.y = 0;
    ui.joyKnob.style.left = '37px';
    ui.joyKnob.style.top = '37px';
  }

  ui.joyBase.addEventListener('pointerup', resetJoystick);
  ui.joyBase.addEventListener('pointercancel', resetJoystick);

  ui.scene.addEventListener('pointerdown', (e) => {
    if (!state.started || !state.local) return;
    if (e.clientX < window.innerWidth * 0.4 && e.clientY > window.innerHeight * 0.55) return;
    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = -(e.clientY / window.innerHeight) * 2 + 1;
    state.local.dir = Math.atan2(nx, ny);
  });
}

const renderer = new THREE.WebGLRenderer({ canvas: ui.scene, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x75aeb0);
scene.fog = new THREE.Fog(0x6ea5a7, 45, 170);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 18, 16);

scene.add(new THREE.HemisphereLight(0xd2fcff, 0x1b3f46, 1.15));
const sun = new THREE.DirectionalLight(0xfff2ba, 1.35);
sun.position.set(40, 65, 24);
scene.add(sun);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(GRID * CELL + 120, GRID * CELL + 120),
  new THREE.MeshStandardMaterial({ color: 0x31666f, roughness: 1 })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const ring = new THREE.Mesh(
  new THREE.RingGeometry(HALF + 1.5, HALF + 10, 80),
  new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, transparent: true, opacity: 0.7 })
);
ring.rotation.x = -Math.PI / 2;
ring.position.y = 0.02;
scene.add(ring);

state.gridMesh = buildGridMesh();
paintHeroPreview();

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
    const camTarget = new THREE.Vector3(p.x + 9, 15.5, p.z + 9);
    camera.position.lerp(camTarget, 0.08);
    camera.lookAt(p.x, 0, p.z);

    colorTimer += dt;
    trailTimer += dt;
    hudTimer += dt;
    mapTimer += dt;

    if (colorTimer > 0.12) { colorTimer = 0; paintGrid(); }
    if (trailTimer > 0.16) { trailTimer = 0; paintTrails(); }
    if (hudTimer > 0.15) { hudTimer = 0; renderHUD(); emitStats(t); }
    if (mapTimer > 0.16) { mapTimer = 0; drawMinimap(); }
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();
