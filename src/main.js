import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js";

const USERNAME_KEY = "lt3d_username";

function sanitizeUsername(value) {
  return (value || "")
    .replace(/[^a-z0-9 _-]/gi, "")
    .trim()
    .slice(0, 16);
}

function $(id) {
  return document.getElementById(id);
}

const modal = $("usernameModal");
const nameForm = $("nameForm");
const nameInput = $("nameInput");
const playerNameEl = $("playerName");
const enterButton =
  nameForm?.querySelector('button[type="submit"], button:not([type])') ||
  $("enterHubBtn");

function hideModal() {
  if (!modal) return;
  modal.classList.add("hidden");
  modal.style.display = "none";
  modal.setAttribute("aria-hidden", "true");
}

function showModal() {
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.style.display = "";
  modal.removeAttribute("aria-hidden");
}

const existingCanvas = $("scene");
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true
});

renderer.domElement.id = "scene";
renderer.domElement.setAttribute("aria-label", "3D scene");
Object.assign(renderer.domElement.style, {
  position: "fixed",
  inset: "0",
  width: "100%",
  height: "100%",
  display: "block",
  zIndex: "0"
});

if (existingCanvas && existingCanvas.parentNode) {
  existingCanvas.replaceWith(renderer.domElement);
} else {
  document.body.prepend(renderer.domElement);
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xa8e3ff, 0.0048);
scene.background = new THREE.Color(0x87d6ff);

const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(0, 16, 20);

const clock = new THREE.Clock();

const ambient = new THREE.HemisphereLight(0xe9fbff, 0xf3bd7b, 1.45);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xfff4d6, 2.2);
sun.position.set(40, 70, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 0.1;
sun.shadow.camera.far = 220;
sun.shadow.camera.left = -80;
sun.shadow.camera.right = 80;
sun.shadow.camera.top = 80;
sun.shadow.camera.bottom = -80;
scene.add(sun);

const world = new THREE.Group();
scene.add(world);

const animatedObjects = [];
const roamingNPCs = [];

const shadowMaterial = new THREE.MeshStandardMaterial({ color: 0x0f1823, transparent: true, opacity: 0.12 });
const sandMaterial = new THREE.MeshStandardMaterial({ color: 0xe6c178, roughness: 0.96, metalness: 0 });
const woodMaterial = new THREE.MeshStandardMaterial({ color: 0x7e5635, roughness: 0.95 });
const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x2dbf7d, roughness: 0.8 });
const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x8c9db1, roughness: 1 });
const foamMaterial = new THREE.MeshStandardMaterial({ color: 0xf0ffff, transparent: true, opacity: 0.8 });

function roundedRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function createRoundedRectTexture(text, fill = "#071119", accent = "#64c1ff") {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 160;
  const ctx = c.getContext("2d");

  roundedRectPath(ctx, 10, 10, c.width - 20, c.height - 20, 30);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 4;
  ctx.stroke();

  const gradient = ctx.createLinearGradient(0, 0, c.width, c.height);
  gradient.addColorStop(0, "rgba(255,255,255,0.22)");
  gradient.addColorStop(1, "rgba(255,255,255,0.02)");
  ctx.fillStyle = gradient;
  roundedRectPath(ctx, 10, 10, c.width - 20, c.height - 20, 30);
  ctx.fill();

  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(48, c.height / 2, 16, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 44px Inter, Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, c.width / 2 + 14, c.height / 2);

  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createTextBillboard(text, options = {}) {
  const texture = createRoundedRectTexture(text, options.fill, options.accent);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(options.width || 10, options.height || 3.15, 1);
  return sprite;
}

function createNameTag(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");

  roundedRectPath(ctx, 20, 18, 472, 92, 28);
  ctx.fillStyle = "rgba(6, 16, 26, 0.74)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 44px Inter, Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 65);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true })
  );
  sprite.scale.set(6, 1.5, 1);
  return sprite;
}

function addShadow(x, z, scale = 1) {
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(2.8 * scale, 24), shadowMaterial);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0.05, z);
  world.add(mesh);
  return mesh;
}

function createPalm(x, z, scale = 1) {
  const group = new THREE.Group();

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24 * scale, 0.38 * scale, 6 * scale, 10),
    new THREE.MeshStandardMaterial({ color: 0x9c6d41, roughness: 1 })
  );
  trunk.position.y = 3 * scale;
  trunk.rotation.z = 0.14;
  trunk.castShadow = true;
  group.add(trunk);

  for (let i = 0; i < 5; i++) {
    const leaf = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.16 * scale, 4.6 * scale, 4, 12),
      leafMaterial
    );
    leaf.position.set(
      Math.cos((i / 5) * Math.PI * 2) * 0.5,
      6 * scale,
      Math.sin((i / 5) * Math.PI * 2) * 0.5
    );
    leaf.rotation.z = Math.PI / 2;
    leaf.rotation.y = (i / 5) * Math.PI * 2;
    leaf.rotation.x = -0.55;
    leaf.castShadow = true;
    group.add(leaf);
  }

  group.position.set(x, 0, z);
  addShadow(x, z, 0.85 * scale);
  world.add(group);
}

function createRock(x, z, scale = 1) {
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.2 * scale, 0), rockMaterial);
  rock.position.set(x, 0.9 * scale, z);
  rock.rotation.set(Math.random() * 0.6, Math.random() * Math.PI, Math.random() * 0.4);
  rock.castShadow = true;
  rock.receiveShadow = true;
  addShadow(x, z, 0.45 * scale);
  world.add(rock);
}

function createUmbrella(x, z, hue = 0xff6fa1) {
  const group = new THREE.Group();

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 3.2, 10),
    new THREE.MeshStandardMaterial({ color: 0xf4f6f7 })
  );
  pole.position.y = 1.6;
  pole.castShadow = true;
  group.add(pole);

  const cap = new THREE.Mesh(
    new THREE.ConeGeometry(2.2, 1.2, 18),
    new THREE.MeshStandardMaterial({ color: hue, roughness: 0.8 })
  );
  cap.position.y = 3.6;
  group.add(cap);

  const towel = new THREE.Mesh(
    new THREE.BoxGeometry(2.8, 0.08, 1.6),
    new THREE.MeshStandardMaterial({ color: 0xf5ece0 })
  );
  towel.position.set(1.8, 0.04, 0.4);
  group.add(towel);

  group.position.set(x, 0, z);
  addShadow(x, z, 0.7);
  world.add(group);
}

function createBench(x, z, rotY = 0) {
  const group = new THREE.Group();

  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.18, 0.75), woodMaterial);
  seat.position.y = 0.85;
  seat.castShadow = true;

  const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 0.16), woodMaterial);
  back.position.set(0, 1.35, -0.32);
  back.castShadow = true;

  group.add(seat, back);

  const legGeo = new THREE.BoxGeometry(0.16, 0.85, 0.16);
  [[-0.95, 0.42], [0.95, 0.42], [-0.95, -0.2], [0.95, -0.2]].forEach(([lx, lz]) => {
    const leg = new THREE.Mesh(legGeo, new THREE.MeshStandardMaterial({ color: 0x53606b }));
    leg.position.set(lx, 0.42, lz);
    leg.castShadow = true;
    group.add(leg);
  });

  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  addShadow(x, z, 0.5);
  world.add(group);
}

function createFirePit(x, z) {
  const group = new THREE.Group();

  for (let i = 0; i < 10; i++) {
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.38, 0), rockMaterial);
    const angle = (i / 10) * Math.PI * 2;
    stone.position.set(Math.cos(angle) * 1.3, 0.35, Math.sin(angle) * 1.3);
    group.add(stone);
  }

  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.55, 1.6, 10),
    new THREE.MeshStandardMaterial({
      color: 0xff9640,
      emissive: 0xff7128,
      emissiveIntensity: 1.8,
      transparent: true,
      opacity: 0.95
    })
  );
  flame.position.y = 1.05;
  group.add(flame);

  group.position.set(x, 0, z);
  addShadow(x, z, 0.55);
  world.add(group);

  group.userData.animate = (t) => {
    flame.scale.y = 0.92 + Math.sin(t * 11) * 0.08;
    flame.material.emissiveIntensity = 1.6 + Math.sin(t * 9) * 0.25;
  };

  animatedObjects.push(group);
}

function createPier(x, z, length = 14) {
  const group = new THREE.Group();

  const deck = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.45, length), woodMaterial);
  deck.position.y = 0.32;
  deck.castShadow = true;
  deck.receiveShadow = true;
  group.add(deck);

  const postGeo = new THREE.BoxGeometry(0.24, 2.6, 0.24);
  for (let i = 0; i < 6; i++) {
    const postL = new THREE.Mesh(postGeo, new THREE.MeshStandardMaterial({ color: 0x6d4e33 }));
    const postR = new THREE.Mesh(postGeo, new THREE.MeshStandardMaterial({ color: 0x6d4e33 }));
    const zPos = -length / 2 + 1.5 + i * 2.3;
    postL.position.set(-1.9, -0.8, zPos);
    postR.position.set(1.9, -0.8, zPos);
    group.add(postL, postR);
  }

  group.position.set(x, 0, z);
  world.add(group);
}

function createFloatingBuoy(x, z, color = 0xff7952) {
  const group = new THREE.Group();

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.75, 0.22, 12, 22),
    new THREE.MeshStandardMaterial({ color, roughness: 0.7 })
  );
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  group.position.set(x, 0.2, z);
  world.add(group);

  group.userData.animate = (t) => {
    group.position.y = 0.28 + Math.sin(t * 1.8 + x) * 0.08;
    group.rotation.z = Math.sin(t * 0.9 + z) * 0.1;
  };

  animatedObjects.push(group);
}

function createComingSoonMarker(x, z, label = "COMING SOON") {
  const group = new THREE.Group();

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(3.7, 0.25, 18, 42),
    new THREE.MeshStandardMaterial({
      color: 0x54c2ff,
      emissive: 0x1560c5,
      emissiveIntensity: 0.45
    })
  );
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(3.2, 32),
    new THREE.MeshStandardMaterial({ color: 0x0c2030, transparent: true, opacity: 0.55 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.02;
  group.add(floor);

  const text = createTextBillboard(label, {
    fill: "#07131d",
    accent: "#59b9ff",
    width: 9.5,
    height: 2.8
  });
  text.position.set(0, 4.4, 0);
  group.add(text);

  group.position.set(x, 0.05, z);
  world.add(group);

  group.userData.animate = (t) => {
    ring.rotation.z = t * 0.7;
    text.position.y = 4.35 + Math.sin(t * 2.2 + x) * 0.18;
  };

  animatedObjects.push(group);
}

function createZoneLabel(text, x, y, z) {
  const label = createTextBillboard(text, {
    fill: "#0c1622",
    accent: "#7ce0ff",
    width: 8.2,
    height: 2.5
  });
  label.position.set(x, y, z);
  world.add(label);
}

function createWater() {
  const geometry = new THREE.PlaneGeometry(560, 560, 110, 110);
  geometry.rotateX(-Math.PI / 2);

  const position = geometry.attributes.position;
  const base = new Float32Array(position.array);

  const material = new THREE.MeshStandardMaterial({
    color: 0x4ec9ff,
    transparent: true,
    opacity: 0.95,
    roughness: 0.18,
    metalness: 0.05
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = -1.2;
  mesh.receiveShadow = true;
  world.add(mesh);

  const foam = new THREE.Mesh(new THREE.RingGeometry(110, 125, 96), foamMaterial);
  foam.rotation.x = -Math.PI / 2;
  foam.position.y = -1.08;
  world.add(foam);

  return { mesh, position, base };
}

function createBeachBase() {
  const island = new THREE.Mesh(new THREE.CylinderGeometry(110, 120, 2.4, 90), sandMaterial);
  island.position.y = -0.1;
  island.receiveShadow = true;
  world.add(island);

  const pathMat = new THREE.MeshStandardMaterial({ color: 0xf2d498, roughness: 0.95 });

  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(18, 18, 0.18, 40), pathMat);
  plaza.position.set(0, 0.08, 18);
  plaza.receiveShadow = true;
  world.add(plaza);

  const socialDeck = new THREE.Mesh(
    new THREE.BoxGeometry(28, 0.24, 16),
    new THREE.MeshStandardMaterial({ color: 0xf0cb8b, roughness: 0.95 })
  );
  socialDeck.position.set(-30, 0.12, 10);
  socialDeck.receiveShadow = true;
  world.add(socialDeck);

  const npcDeck = new THREE.Mesh(
    new THREE.BoxGeometry(18, 0.24, 18),
    new THREE.MeshStandardMaterial({ color: 0xf0cb8b, roughness: 0.95 })
  );
  npcDeck.position.set(38, 0.12, -10);
  npcDeck.receiveShadow = true;
  world.add(npcDeck);

  const path1 = new THREE.Mesh(new THREE.BoxGeometry(60, 0.12, 6), pathMat);
  path1.position.set(0, 0.09, 2);
  path1.receiveShadow = true;
  world.add(path1);

  const path2 = new THREE.Mesh(new THREE.BoxGeometry(6, 0.12, 44), pathMat);
  path2.position.set(28, 0.09, -14);
  path2.receiveShadow = true;
  world.add(path2);

  const path3 = new THREE.Mesh(new THREE.BoxGeometry(8, 0.12, 36), pathMat);
  path3.position.set(-22, 0.09, 10);
  path3.receiveShadow = true;
  world.add(path3);

  createZoneLabel("Beach Plaza", 0, 4.5, 18);
  createZoneLabel("Social Cove", -30, 4.5, 10);
  createZoneLabel("Mini Games Pier", 38, 4.5, -28);
  createZoneLabel("NPC Corner", 38, 4.5, -10);

  const boundaryMat = new THREE.MeshStandardMaterial({
    color: 0xd9eef7,
    transparent: true,
    opacity: 0.25
  });
  const shellRing = new THREE.Mesh(new THREE.TorusGeometry(118, 1.4, 18, 96), boundaryMat);
  shellRing.rotation.x = Math.PI / 2;
  shellRing.position.y = 0.06;
  world.add(shellRing);
}

function createProps() {
  [
    [-42, 36, 1.15], [-56, 6, 1.1], [-64, -28, 1.2], [-28, -50, 1.1],
    [12, -60, 1.18], [54, -46, 1.2], [68, -4, 1.05], [56, 34, 1.15],
    [20, 58, 1.2], [-10, 64, 1.1], [88, 18, 1.25], [-86, -8, 1.12]
  ].forEach(([x, z, s]) => createPalm(x, z, s));

  [[-36, 24], [-26, 24], [-18, 24]].forEach(([x, z]) => createUmbrella(x, z, 0xff8ab1));
  [[-40, 0, 0], [-34, 0, Math.PI / 2], [-24, 2, Math.PI]].forEach(([x, z, r]) => createBench(x, z, r));

  createFirePit(-30, 8);

  [[12, -18, 1.2], [18, -24, 1.0], [6, -26, 0.9], [62, 8, 1.2], [-58, -18, 1.05], [48, 40, 1.1]]
    .forEach(([x, z, s]) => createRock(x, z, s));

  createPier(38, -28, 26);
  createFloatingBuoy(38, -44, 0xff8558);
  createFloatingBuoy(32, -48, 0x6fd0ff);
  createFloatingBuoy(44, -50, 0xffd057);

  createComingSoonMarker(-72, 58, "COMING SOON");
  createComingSoonMarker(84, 58, "COMING SOON");
  createComingSoonMarker(92, -62, "COMING SOON");

  const portal = new THREE.Mesh(
    new THREE.TorusGeometry(2.8, 0.28, 18, 36),
    new THREE.MeshStandardMaterial({
      color: 0x7ae3ff,
      emissive: 0x1b87d0,
      emissiveIntensity: 0.8
    })
  );
  portal.rotation.y = Math.PI / 2;
  portal.position.set(38, 3.2, -18);
  world.add(portal);

  portal.userData.animate = (t) => {
    portal.rotation.z = t;
    portal.material.emissiveIntensity = 0.7 + Math.sin(t * 3) * 0.15;
  };

  animatedObjects.push(portal);
}

function createPlayer() {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(1.6, 24, 20),
    new THREE.MeshStandardMaterial({ color: 0x5ebcf7, roughness: 0.62 })
  );
  body.scale.set(1, 1.08, 1.35);
  body.position.y = 2.9;
  body.castShadow = true;
  group.add(body);

  const belly = new THREE.Mesh(
    new THREE.SphereGeometry(1.05, 24, 20),
    new THREE.MeshStandardMaterial({ color: 0xe9f7ff, roughness: 0.8 })
  );
  belly.scale.set(0.9, 0.92, 1.1);
  belly.position.set(0, 2.4, 0.95);
  group.add(belly);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(1.25, 24, 20),
    new THREE.MeshStandardMaterial({ color: 0x6ac4ff, roughness: 0.62 })
  );
  head.position.set(0, 3.9, 0.8);
  head.scale.set(1.02, 0.95, 1.08);
  head.castShadow = true;
  group.add(head);

  const snout = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.48, 0.6, 4, 10),
    new THREE.MeshStandardMaterial({ color: 0xe8f7ff, roughness: 0.8 })
  );
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, 3.7, 1.78);
  group.add(snout);

  const dorsal = new THREE.Mesh(
    new THREE.ConeGeometry(0.55, 1.45, 12),
    new THREE.MeshStandardMaterial({ color: 0x4aa7e7, roughness: 0.65 })
  );
  dorsal.position.set(0, 4.8, 0.0);
  dorsal.rotation.z = Math.PI;
  group.add(dorsal);

  const finGeo = new THREE.ConeGeometry(0.45, 1.15, 10);
  const finMat = new THREE.MeshStandardMaterial({ color: 0x50b2f0, roughness: 0.7 });

  const finLeft = new THREE.Mesh(finGeo, finMat);
  finLeft.position.set(-1.2, 2.9, 0.55);
  finLeft.rotation.z = -Math.PI / 2;
  finLeft.rotation.x = -0.4;
  group.add(finLeft);

  const finRight = finLeft.clone();
  finRight.position.x = 1.2;
  finRight.rotation.z = Math.PI / 2;
  group.add(finRight);

  const eyeGeo = new THREE.SphereGeometry(0.13, 12, 12);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x061018 });

  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.35, 4.1, 1.72);

  const eyeR = eyeL.clone();
  eyeR.position.x = 0.35;

  group.add(eyeL, eyeR);

  const shoeMat = new THREE.MeshStandardMaterial({ color: 0x2d7fff, roughness: 0.45 });
  const soleMat = new THREE.MeshStandardMaterial({ color: 0xf3f8ff, roughness: 0.85 });

  function makeShoe(x) {
    const shoe = new THREE.Group();

    const base = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.42, 1.45), shoeMat);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.1, 1.52), soleMat);
    sole.position.y = -0.24;

    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), shoeMat);
    tip.scale.set(1.5, 0.8, 1.35);
    tip.position.set(0, -0.02, 0.63);

    shoe.add(base, sole, tip);
    shoe.position.set(x, 0.55, 0.45);
    return shoe;
  }

  nameInput.focus();
+ // Verhindere Neuladen bei Enter im Namensfeld
+ nameInput.addEventListener("keydown", (e) => {
+   if (e.key === "Enter") {
+     e.preventDefault();
+     setPlayerName(nameInput.value);
+     modal.classList.add("hidden");
+   }
+ });
 nameForm.addEventListener("submit", (e) => {
   e.preventDefault();
   setPlayerName(nameInput.value);
   modal.classList.add("hidden");
 });

  
  const shoeL = makeShoe(-0.62);
  const shoeR = makeShoe(0.62);
  group.add(shoeL, shoeR);

  const tag = createNameTag("You");
  tag.position.set(0, 7, 0);
  group.add(tag);

  group.position.set(0, 0, 22);
  group.userData = {
    shoeL,
    shoeR,
    tag
  };

  addShadow(0, 22, 0.7);
  world.add(group);
  return group;
}

function createNPC(name, x, z, color = 0xff7ab5) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.9, 1.7, 5, 12),
    new THREE.MeshStandardMaterial({ color, roughness: 0.65 })
  );
  body.position.y = 2;
  body.castShadow = true;
  group.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.75, 18, 16),
    new THREE.MeshStandardMaterial({ color: 0xfff3ea })
  );
  head.position.y = 3.7;
  head.castShadow = true;
  group.add(head);

  const shoesMat = new THREE.MeshStandardMaterial({ color: 0x3986ff, roughness: 0.45 });
  const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.24, 0.78), shoesMat);
  const shoeR = shoeL.clone();
  shoeL.position.set(-0.3, 0.3, 0.18);
  shoeR.position.set(0.3, 0.3, 0.18);
  group.add(shoeL, shoeR);

  const tag = createNameTag(name);
  tag.position.set(0, 5.4, 0);
  group.add(tag);

  group.position.set(x, 0, z);
  group.userData = {
    home: new THREE.Vector3(x, 0, z),
    timeOffset: Math.random() * Math.PI * 2
  };

  addShadow(x, z, 0.5);
  world.add(group);
  roamingNPCs.push(group);
}

const water = createWater();
createBeachBase();
createProps();
const player = createPlayer();

createNPC("Luna", -18, 14, 0xff91c2);
createNPC("Kai", -35, 15, 0x92d4ff);
createNPC("Milo", 8, 26, 0xffd27e);
createNPC("Nova", 40, -12, 0xc6a7ff);

function setPlayerName(name) {
  const clean = sanitizeUsername(name) || "Guest";
  localStorage.setItem(USERNAME_KEY, clean);

  if (playerNameEl) {
    playerNameEl.textContent = clean;
  }

  if (player?.userData?.tag) {
    player.remove(player.userData.tag);
  }

  const tag = createNameTag(clean);
  tag.position.set(0, 7, 0);
  player.add(tag);
  player.userData.tag = tag;
}

function enterHub(name) {
  const clean = sanitizeUsername(name) || "Guest";
  setPlayerName(clean);
  hideModal();
}

function handleNameSubmit(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  const clean = sanitizeUsername(nameInput?.value);
  if (!clean) {
    if (nameInput) {
      nameInput.value = "";
      nameInput.placeholder = "Choose a username";
      nameInput.focus();
    }
    return;
  }

  enterHub(clean);
}

const existingName = localStorage.getItem(USERNAME_KEY);
if (existingName) {
  enterHub(existingName);
} else {
  showModal();
  setTimeout(() => nameInput?.focus(), 40);
}

if (nameForm) {
  nameForm.addEventListener("submit", handleNameSubmit);
}
if (enterButton) {
  enterButton.addEventListener("click", handleNameSubmit);
}
if (nameInput) {
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      handleNameSubmit(e);
    }
  });
}

const keys = new Set();
let dragLookActive = false;
let cameraYaw = 0;
let cameraPitch = 0.28;
let lastPointerX = 0;
let lastPointerY = 0;

window.addEventListener("keydown", (e) => keys.add(e.key.toLowerCase()));
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

window.addEventListener("pointerdown", (e) => {
  if (modal && modal.style.display !== "none") return;
  if (e.target instanceof Element) {
    if (e.target.closest(".joystick") || e.target.closest(".modal-card")) return;
  }
  dragLookActive = true;
  lastPointerX = e.clientX;
  lastPointerY = e.clientY;
});

window.addEventListener("pointerup", () => {
  dragLookActive = false;
});

window.addEventListener("pointermove", (e) => {
  if (!dragLookActive) return;
  const dx = e.clientX - lastPointerX;
  const dy = e.clientY - lastPointerY;
  cameraYaw -= dx * 0.0032;
  cameraPitch = THREE.MathUtils.clamp(cameraPitch - dy * 0.0022, 0.14, 0.72);
  lastPointerX = e.clientX;
  lastPointerY = e.clientY;
});

const joyEl = $("joystick");
const joyKnob = $("joystickKnob");
const joystickState = { active: false, x: 0, y: 0, pointerId: null };

function resetJoystick() {
  joystickState.active = false;
  joystickState.x = 0;
  joystickState.y = 0;
  joystickState.pointerId = null;
  if (joyKnob) {
    joyKnob.style.transform = "translate(-50%, -50%)";
  }
}

if (joyEl) {
  joyEl.addEventListener("pointerdown", (e) => {
    joystickState.active = true;
    joystickState.pointerId = e.pointerId;
    joyEl.setPointerCapture(e.pointerId);
  });

  joyEl.addEventListener("pointermove", (e) => {
    if (!joystickState.active || e.pointerId !== joystickState.pointerId) return;

    const rect = joyEl.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    let dx = e.clientX - centerX;
    let dy = e.clientY - centerY;

    const max = rect.width * 0.28;
    const len = Math.hypot(dx, dy) || 1;

    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }

    joystickState.x = dx / max;
    joystickState.y = dy / max;

    if (joyKnob) {
      joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    }
  });

  joyEl.addEventListener("pointerup", resetJoystick);
  joyEl.addEventListener("pointercancel", resetJoystick);
}

const playerRadius = 2.2;
const blockedZones = [
  { x: -72, z: 58, r: 6.2 },
  { x: 84, z: 58, r: 6.2 },
  { x: 92, z: -62, r: 6.2 }
];
const worldRadius = 108;

function getMovementInput() {
  let x = 0;
  let z = 0;

  if (keys.has("w") || keys.has("arrowup")) z -= 1;
  if (keys.has("s") || keys.has("arrowdown")) z += 1;
  if (keys.has("a") || keys.has("arrowleft")) x -= 1;
  if (keys.has("d") || keys.has("arrowright")) x += 1;

  x += joystickState.x;
  z += joystickState.y;

  const vec = new THREE.Vector3(x, 0, z);
  if (vec.lengthSq() > 1) vec.normalize();
  return vec;
}

function applyWorldBounds(pos) {
  const len = Math.hypot(pos.x, pos.z);

  if (len > worldRadius - playerRadius) {
    pos.x = (pos.x / len) * (worldRadius - playerRadius);
    pos.z = (pos.z / len) * (worldRadius - playerRadius);
  }

  blockedZones.forEach((zone) => {
    const dx = pos.x - zone.x;
    const dz = pos.z - zone.z;
    const dist = Math.hypot(dx, dz);

    if (dist < zone.r + playerRadius) {
      const safe = zone.r + playerRadius;
      const nx = dx / (dist || 1);
      const nz = dz / (dist || 1);
      pos.x = zone.x + nx * safe;
      pos.z = zone.z + nz * safe;
    }
  });
}

function animatePlayer(delta, time) {
  const input = getMovementInput();
  const sprint = keys.has("shift") ? 1.5 : 1.0;
  const speed = 10.5 * sprint;

  if (input.lengthSq() > 0) {
    const camForward = new THREE.Vector3(Math.sin(cameraYaw), 0, Math.cos(cameraYaw));
    const camRight = new THREE.Vector3(camForward.z, 0, -camForward.x);

    const move = camForward
      .multiplyScalar(-input.z)
      .add(camRight.multiplyScalar(input.x))
      .normalize()
      .multiplyScalar(speed * delta);

    player.position.add(move);
    applyWorldBounds(player.position);

    const faceYaw = Math.atan2(move.x, move.z);
    player.rotation.y = THREE.MathUtils.lerp(player.rotation.y, faceYaw, 0.18);

    const swing = Math.sin(time * 12 * sprint) * 0.18;
    player.userData.shoeL.rotation.x = swing;
    player.userData.shoeR.rotation.x = -swing;
    player.position.y = Math.sin(time * 24 * sprint) * 0.04;
  } else {
    player.userData.shoeL.rotation.x = THREE.MathUtils.lerp(player.userData.shoeL.rotation.x, 0, 0.18);
    player.userData.shoeR.rotation.x = THREE.MathUtils.lerp(player.userData.shoeR.rotation.x, 0, 0.18);
    player.position.y = Math.sin(time * 2) * 0.02;
  }

  const camDistance = 20;
  const camHeight = 11.2;
  const lookTarget = player.position.clone().add(new THREE.Vector3(0, 4.1, 0));

  const desired = new THREE.Vector3(
    player.position.x + Math.sin(cameraYaw) * Math.cos(cameraPitch) * camDistance,
    player.position.y + camHeight + Math.sin(cameraPitch) * 6.8,
    player.position.z + Math.cos(cameraYaw) * Math.cos(cameraPitch) * camDistance
  );

  camera.position.lerp(desired, 0.08);
  camera.lookAt(lookTarget);
}

function animateNPCs(time) {
  roamingNPCs.forEach((npc) => {
    const phase = time * 0.6 + npc.userData.timeOffset;
    npc.position.x = npc.userData.home.x + Math.sin(phase) * 2.2;
    npc.position.z = npc.userData.home.z + Math.cos(phase * 0.8) * 1.8;
    npc.rotation.y = Math.sin(phase * 1.4) * 0.5;
  });
}

function animateWater(time) {
  const position = water.position;
  const arr = position.array;
  const base = water.base;

  for (let i = 0; i < arr.length; i += 3) {
    const bx = base[i];
    const by = base[i + 1];
    const bz = base[i + 2];
    arr[i + 1] =
      by +
      Math.sin((bx + time * 16) * 0.035) * 0.52 +
      Math.cos((bz - time * 18) * 0.028) * 0.45;
  }

  position.needsUpdate = true;
  water.mesh.geometry.computeVertexNormals();
}

function animate() {
  const delta = Math.min(clock.getDelta(), 0.033);
  const time = clock.elapsedTime;

  animateWater(time);
  animatePlayer(delta, time);
  animateNPCs(time);

  animatedObjects.forEach((obj) => {
    if (obj.userData.animate) obj.userData.animate(time, delta);
  });

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
