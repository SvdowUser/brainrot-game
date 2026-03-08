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
  { id: 'SUN', color: 0xf7cd1e, trail: 0xffea85, requirement: { type: 'none', text: 'Unlocked' } },
  { id: 'MINT', color: 0x45de90, trail: 0x9df5c7, requirement: { type: 'area', value: 10, text: 'Cover 10% area' } },
  { id: 'SKY', color: 0x45aff7, trail: 0x9dd6ff, requirement: { type: 'area', value: 20, text: 'Cover 20% area' } },
  { id: 'BERRY', color: 0xff6b8f, trail: 0xffabc0, requirement: { type: 'area', value: 30, text: 'Cover 30% area' } },
  { id: 'VIOLET', color: 0x9d75ff, trail: 0xd0bcff, requirement: { type: 'score', value: 100, text: 'Reach score 100' } },
  { id: 'LAVA', color: 0xff8f3e, trail: 0xffc28f, requirement: { type: 'score', value: 300, text: 'Reach score 300' } },
];

const ui = {
  scene: document.getElementById('scene'),
  menuScreen: document.getElementById('menuScreen'),
  skinsScreen: document.getElementById('skinsScreen'),
  gameHud: document.getElementById('gameHud'),
  tutorialCard: document.getElementById('tutorialCard'),
  closeTutorialBtn: document.getElementById('closeTutorialBtn'),
  settingsBtn: document.getElementById('settingsBtn'),
  menuCoinValue: document.getElementById('menuCoinValue'),
  bestScoreValue: document.getElementById('bestScoreValue'),
  nameInput: document.getElementById('nameInput'),
  heroCube: document.getElementById('heroCube'),
  playBtn: document.getElementById('playBtn'),
  openSkinsBtn: document.getElementById('openSkinsBtn'),

  skinsBackBtn: document.getElementById('skinsBackBtn'),
  skinPrevBtn: document.getElementById('skinPrevBtn'),
  skinNextBtn: document.getElementById('skinNextBtn'),
  skinSelectBtn: document.getElementById('skinSelectBtn'),
  skinPreviewCube: document.getElementById('skinPreviewCube'),
  skinName: document.getElementById('skinName'),
  skinStatus: document.getElementById('skinStatus'),

  coinValue: document.getElementById('coinValue'),
  scoreValue: document.getElementById('scoreValue'),
  areaValue: document.getElementById('areaValue'),
  playerName: document.getElementById('playerName'),
  livesValue: document.getElementById('livesValue'),
  leaderboardList: document.getElementById('leaderboardList'),
  miniMap: document.getElementById('miniMap'),

  mobileJoystick: document.getElementById('mobileJoystick'),
  joyBase: document.getElementById('joyBase'),
  joyKnob: document.getElementById('joyKnob'),
};

const mmCtx = ui.miniMap.getContext('2d');
const isTouch = matchMedia('(pointer: coarse)').matches;
const profileKey = 'tralala_profile_v2';

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
  profile: { coins: 0, bestArea: 0, bestScore: 0, bestName: 'Guest', skinIndex: 0 },
  joystick: { active: false, x: 0, y: 0 },
  tutorialShown: false,
};

function sanitizeName(name) {
  const clean = String(name || '').replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 16);
  return clean || 'Guest';
}

function loadProfile() {
  try {
    const parsed = JSON.parse(localStorage.getItem(profileKey) || '{}');
    state.profile.coins = Math.max(0, Number(parsed.coins) || 0);
    state.profile.bestArea = Math.max(0, Number(parsed.bestArea) || 0);
    state.profile.bestScore = Math.max(0, Number(parsed.bestScore) || 0);
    state.profile.bestName = sanitizeName(parsed.bestName || 'Guest');
    state.profile.skinIndex = Math.max(0, Number(parsed.skinIndex) || 0);
    state.skinIndex = state.profile.skinIndex;
    state.previewSkinIndex = state.skinIndex;
    ui.nameInput.value = state.profile.bestName;
  } catch {
    // ignore malformed local storage
  }
}

function saveProfile() {
  localStorage.setItem(profileKey, JSON.stringify(state.profile));
}

function idx(x, y) { return y * GRID + x; }
function inBounds(x, y) { return x >= 0 && y >= 0 && x < GRID && y < GRID; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

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

function hexColor(v) { return `#${v.toString(16).padStart(6, '0')}`; }

function setCubeStyle(el, skin) {
  el.style.background = `linear-gradient(145deg, #fff0a6, ${hexColor(skin.color)})`;
}

function refreshMenuStats() {
  ui.menuCoinValue.textContent = String(state.profile.coins);
  ui.bestScoreValue.textContent = String(Math.floor(state.profile.bestScore));
}

function showMenu() {
  ui.menuScreen.classList.remove('hidden');
  ui.skinsScreen.classList.add('hidden');
  ui.gameHud.classList.add('hidden');
  ui.tutorialCard.classList.add('hidden');
  setCubeStyle(ui.heroCube, SKINS[state.skinIndex]);
  refreshMenuStats();
}

function showGameUI() {
  ui.menuScreen.classList.add('hidden');
  ui.skinsScreen.classList.add('hidden');
  ui.gameHud.classList.remove('hidden');
}

function showSkins() {
  ui.menuScreen.classList.add('hidden');
  ui.skinsScreen.classList.remove('hidden');
  updateSkinPreview();
}

function updateSkinPreview() {
  const skin = SKINS[state.previewSkinIndex];
  const unlocked = isSkinUnlocked(state.previewSkinIndex);
  setCubeStyle(ui.skinPreviewCube, skin);
  ui.skinName.textContent = skin.id;
  ui.skinStatus.textContent = unlocked ? 'Unlocked' : `Locked · ${skin.requirement.text}`;
  ui.skinSelectBtn.disabled = !unlocked;
  ui.skinSelectBtn.style.opacity = unlocked ? '1' : '.5';
}

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
  const mat = new THREE.MeshStandardMaterial({ color: skin.color, roughness: 0.38, metalness: 0.08 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.18 * scale, 1.18 * scale, 1.18 * scale), mat);
  body.position.y = 0.84 * scale;
  const shadowBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.44 * scale, 0.52 * scale, 0.18 * scale, 10),
    new THREE.MeshStandardMaterial({ color: 0x12373d })
  );
  shadowBase.position.y = 0.09 * scale;
  g.add(body, shadowBase);
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
    speed: data.isPlayer ? 9.6 : 8.1 + Math.random() * 1.6,
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

  if (!state.tutorialShown) {
    ui.tutorialCard.classList.remove('hidden');
    state.tutorialShown = true;
  }
}

function buildGridMesh() {
  const geo = new THREE.BoxGeometry(CELL * 0.96, 0.34, CELL * 0.96);
  const mat = new THREE.MeshStandardMaterial({ color: 0x6aa6a8, roughness: 0.92, metalness: 0.02 });
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
      mesh.setColorAt(i, new THREE.Color(0x7ab2b4));
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
    const c = owner === NONE ? 0x7ab2b4 : (state.entities[owner]?.skin.color || 0x7ab2b4);
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
      new THREE.BoxGeometry(CELL * 0.56, 0.58, CELL * 0.56),
      new THREE.MeshStandardMaterial({ color: skin.trail, emissive: skin.trail, emissiveIntensity: 0.52 })
    );
    m.position.set(p.x, 0.45, p.z);
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

function finishRound() {
  const me = state.local;
  if (!me) return;
  const areaPct = (me.area / TOTAL) * 100;
  const score = scoreOf(me);
  state.profile.coins += me.coins;
  state.profile.bestArea = Math.max(state.profile.bestArea, areaPct);
  state.profile.bestScore = Math.max(state.profile.bestScore, score);
  state.profile.bestName = state.myName;
  state.profile.skinIndex = state.skinIndex;
  saveProfile();
  refreshMenuStats();
  showMenu();
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
      if (state.socket) state.socket.emit('leave_game');
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
  m.add(joystickInput());
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
  mmCtx.fillStyle = '#0f2f35';
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
    mmCtx.fillStyle = p.id === state.myId ? '#ffffff' : '#ffe386';
    mmCtx.beginPath();
    mmCtx.arc(x, y, p.id === state.myId ? 3.5 : 2.4, 0, Math.PI * 2);
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

  ui.coinValue.textContent = `${state.profile.coins + me.coins}`;
  ui.scoreValue.textContent = `${score}`;
  ui.areaValue.textContent = `${areaPct.toFixed(1)}%`;
  ui.playerName.textContent = state.myName;
  ui.livesValue.textContent = '❤'.repeat(Math.max(0, me.lives));

  const rows = [...state.leaderboard].slice(0, 6);
  ui.leaderboardList.innerHTML = '';
  rows.forEach((r) => {
    const li = document.createElement('li');
    const color = SKINS[r.skinIndex % SKINS.length]?.color || 0xffffff;
    li.innerHTML = `<span style="color:${hexColor(color)}">■</span> ${r.name}${r.id === state.myId ? ' (You)' : ''} ${r.area.toFixed(1)}%`;
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
    state.socket.emit('join_game', { name: state.myName, skinIndex: state.skinIndex });
  });

  state.socket.on('server_full', () => {
    alert('Lobby is full (30/30). Try again.');
    state.started = false;
    showMenu();
  });

  state.socket.on('snapshot', ({ players }) => {
    state.players.clear();
    players.forEach((p) => state.players.set(p.id, p));
  });

  state.socket.on('leaderboard', ({ rows }) => {
    state.leaderboard = rows;
  });
}

function setupUIHandlers() {
  ui.settingsBtn.addEventListener('click', () => {
    alert('Settings panel coming soon. Replace this with your own menu.');
  });

  ui.openSkinsBtn.addEventListener('click', showSkins);
  ui.skinsBackBtn.addEventListener('click', showMenu);

  ui.skinPrevBtn.addEventListener('click', () => {
    state.previewSkinIndex = (state.previewSkinIndex - 1 + SKINS.length) % SKINS.length;
    updateSkinPreview();
  });
  ui.skinNextBtn.addEventListener('click', () => {
    state.previewSkinIndex = (state.previewSkinIndex + 1) % SKINS.length;
    updateSkinPreview();
  });

  ui.skinSelectBtn.addEventListener('click', () => {
    if (!isSkinUnlocked(state.previewSkinIndex)) return;
    state.skinIndex = state.previewSkinIndex;
    state.profile.skinIndex = state.skinIndex;
    saveProfile();
    showMenu();
  });

  ui.closeTutorialBtn.addEventListener('click', () => ui.tutorialCard.classList.add('hidden'));

  ui.playBtn.addEventListener('click', () => {
    state.myName = sanitizeName(ui.nameInput.value);
    state.profile.bestName = state.myName;
    saveProfile();
    state.started = true;
    showGameUI();
    setupRound();

    if (!state.socket) connectSocket();
    else if (state.socket.connected) state.socket.emit('join_game', { name: state.myName, skinIndex: state.skinIndex });
  });
}

function setupControls() {
  window.addEventListener('keydown', (e) => state.keys.add(e.key.toLowerCase()));
  window.addEventListener('keyup', (e) => state.keys.delete(e.key.toLowerCase()));

  if (!isTouch) {
    ui.mobileJoystick.classList.add('hidden');
    return;
  }

  const center = { x: 63, y: 63 };
  const maxDist = 34;

  function setKnob(dx, dy) {
    const len = Math.hypot(dx, dy);
    let nx = dx;
    let ny = dy;
    if (len > maxDist) {
      nx = (dx / len) * maxDist;
      ny = (dy / len) * maxDist;
    }
    ui.joyKnob.style.left = `${36 + nx}px`;
    ui.joyKnob.style.top = `${36 + ny}px`;
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
    ui.joyKnob.style.left = '36px';
    ui.joyKnob.style.top = '36px';
  }

  ui.joyBase.addEventListener('pointerup', resetJoystick);
  ui.joyBase.addEventListener('pointercancel', resetJoystick);
}

const renderer = new THREE.WebGLRenderer({ canvas: ui.scene, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x6da5a8);
scene.fog = new THREE.Fog(0x6da5a8, 40, 150);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 16, 14);

scene.add(new THREE.HemisphereLight(0xd7ffff, 0x19444c, 1.08));
const sun = new THREE.DirectionalLight(0xfff1c3, 1.35);
sun.position.set(38, 62, 20);
scene.add(sun);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(GRID * CELL + 120, GRID * CELL + 120),
  new THREE.MeshStandardMaterial({ color: 0x367478, roughness: 1 })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const borderRing = new THREE.Mesh(
  new THREE.RingGeometry(HALF + 2, HALF + 10, 80),
  new THREE.MeshBasicMaterial({ color: 0x031013, side: THREE.DoubleSide, transparent: true, opacity: 0.78 })
);
borderRing.rotation.x = -Math.PI / 2;
borderRing.position.y = 0.03;
scene.add(borderRing);

state.gridMesh = buildGridMesh();

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
refreshMenuStats();
setCubeStyle(ui.heroCube, SKINS[state.skinIndex]);
updateSkinPreview();
showMenu();
animate();
