import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js';

const SERVER_URL = window.location.hostname.includes('github.io')
  ? 'https://YOUR-NODE-SERVER-URL'
  ? 'http://89.167.75.175:3000'
  : window.location.origin;

const STARTER_SKINS = [
  { id: 'blue', name: 'Beach Blue', accent: '#67c8ff', body: 0x67c8ff, hat: 0x1e88d9, unlocked: true },
  { id: 'coral', name: 'Coral Pop', accent: '#ff8ba7', body: 0xff8ba7, hat: 0xf76895, unlocked: true },
  { id: 'mint', name: 'Mint Surf', accent: '#7de5c4', body: 0x7de5c4, hat: 0x1aa086, unlocked: true },
  { id: 'shadow-1', name: 'Shadow Drift', accent: '#ffffff', body: 0x131313, hat: 0x000000, unlocked: false },
  { id: 'shadow-2', name: 'Shadow Neon', accent: '#ffffff', body: 0x101010, hat: 0x000000, unlocked: false },
  { id: 'shadow-3', name: 'Shadow Tide', accent: '#ffffff', body: 0x171717, hat: 0x000000, unlocked: false },
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
  sceneCanvas: document.getElementById('scene'),
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
  enterBtn: document.getElementById('enterBtn'),
  skinPrev: document.getElementById('skinPrev'),
  skinNext: document.getElementById('skinNext'),
  skinCardWrap: document.getElementById('skinCardWrap'),
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
  startOverlay: document.getElementById('startOverlay'),
  portraitName: document.getElementById('portraitName'),
  portraitCanvas: document.getElementById('portraitCanvas'),
  chatInput: document.getElementById('chatInput'),
  chatSend: document.getElementById('chatSend'),
  chatLog: document.getElementById('chatLog'),
  settingsBtn: document.getElementById('settingsBtn'),
  settingsPanel: document.getElementById('settingsPanel'),
  joystickBase: document.getElementById('joystickBase'),
  joystickKnob: document.getElementById('joystickKnob'),
  jumpBtn: document.getElementById('jumpBtn'),
  overlayLabels: document.getElementById('overlayLabels'),
  serverBadge: document.getElementById('serverBadge'),

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
  selectedSkinIndex: 0,
  joined: false,
  keys: new Set(),
  socket: null,
  started: false,
  myId: null,
  myName: 'Guest',
  focusedChat: false,
  skinIndex: 0,
  previewSkinIndex: 0,
  players: new Map(),
  remoteVisuals: new Map(),
  platformBoxes: [],
  currentBubbleTimers: new Map(),
  joystick: { active: false, x: 0, y: 0, id: null },
  keys: new Set(),
  dragActive: false,
  pointerX: 0,
  pointerY: 0,
  jumpQueued: false,
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

function sanitizeName(value) {
  const clean = (value || '').replace(/[^a-z0-9 _-]/gi, '').trim().slice(0, 16);
function sanitizeName(name) {
  const clean = String(name || '').replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 16);
  return clean || 'Guest';
}

function renderPortrait(canvas, skin, name = 'LT') {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const g = ctx.createRadialGradient(48, 24, 8, 48, 54, 64);
  g.addColorStop(0, '#a5ecff');
  g.addColorStop(0.45, skin.accent || '#67c8ff');
  g.addColorStop(1, '#0b2a3d');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(48, 48, 46, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#effaff';
  ctx.beginPath();
  ctx.ellipse(48, 58, 20, 18, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = skin.accent || '#67c8ff';
  ctx.beginPath();
  ctx.ellipse(48, 42, 28, 24, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#0b1721';
  ctx.beginPath();
  ctx.arc(38, 42, 3, 0, Math.PI * 2);
  ctx.arc(58, 42, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(30, 82);
  ctx.lineTo(66, 82);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 16px Inter, Arial';
  ctx.textAlign = 'center';
  ctx.fillText(name.slice(0, 2).toUpperCase(), 48, 19);
}

function currentSkin() {
  return STARTER_SKINS[state.selectedSkinIndex];
}

function renderSkinCard() {
  const skin = currentSkin();
  ui.skinCardWrap.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'skin-card';

  const preview = document.createElement('div');
  preview.className = 'skin-preview';
  const c = document.createElement('canvas');
  c.width = 112;
  c.height = 112;
  renderPortrait(c, skin, skin.name.slice(0, 2));
  preview.appendChild(c);

  const meta = document.createElement('div');
  meta.className = 'skin-meta';
  const name = document.createElement('div');
  name.className = 'skin-name';
  name.textContent = skin.name;
  const desc = document.createElement('div');
  desc.className = 'skin-desc';
  desc.textContent = skin.unlocked ? 'Starter skin ready now.' : 'Coming soon';
  meta.append(name, desc);

  if (!skin.unlocked) {
    const lock = document.createElement('div');
    lock.className = 'skin-lock';
    lock.textContent = '🔒 Coming soon';
    card.appendChild(lock);
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

  card.append(preview, meta);
  ui.skinCardWrap.appendChild(card);
  ui.skinStatus.textContent = skin.unlocked
    ? `Starter skin ${state.selectedSkinIndex + 1} / 3`
    : 'Locked skin · Coming soon';
function saveProfile() {
  localStorage.setItem(profileKey, JSON.stringify(state.profile));
}

  renderPortrait(ui.portraitCanvas, skin, skin.name.slice(0, 2));
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

ui.skinPrev.addEventListener('click', () => {
  state.selectedSkinIndex = (state.selectedSkinIndex - 1 + STARTER_SKINS.length) % STARTER_SKINS.length;
  renderSkinCard();
});
ui.skinNext.addEventListener('click', () => {
  state.selectedSkinIndex = (state.selectedSkinIndex + 1) % STARTER_SKINS.length;
  renderSkinCard();
});
renderSkinCard();
function scoreOf(entity) {
  return entity.kills * 30 + entity.coins + Math.floor((entity.area / TOTAL) * 100 * 3);
}

ui.settingsBtn.addEventListener('click', () => ui.settingsPanel.classList.toggle('hidden'));
function hexColor(v) { return `#${v.toString(16).padStart(6, '0')}`; }

const renderer = new THREE.WebGLRenderer({ canvas: ui.sceneCanvas, antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
function setCubeStyle(el, skin) {
  el.style.background = `linear-gradient(145deg, #fff0a6, ${hexColor(skin.color)})`;
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x80d8ff);
scene.fog = new THREE.Fog(0x80d8ff, 80, 180);
function refreshMenuStats() {
  ui.menuCoinValue.textContent = String(state.profile.coins);
  ui.bestScoreValue.textContent = String(Math.floor(state.profile.bestScore));
}

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 450);
const clock = new THREE.Clock();
function showMenu() {
  ui.menuScreen.classList.remove('hidden');
  ui.skinsScreen.classList.add('hidden');
  ui.gameHud.classList.add('hidden');
  ui.tutorialCard.classList.add('hidden');
  setCubeStyle(ui.heroCube, SKINS[state.skinIndex]);
  refreshMenuStats();
}

scene.add(new THREE.HemisphereLight(0xf0faff, 0xd7a35f, 1.8));
const sun = new THREE.DirectionalLight(0xfff2cf, 2.4);
sun.position.set(45, 70, 25);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -70;
sun.shadow.camera.right = 70;
sun.shadow.camera.top = 70;
sun.shadow.camera.bottom = -70;
scene.add(sun);
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

const world = new THREE.Group();
scene.add(world);

const sharkMaterials = new Map();
function getSkinMaterials(skinId) {
  if (sharkMaterials.has(skinId)) return sharkMaterials.get(skinId);
  const skin = STARTER_SKINS.find(s => s.id === skinId) || STARTER_SKINS[0];
  const mats = {
    body: new THREE.MeshStandardMaterial({ color: skin.body, roughness: 0.58 }),
    belly: new THREE.MeshStandardMaterial({ color: 0xecfaff, roughness: 0.84 }),
    hat: new THREE.MeshStandardMaterial({ color: skin.hat, roughness: 0.72 }),
    shoe: new THREE.MeshStandardMaterial({ color: 0x2d88ff, roughness: 0.45 }),
    sole: new THREE.MeshStandardMaterial({ color: 0xf6fbff, roughness: 0.85 }),
    eye: new THREE.MeshStandardMaterial({ color: 0x07131d, roughness: 1 }),
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
  sharkMaterials.set(skinId, mats);
  return mats;
}

function makeLabel(className, text) {
  const el = document.createElement('div');
  el.className = className;
  el.textContent = text;
  ui.overlayLabels.appendChild(el);
  return el;
}

function createAvatar(name, skinId, isLocal = false) {
  const mats = getSkinMaterials(skinId);
  const root = new THREE.Group();
  root.userData.skinId = skinId;

  const body = new THREE.Mesh(new THREE.SphereGeometry(1.25, 20, 20), mats.body);
  body.scale.set(1, 1.05, 1.35);
  body.castShadow = true;
  body.position.y = 2.2;
  root.add(body);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 16), mats.belly);
  belly.scale.set(0.84, 0.9, 1.05);
  belly.position.set(0, 1.92, 0.72);
  root.add(belly);

  const head = new THREE.Mesh(new THREE.SphereGeometry(1.0, 18, 18), mats.body);
  head.position.set(0, 3.28, 0.45);
  head.scale.set(1.02, 0.92, 1.12);
  head.castShadow = true;
  root.add(head);

  const snout = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.42, 4, 10), mats.belly);
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, 3.16, 1.34);
  root.add(snout);

  const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.36, 1.1, 10), mats.hat);
  dorsal.position.set(0, 4.05, 0.08);
  dorsal.rotation.z = Math.PI;
  root.add(dorsal);

  const finGeo = new THREE.ConeGeometry(0.28, 0.8, 10);
  const finL = new THREE.Mesh(finGeo, mats.hat);
  finL.position.set(-0.86, 2.3, 0.32);
  finL.rotation.z = -Math.PI / 2;
  finL.rotation.x = -0.24;
  root.add(finL);
  const finR = finL.clone();
  finR.position.x = 0.86;
  finR.rotation.z = Math.PI / 2;
  root.add(finR);

  const eyeGeo = new THREE.SphereGeometry(0.11, 10, 10);
  const eyeL = new THREE.Mesh(eyeGeo, mats.eye);
  eyeL.position.set(-0.26, 3.38, 1.25);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.26;
  root.add(eyeL, eyeR);

  function shoe(x) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.3, 1.1), mats.shoe);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.08, 1.16), mats.sole);
    sole.position.y = -0.18;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 10), mats.shoe);
    tip.scale.set(1.4, 0.74, 1.22);
    tip.position.set(0, -0.04, 0.48);
    g.add(base, sole, tip);
    g.position.set(x, 0.28, 0.26);
    return g;
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

  const shoeL = shoe(-0.45);
  const shoeR = shoe(0.45);
  root.add(shoeL, shoeR);
function setupRound() {
  state.entities.forEach((e) => scene.remove(e.body));
  state.entities.length = 0;
  state.owners.fill(NONE);
  state.trailOwners.fill(NONE);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.6, 20),
    new THREE.MeshStandardMaterial({ color: 0x09131d, transparent: true, opacity: 0.18 })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  root.add(shadow);

  root.userData.shoeL = shoeL;
  root.userData.shoeR = shoeR;
  root.userData.baseY = 0;
  root.userData.verticalVelocity = 0;
  root.userData.isGrounded = true;
  root.userData.nameEl = makeLabel('nameplate', name);
  root.userData.bubbleEl = makeLabel('bubble', '');
  root.userData.bubbleEl.style.display = 'none';
  root.userData.isLocal = isLocal;

  world.add(root);
  return root;
}

function updateAvatarSkin(group, skinId) {
  world.remove(group);
  group.userData.nameEl?.remove();
  group.userData.bubbleEl?.remove();
  return createAvatar(group.userData.name || 'Guest', skinId, group.userData.isLocal);
}

const sandMat = new THREE.MeshStandardMaterial({ color: 0xedcc8c, roughness: 0.96 });
const pathMat = new THREE.MeshStandardMaterial({ color: 0xf5dfb6, roughness: 0.92 });
const woodMat = new THREE.MeshStandardMaterial({ color: 0x7a5330, roughness: 0.9 });
const waterMat = new THREE.MeshStandardMaterial({ color: 0x49c7ff, roughness: 0.18, metalness: 0.05, transparent: true, opacity: 0.94 });

function addStaticBox(w, h, d, x, y, z, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  world.add(m);
  const box = new THREE.Box3().setFromObject(m);
  state.platformBoxes.push(box);
  return m;
}

function addSign(text, x, y, z) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(10, 21, 32, 0.78)';
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 4;
  roundRect(ctx, 20, 20, 472, 88, 24);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 36px Inter';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 64);
  const tex = new THREE.CanvasTexture(c);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sprite.scale.set(6.6, 1.65, 1);
  sprite.position.set(x, y, z);
  world.add(sprite);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function createWorld() {
  const island = new THREE.Mesh(new THREE.CylinderGeometry(86, 95, 3.2, 80), sandMat);
  island.position.y = -0.9;
  island.receiveShadow = true;
  world.add(island);

  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 0.18, 36), pathMat);
  plaza.position.set(0, 0.1, 10);
  plaza.receiveShadow = true;
  world.add(plaza);

  const boardwalk = new THREE.Mesh(new THREE.BoxGeometry(10, 0.32, 34), woodMat);
  boardwalk.position.set(-28, 0.16, 8);
  boardwalk.receiveShadow = true;
  boardwalk.castShadow = true;
  world.add(boardwalk);

  const galleryPath = new THREE.Mesh(new THREE.BoxGeometry(8, 0.18, 28), pathMat);
  galleryPath.position.set(28, 0.08, 8);
  world.add(galleryPath);

  const water = new THREE.Mesh(new THREE.PlaneGeometry(280, 280, 80, 80), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -1.45;
  water.receiveShadow = true;
  world.add(water);
  water.userData.base = new Float32Array(water.geometry.attributes.position.array);
  water.userData.wave = true;

  addSign('Beach Plaza', 0, 4.6, 10);
  addSign('Meme Gallery', 28, 4.6, 8);
  addSign('Parkour', -10, 4.6, -22);
  addSign('Social Boardwalk', -28, 4.6, 8);

  for (let i = -2; i <= 2; i++) {
    const p = addStaticBox(4.4, 0.5, 4.4, -8 + i * 5, 1.2 + Math.abs(i % 2) * 1.5, -22 - i * 2.5, new THREE.MeshStandardMaterial({ color: 0xfff2d7, roughness: 0.9 }));
    p.userData.parkour = true;
  const me = makeEntity({ id: 0, name: state.myName, skinIndex: state.skinIndex, isPlayer: true });
  state.local = me;
  state.entities.push(me);

  const npcNames = ['Nova', 'Echo', 'Flux', 'Astra', 'Vex', 'Blitz', 'Kiro', 'Zen'];
  for (let i = 0; i < 8; i++) {
    state.entities.push(makeEntity({ id: i + 1, name: npcNames[i], skinIndex: i + 1, npc: true }));
  }

  for (let i = 0; i < 5; i++) {
    const frame = addStaticBox(4.4, 3.1, 0.24, 22 + (i % 2) * 7, 2, -6 + i * 6, new THREE.MeshStandardMaterial({ color: 0x122130, roughness: 0.85 }));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(3.7, 2.4), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xff8cb5 : 0x80d4ff }));
    face.position.z = 0.14;
    frame.add(face);
  const anchors = [[35, 35], [10, 10], [60, 10], [10, 60], [60, 60], [20, 35], [50, 35], [35, 18], [35, 55]];
  state.entities.forEach((e, i) => spawnArea(e, anchors[i][0], anchors[i][1], e.isPlayer ? 3 : 2));
  state.dirtyColors = true;
  state.dirtyTrails = true;

  if (!state.tutorialShown) {
    ui.tutorialCard.classList.remove('hidden');
    state.tutorialShown = true;
  }
}

  for (let i = 0; i < 5; i++) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 6, 10), new THREE.MeshStandardMaterial({ color: 0x8f6039, roughness: 1 }));
    trunk.position.set(-60 + i * 24, 2.7, -8 + (i % 2) * 18);
    world.add(trunk);
    for (let j = 0; j < 5; j++) {
      const leaf = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 3.9, 4, 10), new THREE.MeshStandardMaterial({ color: 0x32bf7d, roughness: 0.8 }));
      leaf.position.copy(trunk.position).add(new THREE.Vector3(Math.cos(j * 1.2) * 0.32, 3.1, Math.sin(j * 1.2) * 0.32));
      leaf.rotation.z = Math.PI / 2;
      leaf.rotation.y = j * 1.2;
      leaf.rotation.x = -0.55;
      world.add(leaf);
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

  const lockedMat = new THREE.MeshStandardMaterial({ color: 0x7dd5ff, emissive: 0x1b6db0, emissiveIntensity: 0.45 });
  [-58, 0, 58].forEach((x, idx) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.8, 0.22, 18, 42), lockedMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, 0.22, 58 - idx * 10);
    ring.userData.spin = true;
    world.add(ring);
    addSign('Coming Soon', x, 4.4, 58 - idx * 10);
  });
  scene.add(mesh);
  return mesh;
}
createWorld();

function addChatMessage(text) {
  const div = document.createElement('div');
  div.className = 'msg';
  div.textContent = text;
  ui.chatLog.appendChild(div);
  ui.chatLog.scrollTop = ui.chatLog.scrollHeight;
}

function bubbleForPlayer(playerId, text) {
  const visual = playerId === state.myId ? state.localVisual : state.remoteVisuals.get(playerId);
  if (!visual) return;
  const bubble = visual.userData.bubbleEl;
  bubble.textContent = text;
  bubble.style.display = 'block';
  clearTimeout(state.currentBubbleTimers.get(playerId));
  const t = setTimeout(() => { bubble.style.display = 'none'; }, 4500);
  state.currentBubbleTimers.set(playerId, t);
}

function projectLabel(el, worldPos) {
  const p = worldPos.clone().project(camera);
  const visible = p.z < 1;
  el.style.display = visible ? (el.dataset.forceHidden === '1' ? 'none' : '') : 'none';
  if (!visible) return;
  const x = (p.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-p.y * 0.5 + 0.5) * window.innerHeight;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}

function updateProjectedLabels() {
  const all = [];
  if (state.localVisual) all.push(state.localVisual);
  state.remoteVisuals.forEach(v => all.push(v));
  for (const v of all) {
    const nameEl = v.userData.nameEl;
    const bubbleEl = v.userData.bubbleEl;
    const head = v.position.clone().add(new THREE.Vector3(0, 5.7, 0));
    projectLabel(nameEl, head);
    projectLabel(bubbleEl, head.clone().add(new THREE.Vector3(0, 0.95, 0)));

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

function createSocket() {
  const socket = io(SERVER_URL, { transports: ['websocket', 'polling'] });
  state.socket = socket;
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

  socket.on('connect', () => {
    state.myId = socket.id;
    socket.emit('join_hub', {
      roomId: 'beach-01',
      name: state.myName,
      skinId: currentSkin().id,
    });
  });
function closeLoop(entity) {
  if (entity.trail.length < 2) {
    entity.trail.forEach((i) => { state.owners[i] = entity.id; state.trailOwners[i] = NONE; });
    entity.trail.length = 0;
    state.dirtyColors = true;
    state.dirtyTrails = true;
    return;
  }

  socket.on('server_full', () => {
    addChatMessage('Server is full.');
  const points = entity.trail.map((cellIdx) => ({ x: cellIdx % GRID + 0.5, y: Math.floor(cellIdx / GRID) + 0.5 }));
  let minX = GRID - 1; let minY = GRID - 1; let maxX = 0; let maxY = 0;
  points.forEach((p) => {
    minX = Math.min(minX, Math.floor(p.x));
    minY = Math.min(minY, Math.floor(p.y));
    maxX = Math.max(maxX, Math.floor(p.x));
    maxY = Math.max(maxY, Math.floor(p.y));
  });

  socket.on('room_info', (info) => {
    ui.serverBadge.textContent = `${info.roomId} · ${info.count}/20`;
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

  socket.on('snapshot', (payload) => {
    const ids = new Set(payload.players.map(p => p.id));

    for (const player of payload.players) {
      if (player.id === state.myId) {
        if (!state.localVisual) {
          state.localVisual = createAvatar(player.name, player.skinId, true);
          state.localVisual.position.set(player.x, player.y, player.z);
          state.localVisual.userData.name = player.name;
        }
        continue;
      }
      let visual = state.remoteVisuals.get(player.id);
      if (!visual) {
        visual = createAvatar(player.name, player.skinId);
        visual.userData.name = player.name;
        state.remoteVisuals.set(player.id, visual);
      }
      if (visual.userData.skinId !== player.skinId) {
        const replaced = updateAvatarSkin(visual, player.skinId);
        replaced.userData.name = player.name;
        state.remoteVisuals.set(player.id, replaced);
        visual = replaced;
      }
      visual.userData.target = player;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (inside(x + 0.5, y + 0.5)) state.owners[idx(x, y)] = entity.id;
    }
  }

    Array.from(state.remoteVisuals.keys()).forEach((id) => {
      if (!ids.has(id)) {
        const visual = state.remoteVisuals.get(id);
        visual.userData.nameEl.remove();
        visual.userData.bubbleEl.remove();
        world.remove(visual);
        state.remoteVisuals.delete(id);
      }
    });
  });
  entity.trail.forEach((i) => { state.owners[i] = entity.id; state.trailOwners[i] = NONE; });
  entity.trail.length = 0;
  state.dirtyColors = true;
  state.dirtyTrails = true;
}

  socket.on('chat_message', ({ fromId, name, text }) => {
    addChatMessage(`${name}: ${text}`);
    bubbleForPlayer(fromId, text);
  });
function respawn(entity) {
  clearTrailsAndTerritory(entity.id);
  entity.trail.length = 0;
  const rx = Math.floor(6 + Math.random() * (GRID - 12));
  const ry = Math.floor(6 + Math.random() * (GRID - 12));
  spawnArea(entity, rx, ry, entity.isPlayer ? 2 : 1);
  state.dirtyColors = true;
  state.dirtyTrails = true;
}

ui.enterBtn.addEventListener('click', () => {
  const skin = currentSkin();
  if (!skin.unlocked) return;
  state.myName = sanitizeName(ui.nameInput.value);
  ui.portraitName.textContent = state.myName;
  renderPortrait(ui.portraitCanvas, skin, state.myName.slice(0, 2));
  ui.startOverlay.classList.add('hidden');
  state.joined = true;
  createSocket();
  ui.chatInput.blur();
});
ui.nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') ui.enterBtn.click();
});
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

ui.chatSend.addEventListener('click', sendChat);
ui.chatInput.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') sendChat();
});
ui.chatInput.addEventListener('focus', () => state.focusedChat = true);
ui.chatInput.addEventListener('blur', () => state.focusedChat = false);
function sendChat() {
  if (!state.socket || !state.joined) return;
  const text = ui.chatInput.value.trim().slice(0, 120);
  if (!text) return;
  state.socket.emit('chat_message', { text });
  ui.chatInput.value = '';
}

window.addEventListener('keydown', (e) => {
  if (state.focusedChat || !state.joined) return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  const k = e.key.toLowerCase();
  if (['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright',' '].includes(k)) e.preventDefault();
  state.keys.add(k);
  if (k === ' ') state.jumpQueued = true;
  if (k === 'enter') {
    ui.chatInput.focus();
    e.preventDefault();
function killEntity(victim, killer) {
  if (!victim || !killer) return;
  if (killer.isPlayer) {
    killer.coins += 8;
    killer.kills += 1;
  }
});
window.addEventListener('keyup', (e) => state.keys.delete(e.key.toLowerCase()));

window.addEventListener('pointerdown', (e) => {
  if (!state.joined) return;
  if (e.target.closest('#chatPanel') || e.target.closest('#mobileControls') || e.target.closest('.panel') || e.target.closest('.portrait-card') || e.target.closest('.top-actions')) return;
  state.dragActive = true;
  state.pointerX = e.clientX;
  state.pointerY = e.clientY;
});
window.addEventListener('pointerup', () => state.dragActive = false);
window.addEventListener('pointermove', (e) => {
  if (!state.dragActive || !state.localVisual) return;
  const dx = e.clientX - state.pointerX;
  const dy = e.clientY - state.pointerY;
  state.pointerX = e.clientX;
  state.pointerY = e.clientY;
  state.cameraYaw -= dx * 0.0032;
  state.cameraPitch = THREE.MathUtils.clamp((state.cameraPitch ?? 0.26) - dy * 0.0024, 0.12, 0.7);
});
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

ui.jumpBtn.addEventListener('click', () => state.jumpQueued = true);
ui.joystickBase.addEventListener('pointerdown', (e) => {
  state.joystick.active = true;
  state.joystick.id = e.pointerId;
  ui.joystickBase.setPointerCapture(e.pointerId);
});
ui.joystickBase.addEventListener('pointermove', (e) => {
  if (!state.joystick.active || e.pointerId !== state.joystick.id) return;
  const rect = ui.joystickBase.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let dx = e.clientX - cx;
  let dy = e.clientY - cy;
  const max = rect.width * 0.28;
  const len = Math.hypot(dx, dy) || 1;
  if (len > max) { dx = dx / len * max; dy = dy / len * max; }
  state.joystick.x = dx / max;
  state.joystick.y = dy / max;
  ui.joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
});
function resetStick() {
  state.joystick.active = false;
  state.joystick.x = 0;
  state.joystick.y = 0;
  ui.joystickKnob.style.transform = 'translate(-50%, -50%)';
}
ui.joystickBase.addEventListener('pointerup', resetStick);
ui.joystickBase.addEventListener('pointercancel', resetStick);

state.cameraYaw = 0;
state.cameraPitch = 0.28;

function getMoveInput() {
  let x = 0;
  let z = 0;
  if (state.keys.has('w') || state.keys.has('arrowup')) z -= 1;
  if (state.keys.has('s') || state.keys.has('arrowdown')) z += 1;
  if (state.keys.has('a') || state.keys.has('arrowleft')) x -= 1;
  if (state.keys.has('d') || state.keys.has('arrowright')) x += 1;
  x += state.joystick.x;
  z += state.joystick.y;
  const v = new THREE.Vector3(x, 0, z);
  if (v.lengthSq() > 1) v.normalize();
  return v;
}

const PLAY_RADIUS = 80;
function boundPlayer(p) {
  const len = Math.hypot(p.x, p.z);
  if (len > PLAY_RADIUS) {
    p.x = p.x / len * PLAY_RADIUS;
    p.z = p.z / len * PLAY_RADIUS;
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

function updateLocalPlayer(delta, time) {
  const player = state.localVisual;
  if (!player) return;

  const moveInput = getMoveInput();
  const speed = 8.3;
  const forward = new THREE.Vector3(Math.sin(state.cameraYaw), 0, Math.cos(state.cameraYaw));
  const right = new THREE.Vector3(forward.z, 0, -forward.x);
  const move = forward.clone().multiplyScalar(-moveInput.z).add(right.multiplyScalar(moveInput.x));

  if (move.lengthSq() > 0) {
    move.normalize().multiplyScalar(speed * delta);
    player.position.add(move);
    const yaw = Math.atan2(move.x, move.z);
    player.rotation.y = THREE.MathUtils.lerp(player.rotation.y, yaw, 0.18);
    const swing = Math.sin(time * 12) * 0.24;
    player.userData.shoeL.rotation.x = swing;
    player.userData.shoeR.rotation.x = -swing;
  } else {
    player.userData.shoeL.rotation.x *= 0.82;
    player.userData.shoeR.rotation.x *= 0.82;
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

  if (state.jumpQueued && player.userData.isGrounded) {
    player.userData.verticalVelocity = 7.5;
    player.userData.isGrounded = false;
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
  state.jumpQueued = false;

  player.userData.verticalVelocity -= 16 * delta;
  player.position.y += player.userData.verticalVelocity * delta;
  if (player.position.y <= 0) {
    player.position.y = 0;
    player.userData.verticalVelocity = 0;
    player.userData.isGrounded = true;

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

  boundPlayer(player.position);
function updateArea() {
  state.entities.forEach((e) => (e.area = 0));
  for (let i = 0; i < TOTAL; i++) {
    const owner = state.owners[i];
    if (owner !== NONE && state.entities[owner]) state.entities[owner].area += 1;
  }
}

  const lookAt = player.position.clone().add(new THREE.Vector3(0, 4.2, 0));
  const desiredCam = new THREE.Vector3(
    player.position.x + Math.sin(state.cameraYaw) * Math.cos(state.cameraPitch) * 18,
    player.position.y + 9.8 + Math.sin(state.cameraPitch) * 5.2,
    player.position.z + Math.cos(state.cameraYaw) * Math.cos(state.cameraPitch) * 18,
  );
  camera.position.lerp(desiredCam, 0.08);
  camera.lookAt(lookAt);

  ui.portraitName.textContent = state.myName;

  if (state.socket && state.socket.connected) {
    if (!state.lastSent || time - state.lastSent > 0.05) {
      state.socket.emit('move', {
        x: player.position.x,
        y: player.position.y,
        z: player.position.z,
        rot: player.rotation.y,
        jumping: !player.userData.isGrounded,
        t: time,
      });
      state.lastSent = time;
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

function updateRemotePlayers(delta, time) {
  state.remoteVisuals.forEach((visual) => {
    const target = visual.userData.target;
    if (!target) return;
    visual.position.lerp(new THREE.Vector3(target.x, target.y, target.z), 0.22);
    visual.rotation.y = THREE.MathUtils.lerp(visual.rotation.y, target.rot || 0, 0.2);
    const speed = Math.hypot((target.vx || 0), (target.vz || 0));
    const swing = Math.sin(time * 12 + target.x) * 0.2 * (speed > 0.01 ? 1 : 0);
    visual.userData.shoeL.rotation.x = swing;
    visual.userData.shoeR.rotation.x = -swing;
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

function updateWater(time) {
  world.traverse(obj => {
    if (obj.userData.wave) {
      const attr = obj.geometry.attributes.position;
      const base = obj.userData.base;
      const arr = attr.array;
      for (let i = 0; i < arr.length; i += 3) {
        const bx = base[i];
        const bz = base[i + 2];
        arr[i + 1] = Math.sin((bx + time * 10) * 0.035) * 0.5 + Math.cos((bz - time * 11) * 0.03) * 0.28;
      }
      attr.needsUpdate = true;
      obj.geometry.computeVertexNormals();
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
    if (obj.userData.spin) obj.rotation.z = time * 0.7;
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
  const delta = Math.min(clock.getDelta(), 0.033);
  const time = clock.elapsedTime;
  updateWater(time);
  updateLocalPlayer(delta, time);
  updateRemotePlayers(delta, time);
  updateProjectedLabels();
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
