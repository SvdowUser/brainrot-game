import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js';

const SERVER_URL = window.location.hostname.includes('github.io')
  ? 'http://89.167.75.175:3000'
  : window.location.origin;

const STARTER_SKINS = [
  { id: 'blue', name: 'Beach Blue', accent: '#67c8ff', body: 0x67c8ff, hat: 0x1e88d9, unlocked: true },
  { id: 'coral', name: 'Coral Pop', accent: '#ff8ba7', body: 0xff8ba7, hat: 0xf76895, unlocked: true },
  { id: 'mint', name: 'Mint Surf', accent: '#7de5c4', body: 0x7de5c4, hat: 0x1aa086, unlocked: true },
  { id: 'shadow-1', name: 'Shadow Drift', accent: '#ffffff', body: 0x131313, hat: 0x000000, unlocked: false },
  { id: 'shadow-2', name: 'Shadow Neon', accent: '#ffffff', body: 0x101010, hat: 0x000000, unlocked: false },
  { id: 'shadow-3', name: 'Shadow Tide', accent: '#ffffff', body: 0x171717, hat: 0x000000, unlocked: false },
];

const PLAY_RADIUS = 80;
const PROFILE_KEY = 'tralala_profile_v3';
const isTouch = window.matchMedia('(pointer: coarse)').matches;

const $ = (id) => document.getElementById(id);

const ui = {
  scene: $('scene'),
  startOverlay: $('startOverlay'),
  menuScreen: $('menuScreen'),
  skinsScreen: $('skinsScreen'),
  gameHud: $('gameHud'),
  tutorialCard: $('tutorialCard'),
  closeTutorialBtn: $('closeTutorialBtn'),

  settingsBtn: $('settingsBtn'),
  settingsPanel: $('settingsPanel'),

  nameInput: $('nameInput'),
  enterBtn: $('enterBtn'),
  playBtn: $('playBtn'),
  openSkinsBtn: $('openSkinsBtn'),

  skinPrev: $('skinPrev'),
  skinNext: $('skinNext'),
  skinCardWrap: $('skinCardWrap'),

  skinsBackBtn: $('skinsBackBtn'),
  skinPrevBtn: $('skinPrevBtn'),
  skinNextBtn: $('skinNextBtn'),
  skinSelectBtn: $('skinSelectBtn'),
  skinPreviewCube: $('skinPreviewCube'),
  skinName: $('skinName'),
  skinStatus: $('skinStatus'),

  heroCube: $('heroCube'),
  portraitCanvas: $('portraitCanvas'),
  portraitName: $('portraitName'),

  menuCoinValue: $('menuCoinValue'),
  bestScoreValue: $('bestScoreValue'),
  coinValue: $('coinValue'),
  scoreValue: $('scoreValue'),
  areaValue: $('areaValue'),
  playerName: $('playerName'),
  livesValue: $('livesValue'),
  leaderboardList: $('leaderboardList'),
  miniMap: $('miniMap'),
  serverBadge: $('serverBadge'),

  chatInput: $('chatInput'),
  chatSend: $('chatSend'),
  chatLog: $('chatLog'),

  joystickBase: $('joystickBase'),
  joystickKnob: $('joystickKnob'),
  jumpBtn: $('jumpBtn'),
  overlayLabels: $('overlayLabels'),
};

const state = {
  selectedSkinIndex: 0,
  previewSkinIndex: 0,
  joined: false,
  started: false,
  focusedChat: false,
  myId: null,
  myName: 'Guest',
  socket: null,
  keys: new Set(),
  currentBubbleTimers: new Map(),
  remoteVisuals: new Map(),
  localVisual: null,
  platformBoxes: [],
  joystick: { active: false, x: 0, y: 0, id: null },
  dragActive: false,
  pointerX: 0,
  pointerY: 0,
  jumpQueued: false,
  cameraYaw: 0,
  cameraPitch: 0.26,
  cameraDistance: 16,
  cameraHeight: 8.5,
  profile: {
    coins: 0,
    bestScore: 0,
    bestName: 'Guest',
    selectedSkinIndex: 0,
  },
  waterMeshes: [],
};

const mmCtx = ui.miniMap ? ui.miniMap.getContext('2d') : null;

/* -------------------- helpers -------------------- */

function sanitizeName(name) {
  const clean = String(name || '')
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .trim()
    .slice(0, 16);
  return clean || 'Guest';
}

function currentSkin() {
  return STARTER_SKINS[state.selectedSkinIndex] || STARTER_SKINS[0];
}

function previewSkin() {
  return STARTER_SKINS[state.previewSkinIndex] || STARTER_SKINS[0];
}

function loadProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    state.profile.coins = Math.max(0, Number(parsed.coins) || 0);
    state.profile.bestScore = Math.max(0, Number(parsed.bestScore) || 0);
    state.profile.bestName = sanitizeName(parsed.bestName || 'Guest');
    state.profile.selectedSkinIndex = Math.max(0, Math.min(STARTER_SKINS.length - 1, Number(parsed.selectedSkinIndex) || 0));
    state.selectedSkinIndex = state.profile.selectedSkinIndex;
    state.previewSkinIndex = state.selectedSkinIndex;
  } catch {}
}

function saveProfile() {
  state.profile.selectedSkinIndex = state.selectedSkinIndex;
  localStorage.setItem(PROFILE_KEY, JSON.stringify(state.profile));
}

function setText(el, value) {
  if (el) el.textContent = String(value);
}

function setHidden(el, hidden) {
  if (!el) return;
  el.classList.toggle('hidden', hidden);
}

function setCubeStyle(el, skin) {
  if (!el || !skin) return;
  el.style.background = `linear-gradient(145deg, #fff0a6, ${skin.accent})`;
}

function renderPortrait(canvas, skin, name = 'LT') {
  if (!canvas) return;
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

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function refreshMenuStats() {
  setText(ui.menuCoinValue, state.profile.coins);
  setText(ui.bestScoreValue, state.profile.bestScore);
  setText(ui.portraitName, state.myName);
  renderPortrait(ui.portraitCanvas, currentSkin(), state.myName.slice(0, 2));
  setCubeStyle(ui.heroCube, currentSkin());
}

function showOverlay() {
  setHidden(ui.startOverlay, false);
  setHidden(ui.menuScreen, true);
  setHidden(ui.skinsScreen, true);
  setHidden(ui.gameHud, true);
}

function showMenu() {
  setHidden(ui.startOverlay, true);
  setHidden(ui.menuScreen, false);
  setHidden(ui.skinsScreen, true);
  setHidden(ui.gameHud, true);
  setHidden(ui.tutorialCard, true);
  refreshMenuStats();
}

function showSkins() {
  setHidden(ui.startOverlay, true);
  setHidden(ui.menuScreen, true);
  setHidden(ui.skinsScreen, false);
  setHidden(ui.gameHud, true);
  updateSkinPreview();
}

function showGame() {
  setHidden(ui.startOverlay, true);
  setHidden(ui.menuScreen, true);
  setHidden(ui.skinsScreen, true);
  setHidden(ui.gameHud, false);
  if (ui.tutorialCard) setHidden(ui.tutorialCard, false);
}

function updateSkinPreview() {
  const skin = previewSkin();
  if (!skin) return;
  setCubeStyle(ui.skinPreviewCube, skin);
  setText(ui.skinName, skin.name);
  setText(ui.skinStatus, skin.unlocked ? 'Unlocked' : 'Locked · Coming soon');
  if (ui.skinSelectBtn) {
    ui.skinSelectBtn.disabled = !skin.unlocked;
    ui.skinSelectBtn.style.opacity = skin.unlocked ? '1' : '.5';
  }
}

function renderSkinCard() {
  if (!ui.skinCardWrap) return;

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
  card.append(preview, meta);

  if (!skin.unlocked) {
    const lock = document.createElement('div');
    lock.className = 'skin-lock';
    lock.textContent = '🔒 Coming soon';
    card.appendChild(lock);
  }

  ui.skinCardWrap.appendChild(card);
  renderPortrait(ui.portraitCanvas, skin, state.myName.slice(0, 2));
}

/* -------------------- three scene -------------------- */

const renderer = new THREE.WebGLRenderer({
  canvas: ui.scene,
  antialias: true,
  alpha: false,
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x80d8ff);
scene.fog = new THREE.Fog(0x80d8ff, 80, 180);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 450);
const clock = new THREE.Clock();

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

const world = new THREE.Group();
scene.add(world);

const sandMat = new THREE.MeshStandardMaterial({ color: 0xedcc8c, roughness: 0.96 });
const pathMat = new THREE.MeshStandardMaterial({ color: 0xf5dfb6, roughness: 0.92 });
const woodMat = new THREE.MeshStandardMaterial({ color: 0x7a5330, roughness: 0.9 });
const waterMat = new THREE.MeshStandardMaterial({
  color: 0x49c7ff,
  roughness: 0.18,
  metalness: 0.05,
  transparent: true,
  opacity: 0.94,
});

function addStaticBox(w, h, d, x, y, z, mat) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  world.add(mesh);

  state.platformBoxes.push({
    minX: x - w / 2,
    maxX: x + w / 2,
    minZ: z - d / 2,
    maxZ: z + d / 2,
    topY: y + h / 2,
  });

  return mesh;
}

function addSign(text, x, y, z) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d');

  ctx.fillStyle = 'rgba(10, 21, 32, 0.78)';
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 4;
  roundRect(ctx, 20, 20, 472, 88, 24);
  ctx.fill();
  ctx.stroke();

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
  water.userData.base = new Float32Array(water.geometry.attributes.position.array);
  state.waterMeshes.push(water);
  world.add(water);

  addSign('Beach Plaza', 0, 4.6, 10);
  addSign('Meme Gallery', 28, 4.6, 8);
  addSign('Parkour', -10, 4.6, -22);
  addSign('Social Boardwalk', -28, 4.6, 8);

  for (let i = -2; i <= 2; i++) {
    const box = addStaticBox(
      4.4,
      0.5,
      4.4,
      -8 + i * 5,
      1.2 + Math.abs(i % 2) * 1.5,
      -22 - i * 2.5,
      new THREE.MeshStandardMaterial({ color: 0xfff2d7, roughness: 0.9 })
    );
    box.userData.parkour = true;
  }

  for (let i = 0; i < 5; i++) {
    const frame = addStaticBox(
      4.4,
      3.1,
      0.24,
      22 + (i % 2) * 7,
      2,
      -6 + i * 6,
      new THREE.MeshStandardMaterial({ color: 0x122130, roughness: 0.85 })
    );
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(3.7, 2.4),
      new THREE.MeshStandardMaterial({ color: i % 2 ? 0xff8cb5 : 0x80d4ff })
    );
    face.position.z = 0.14;
    frame.add(face);
  }

  for (let i = 0; i < 5; i++) {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.34, 6, 10),
      new THREE.MeshStandardMaterial({ color: 0x8f6039, roughness: 1 })
    );
    trunk.position.set(-60 + i * 24, 2.7, -8 + (i % 2) * 18);
    world.add(trunk);

    for (let j = 0; j < 5; j++) {
      const leaf = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.16, 3.9, 4, 10),
        new THREE.MeshStandardMaterial({ color: 0x32bf7d, roughness: 0.8 })
      );
      leaf.position.copy(trunk.position).add(new THREE.Vector3(Math.cos(j * 1.2) * 0.32, 3.1, Math.sin(j * 1.2) * 0.32));
      leaf.rotation.z = Math.PI / 2;
      leaf.rotation.y = j * 1.2;
      leaf.rotation.x = -0.55;
      world.add(leaf);
    }
  }

  const lockedMat = new THREE.MeshStandardMaterial({
    color: 0x7dd5ff,
    emissive: 0x1b6db0,
    emissiveIntensity: 0.45,
  });

  [-58, 0, 58].forEach((x, index) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.8, 0.22, 18, 42), lockedMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.22, 58 - index * 10);
    ring.userData.spin = true;
    world.add(ring);
    addSign('Coming Soon', x, 4.4, 58 - index * 10);
  });
}

createWorld();

/* -------------------- avatar -------------------- */

const sharkMaterials = new Map();

function getSkinMaterials(skinId) {
  if (sharkMaterials.has(skinId)) return sharkMaterials.get(skinId);

  const skin = STARTER_SKINS.find((s) => s.id === skinId) || STARTER_SKINS[0];
  const mats = {
    body: new THREE.MeshStandardMaterial({ color: skin.body, roughness: 0.58 }),
    belly: new THREE.MeshStandardMaterial({ color: 0xecfaff, roughness: 0.84 }),
    hat: new THREE.MeshStandardMaterial({ color: skin.hat, roughness: 0.72 }),
    shoe: new THREE.MeshStandardMaterial({ color: 0x2d88ff, roughness: 0.45 }),
    sole: new THREE.MeshStandardMaterial({ color: 0xf6fbff, roughness: 0.85 }),
    eye: new THREE.MeshStandardMaterial({ color: 0x07131d, roughness: 1 }),
  };

  sharkMaterials.set(skinId, mats);
  return mats;
}

function makeLabel(className, text) {
  const el = document.createElement('div');
  el.className = className;
  el.textContent = text;
  if (ui.overlayLabels) ui.overlayLabels.appendChild(el);
  return el;
}

function createAvatar(name, skinId, isLocal = false) {
  const mats = getSkinMaterials(skinId);
  const root = new THREE.Group();
  root.userData.skinId = skinId;
  root.userData.name = name;
  root.userData.isLocal = isLocal;
  root.userData.baseY = 0;
  root.userData.verticalVelocity = 0;
  root.userData.isGrounded = true;

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

  function makeShoe(x) {
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

  const shoeL = makeShoe(-0.45);
  const shoeR = makeShoe(0.45);
  root.add(shoeL, shoeR);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.6, 20),
    new THREE.MeshStandardMaterial({ color: 0x09131d, transparent: true, opacity: 0.18 })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  root.add(shadow);

  root.userData.shoeL = shoeL;
  root.userData.shoeR = shoeR;
  root.userData.nameEl = makeLabel('nameplate', name);
  root.userData.bubbleEl = makeLabel('bubble', '');
  root.userData.bubbleEl.style.display = 'none';

  world.add(root);
  return root;
}

function removeAvatar(avatar) {
  if (!avatar) return;
  avatar.userData.nameEl?.remove();
  avatar.userData.bubbleEl?.remove();
  world.remove(avatar);
}

function updateAvatarSkin(group, skinId) {
  if (!group) return null;
  const pos = group.position.clone();
  const rotY = group.rotation.y;
  const name = group.userData.name || 'Guest';
  const isLocal = !!group.userData.isLocal;
  removeAvatar(group);
  const next = createAvatar(name, skinId, isLocal);
  next.position.copy(pos);
  next.rotation.y = rotY;
  return next;
}

/* -------------------- movement / labels -------------------- */

function addChatMessage(text) {
  if (!ui.chatLog) return;
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
  const t = setTimeout(() => {
    bubble.style.display = 'none';
  }, 4500);
  state.currentBubbleTimers.set(playerId, t);
}

function projectLabel(el, worldPos) {
  if (!el) return;
  const p = worldPos.clone().project(camera);
  const visible = p.z < 1;
  el.style.display = visible ? '' : 'none';
  if (!visible) return;
  const x = (p.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-p.y * 0.5 + 0.5) * window.innerHeight;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}

function updateProjectedLabels() {
  const all = [];
  if (state.localVisual) all.push(state.localVisual);
  state.remoteVisuals.forEach((v) => all.push(v));

  for (const v of all) {
    const head = v.position.clone().add(new THREE.Vector3(0, 5.7, 0));
    projectLabel(v.userData.nameEl, head);
    projectLabel(v.userData.bubbleEl, head.clone().add(new THREE.Vector3(0, 0.95, 0)));
  }
}

function sendChat() {
  if (!state.joined) return;
  const text = ui.chatInput?.value.trim().slice(0, 120);
  if (!text) return;

  if (state.socket && state.socket.connected) {
    state.socket.emit('chat_message', { text });
  } else {
    addChatMessage(`${state.myName}: ${text}`);
    bubbleForPlayer(state.myId || 'local', text);
  }

  if (ui.chatInput) ui.chatInput.value = '';
}

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

function getGroundHeightAt(x, z) {
  let top = 0;
  for (const box of state.platformBoxes) {
    if (x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ) {
      top = Math.max(top, box.topY);
    }
  }
  return top;
}

function boundPlayer(pos) {
  const len = Math.hypot(pos.x, pos.z);
  if (len > PLAY_RADIUS) {
    pos.x = (pos.x / len) * PLAY_RADIUS;
    pos.z = (pos.z / len) * PLAY_RADIUS;
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
    boundPlayer(player.position);

    const yaw = Math.atan2(move.x, move.z);
    player.rotation.y = THREE.MathUtils.lerp(player.rotation.y, yaw, 0.18);

    const swing = Math.sin(time * 12) * 0.24;
    player.userData.shoeL.rotation.x = swing;
    player.userData.shoeR.rotation.x = -swing;
  } else {
    player.userData.shoeL.rotation.x *= 0.82;
    player.userData.shoeR.rotation.x *= 0.82;
  }

  if (state.jumpQueued && player.userData.isGrounded) {
    player.userData.verticalVelocity = 7.6;
    player.userData.isGrounded = false;
    state.jumpQueued = false;
  }

  player.userData.verticalVelocity -= 18 * delta;
  player.userData.baseY += player.userData.verticalVelocity * delta;

  const ground = getGroundHeightAt(player.position.x, player.position.z);
  if (player.userData.baseY <= ground) {
    player.userData.baseY = ground;
    player.userData.verticalVelocity = 0;
    player.userData.isGrounded = true;
  }

  player.position.y = player.userData.baseY + Math.sin(time * 6) * 0.03;

  if (state.socket && state.socket.connected) {
    state.socket.emit('move', {
      x: player.position.x,
      y: player.userData.baseY,
      z: player.position.z,
      rot: player.rotation.y,
      skinId: currentSkin().id,
      roomId: 'beach-01',
    });
  }
}

function updateRemoteVisuals(delta) {
  state.remoteVisuals.forEach((visual) => {
    const t = visual.userData.target;
    if (!t) return;
    visual.position.lerp(new THREE.Vector3(t.x, t.y || 0, t.z), Math.min(1, delta * 10));
    visual.rotation.y = THREE.MathUtils.lerp(visual.rotation.y, t.rot || 0, Math.min(1, delta * 10));
  });
}

function updateMinimap() {
  if (!mmCtx || !ui.miniMap || !state.localVisual) return;

  const w = ui.miniMap.width;
  const h = ui.miniMap.height;

  mmCtx.clearRect(0, 0, w, h);
  mmCtx.fillStyle = '#0d2732';
  mmCtx.fillRect(0, 0, w, h);

  mmCtx.strokeStyle = 'rgba(255,255,255,0.15)';
  mmCtx.lineWidth = 2;
  mmCtx.beginPath();
  mmCtx.arc(w / 2, h / 2, w * 0.42, 0, Math.PI * 2);
  mmCtx.stroke();

  const drawDot = (x, z, color, r) => {
    const px = w / 2 + (x / PLAY_RADIUS) * (w * 0.42);
    const py = h / 2 + (z / PLAY_RADIUS) * (h * 0.42);
    mmCtx.fillStyle = color;
    mmCtx.beginPath();
    mmCtx.arc(px, py, r, 0, Math.PI * 2);
    mmCtx.fill();
  };

  drawDot(state.localVisual.position.x, state.localVisual.position.z, '#ffffff', 4);

  state.remoteVisuals.forEach((v) => {
    drawDot(v.position.x, v.position.z, '#ffe180', 3);
  });
}

function updateHud() {
  const score = Math.floor(state.profile.coins);
  setText(ui.coinValue, state.profile.coins);
  setText(ui.scoreValue, score);
  setText(ui.areaValue, 'Hub');
  setText(ui.playerName, state.myName);
  setText(ui.livesValue, 'Ready');
}

/* -------------------- socket -------------------- */

function connectSocket() {
  if (!window.io) {
    setText(ui.serverBadge, 'Offline demo');
    return;
  }

  const socket = window.io(SERVER_URL, { transports: ['websocket', 'polling'] });
  state.socket = socket;

  socket.on('connect', () => {
    state.myId = socket.id;
    setText(ui.serverBadge, 'beach-01 · connected');

    socket.emit('join_hub', {
      roomId: 'beach-01',
      name: state.myName,
      skinId: currentSkin().id,
      x: state.localVisual?.position.x || 0,
      y: state.localVisual?.userData.baseY || 0,
      z: state.localVisual?.position.z || 0,
      rot: state.localVisual?.rotation.y || 0,
    });
  });

  socket.on('disconnect', () => {
    setText(ui.serverBadge, 'Disconnected');
  });

  socket.on('server_full', () => {
    addChatMessage('Server is full.');
  });

  socket.on('room_info', (info) => {
    if (!info) return;
    setText(ui.serverBadge, `${info.roomId || 'beach-01'} · ${info.count || 0}/20`);
  });

  socket.on('snapshot', (payload) => {
    if (!payload?.players) return;

    const ids = new Set(payload.players.map((p) => p.id));

    for (const player of payload.players) {
      if (player.id === state.myId) {
        if (state.localVisual) {
          state.localVisual.userData.target = player;
        }
        continue;
      }

      let visual = state.remoteVisuals.get(player.id);
      if (!visual) {
        visual = createAvatar(player.name, player.skinId);
        visual.position.set(player.x || 0, player.y || 0, player.z || 0);
        visual.userData.target = player;
        state.remoteVisuals.set(player.id, visual);
      } else {
        if (visual.userData.skinId !== player.skinId) {
          const replacement = updateAvatarSkin(visual, player.skinId);
          replacement.userData.target = player;
          state.remoteVisuals.set(player.id, replacement);
          visual = replacement;
        }
        visual.userData.name = player.name;
        visual.userData.nameEl.textContent = player.name;
        visual.userData.target = player;
      }
    }

    Array.from(state.remoteVisuals.keys()).forEach((id) => {
      if (!ids.has(id)) {
        const visual = state.remoteVisuals.get(id);
        removeAvatar(visual);
        state.remoteVisuals.delete(id);
      }
    });

    if (ui.leaderboardList) {
      ui.leaderboardList.innerHTML = '';
      payload.players
        .slice()
        .sort((a, b) => (b.coins || 0) - (a.coins || 0))
        .slice(0, 8)
        .forEach((p) => {
          const li = document.createElement('li');
          li.textContent = `${p.name}${p.id === state.myId ? ' (You)' : ''}`;
          ui.leaderboardList.appendChild(li);
        });
    }
  });

  socket.on('chat_message', ({ fromId, name, text }) => {
    addChatMessage(`${name}: ${text}`);
    bubbleForPlayer(fromId, text);
  });
}

/* -------------------- start / ui actions -------------------- */

function joinGameFromOverlay() {
  const skin = currentSkin();
  if (!skin.unlocked) return;

  state.myName = sanitizeName(ui.nameInput?.value || state.profile.bestName || 'Guest');
  state.profile.bestName = state.myName;
  saveProfile();
  refreshMenuStats();

  if (!state.localVisual) {
    state.localVisual = createAvatar(state.myName, skin.id, true);
    state.localVisual.position.set(0, 0, 10);
  } else if (state.localVisual.userData.skinId !== skin.id) {
    state.localVisual = updateAvatarSkin(state.localVisual, skin.id);
    state.localVisual.userData.name = state.myName;
    state.localVisual.userData.nameEl.textContent = state.myName;
  }

  state.joined = true;
  state.started = true;
  showGame();
  updateHud();
  connectSocket();
}

function applySelectedPreviewSkin() {
  if (!previewSkin().unlocked) return;
  state.selectedSkinIndex = state.previewSkinIndex;
  saveProfile();
  renderSkinCard();
  refreshMenuStats();

  if (state.localVisual) {
    state.localVisual = updateAvatarSkin(state.localVisual, currentSkin().id);
    state.localVisual.userData.name = state.myName;
    state.localVisual.userData.nameEl.textContent = state.myName;
  }

  showMenu();
}

function setupUiEvents() {
  ui.enterBtn?.addEventListener('click', joinGameFromOverlay);
  ui.playBtn?.addEventListener('click', joinGameFromOverlay);

  ui.nameInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      joinGameFromOverlay();
    }
  });

  ui.skinPrev?.addEventListener('click', () => {
    state.selectedSkinIndex = (state.selectedSkinIndex - 1 + STARTER_SKINS.length) % STARTER_SKINS.length;
    renderSkinCard();
    refreshMenuStats();
  });

  ui.skinNext?.addEventListener('click', () => {
    state.selectedSkinIndex = (state.selectedSkinIndex + 1) % STARTER_SKINS.length;
    renderSkinCard();
    refreshMenuStats();
  });

  ui.openSkinsBtn?.addEventListener('click', showSkins);
  ui.skinsBackBtn?.addEventListener('click', showMenu);

  ui.skinPrevBtn?.addEventListener('click', () => {
    state.previewSkinIndex = (state.previewSkinIndex - 1 + STARTER_SKINS.length) % STARTER_SKINS.length;
    updateSkinPreview();
  });

  ui.skinNextBtn?.addEventListener('click', () => {
    state.previewSkinIndex = (state.previewSkinIndex + 1) % STARTER_SKINS.length;
    updateSkinPreview();
  });

  ui.skinSelectBtn?.addEventListener('click', applySelectedPreviewSkin);

  ui.settingsBtn?.addEventListener('click', () => {
    ui.settingsPanel?.classList.toggle('hidden');
  });

  ui.closeTutorialBtn?.addEventListener('click', () => {
    setHidden(ui.tutorialCard, true);
  });

  ui.chatSend?.addEventListener('click', sendChat);

  ui.chatInput?.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      sendChat();
    }
  });

  ui.chatInput?.addEventListener('focus', () => {
    state.focusedChat = true;
  });

  ui.chatInput?.addEventListener('blur', () => {
    state.focusedChat = false;
  });

  ui.jumpBtn?.addEventListener('click', () => {
    state.jumpQueued = true;
  });
}

function setupInputEvents() {
  window.addEventListener('keydown', (e) => {
    if (state.focusedChat) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

    const k = e.key.toLowerCase();

    if (['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright', ' '].includes(k)) {
      e.preventDefault();
    }

    state.keys.add(k);

    if (k === ' ') state.jumpQueued = true;

    if (k === 'enter' && ui.chatInput) {
      ui.chatInput.focus();
      e.preventDefault();
    }
  });

  window.addEventListener('keyup', (e) => {
    state.keys.delete(e.key.toLowerCase());
  });

  window.addEventListener('pointerdown', (e) => {
    if (!state.joined) return;
    if (
      e.target.closest('#chatPanel') ||
      e.target.closest('#mobileControls') ||
      e.target.closest('.panel') ||
      e.target.closest('.portrait-card') ||
      e.target.closest('.top-actions')
    ) return;

    state.dragActive = true;
    state.pointerX = e.clientX;
    state.pointerY = e.clientY;
  });

  window.addEventListener('pointerup', () => {
    state.dragActive = false;
  });

  window.addEventListener('pointermove', (e) => {
    if (!state.dragActive || !state.localVisual) return;
    const dx = e.clientX - state.pointerX;
    const dy = e.clientY - state.pointerY;
    state.pointerX = e.clientX;
    state.pointerY = e.clientY;
    state.cameraYaw -= dx * 0.0032;
    state.cameraPitch = THREE.MathUtils.clamp(state.cameraPitch - dy * 0.0024, 0.12, 0.7);
  });

  if (ui.joystickBase && ui.joystickKnob) {
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

      if (len > max) {
        dx = (dx / len) * max;
        dy = (dy / len) * max;
      }

      state.joystick.x = dx / max;
      state.joystick.y = dy / max;
      ui.joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    });

    const resetStick = () => {
      state.joystick.active = false;
      state.joystick.x = 0;
      state.joystick.y = 0;
      ui.joystickKnob.style.transform = 'translate(-50%, -50%)';
    };

    ui.joystickBase.addEventListener('pointerup', resetStick);
    ui.joystickBase.addEventListener('pointercancel', resetStick);
  }
}

/* -------------------- animation -------------------- */

function animateWater(time) {
  for (const water of state.waterMeshes) {
    const pos = water.geometry.attributes.position;
    const arr = pos.array;
    const base = water.userData.base;

    for (let i = 0; i < arr.length; i += 3) {
      const bx = base[i];
      const bz = base[i + 2];
      arr[i + 1] =
        base[i + 1] +
        Math.sin((bx + time * 14) * 0.04) * 0.24 +
        Math.cos((bz - time * 16) * 0.035) * 0.18;
    }

    pos.needsUpdate = true;
    water.geometry.computeVertexNormals();
  }
}

function animateWorld(time) {
  world.children.forEach((child) => {
    if (child.userData.spin) {
      child.rotation.z = time * 0.8;
    }
  });
}

function animate() {
  const delta = Math.min(clock.getDelta(), 0.033);
  const time = clock.elapsedTime;

  animateWater(time);
  animateWorld(time);

  if (state.started && state.localVisual) {
    updateLocalPlayer(delta, time);
    updateRemoteVisuals(delta);

    const p = state.localVisual.position.clone();
    const desiredCam = new THREE.Vector3(
      p.x + Math.sin(state.cameraYaw) * Math.cos(state.cameraPitch) * state.cameraDistance,
      p.y + state.cameraHeight + Math.sin(state.cameraPitch) * 5.4,
      p.z + Math.cos(state.cameraYaw) * Math.cos(state.cameraPitch) * state.cameraDistance
    );

    camera.position.lerp(desiredCam, 0.09);
    camera.lookAt(p.x, p.y + 3.0, p.z);

    updateProjectedLabels();
    updateHud();
    updateMinimap();
  } else {
    camera.position.lerp(new THREE.Vector3(0, 16, 26), 0.08);
    camera.lookAt(0, 0, 0);
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

/* -------------------- init -------------------- */

loadProfile();
state.myName = state.profile.bestName || 'Guest';

if (ui.nameInput) ui.nameInput.value = state.myName;

renderSkinCard();
updateSkinPreview();
refreshMenuStats();
setupUiEvents();
setupInputEvents();

if (isTouch && ui.joystickBase) {
  ui.joystickBase.style.display = '';
} else if (ui.joystickBase) {
  ui.joystickBase.style.display = 'none';
}

showOverlay();
animate();
