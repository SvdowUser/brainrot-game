import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js';

const GRID = 36;
const CELL_SIZE = 2;
const HALF = (GRID * CELL_SIZE) / 2;
const TOTAL = GRID * GRID;
const NEUTRAL = -1;

const SKINS = [
  { id: 'mint', name: 'Mint', color: 0x4df3a8, trail: 0x91ffd2 },
  { id: 'blue', name: 'Ocean', color: 0x4ea3ff, trail: 0x8ec8ff },
  { id: 'rose', name: 'Rose', color: 0xff5d8f, trail: 0xff9fba },
  { id: 'gold', name: 'Gold', color: 0xffc34f, trail: 0xffdf99 },
  { id: 'violet', name: 'Violet', color: 0xa866ff, trail: 0xc7a2ff },
];

const ui = {
  nameInput: document.getElementById('nameInput'),
  startBtn: document.getElementById('startBtn'),
  startOverlay: document.getElementById('startOverlay'),
  coinsValue: document.getElementById('coinsValue'),
  killsValue: document.getElementById('killsValue'),
  areaValue: document.getElementById('areaValue'),
  playerNameLabel: document.getElementById('playerNameLabel'),
  leaderboardList: document.getElementById('leaderboardList'),
  skinRow: document.getElementById('skinRow'),
  heroCube: document.getElementById('heroCube'),
  sceneCanvas: document.getElementById('scene'),
};

const state = {
  started: false,
  selectedSkin: 0,
  keys: new Set(),
  entities: [],
  player: null,
  owners: new Int16Array(TOTAL).fill(NEUTRAL),
  trailOwners: new Int16Array(TOTAL).fill(NEUTRAL),
  trailMeshes: new Map(),
  killFeedCooldown: 0,
};

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function idx(x, y) { return y * GRID + x; }
function inBounds(x, y) { return x >= 0 && y >= 0 && x < GRID && y < GRID; }
function cellCenter(x, y) {
  return new THREE.Vector3(-HALF + x * CELL_SIZE + CELL_SIZE / 2, 0.4, -HALF + y * CELL_SIZE + CELL_SIZE / 2);
}
function worldToCell(v) {
  const x = clamp(Math.floor((v.x + HALF) / CELL_SIZE), 0, GRID - 1);
  const y = clamp(Math.floor((v.z + HALF) / CELL_SIZE), 0, GRID - 1);
  return { x, y };
}

function createEntity(id, name, skin, isPlayer = false) {
  return {
    id,
    name,
    skin,
    isPlayer,
    alive: true,
    dir: Math.random() * Math.PI * 2,
    speed: isPlayer ? 9.4 : 8.2 + Math.random() * 1.5,
    coins: 0,
    kills: 0,
    trail: [],
    body: createAvatar(skin),
    home: { x: 0, y: 0 },
  };
}

function createAvatar(skin) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: skin.color, roughness: 0.35, metalness: 0.08 });
  const core = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), mat);
  core.position.y = 0.8;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.4, 0.24, 8), new THREE.MeshStandardMaterial({ color: 0x0a0f18 }));
  base.position.y = 0.15;
  g.add(core, base);
  scene.add(g);
  return g;
}

function clearEntityTerritory(entityId) {
  for (let i = 0; i < TOTAL; i++) {
    if (state.owners[i] === entityId) state.owners[i] = NEUTRAL;
    if (state.trailOwners[i] === entityId) state.trailOwners[i] = NEUTRAL;
  }
}

function assignSpawnTerritory(entity, cx, cy, radius = 2) {
  entity.home.x = cx;
  entity.home.y = cy;
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      if (!inBounds(x, y)) continue;
      state.owners[idx(x, y)] = entity.id;
    }
  }
  const start = cellCenter(cx, cy);
  entity.body.position.copy(start);
  entity.body.position.y = 0;
}

function setupEntities(playerName) {
  state.entities.forEach((e) => scene.remove(e.body));
  state.entities.length = 0;

  const player = createEntity(0, playerName, SKINS[state.selectedSkin], true);
  state.player = player;
  state.entities.push(player);

  const npcNames = ['Nova', 'Byte', 'Flux', 'Echo', 'Kite', 'Vex'];
  for (let i = 0; i < 6; i++) {
    const skin = SKINS[(i + 1) % SKINS.length];
    state.entities.push(createEntity(i + 1, npcNames[i], skin));
  }

  state.owners.fill(NEUTRAL);
  state.trailOwners.fill(NEUTRAL);

  const anchors = [
    [18, 18], [6, 6], [29, 7], [7, 29], [29, 29], [18, 6], [18, 29],
  ];
  state.entities.forEach((e, i) => assignSpawnTerritory(e, anchors[i][0], anchors[i][1]));
}

function createGridInstances() {
  const geo = new THREE.BoxGeometry(CELL_SIZE * 0.92, 0.45, CELL_SIZE * 0.92);
  const mat = new THREE.MeshStandardMaterial({ color: 0x1a2233, roughness: 0.78, metalness: 0.06 });
  const mesh = new THREE.InstancedMesh(geo, mat, TOTAL);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  let i = 0;
  const tmp = new THREE.Object3D();
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const p = cellCenter(x, y);
      tmp.position.set(p.x, 0, p.z);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
      mesh.setColorAt(i, new THREE.Color(0x1a2233));
      i++;
    }
  }
  scene.add(mesh);
  return mesh;
}

function createWorldFrame() {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(GRID * CELL_SIZE + 40, GRID * CELL_SIZE + 40),
    new THREE.MeshStandardMaterial({ color: 0x09111d, roughness: 1 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(HALF + 1, HALF + 5, 64),
    new THREE.MeshBasicMaterial({ color: 0x22334d, transparent: true, opacity: 0.45, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  scene.add(ring);
}

function updateInstancedColors() {
  for (let i = 0; i < TOTAL; i++) {
    const owner = state.owners[i];
    const c = owner === NEUTRAL ? 0x1a2233 : state.entities[owner]?.skin?.color ?? 0x1a2233;
    gridMesh.setColorAt(i, new THREE.Color(c));
  }
  gridMesh.instanceColor.needsUpdate = true;
}

function refreshTrailVisuals() {
  state.trailMeshes.forEach((m) => scene.remove(m));
  state.trailMeshes.clear();

  for (let i = 0; i < TOTAL; i++) {
    const owner = state.trailOwners[i];
    if (owner === NEUTRAL) continue;
    const x = i % GRID;
    const y = Math.floor(i / GRID);
    const p = cellCenter(x, y);
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(CELL_SIZE * 0.4, 0.8, CELL_SIZE * 0.4),
      new THREE.MeshStandardMaterial({ color: state.entities[owner].skin.trail, emissive: state.entities[owner].skin.trail, emissiveIntensity: 0.4 })
    );
    m.position.set(p.x, 0.8, p.z);
    state.trailMeshes.set(i, m);
    scene.add(m);
  }
}

function onCellStep(entity) {
  const c = worldToCell(entity.body.position);
  const i = idx(c.x, c.y);
  const onOwn = state.owners[i] === entity.id;

  if (!onOwn) {
    if (state.trailOwners[i] !== entity.id) {
      state.trailOwners[i] = entity.id;
      const last = entity.trail[entity.trail.length - 1];
      if (last !== i) entity.trail.push(i);
    }
  } else if (entity.trail.length > 0) {
    closeLoopAndCapture(entity);
  }

  const hitOwner = state.trailOwners[i];
  if (hitOwner !== NEUTRAL && hitOwner !== entity.id) {
    entity.kills += 1;
    entity.coins += 7;
    eliminate(state.entities[hitOwner]);
    if (entity.isPlayer) state.killFeedCooldown = 1.2;
  }
}

function closeLoopAndCapture(entity) {
  const pts = entity.trail.map((cellIdx) => {
    const x = cellIdx % GRID;
    const y = Math.floor(cellIdx / GRID);
    return { x, y };
  });
  if (pts.length < 3) {
    entity.trail.forEach((c) => { state.owners[c] = entity.id; state.trailOwners[c] = NEUTRAL; });
    entity.trail.length = 0;
    return;
  }

  let minX = GRID - 1, minY = GRID - 1, maxX = 0, maxY = 0;
  pts.forEach((p) => {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  });

  function insidePoly(px, py) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x + 0.5, yi = pts[i].y + 0.5;
      const xj = pts[j].x + 0.5, yj = pts[j].y + 0.5;
      const intersects = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / ((yj - yi) || 0.0001) + xi);
      if (intersects) inside = !inside;
    }
    return inside;
  }

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (insidePoly(x + 0.5, y + 0.5)) state.owners[idx(x, y)] = entity.id;
    }
  }
  entity.trail.forEach((i) => {
    state.owners[i] = entity.id;
    state.trailOwners[i] = NEUTRAL;
  });
  entity.trail.length = 0;
}

function eliminate(entity) {
  if (!entity?.alive) return;
  clearEntityTerritory(entity.id);
  entity.trail.length = 0;
  const rx = Math.floor(4 + Math.random() * (GRID - 8));
  const ry = Math.floor(4 + Math.random() * (GRID - 8));
  assignSpawnTerritory(entity, rx, ry, 1);
  if (entity.isPlayer) {
    entity.coins = Math.max(0, entity.coins - 10);
    entity.kills = Math.max(0, entity.kills - 1);
  }
}

function updatePlayer(dt) {
  const p = state.player;
  const move = new THREE.Vector2(0, 0);
  if (state.keys.has('w') || state.keys.has('arrowup')) move.y -= 1;
  if (state.keys.has('s') || state.keys.has('arrowdown')) move.y += 1;
  if (state.keys.has('a') || state.keys.has('arrowleft')) move.x -= 1;
  if (state.keys.has('d') || state.keys.has('arrowright')) move.x += 1;

  if (move.lengthSq() > 0) {
    move.normalize();
    p.dir = Math.atan2(move.x, move.y);
  }

  p.body.position.x += Math.sin(p.dir) * p.speed * dt;
  p.body.position.z += Math.cos(p.dir) * p.speed * dt;
  p.body.position.x = clamp(p.body.position.x, -HALF + 1, HALF - 1);
  p.body.position.z = clamp(p.body.position.z, -HALF + 1, HALF - 1);
  p.body.rotation.y = p.dir;
  onCellStep(p);
}

function updateNpc(entity, dt, time) {
  const c = worldToCell(entity.body.position);
  const i = idx(c.x, c.y);
  const inOwn = state.owners[i] === entity.id;

  if (!entity.aiTick || time > entity.aiTick) {
    entity.aiTick = time + 0.4 + Math.random() * 0.9;
    const homePos = cellCenter(entity.home.x, entity.home.y);
    const toHome = Math.atan2(homePos.x - entity.body.position.x, homePos.z - entity.body.position.z);

    if (!inOwn && entity.trail.length > 8) {
      entity.dir = toHome + (Math.random() - 0.5) * 0.25;
    } else {
      const enemyTrail = findNearestEnemyTrail(entity, 8);
      if (enemyTrail) {
        entity.dir = Math.atan2(enemyTrail.x - entity.body.position.x, enemyTrail.z - entity.body.position.z);
      } else {
        entity.dir += (Math.random() - 0.5) * 1.15;
      }
    }
  }

  entity.body.position.x += Math.sin(entity.dir) * entity.speed * dt;
  entity.body.position.z += Math.cos(entity.dir) * entity.speed * dt;

  if (Math.abs(entity.body.position.x) > HALF - 1 || Math.abs(entity.body.position.z) > HALF - 1) {
    entity.dir += Math.PI * 0.7;
  }

  entity.body.position.x = clamp(entity.body.position.x, -HALF + 1, HALF - 1);
  entity.body.position.z = clamp(entity.body.position.z, -HALF + 1, HALF - 1);
  entity.body.rotation.y = entity.dir;
  onCellStep(entity);
}

function findNearestEnemyTrail(entity, radiusCells) {
  const c = worldToCell(entity.body.position);
  let best = null;
  let bestDist = Infinity;
  for (let y = c.y - radiusCells; y <= c.y + radiusCells; y++) {
    for (let x = c.x - radiusCells; x <= c.x + radiusCells; x++) {
      if (!inBounds(x, y)) continue;
      const i = idx(x, y);
      const owner = state.trailOwners[i];
      if (owner === NEUTRAL || owner === entity.id) continue;
      const p = cellCenter(x, y);
      const d = p.distanceToSquared(entity.body.position);
      if (d < bestDist) { bestDist = d; best = p; }
    }
  }
  return best;
}

function updateHUD() {
  const p = state.player;
  ui.playerNameLabel.textContent = p.name;
  ui.coinsValue.textContent = `${p.coins}`;
  ui.killsValue.textContent = `${p.kills}`;

  let owned = 0;
  for (let i = 0; i < TOTAL; i++) if (state.owners[i] === p.id) owned++;
  ui.areaValue.textContent = `${((owned / TOTAL) * 100).toFixed(1)}%`;

  const rows = state.entities
    .map((e) => {
      let area = 0;
      for (let i = 0; i < TOTAL; i++) if (state.owners[i] === e.id) area++;
      return { name: e.name, area, kills: e.kills, player: e.isPlayer };
    })
    .sort((a, b) => b.area - a.area)
    .slice(0, 8);

  ui.leaderboardList.innerHTML = '';
  rows.forEach((r) => {
    const li = document.createElement('li');
    li.textContent = `${r.name}${r.player ? ' (Du)' : ''} · ${((r.area / TOTAL) * 100).toFixed(1)}% · ${r.kills} Kills`;
    ui.leaderboardList.appendChild(li);
  });
}

function sanitizeName(v) {
  const clean = String(v || '').replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 16);
  return clean || 'Guest';
}

function buildSkinButtons() {
  ui.skinRow.innerHTML = '';
  SKINS.forEach((s, i) => {
    const b = document.createElement('button');
    b.className = `skin-btn${i === state.selectedSkin ? ' active' : ''}`;
    b.style.background = `#${s.color.toString(16).padStart(6, '0')}`;
    b.title = s.name;
    b.type = 'button';
    b.onclick = () => {
      state.selectedSkin = i;
      ui.heroCube.style.background = `linear-gradient(140deg, #ffffff44, #${s.color.toString(16).padStart(6, '0')})`;
      buildSkinButtons();
    };
    ui.skinRow.appendChild(b);
  });
}

ui.startBtn.addEventListener('click', () => {
  state.started = true;
  ui.startOverlay.style.display = 'none';
  const name = sanitizeName(ui.nameInput.value);
  setupEntities(name);
  updateInstancedColors();
  refreshTrailVisuals();
});

window.addEventListener('keydown', (e) => state.keys.add(e.key.toLowerCase()));
window.addEventListener('keyup', (e) => state.keys.delete(e.key.toLowerCase()));

const renderer = new THREE.WebGLRenderer({ canvas: ui.sceneCanvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060b14);
scene.fog = new THREE.Fog(0x060b14, 60, 170);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 400);
camera.position.set(0, 55, 54);
camera.lookAt(0, 0, 0);

scene.add(new THREE.HemisphereLight(0xdce8ff, 0x1b2840, 1));
const dl = new THREE.DirectionalLight(0xffffff, 1.15);
dl.position.set(45, 60, 30);
scene.add(dl);

createWorldFrame();
const gridMesh = createGridInstances();
buildSkinButtons();

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

const clock = new THREE.Clock();
let colorTick = 0;
let trailTick = 0;
let hudTick = 0;

function animate() {
  const dt = Math.min(clock.getDelta(), 0.033);
  const t = clock.elapsedTime;

  if (state.started) {
    updatePlayer(dt);
    state.entities.forEach((e) => {
      if (!e.isPlayer) updateNpc(e, dt, t);
      e.body.position.y = Math.sin(t * 6 + e.id) * 0.03;
    });

    colorTick += dt;
    trailTick += dt;
    hudTick += dt;

    if (colorTick > 0.14) {
      colorTick = 0;
      updateInstancedColors();
    }
    if (trailTick > 0.18) {
      trailTick = 0;
      refreshTrailVisuals();
    }
    if (hudTick > 0.2) {
      hudTick = 0;
      updateHUD();
    }

    const p = state.player.body.position;
    const targetCam = new THREE.Vector3(p.x + 18, 28, p.z + 18);
    camera.position.lerp(targetCam, 0.06);
    camera.lookAt(p.x, 0, p.z);
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();
