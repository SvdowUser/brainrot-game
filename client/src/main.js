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
  { id: 'mint', color: 0x40f1a0, trail: 0x8fffd2 },
  { id: 'blue', color: 0x4d9cff, trail: 0x9ec9ff },
  { id: 'rose', color: 0xff5a8d, trail: 0xff9ab5 },
  { id: 'gold', color: 0xffc34b, trail: 0xffde8d },
  { id: 'violet', color: 0xa46aff, trail: 0xc6a4ff },
  { id: 'cyan', color: 0x4ce2ff, trail: 0x96f1ff },
];

const ui = {
  scene: document.getElementById('scene'),
  coinIcon: document.getElementById('coinIcon'),
  coinFallback: document.getElementById('coinFallback'),
  coinValue: document.getElementById('coinValue'),
  killsValue: document.getElementById('killsValue'),
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
};

ui.coinIcon.addEventListener('error', () => {
  ui.coinIcon.style.display = 'none';
  ui.coinFallback.style.display = 'inline';
});

const mmCtx = ui.miniMap.getContext('2d');

const state = {
  keys: new Set(),
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

function createAvatar(skin, scale = 1) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: skin.color, roughness: 0.34, metalness: 0.06 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.2 * scale, 1.2 * scale, 1.2 * scale), mat);
  body.position.y = 0.85 * scale;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34 * scale, 0.4 * scale, 0.25 * scale, 8), new THREE.MeshStandardMaterial({ color: 0x0b121e }));
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
  const mat = new THREE.MeshStandardMaterial({ color: 0x1b2438, roughness: 0.82, metalness: 0.08 });
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
      mesh.setColorAt(i, new THREE.Color(0x1b2438));
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
    const c = owner === NONE ? 0x1b2438 : (state.entities[owner]?.skin.color || 0x1b2438);
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
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(CELL * 0.42, 0.85, CELL * 0.42),
      new THREE.MeshStandardMaterial({ color: state.entities[owner].skin.trail, emissive: state.entities[owner].skin.trail, emissiveIntensity: 0.42 })
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

function killEntity(victim, killer) {
  if (!victim || !killer) return;
  if (killer.isPlayer) {
    killer.coins += 8;
    killer.kills += 1;
  }
  if (victim.isPlayer) {
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

function getInput() {
  const m = new THREE.Vector2(0, 0);
  if (state.keys.has('w') || state.keys.has('arrowup')) m.y -= 1;
  if (state.keys.has('s') || state.keys.has('arrowdown')) m.y += 1;
  if (state.keys.has('a') || state.keys.has('arrowleft')) m.x -= 1;
  if (state.keys.has('d') || state.keys.has('arrowright')) m.x += 1;
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
  mmCtx.fillStyle = '#101a2c';
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
    mmCtx.fillStyle = p.id === state.myId ? '#ffffff' : '#ffd26d';
    mmCtx.beginPath();
    mmCtx.arc(x, y, p.id === state.myId ? 4 : 3, 0, Math.PI * 2);
    mmCtx.fill();
  });

  const lp = state.local.body.position;
  mmCtx.strokeStyle = '#ffffff';
  mmCtx.lineWidth = 2;
  mmCtx.strokeRect(((lp.x + HALF) / (GRID * CELL)) * w - 8, ((lp.z + HALF) / (GRID * CELL)) * h - 8, 16, 16);
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

  ui.playerName.textContent = state.myName;
  ui.coinValue.textContent = `${me.coins}`;
  ui.killsValue.textContent = `${me.kills}`;
  ui.livesValue.textContent = `${me.lives}`;
  ui.areaValue.textContent = `${((me.area / TOTAL) * 100).toFixed(1)}%`;
  ui.lobbyValue.textContent = `${state.players.size}/${LOBBY_LIMIT}`;

  const rows = [...state.leaderboard].slice(0, 8);
  ui.leaderboardList.innerHTML = '';
  rows.forEach((r) => {
    const li = document.createElement('li');
    li.textContent = `${r.name}${r.id === state.myId ? ' (Du)' : ''} · ${r.area.toFixed(1)}% · ${r.kills} K · ${r.coins} 🪙`;
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
    alert('Lobby ist voll (30/30). Bitte gleich nochmal versuchen.');
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

function buildSkinButtons() {
  ui.skinRow.innerHTML = '';
  SKINS.forEach((s, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `skinBtn${i === state.skinIndex ? ' active' : ''}`;
    b.style.background = `#${s.color.toString(16).padStart(6, '0')}`;
    b.onclick = () => {
      state.skinIndex = i;
      ui.heroCube.style.background = `linear-gradient(140deg, #ffffff4a, #${s.color.toString(16).padStart(6, '0')})`;
      buildSkinButtons();
    };
    ui.skinRow.appendChild(b);
  });
}

ui.startBtn.addEventListener('click', () => {
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
scene.background = new THREE.Color(0x060d18);
scene.fog = new THREE.Fog(0x060d18, 85, 250);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 28, 25);

scene.add(new THREE.HemisphereLight(0xdce8ff, 0x1d2639, 1.05));
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(50, 70, 30);
scene.add(sun);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(GRID * CELL + 60, GRID * CELL + 60), new THREE.MeshStandardMaterial({ color: 0x0b1320, roughness: 1 }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const ring = new THREE.Mesh(new THREE.RingGeometry(HALF + 1.5, HALF + 6, 80), new THREE.MeshBasicMaterial({ color: 0x233652, side: THREE.DoubleSide, transparent: true, opacity: 0.45 }));
ring.rotation.x = -Math.PI / 2;
ring.position.y = 0.02;
scene.add(ring);

state.gridMesh = buildGridMesh();
buildSkinButtons();

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
    const camTarget = new THREE.Vector3(p.x + 18, 28, p.z + 18);
    camera.position.lerp(camTarget, 0.07);
    camera.lookAt(p.x, 0, p.z);

    colorTimer += dt;
    trailTimer += dt;
    hudTimer += dt;
    mapTimer += dt;

    if (colorTimer > 0.15) { colorTimer = 0; paintGrid(); }
    if (trailTimer > 0.2) { trailTimer = 0; paintTrails(); }
    if (hudTimer > 0.18) { hudTimer = 0; renderHUD(); emitStats(t); }
    if (mapTimer > 0.16) { mapTimer = 0; drawMinimap(); }
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();
