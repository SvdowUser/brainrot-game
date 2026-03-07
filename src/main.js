
const STORAGE_KEY = "lt_profile_v2";

const appState = {
  profile: null,
  selectedServer: null,
  liveCounts: {
    "beach-01": 8,
    "beach-02": 14,
    "beach-03": 5
  },
  joystick: { active: false, x: 0, y: 0 },
  gameReady: false,
  scene: null
};

const mockServers = [
  { id: "beach-01", name: "Azure Beach", region: "EU", players: 8, maxPlayers: 20, ping: 28 },
  { id: "beach-02", name: "Coral Coast", region: "EU", players: 14, maxPlayers: 20, ping: 34 },
  { id: "beach-03", name: "Sunset Bay", region: "EU", players: 5, maxPlayers: 20, ping: 22 }
];

const el = {
  authScreen: document.getElementById("auth-screen"),
  serverScreen: document.getElementById("server-screen"),
  topbar: document.getElementById("topbar"),
  topbarName: document.getElementById("topbar-name"),
  topbarServer: document.getElementById("topbar-server"),
  enterBtn: document.getElementById("enter-btn"),
  demoBtn: document.getElementById("demo-btn"),
  backAuthBtn: document.getElementById("back-auth-btn"),
  serverList: document.getElementById("server-list"),
  emailInput: document.getElementById("email-input"),
  usernameInput: document.getElementById("username-input"),
  btnServers: document.getElementById("btn-servers"),
  joystick: document.getElementById("joystick"),
  joyBase: document.getElementById("joy-base"),
  joyThumb: document.getElementById("joy-thumb"),
  tip: document.getElementById("tip")
};

function sanitizeUsername(name) {
  return String(name || "")
    .replace(/[^a-zA-Z0-9_ -]/g, "")
    .trim()
    .slice(0, 16);
}

function saveProfile(profile) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

function loadProfile() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!raw) return null;
    return {
      email: raw.email || "",
      username: sanitizeUsername(raw.username) || "Guest"
    };
  } catch {
    return null;
  }
}

function show(elm) { elm.classList.remove("hidden"); }
function hide(elm) { elm.classList.add("hidden"); }

function pointerCoarse() {
  return window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
}

function setTip(message, ms = 2400) {
  el.tip.textContent = message;
  show(el.tip);
  window.clearTimeout(setTip._t);
  setTip._t = window.setTimeout(() => hide(el.tip), ms);
}

function buildServerCards() {
  el.serverList.innerHTML = "";
  mockServers.forEach((server) => {
    const card = document.createElement("div");
    card.className = "server-card";
    card.innerHTML = `
      <h3>${server.name}</h3>
      <div class="server-meta">${server.region} region · ${server.ping}ms ping</div>
      <div class="badges">
        <span class="badge gold">${server.players}/${server.maxPlayers} players</span>
        <span class="badge">20-player cap</span>
      </div>
      <button class="primary-btn">Join server</button>
    `;
    card.querySelector("button").addEventListener("click", () => joinServer(server));
    el.serverList.appendChild(card);
  });
}

function openServerScreen() {
  hide(el.authScreen);
  show(el.serverScreen);
}

function openAuthScreen() {
  hide(el.serverScreen);
  show(el.authScreen);
}

function updateTopbar() {
  const profile = appState.profile || { username: "Guest" };
  const server = appState.selectedServer || mockServers[0];
  el.topbarName.textContent = profile.username;
  el.topbarServer.textContent = `${server.name} · ${server.players}/${server.maxPlayers}`;
}

function beginSession(profile) {
  appState.profile = profile;
  saveProfile(profile);
  openServerScreen();
}

function quickDemo() {
  const demoName = "Tralalerito";
  const profile = { email: "demo@beachhub.local", username: demoName };
  el.emailInput.value = profile.email;
  el.usernameInput.value = profile.username;
  beginSession(profile);
}

function validateAuth() {
  const email = el.emailInput.value.trim();
  const username = sanitizeUsername(el.usernameInput.value);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk) return setTip("Please enter a valid email.");
  if (username.length < 3) return setTip("Username must be at least 3 characters.");
  beginSession({ email, username });
}

function joinServer(server) {
  appState.selectedServer = { ...server };
  hide(el.serverScreen);
  hide(el.authScreen);
  show(el.topbar);
  updateTopbar();

  if (pointerCoarse()) show(el.joystick);
  if (appState.scene) {
    appState.scene.startHub(appState.profile, appState.selectedServer);
  }
  setTip("Welcome to the beach hub.");
}

function bindDom() {
  const saved = loadProfile();
  if (saved) {
    el.emailInput.value = saved.email || "";
    el.usernameInput.value = saved.username || "";
  }

  el.enterBtn.addEventListener("click", validateAuth);
  el.demoBtn.addEventListener("click", quickDemo);
  el.backAuthBtn.addEventListener("click", openAuthScreen);
  el.btnServers.addEventListener("click", () => {
    buildServerCards();
    show(el.serverScreen);
  });

  el.usernameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") validateAuth();
  });
  el.emailInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") validateAuth();
  });

  setupJoystick();
  buildServerCards();
}

function setupJoystick() {
  const base = el.joyBase;
  const thumb = el.joyThumb;
  let rect = null;
  let radius = 60;

  function resetThumb() {
    thumb.style.transform = "translate(-50%, -50%)";
    appState.joystick = { active: false, x: 0, y: 0 };
  }

  function move(clientX, clientY) {
    rect = rect || base.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    let dx = clientX - centerX;
    let dy = clientY - centerY;
    const dist = Math.hypot(dx, dy);
    if (dist > radius) {
      dx = (dx / dist) * radius;
      dy = (dy / dist) * radius;
    }
    thumb.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    appState.joystick = {
      active: true,
      x: Number((dx / radius).toFixed(3)),
      y: Number((dy / radius).toFixed(3))
    };
  }

  base.addEventListener("pointerdown", (e) => {
    rect = base.getBoundingClientRect();
    base.setPointerCapture(e.pointerId);
    move(e.clientX, e.clientY);
  });

  base.addEventListener("pointermove", (e) => {
    if (!base.hasPointerCapture(e.pointerId)) return;
    move(e.clientX, e.clientY);
  });

  ["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => {
    base.addEventListener(eventName, () => {
      rect = null;
      resetThumb();
    });
  });

  resetThumb();
}

class HubScene extends Phaser.Scene {
  constructor() {
    super("HubScene");
    this.player = null;
    this.playerLabel = null;
    this.cursors = null;
    this.mockPlayers = [];
    this.npcs = [];
    this.started = false;
    this.sections = {};
    this.apiStatus = "Demo frontend";
  }

  preload() {
    this.load.spritesheet("player", "./assets/sprites/player/los_tralaleritos_sheet.png", {
      frameWidth: 64,
      frameHeight: 64
    });
    this.load.spritesheet("npcSheet", "./assets/sprites/npcs/npc_beachbot_sheet.png", {
      frameWidth: 64,
      frameHeight: 64
    });
    this.load.image("tileSand", "./assets/tiles/sand.png");
    this.load.image("tileWater", "./assets/tiles/water.png");
    this.load.image("tileBoardwalk", "./assets/tiles/boardwalk.png");
    this.load.image("tileGrass", "./assets/tiles/grass.png");
    this.load.image("objPalm", "./assets/objects/palm.png");
    this.load.image("objRock", "./assets/objects/rock.png");
    this.load.image("objUmbrellaPink", "./assets/objects/umbrella_pink.png");
    this.load.image("objUmbrellaBlue", "./assets/objects/umbrella_blue.png");
    this.load.image("objTent", "./assets/objects/tent.png");
    this.load.image("objFence", "./assets/objects/fence.png");
    this.load.image("objBonfire", "./assets/objects/bonfire.png");
    this.load.image("objCrate", "./assets/objects/crate.png");
    this.load.image("uiComingSoon", "./assets/ui/coming_soon_circle.png");
    this.load.image("signMiniGames", "./assets/ui/sign_minigames.png");
    this.load.image("signNPC", "./assets/ui/sign_npc.png");
    this.load.image("signSocial", "./assets/ui/sign_social.png");
  }

  create() {
    appState.scene = this;

    this.createAnimations();

    this.physics.world.setBounds(0, 0, 2600, 1700);
    this.cameras.main.setBackgroundColor("#7ad6ff");
    this.cameras.main.setBounds(0, 0, 2600, 1700);
    this.cameras.main.roundPixels = true;
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys("W,A,S,D");

    this.buildMap();

    this.player = this.physics.add.sprite(760, 980, "player", 0);
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(50);
    this.player.body.setSize(28, 20).setOffset(18, 40);

    this.playerLabel = this.makeNameLabel("Guest");
    this.playerLabel.setDepth(1000);

    this.obstacles = this.physics.add.staticGroup();
    this.buildObstacles();
    this.physics.add.collider(this.player, this.obstacles);

    this.mockPlayers = this.createMockPlayers();
    this.npcs = this.createNPCs();

    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.scale.on("resize", this.handleResize, this);

    this.started = true;
  }

  handleResize() {
    this.cameras.main.setViewport(0, 0, this.scale.width, this.scale.height);
  }

  createAnimations() {
    const defs = [
      { key: "walk-down", frames: [0, 1, 2] },
      { key: "walk-left", frames: [3, 4, 5] },
      { key: "walk-right", frames: [6, 7, 8] },
      { key: "walk-up", frames: [9, 10, 11] }
    ];
    defs.forEach((def) => {
      if (!this.anims.exists(def.key)) {
        this.anims.create({
          key: def.key,
          frames: this.anims.generateFrameNumbers("player", { frames: def.frames }),
          frameRate: 8,
          repeat: -1
        });
      }
      const npcKey = `${def.key}-npc`;
      if (!this.anims.exists(npcKey)) {
        this.anims.create({
          key: npcKey,
          frames: this.anims.generateFrameNumbers("npcSheet", { frames: def.frames }),
          frameRate: 7,
          repeat: -1
        });
      }
    });
  }

  startHub(profile, server) {
    this.playerLabel.text = profile.username;
    this.player.nameValue = profile.username;
    updateTopbar();
  }

  makeNameLabel(text) {
    const label = this.add.text(0, 0, text, {
      fontFamily: "Arial, sans-serif",
      fontSize: "13px",
      color: "#ffffff",
      backgroundColor: "rgba(12, 21, 33, 0.7)",
      padding: { left: 8, right: 8, top: 4, bottom: 4 }
    }).setOrigin(0.5, 1);
    return label;
  }

  buildMap() {
    const W = 2600;
    const H = 1700;
    this.add.tileSprite(0, 0, W, H, "tileSand").setOrigin(0).setDepth(-50);

    this.sections.water = this.add.tileSprite(0, 0, W, 330, "tileWater").setOrigin(0).setDepth(-40);
    this.sections.water2 = this.add.tileSprite(0, 292, W, 110, "tileWater").setOrigin(0).setDepth(-39).setAlpha(0.36);
    this.sections.grassNPC = this.add.tileSprite(1790, 370, 680, 400, "tileGrass").setOrigin(0).setAlpha(0.95).setDepth(-35);
    this.sections.socialPatch = this.add.tileSprite(160, 1070, 720, 390, "tileGrass").setOrigin(0).setAlpha(0.65).setDepth(-35);

    this.boardwalk = this.add.tileSprite(870, 770, 930, 250, "tileBoardwalk").setOrigin(0).setDepth(-10);
    this.boardwalk2 = this.add.tileSprite(1020, 1020, 610, 126, "tileBoardwalk").setOrigin(0).setDepth(-10).setAlpha(0.94);

    // shoreline foam
    this.foamLines = [];
    [325, 342, 360].forEach((y, i) => {
      const foam = this.add.graphics().setDepth(-30);
      foam.y = y;
      foam.alpha = i === 0 ? 0.8 : 0.45;
      this.foamLines.push(foam);
    });

    // area decorations
    this.placeCluster([
      ["objPalm", 320, 545, 0.84], ["objPalm", 560, 500, 0.92], ["objPalm", 470, 695, 0.78],
      ["objRock", 205, 705, 0.78], ["objRock", 272, 760, 0.88], ["objUmbrellaPink", 735, 640, 0.8],
      ["objCrate", 825, 580, 0.72]
    ]);

    this.placeCluster([
      ["objPalm", 1980, 510, 0.95], ["objPalm", 2180, 620, 0.9], ["objTent", 2020, 640, 0.72],
      ["objTent", 2220, 520, 0.76], ["objCrate", 1948, 760, 0.74], ["objCrate", 2148, 808, 0.74],
      ["objUmbrellaBlue", 2335, 720, 0.78]
    ]);

    this.placeCluster([
      ["objBonfire", 430, 1225, 0.84], ["objUmbrellaPink", 245, 1180, 0.7], ["objUmbrellaBlue", 675, 1210, 0.72],
      ["objPalm", 185, 1340, 0.82], ["objPalm", 742, 1328, 0.82], ["objCrate", 548, 1338, 0.7],
      ["objRock", 317, 1388, 0.72], ["objRock", 618, 1382, 0.72]
    ]);

    // locked area barriers
    for (let i = 0; i < 5; i += 1) {
      this.add.image(2028 + i * 72, 980, "objFence").setScale(0.74).setDepth(30);
      this.add.image(112 + i * 72, 890, "objFence").setScale(0.74).setDepth(30);
    }
    this.add.image(2208, 900, "uiComingSoon").setScale(0.7).setDepth(31);
    this.add.image(290, 810, "uiComingSoon").setScale(0.7).setDepth(31);

    // signs
    this.add.image(1260, 715, "signMiniGames").setScale(0.78).setDepth(26);
    this.add.image(2050, 442, "signNPC").setScale(0.76).setDepth(26);
    this.add.image(500, 1104, "signSocial").setScale(0.76).setDepth(26);

    // zone headings
    this.makeHeading(1320, 700, "Mini Games Pier");
    this.makeHeading(2050, 425, "NPC Plaza");
    this.makeHeading(490, 1084, "Social Cove");
  }

  placeCluster(entries) {
    entries.forEach(([key, x, y, scale]) => {
      this.add.image(x, y, key).setScale(scale).setDepth(y);
    });
  }

  makeHeading(x, y, text) {
    const shadow = this.add.text(x, y + 2, text, {
      fontFamily: "Arial, sans-serif",
      fontSize: "26px",
      color: "#122132",
      fontStyle: "bold"
    }).setOrigin(0.5);
    const title = this.add.text(x, y, text, {
      fontFamily: "Arial, sans-serif",
      fontSize: "26px",
      color: "#ffffff",
      fontStyle: "bold"
    }).setOrigin(0.5);
    shadow.setDepth(60);
    title.setDepth(61);
  }

  buildObstacles() {
    const block = (x, y, w, h) => {
      const r = this.add.rectangle(x, y, w, h, 0x000000, 0);
      this.physics.add.existing(r, true);
      this.obstacles.add(r);
      return r;
    };

    // water barrier, locked areas, key objects
    block(1300, 150, 2600, 260);
    block(2215, 980, 350, 190);
    block(280, 900, 370, 160);
    block(2030, 644, 120, 92);
    block(2225, 523, 120, 92);
    block(430, 1228, 120, 90);
  }

  createMockPlayers() {
    const names = ["Milo", "AquaRex", "MemeWave", "BlueStep", "Sunny", "CoralFox"];
    const starts = [
      [1180, 880], [1460, 955], [530, 1180], [2135, 618], [980, 1110], [700, 735]
    ];

    return names.map((name, index) => {
      const sprite = this.physics.add.sprite(starts[index][0], starts[index][1], "npcSheet", 0);
      sprite.body.setSize(28, 20).setOffset(18, 40);
      sprite.setDepth(sprite.y);
      const label = this.makeNameLabel(name);
      label.setDepth(1000);
      const target = new Phaser.Math.Vector2(starts[index][0], starts[index][1]);
      return { sprite, label, target, speed: 95 + index * 5, changeAt: 0 };
    });
  }

  createNPCs() {
    const names = ["Guide", "Dock Bot", "Beach Bot"];
    const starts = [[1910, 560], [2280, 690], [465, 1250]];

    return names.map((name, index) => {
      const sprite = this.physics.add.sprite(starts[index][0], starts[index][1], "npcSheet", 0);
      sprite.body.setSize(28, 20).setOffset(18, 40);
      sprite.setTint(index === 0 ? 0xffffff : index === 1 ? 0xfff0c7 : 0xd9ffd4);
      const label = this.makeNameLabel(name);
      label.setDepth(1000);
      return { sprite, label, anchor: new Phaser.Math.Vector2(starts[index][0], starts[index][1]), drift: index * 0.8 };
    });
  }

  updateMockActors(list, time) {
    list.forEach((actor) => {
      if (time > actor.changeAt) {
        actor.changeAt = time + Phaser.Math.Between(1800, 3400);
        const rangeX = actor.sprite.x < 1200 ? [220, 980] : [1100, 2360];
        const rangeY = actor.sprite.y < 920 ? [470, 980] : [1020, 1410];
        actor.target.set(
          Phaser.Math.Between(rangeX[0], rangeX[1]),
          Phaser.Math.Between(rangeY[0], rangeY[1])
        );
      }
      const dir = actor.target.clone().subtract(new Phaser.Math.Vector2(actor.sprite.x, actor.sprite.y));
      if (dir.length() > 8) {
        dir.normalize();
        actor.sprite.body.setVelocity(dir.x * actor.speed, dir.y * actor.speed);
        this.playDirectional(actor.sprite, dir.x, dir.y, true, true);
      } else {
        actor.sprite.body.setVelocity(0, 0);
        actor.sprite.anims.stop();
      }
      actor.label.setPosition(actor.sprite.x, actor.sprite.y - 22);
      actor.sprite.setDepth(actor.sprite.y);
    });
  }

  updateNPCs(time) {
    this.npcs.forEach((npc, index) => {
      const x = npc.anchor.x + Math.sin((time * 0.0012) + npc.drift) * 32;
      const y = npc.anchor.y + Math.cos((time * 0.0017) + npc.drift) * 24;
      const vx = x - npc.sprite.x;
      const vy = y - npc.sprite.y;
      npc.sprite.body.setVelocity(vx * 2.2, vy * 2.2);
      this.playDirectional(npc.sprite, vx, vy, true, true);
      npc.label.setPosition(npc.sprite.x, npc.sprite.y - 22);
      npc.sprite.setDepth(npc.sprite.y);
    });
  }

  playDirectional(sprite, vx, vy, isNpc = false, keepLast = false) {
    const prefix = isNpc ? "-npc" : "";
    let animKey = keepLast && sprite._lastAnim ? sprite._lastAnim : `walk-down${prefix}`;
    if (Math.abs(vx) > Math.abs(vy)) {
      animKey = vx < 0 ? `walk-left${prefix}` : `walk-right${prefix}`;
    } else if (Math.abs(vy) > 1) {
      animKey = vy < 0 ? `walk-up${prefix}` : `walk-down${prefix}`;
    }
    sprite._lastAnim = animKey;
    if (sprite.anims.currentAnim?.key !== animKey) sprite.play(animKey, true);
  }

  updateWater(time) {
    this.sections.water.tilePositionX = time * 0.02;
    this.sections.water.tilePositionY = Math.sin(time * 0.0005) * 10;
    this.sections.water2.tilePositionX = -time * 0.028;

    this.foamLines.forEach((g, i) => {
      g.clear();
      g.lineStyle(4 - i, 0xffffff, 0.45 - i * 0.08);
      const y = 0;
      let first = true;
      for (let x = 0; x <= 2600; x += 28) {
        const py = Math.sin((x * 0.018) + (time * 0.0024) + i) * (6 + i * 2);
        if (first) {
          g.beginPath();
          g.moveTo(x, py);
          first = false;
        } else {
          g.lineTo(x, py);
        }
      }
      g.strokePath();
    });
  }

  getMoveVector() {
    let x = 0;
    let y = 0;
    if (this.cursors.left.isDown || this.keys.A.isDown) x -= 1;
    if (this.cursors.right.isDown || this.keys.D.isDown) x += 1;
    if (this.cursors.up.isDown || this.keys.W.isDown) y -= 1;
    if (this.cursors.down.isDown || this.keys.S.isDown) y += 1;

    if (appState.joystick.active) {
      x = appState.joystick.x;
      y = appState.joystick.y;
    }
    return new Phaser.Math.Vector2(x, y);
  }

  update(time) {
    if (!this.started) return;

    this.updateWater(time);

    const move = this.getMoveVector();
    const speed = 220;
    if (move.length() > 0.08) {
      move.normalize();
      this.player.body.setVelocity(move.x * speed, move.y * speed);
      this.playDirectional(this.player, move.x, move.y, false, false);
    } else {
      this.player.body.setVelocity(0, 0);
      if (this.player._lastAnim) {
        const stoppedFrameMap = {
          "walk-down": 1, "walk-left": 4, "walk-right": 7, "walk-up": 10
        };
        this.player.anims.stop();
        this.player.setFrame(stoppedFrameMap[this.player._lastAnim] ?? 1);
      }
    }

    // keep on beach / world safe area
    if (this.player.y < 364) this.player.y = 364;
    if (this.player.x < 90) this.player.x = 90;
    if (this.player.x > 2510) this.player.x = 2510;
    if (this.player.y > 1600) this.player.y = 1600;

    this.player.setDepth(this.player.y);
    this.playerLabel.setPosition(this.player.x, this.player.y - 22);

    this.updateMockActors(this.mockPlayers, time);
    this.updateNPCs(time);
  }
}

bindDom();

const config = {
  type: Phaser.AUTO,
  parent: "game",
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: "#7ad6ff",
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  physics: {
    default: "arcade",
    arcade: {
      gravity: { y: 0 },
      debug: false
    }
  },
  scene: [HubScene]
};

const game = new Phaser.Game(config);
window.addEventListener("resize", () => {
  game.scale.resize(window.innerWidth, window.innerHeight);
});
