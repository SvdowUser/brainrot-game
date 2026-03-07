const STORAGE_KEYS = {
  bestScore: "brainrot_best_score",
  unlockedSkins: "brainrot_unlocked_skins",
  selectedSkin: "brainrot_selected_skin"
};

const DEFAULT_STATE = {
  bestScore: 0,
  unlockedSkins: ["babyrot_blue"],
  selectedSkin: "babyrot_blue"
};

const SKINS = [
  { id: "babyrot_blue", name: "Babyrot Blue", unlockScore: 0, color: 0x3da5ff },
  { id: "tralala_pink", name: "Tralala Pink", unlockScore: 40, color: 0xff66c4 },
  { id: "golden_brainrot", name: "Golden Brainrot", unlockScore: 90, color: 0xf7c948 }
];

function loadState() {
  try {
    const bestScore = Number(localStorage.getItem(STORAGE_KEYS.bestScore) || DEFAULT_STATE.bestScore);
    const unlocked = JSON.parse(localStorage.getItem(STORAGE_KEYS.unlockedSkins) || JSON.stringify(DEFAULT_STATE.unlockedSkins));
    const selectedSkin = localStorage.getItem(STORAGE_KEYS.selectedSkin) || DEFAULT_STATE.selectedSkin;
    return {
      bestScore,
      unlockedSkins: Array.isArray(unlocked) ? unlocked : [...DEFAULT_STATE.unlockedSkins],
      selectedSkin
    };
  } catch (e) {
    return { ...DEFAULT_STATE };
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEYS.bestScore, String(state.bestScore));
  localStorage.setItem(STORAGE_KEYS.unlockedSkins, JSON.stringify(state.unlockedSkins));
  localStorage.setItem(STORAGE_KEYS.selectedSkin, state.selectedSkin);
}

function unlockSkinsForScore(state, score) {
  let changed = false;
  SKINS.forEach((skin) => {
    if (score >= skin.unlockScore && !state.unlockedSkins.includes(skin.id)) {
      state.unlockedSkins.push(skin.id);
      changed = true;
    }
  });
  return changed;
}

function createRectTexture(scene, key, width, height, color) {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(color, 1);
  g.fillRoundedRect(0, 0, width, height, 12);
  g.generateTexture(key, width, height);
  g.destroy();
}

function fitGameSize(game) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  game.scale.resize(w, h);
}

class MenuScene extends Phaser.Scene {
  constructor() {
    super("MenuScene");
  }

  create() {
    this.state = loadState();
    fitGameSize(this.game);

    this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x161616).setOrigin(0);

    this.add.text(this.scale.width / 2, 70, "BRAINROT RUNNER", {
      fontFamily: "Arial",
      fontSize: "36px",
      color: "#ffffff",
      fontStyle: "bold"
    }).setOrigin(0.5);

    this.add.text(this.scale.width / 2, 120, "Starter für GitHub Pages", {
      fontFamily: "Arial",
      fontSize: "20px",
      color: "#bbbbbb"
    }).setOrigin(0.5);

    this.bestText = this.add.text(this.scale.width / 2, 180, `Best Score: ${this.state.bestScore}`, {
      fontFamily: "Arial",
      fontSize: "22px",
      color: "#ffe08a"
    }).setOrigin(0.5);

    this.skinText = this.add.text(this.scale.width / 2, 230, this.getSkinLabel(), {
      fontFamily: "Arial",
      fontSize: "20px",
      color: "#8ee3ff",
      align: "center"
    }).setOrigin(0.5);

    const startBtn = this.makeButton(this.scale.width / 2, 320, "Spiel starten", () => {
      this.scene.start("RunnerScene");
    });

    const skinBtn = this.makeButton(this.scale.width / 2, 395, "Skin wechseln", () => {
      this.cycleSkin();
    });

    const info = [
      "Tippen / Leertaste = springen",
      "Sammle Coins, weiche Hindernissen aus",
      "Neue Skins werden über Score freigeschaltet"
    ].join("\n");

    this.add.text(this.scale.width / 2, 500, info, {
      fontFamily: "Arial",
      fontSize: "18px",
      color: "#d6d6d6",
      align: "center",
      lineSpacing: 6
    }).setOrigin(0.5);

    this.scale.on("resize", this.handleResize, this);
  }

  handleResize(gameSize) {
    this.scene.restart();
  }

  makeButton(x, y, label, onClick) {
    const bg = this.add.rectangle(x, y, 240, 52, 0x2b6fff, 1).setStrokeStyle(2, 0xffffff);
    const text = this.add.text(x, y, label, {
      fontFamily: "Arial",
      fontSize: "22px",
      color: "#ffffff",
      fontStyle: "bold"
    }).setOrigin(0.5);

    bg.setInteractive({ useHandCursor: true })
      .on("pointerover", () => bg.setFillStyle(0x4f86ff))
      .on("pointerout", () => bg.setFillStyle(0x2b6fff))
      .on("pointerdown", onClick);

    return { bg, text };
  }

  cycleSkin() {
    const unlockedSkins = SKINS.filter((skin) => this.state.unlockedSkins.includes(skin.id));
    const currentIndex = unlockedSkins.findIndex((skin) => skin.id === this.state.selectedSkin);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % unlockedSkins.length : 0;
    this.state.selectedSkin = unlockedSkins[nextIndex].id;
    saveState(this.state);
    this.skinText.setText(this.getSkinLabel());
  }

  getSkinLabel() {
    const current = SKINS.find((skin) => skin.id === this.state.selectedSkin) || SKINS[0];
    const unlockedCount = this.state.unlockedSkins.length;
    return `Aktiver Skin: ${current.name}\nFreigeschaltet: ${unlockedCount}/${SKINS.length}`;
  }
}

class RunnerScene extends Phaser.Scene {
  constructor() {
    super("RunnerScene");
  }

  create() {
    this.state = loadState();
    fitGameSize(this.game);

    this.speed = 320;
    this.score = 0;
    this.coins = 0;
    this.gameOver = false;

    createRectTexture(this, "ground", 64, 64, 0x3a3a3a);
    createRectTexture(this, "obstacle", 42, 60, 0xff5a5a);
    createRectTexture(this, "coin", 28, 28, 0xffd54a);

    SKINS.forEach((skin) => {
      createRectTexture(this, skin.id, 48, 48, skin.color);
    });

    this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x1d1f27).setOrigin(0);
    this.add.rectangle(0, this.scale.height - 110, this.scale.width, 110, 0x2d2d2d).setOrigin(0);

    this.player = this.physics.add.sprite(120, this.scale.height - 150, this.state.selectedSkin);
    this.player.setCollideWorldBounds(true);
    this.player.body.setSize(40, 44).setOffset(4, 4);
    this.player.setGravityY(1600);

    this.ground = this.add.tileSprite(this.scale.width / 2, this.scale.height - 32, this.scale.width, 64, "ground");

    this.obstacles = this.physics.add.group();
    this.coinGroup = this.physics.add.group();

    this.physics.world.setBounds(0, 0, this.scale.width, this.scale.height);
    this.player.setCollideWorldBounds(true);

    this.scoreText = this.add.text(18, 18, "Score: 0", {
      fontFamily: "Arial",
      fontSize: "24px",
      color: "#ffffff",
      fontStyle: "bold"
    });

    this.coinText = this.add.text(18, 50, "Coins: 0", {
      fontFamily: "Arial",
      fontSize: "20px",
      color: "#ffe08a"
    });

    this.hintText = this.add.text(this.scale.width - 18, 18, "ESC = Menü", {
      fontFamily: "Arial",
      fontSize: "18px",
      color: "#cccccc"
    }).setOrigin(1, 0);

    this.input.keyboard.on("keydown-SPACE", this.jump, this);
    this.input.keyboard.on("keydown-UP", this.jump, this);
    this.input.keyboard.on("keydown-ESC", () => this.scene.start("MenuScene"));
    this.input.on("pointerdown", this.jump, this);

    this.physics.add.overlap(this.player, this.coinGroup, this.collectCoin, null, this);
    this.physics.add.overlap(this.player, this.obstacles, this.hitObstacle, null, this);

    this.time.addEvent({
      delay: 1400,
      callback: this.spawnObstacle,
      callbackScope: this,
      loop: true
    });

    this.time.addEvent({
      delay: 1700,
      callback: this.spawnCoin,
      callbackScope: this,
      loop: true
    });

    this.time.addEvent({
      delay: 200,
      callback: () => {
        if (!this.gameOver) {
          this.score += 1;
          this.scoreText.setText(`Score: ${this.score}`);
        }
      },
      loop: true
    });

    this.scale.on("resize", this.handleResize, this);
  }

  handleResize() {
    this.scene.restart();
  }

  jump() {
    if (this.gameOver) {
      this.scene.start("MenuScene");
      return;
    }

    const onGround = this.player.y >= this.scale.height - 151;
    if (onGround) {
      this.player.setVelocityY(-720);
    }
  }

  spawnObstacle() {
    if (this.gameOver) return;
    const y = this.scale.height - 142;
    const obstacle = this.obstacles.create(this.scale.width + 40, y, "obstacle");
    obstacle.setImmovable(true);
    obstacle.body.allowGravity = false;
    obstacle.setVelocityX(-this.speed);
  }

  spawnCoin() {
    if (this.gameOver) return;
    const yOptions = [this.scale.height - 230, this.scale.height - 280, this.scale.height - 180];
    const y = Phaser.Utils.Array.GetRandom(yOptions);
    const coin = this.coinGroup.create(this.scale.width + 40, y, "coin");
    coin.body.allowGravity = false;
    coin.setVelocityX(-this.speed);
  }

  collectCoin(player, coin) {
    coin.destroy();
    this.coins += 1;
    this.score += 3;
    this.coinText.setText(`Coins: ${this.coins}`);
    this.scoreText.setText(`Score: ${this.score}`);
  }

  hitObstacle() {
    if (this.gameOver) return;
    this.gameOver = true;
    this.physics.pause();

    const previousBest = this.state.bestScore;
    if (this.score > this.state.bestScore) {
      this.state.bestScore = this.score;
    }

    const unlockedAnything = unlockSkinsForScore(this.state, this.score);
    saveState(this.state);

    this.add.rectangle(this.scale.width / 2, this.scale.height / 2, 340, 220, 0x000000, 0.82).setStrokeStyle(2, 0xffffff);

    let message = `Game Over\nScore: ${this.score}\nBest: ${this.state.bestScore}`;
    if (this.score > previousBest) {
      message += `\n\nNeuer Highscore!`;
    }
    if (unlockedAnything) {
      message += `\nNeuer Skin freigeschaltet!`;
    }

    this.add.text(this.scale.width / 2, this.scale.height / 2 - 25, message, {
      fontFamily: "Arial",
      fontSize: "26px",
      color: "#ffffff",
      align: "center",
      lineSpacing: 8
    }).setOrigin(0.5);

    this.add.text(this.scale.width / 2, this.scale.height / 2 + 70, "Tippen oder Leertaste für Menü", {
      fontFamily: "Arial",
      fontSize: "18px",
      color: "#ffe08a"
    }).setOrigin(0.5);
  }

  update() {
    if (this.gameOver) return;

    this.ground.tilePositionX += 6;

    this.obstacles.children.each((child) => {
      if (child && child.x < -60) {
        child.destroy();
      }
    });

    this.coinGroup.children.each((child) => {
      if (child && child.x < -60) {
        child.destroy();
      }
    });
  }
}

const config = {
  type: Phaser.AUTO,
  parent: "game",
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: "#111111",
  physics: {
    default: "arcade",
    arcade: {
      gravity: { y: 0 },
      debug: false
    }
  },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: [MenuScene, RunnerScene]
};

const game = new Phaser.Game(config);

window.addEventListener("resize", () => {
  fitGameSize(game);
});
