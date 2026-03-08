let THREE = null;

const SERVER_URL = window.location.hostname.includes('github.io')
  ? 'http://89.167.75.175:3000'
  : window.location.origin;

const GRID = 70;
const CELL = 2;
const HALF = (GRID * CELL) / 2;
const TOTAL = GRID * GRID;
const NONE = -1;
const LOBBY_LIMIT = 30;
const PROFILE_KEY = 'tralala_profile_v3';

const SKINS = [
  { id: 'SUN', color: 0xf7cb17, trail: 0xffea87, requirement: { type: 'none', text: 'Unlocked' } },
  { id: 'MINT', color: 0x42df91, trail: 0x98f8c9, requirement: { type: 'area', value: 10, text: 'Capture 10% area' } },
  { id: 'SKY', color: 0x4caaf9, trail: 0x9ed5ff, requirement: { type: 'area', value: 20, text: 'Capture 20% area' } },
  { id: 'ROSE', color: 0xff6991, trail: 0xffacc3, requirement: { type: 'area', value: 30, text: 'Capture 30% area' } },
  { id: 'VIOLET', color: 0x9e75ff, trail: 0xd3c1ff, requirement: { type: 'score', value: 100, text: 'Reach score 100' } },
  { id: 'LAVA', color: 0xff9342, trail: 0xffc99c, requirement: { type: 'score', value: 300, text: 'Reach score 300' } },
];

function requireEl(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing UI element #${id}`);
  return el;
}

const ui = {
  scene: requireEl('scene'),
  menuScreen: requireEl('menuScreen'),
  skinsScreen: requireEl('skinsScreen'),
  gameHud: requireEl('gameHud'),
  settingsSheet: requireEl('settingsSheet'),
  tutorialCard: requireEl('tutorialCard'),

  settingsBtn: requireEl('settingsBtn'),
  settingsCloseBtn: requireEl('settingsCloseBtn'),
  playBtn: requireEl('playBtn'),
  openSkinsBtn: requireEl('openSkinsBtn'),
  skinsBackBtn: requireEl('skinsBackBtn'),
  skinPrevBtn: requireEl('skinPrevBtn'),
  skinNextBtn: requireEl('skinNextBtn'),
  skinSelectBtn: requireEl('skinSelectBtn'),
  closeTutorialBtn: requireEl('closeTutorialBtn'),

  menuCoins: requireEl('menuCoins'),
  bestScore: requireEl('bestScore'),
  nameInput: requireEl('nameInput'),
  heroCube: requireEl('heroCube'),

  skinPreviewCube: requireEl('skinPreviewCube'),
  skinName: requireEl('skinName'),
  skinRequirement: requireEl('skinRequirement'),

  coinValue: requireEl('coinValue'),
  scoreValue: requireEl('scoreValue'),
  areaValue: requireEl('areaValue'),
  playerName: requireEl('playerName'),
  livesValue: requireEl('livesValue'),
  leaderboardList: requireEl('leaderboardList'),
  miniMap: requireEl('miniMap'),

  mobileJoystick: requireEl('mobileJoystick'),
  joyBase: requireEl('joyBase'),
  joyKnob: requireEl('joyKnob'),
};

async function ensureThree() {
  if (THREE) return THREE;
  THREE = await import('https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js');
  return THREE;
}

function onPress(el, handler) {
  let last = 0;
  const run = (e) => {
    const now = performance.now();
    if (now - last < 220) return;
    last = now;
    if (e) e.preventDefault();
    handler();
  };
  el.addEventListener('click', run);
  el.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'touch') run(e);
  });
}

function sanitizeName(name) {
  const clean = String(name || '').replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 16);
  return clean || 'Guest';
}

function hexColor(v) { return `#${v.toString(16).padStart(6, '0')}`; }
function idx(x, y) { return y * GRID + x; }
function inBounds(x, y) { return x >= 0 && y >= 0 && x < GRID && y < GRID; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

const mmCtx = ui.miniMap.getContext('2d');
const isTouch = matchMedia('(pointer: coarse)').matches;

const state = {
  started: false,
  myName: 'Guest',
  myId: null,
  skinIndex: 0,
  previewSkinIndex: 0,
  keys: new Set(),
  socket: null,
  players: new Map(),
  remotes: new Map(),
  leaderboard: [],
  local: null,
  entities: [],
  owners: new Int16Array(TOTAL).fill(NONE),
  trailOwners: new Int16Array(TOTAL).fill(NONE),
  trailMeshes: new Map(),
  gridMesh: null,
  dirtyColors: true,
  dirtyTrails: true,
  lastStatsEmit: 0,
  tutorialSeen: false,
  profile: { coins: 0, bestScore: 0, bestArea: 0, name: 'Guest', skinIndex: 0 },
  joystick: { active: false, x: 0, y: 0 },
};

let renderer = null;
let scene = null;
let camera = null;
let clock = null;
let colorTimer = 0;
let trailTimer = 0;
let hudTimer = 0;
let mapTimer = 0;

function cellCenter(x, y) {
  return new THREE.Vector3(-HALF + x * CELL + CELL / 2, 0, -HALF + y * CELL + CELL / 2);
}

function worldToCell(pos) {
  return {
    x: clamp(Math.floor((pos.x + HALF) / CELL), 0, GRID - 1),
    y: clamp(Math.floor((pos.z + HALF) / CELL), 0, GRID - 1),
  };
}

function loadProfile() {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}');
    state.profile.coins = Math.max(0, Number(p.coins) || 0);
    state.profile.bestScore = Math.max(0, Number(p.bestScore) || 0);
    state.profile.bestArea = Math.max(0, Number(p.bestArea) || 0);
    state.profile.name = sanitizeName(p.name || 'Guest');
    state.profile.skinIndex = Math.max(0, Number(p.skinIndex) || 0);
    state.myName = state.profile.name;
    state.skinIndex = state.profile.skinIndex % SKINS.length;
    state.previewSkinIndex = state.skinIndex;
    ui.nameInput.value = state.myName;
  } catch {
    // ignore
  }
}

function saveProfile() {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(state.profile));
}

function isSkinUnlocked(i) {
  const req = SKINS[i].requirement;
  if (req.type === 'none') return true;
  if (req.type === 'area') return state.profile.bestArea >= req.value;
  if (req.type === 'score') return state.profile.bestScore >= req.value;
  return false;
}

function scoreOf(entity) {
  return entity.kills * 30 + entity.coins + Math.floor((entity.area / TOTAL) * 300);
}

function setCubeStyle(el, skin) {
  el.style.background = `linear-gradient(145deg, #fff2ae, ${hexColor(skin.color)})`;
}

function showMenu() {
  ui.menuScreen.classList.remove('hidden');
  ui.skinsScreen.classList.add('hidden');
  ui.gameHud.classList.add('hidden');
  ui.settingsSheet.classList.add('hidden');
  ui.tutorialCard.classList.add('hidden');
  ui.menuCoins.textContent = String(state.profile.coins);
  ui.bestScore.textContent = String(Math.floor(state.profile.bestScore));
  setCubeStyle(ui.heroCube, SKINS[state.skinIndex]);
}

function showSkins() {
  ui.menuScreen.classList.add('hidden');
  ui.skinsScreen.classList.remove('hidden');
  ui.gameHud.classList.add('hidden');
  updateSkinPreview();
}

function showGameHUD() {
  ui.menuScreen.classList.add('hidden');
  ui.skinsScreen.classList.add('hidden');
  ui.gameHud.classList.remove('hidden');
}

function updateSkinPreview() {
  const skin = SKINS[state.previewSkinIndex];
  const unlocked = isSkinUnlocked(state.previewSkinIndex);
  setCubeStyle(ui.skinPreviewCube, skin);
  ui.skinName.textContent = skin.id;
  ui.skinRequirement.textContent = unlocked ? 'Unlocked' : `Locked · ${skin.requirement.text}`;
  ui.skinSelectBtn.disabled = !unlocked;
  ui.skinSelectBtn.style.opacity = unlocked ? '1' : '.55';
}

function connectSocket() {
  if (typeof io !== 'function') return;
  if (state.socket) return;
  state.socket = io(SERVER_URL, { transports: ['websocket', 'polling'] });

  state.socket.on('connect', () => {
    state.myId = state.socket.id;
    state.socket.emit('join_game', { name: state.myName, skinIndex: state.skinIndex });
  });

  state.socket.on('snapshot', ({ players }) => {
    state.players.clear();
    players.forEach((p) => state.players.set(p.id, p));
  });

  state.socket.on('leaderboard', ({ rows }) => {
    state.leaderboard = rows;
  });

  state.socket.on('server_full', () => {
    state.started = false;
    showMenu();
    ui.settingsSheet.classList.remove('hidden');
    ui.settingsSheet.querySelector('h3').textContent = 'Lobby is full';
  });
}

function createAvatar(skin, scale = 1) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.2 * scale, 1.2 * scale, 1.2 * scale),
    new THREE.MeshStandardMaterial({ color: skin.color, roughness: 0.35, metalness: 0.1 })
  );
  body.position.y = 0.85 * scale;

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4 * scale, 0.48 * scale, 0.18 * scale, 10),
    new THREE.MeshStandardMaterial({ color: 0x123841 })
  );
  base.position.y = 0.09;

  group.add(body, base);
  scene.add(group);
  return group;
}

function makeEntity({ id, name, skinIndex, isPlayer = false, npc = false }) {
  const skin = SKINS[skinIndex % SKINS.length];
  return {
    id,
    name,
    skin,
    skinIndex,
    isPlayer,
    npc,
    speed: isPlayer ? 9.6 : 8 + Math.random() * 1.5,
    dir: Math.random() * Math.PI * 2,
    kills: 0,
    coins: 0,
    lives: 3,
    deaths: 0,
    area: 0,
    trail: [],
    body: createAvatar(skin, isPlayer ? 1 : 0.9),
    home: { x: 0, y: 0 },
    aiTick: 0,
  };
}

function clearEntityMap(id) {
  for (let i = 0; i < TOTAL; i++) {
    if (state.owners[i] === id) state.owners[i] = NONE;
    if (state.trailOwners[i] === id) state.trailOwners[i] = NONE;
  }
}

function spawnArea(entity, cx, cy, radius = 2) {
  entity.home = { x: cx, y: cy };
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      if (inBounds(x, y)) state.owners[idx(x, y)] = entity.id;
    }
  }
  const p = cellCenter(cx, cy);
  entity.body.position.set(p.x, 0, p.z);
}

function setupRound() {
  if (!scene) throw new Error('Scene not initialized');

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
  const p = cellCenter(cx, cy);
  entity.body.position.set(p.x, 0, p.z);
}

  const anchors = [[35, 35], [10, 10], [60, 10], [10, 60], [60, 60], [20, 35], [50, 35], [35, 18], [35, 55]];
  state.entities.forEach((e, i) => spawnArea(e, anchors[i][0], anchors[i][1], e.isPlayer ? 3 : 2));
  state.dirtyColors = true;
  state.dirtyTrails = true;

  const anchors = [[35, 35], [10, 10], [60, 10], [10, 60], [60, 60], [20, 35], [50, 35], [35, 18], [35, 55]];
  state.entities.forEach((e, i) => spawnArea(e, anchors[i][0], anchors[i][1], e.isPlayer ? 3 : 2));
  state.dirtyColors = true;
  state.dirtyTrails = true;

  const anchors = [[35, 35], [10, 10], [60, 10], [10, 60], [60, 60], [20, 35], [50, 35], [35, 18], [35, 55]];
  state.entities.forEach((e, i) => spawnArea(e, anchors[i][0], anchors[i][1], e.isPlayer ? 3 : 2));
  state.dirtyColors = true;
  state.dirtyTrails = true;

  if (!state.tutorialSeen) {
    state.tutorialSeen = true;
    ui.tutorialCard.classList.remove('hidden');
  }
}


function buildGridMesh() {
  const geo = new THREE.BoxGeometry(CELL * 0.96, 0.35, CELL * 0.96);
  const mat = new THREE.MeshStandardMaterial({ color: 0x76b1b5, roughness: 0.94, metalness: 0.02 });
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
      mesh.setColorAt(i, new THREE.Color(0x76b1b5));
      i++;
    }
  }
  scene.add(mesh);
  return mesh;
}

function paintGrid() {
  if (!state.dirtyColors || !state.gridMesh) return;
  for (let i = 0; i < TOTAL; i++) {
    const owner = state.owners[i];
    const color = owner === NONE ? 0x76b1b5 : (state.entities[owner]?.skin.color ?? 0x76b1b5);
    state.gridMesh.setColorAt(i, new THREE.Color(color));
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
    const skin = state.entities[owner]?.skin;
    if (!skin) continue;

    const trail = new THREE.Mesh(
      new THREE.BoxGeometry(CELL * 0.56, 0.58, CELL * 0.56),
      new THREE.MeshStandardMaterial({ color: skin.trail, emissive: skin.trail, emissiveIntensity: 0.5 })
    );
    trail.position.set(p.x, 0.45, p.z);
    scene.add(trail);
    state.trailMeshes.set(i, trail);
  }
  state.dirtyTrails = false;
}

function closeLoop(entity) {
  if (entity.trail.length < 2) {
    entity.trail.forEach((i) => {
      state.owners[i] = entity.id;
      state.trailOwners[i] = NONE;
    });
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

  entity.trail.forEach((i) => {
    state.owners[i] = entity.id;
    state.trailOwners[i] = NONE;
  });
  entity.trail.length = 0;
  state.dirtyColors = true;
  state.dirtyTrails = true;
}

function respawn(entity) {
  clearEntityMap(entity.id);
  entity.trail.length = 0;
  const rx = Math.floor(6 + Math.random() * (GRID - 12));
  const ry = Math.floor(6 + Math.random() * (GRID - 12));
  spawnArea(entity, rx, ry, entity.isPlayer ? 2 : 1);
  state.dirtyColors = true;
  state.dirtyTrails = true;
}

function finishRound() {
  const me = state.local;
  if (!me) return;
  const areaPct = (me.area / TOTAL) * 100;
  const score = scoreOf(me);
  state.profile.coins += me.coins;
  state.profile.bestArea = Math.max(state.profile.bestArea, areaPct);
  state.profile.bestScore = Math.max(state.profile.bestScore, score);
  state.profile.name = state.myName;
  state.profile.skinIndex = state.skinIndex;
  saveProfile();
  state.started = false;
  showMenu();
}

function killEntity(victim, killer) {
  if (!victim || !killer) return;
  if (killer.isPlayer) {
    killer.kills += 1;
    killer.coins += 8;
  }
  if (victim.isPlayer) {
    victim.lives -= 1;
    victim.deaths += 1;
    if (victim.lives <= 0) {
      if (state.socket?.connected) state.socket.emit('leave_game');
      finishRound();
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
  const inOwn = state.owners[idx(c.x, c.y)] === npc.id;
  const homePos = cellCenter(npc.home.x, npc.home.y);

  if (t > npc.aiTick) {
    npc.aiTick = t + 0.35 + Math.random() * 0.8;
    if (!inOwn && npc.trail.length > 10) {
      npc.dir = Math.atan2(homePos.x - npc.body.position.x, homePos.z - npc.body.position.z) + (Math.random() - 0.5) * 0.2;
    } else {
      const enemy = nearestEnemyTrail(npc, 9);
      if (enemy) npc.dir = Math.atan2(enemy.x - npc.body.position.x, enemy.z - npc.body.position.z);
      else npc.dir += (Math.random() - 0.5) * 1.2;
    }
  }

  npc.body.position.x += Math.sin(npc.dir) * npc.speed * dt;
  npc.body.position.z += Math.cos(npc.dir) * npc.speed * dt;
  npc.body.position.x = clamp(npc.body.position.x, -HALF + 1, HALF - 1);
  npc.body.position.z = clamp(npc.body.position.z, -HALF + 1, HALF - 1);
  npc.body.rotation.y = npc.dir;
  stepEntity(npc);
}

function joystickInput() {
  if (!THREE) return { x: 0, y: 0, lengthSq: () => 0, normalize: () => ({ x: 0, y: 0 }) };
  const v = new THREE.Vector2(state.joystick.x, state.joystick.y);
  return v.lengthSq() > 0.01 ? v.normalize() : new THREE.Vector2(0, 0);
}

function getInput() {
  const m = new THREE.Vector2(0, 0);
  if (state.keys.has('w') || state.keys.has('arrowup')) m.y -= 1;
  if (state.keys.has('s') || state.keys.has('arrowdown')) m.y += 1;
  if (state.keys.has('a') || state.keys.has('arrowleft')) m.x -= 1;
  if (state.keys.has('d') || state.keys.has('arrowright')) m.x += 1;
  m.add(joystickInput());
  return m.lengthSq() > 0 ? m.normalize() : m;
}

function updatePlayer(dt) {
  const p = state.local;
  const input = getInput();
  if (input.lengthSq() > 0) p.dir = Math.atan2(input.x, input.y);

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
  state.entities.forEach((e) => { e.area = 0; });
  for (let i = 0; i < TOTAL; i++) {
    const owner = state.owners[i];
    if (owner !== NONE && state.entities[owner]) state.entities[owner].area += 1;
  }
}

function drawMinimap() {
  const w = ui.miniMap.width;
  const h = ui.miniMap.height;
  mmCtx.clearRect(0, 0, w, h);
  mmCtx.fillStyle = '#0d2f34';
  mmCtx.fillRect(0, 0, w, h);

  const pixel = w / GRID;
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const owner = state.owners[idx(x, y)];
      if (owner === NONE) continue;
      mmCtx.fillStyle = hexColor(state.entities[owner]?.skin.color || 0xffffff);
      mmCtx.fillRect(x * pixel, y * pixel, Math.ceil(pixel), Math.ceil(pixel));
    }
  }

  state.players.forEach((p) => {
    const x = ((p.x + HALF) / (GRID * CELL)) * w;
    const y = ((p.z + HALF) / (GRID * CELL)) * h;
    mmCtx.fillStyle = p.id === state.myId ? '#ffffff' : '#ffe58f';
    mmCtx.beginPath();
    mmCtx.arc(x, y, p.id === state.myId ? 3.5 : 2.3, 0, Math.PI * 2);
    mmCtx.fill();
  });
}

function updateRemoteVisuals() {
  state.players.forEach((p, id) => {
    if (id === state.myId) return;
    let mesh = state.remotes.get(id);
    if (!mesh) {
      mesh = createAvatar(SKINS[p.skinIndex % SKINS.length], 0.95);
      state.remotes.set(id, mesh);
    }
    mesh.position.lerp(new THREE.Vector3(p.x, 0, p.z), 0.28);
    mesh.rotation.y = THREE.MathUtils.lerp(mesh.rotation.y, p.rot || 0, 0.22);
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

  ui.coinValue.textContent = String(state.profile.coins + me.coins);
  ui.scoreValue.textContent = String(score);
  ui.areaValue.textContent = `${areaPct.toFixed(1)}%`;
  ui.playerName.textContent = state.myName;
  ui.livesValue.textContent = '❤'.repeat(Math.max(0, me.lives));

  const rows = [...state.leaderboard].slice(0, 6);
  ui.leaderboardList.innerHTML = '';
  rows.forEach((row) => {
    const li = document.createElement('li');
    const color = SKINS[row.skinIndex % SKINS.length]?.color ?? 0xffffff;
    li.innerHTML = `<span style="color:${hexColor(color)}">■</span> ${row.name}${row.id === state.myId ? ' (You)' : ''} ${row.area.toFixed(1)}%`;
    ui.leaderboardList.appendChild(li);
  });

  state.profile.bestArea = Math.max(state.profile.bestArea, areaPct);
  state.profile.bestScore = Math.max(state.profile.bestScore, score);
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

function setupUIHandlers() {
  onPress(ui.settingsBtn, () => ui.settingsSheet.classList.remove('hidden'));
  onPress(ui.settingsCloseBtn, () => ui.settingsSheet.classList.add('hidden'));
  onPress(ui.openSkinsBtn, () => showSkins());
  onPress(ui.skinsBackBtn, () => showMenu());

  onPress(ui.skinPrevBtn, () => {
    state.previewSkinIndex = (state.previewSkinIndex - 1 + SKINS.length) % SKINS.length;
    updateSkinPreview();
  });

  onPress(ui.skinNextBtn, () => {
    state.previewSkinIndex = (state.previewSkinIndex + 1) % SKINS.length;
    updateSkinPreview();
  });

  onPress(ui.skinSelectBtn, () => {
    if (!isSkinUnlocked(state.previewSkinIndex)) return;
    state.skinIndex = state.previewSkinIndex;
    state.profile.skinIndex = state.skinIndex;
    saveProfile();
    showMenu();
  });

  onPress(ui.closeTutorialBtn, () => ui.tutorialCard.classList.add('hidden'));

  onPress(ui.playBtn, async () => {
    try {
      await ensureThree();
      if (!renderer) init3D();
    } catch {
      ui.settingsSheet.classList.remove('hidden');
      ui.settingsSheet.querySelector('h3').textContent = 'Could not load 3D engine';
      return;
    }

    state.myName = sanitizeName(ui.nameInput.value);
    state.profile.name = state.myName;
    saveProfile();

    state.started = true;
    showGameHUD();
    setupRound();

    connectSocket();
    if (state.socket?.connected) state.socket.emit('join_game', { name: state.myName, skinIndex: state.skinIndex });
  });

  state.profile.bestArea = Math.max(state.profile.bestArea, areaPct);
  state.profile.bestScore = Math.max(state.profile.bestScore, score);
}

function setupControls() {
  window.addEventListener('keydown', (e) => state.keys.add(e.key.toLowerCase()));
  window.addEventListener('keyup', (e) => state.keys.delete(e.key.toLowerCase()));

  if (!isTouch) {
    ui.mobileJoystick.classList.add('hidden');
    return;
  }

  const center = { x: 62, y: 62 };
  const maxDist = 34;

  function setKnob(dx, dy) {
    const len = Math.hypot(dx, dy);
    let nx = dx;
    let ny = dy;
    if (len > maxDist) {
      nx = (dx / len) * maxDist;
      ny = (dy / len) * maxDist;
    }
    ui.joyKnob.style.left = `${35 + nx}px`;
    ui.joyKnob.style.top = `${35 + ny}px`;
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

  function resetJoy() {
    state.joystick.active = false;
    state.joystick.x = 0;
    state.joystick.y = 0;
    ui.joyKnob.style.left = '35px';
    ui.joyKnob.style.top = '35px';
  }

  ui.joyBase.addEventListener('pointerup', resetJoy);
  ui.joyBase.addEventListener('pointercancel', resetJoy);
}

function init3D() {
  if (renderer) return;

  renderer = new THREE.WebGLRenderer({ canvas: ui.scene, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2f7075);
  scene.fog = new THREE.Fog(0x2f7075, 42, 150);

  camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 500);
  camera.position.set(0, 16, 14);

  scene.add(new THREE.HemisphereLight(0xd6ffff, 0x1b4b53, 1.06));
  const sun = new THREE.DirectionalLight(0xfff2bf, 1.3);
  sun.position.set(38, 62, 22);
  scene.add(sun);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(GRID * CELL + 120, GRID * CELL + 120),
    new THREE.MeshStandardMaterial({ color: 0x2f6d73, roughness: 1 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(HALF + 2, HALF + 10, 80),
    new THREE.MeshBasicMaterial({ color: 0x041215, side: THREE.DoubleSide, transparent: true, opacity: 0.8 })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  scene.add(ring);

  state.gridMesh = buildGridMesh();

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  clock = new THREE.Clock();
  animate();
}

function animate() {
  if (!renderer || !scene || !camera || !clock) return;

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
    const camTarget = new THREE.Vector3(p.x + 8, 14.5, p.z + 8);
    camera.position.lerp(camTarget, 0.09);
    camera.lookAt(p.x, 0, p.z);

    colorTimer += dt;
    trailTimer += dt;
    hudTimer += dt;
    mapTimer += dt;

    if (colorTimer > 0.12) { colorTimer = 0; paintGrid(); }
    if (trailTimer > 0.14) { trailTimer = 0; paintTrails(); }
    if (hudTimer > 0.14) { hudTimer = 0; renderHUD(); emitStats(t); }
    if (mapTimer > 0.15) { mapTimer = 0; drawMinimap(); }
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

loadProfile();
setupUIHandlers();
setupControls();
showMenu();
updateSkinPreview();

ensureThree().then(() => init3D()).catch(() => {
  // UI still usable even if engine preload fails.
});
