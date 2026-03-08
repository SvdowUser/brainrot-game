const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');

const menuScreen = document.getElementById('menuScreen');
const skinsScreen = document.getElementById('skinsScreen');
const settingsSheet = document.getElementById('settingsSheet');
const settingsBtn = document.getElementById('settingsBtn');
const settingsCloseBtn = document.getElementById('settingsCloseBtn');
const playBtn = document.getElementById('playBtn');
const openSkinsBtn = document.getElementById('openSkinsBtn');
const skinsBackBtn = document.getElementById('skinsBackBtn');
const skinPrevBtn = document.getElementById('skinPrevBtn');
const skinNextBtn = document.getElementById('skinNextBtn');
const skinSelectBtn = document.getElementById('skinSelectBtn');
const nameInput = document.getElementById('nameInput');
const menuCoins = document.getElementById('menuCoins');
const bestScore = document.getElementById('bestScore');
const skinName = document.getElementById('skinName');
const skinRequirement = document.getElementById('skinRequirement');
const heroCube = document.getElementById('heroCube');
const skinPreviewCube = document.getElementById('skinPreviewCube');

const PROFILE_KEY = 'tralala-profile-v1';
const SKINS = [
  { name: 'Sun', colorA: '#f5da5a', colorB: '#f2cf2a', req: 0 },
  { name: 'Coral', colorA: '#ff9f9f', colorB: '#ff6f8e', req: 120 },
  { name: 'Mint', colorA: '#93f6dc', colorB: '#4dd9b8', req: 260 },
];

const profile = loadProfile();
let skinIndex = profile.skinIndex || 0;
let previewIndex = skinIndex;

nameInput.value = profile.name || 'Guest';
menuCoins.textContent = String(profile.coins || 0);
bestScore.textContent = String(profile.best || 0);

applySkin(heroCube, SKINS[skinIndex]);
renderSkinCard();

settingsBtn.addEventListener('click', () => settingsSheet.classList.remove('hidden'));
settingsCloseBtn.addEventListener('click', () => settingsSheet.classList.add('hidden'));
openSkinsBtn.addEventListener('click', () => {
  menuScreen.classList.add('hidden');
  skinsScreen.classList.remove('hidden');
});
skinsBackBtn.addEventListener('click', () => {
  skinsScreen.classList.add('hidden');
  menuScreen.classList.remove('hidden');
});
skinPrevBtn.addEventListener('click', () => {
  previewIndex = (previewIndex - 1 + SKINS.length) % SKINS.length;
  renderSkinCard();
});
skinNextBtn.addEventListener('click', () => {
  previewIndex = (previewIndex + 1) % SKINS.length;
  renderSkinCard();
});
skinSelectBtn.addEventListener('click', () => {
  if ((profile.best || 0) < SKINS[previewIndex].req) return;
  skinIndex = previewIndex;
  profile.skinIndex = skinIndex;
  applySkin(heroCube, SKINS[skinIndex]);
  saveProfile(profile);
});
playBtn.addEventListener('click', () => {
  const entered = String(nameInput.value || '').trim().slice(0, 16);
  profile.name = entered || 'Guest';
  profile.coins = Number(profile.coins || 0) + 1;
  menuCoins.textContent = String(profile.coins);
  saveProfile(profile);
});

let t = 0;
function frame() {
  drawBackground(t);
  t += 0.012;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.addEventListener('resize', resize);
resize();

function drawBackground(time) {
  const w = canvas.width;
  const h = canvas.height;

  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#357f85');
  g.addColorStop(1, '#2e7478');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const horizon = h * 0.64;
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(0, horizon, w, h - horizon);

  const step = Math.max(20, Math.floor(w / 40));
  ctx.strokeStyle = 'rgba(8, 55, 62, 0.45)';
  ctx.lineWidth = 1;

  for (let x = -w; x < w * 2; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(w / 2 + (x - w / 2) * 0.14, horizon);
    ctx.stroke();
  }

  for (let i = 0; i < 18; i += 1) {
    const p = i / 18;
    const y = horizon + (p * p) * (h - horizon);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

  const shadowY = horizon - 8;
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(w * 0.5, shadowY, 330 + Math.sin(time) * 16, 14, 0, 0, Math.PI * 2);
  ctx.fill();
}

function renderSkinCard() {
  const skin = SKINS[previewIndex];
  applySkin(skinPreviewCube, skin);
  skinName.textContent = skin.name;
  if ((profile.best || 0) >= skin.req) {
    skinRequirement.textContent = 'Unlocked';
    skinSelectBtn.disabled = false;
  } else {
    skinRequirement.textContent = `Requires best score ${skin.req}`;
    skinSelectBtn.disabled = true;
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

function applySkin(el, skin) {
  el.style.background = `linear-gradient(135deg, ${skin.colorA}, ${skin.colorB})`;
}

function loadProfile() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}');
    return {
      name: parsed.name || 'Guest',
      best: Number(parsed.best || 0),
      coins: Number(parsed.coins || 0),
      skinIndex: Number(parsed.skinIndex || 0),
    };
  } catch {
    return { name: 'Guest', best: 0, coins: 0, skinIndex: 0 };
  }
}

function saveProfile(next) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
}

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = '100%';
  canvas.style.height = '100%';
}
