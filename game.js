const WORLD_WIDTH = 2304;
const WORLD_HEIGHT = 1536;
const PLAYER_SPEED = 240;

class BeachHubScene extends Phaser.Scene {
  constructor() {
    super('BeachHubScene');
  }

  create() {
    this.createTextures();
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.obstacles = this.physics.add.staticGroup();

    this.drawMap();
    this.createLockedAreas();
    this.createPlayer();
    this.createUI();
    this.createControls();

    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.applyResponsiveZoom();

    this.scale.on('resize', () => {
      this.updateFixedUI();
      this.applyResponsiveZoom();
    });
  }

  createTextures() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });

    g.fillStyle(0x76d8f4, 1);
    g.fillRect(0, 0, 64, 64);
    g.fillStyle(0x9ae8ff, 0.9);
    g.fillRect(0, 16, 64, 6);
    g.fillRect(0, 42, 64, 5);
    g.generateTexture('water', 64, 64);
    g.clear();

    g.fillStyle(0xf1c27d, 1);
    g.fillRect(0, 0, 64, 64);
    g.fillStyle(0xe5b063, 1);
    for (let i = 0; i < 26; i++) {
      g.fillCircle(Phaser.Math.Between(2, 62), Phaser.Math.Between(2, 62), Phaser.Math.Between(1, 2));
    }
    g.generateTexture('sand', 64, 64);
    g.clear();

    g.fillStyle(0x67bf5c, 1);
    g.fillRect(0, 0, 64, 64);
    g.fillStyle(0x4f9d45, 1);
    for (let i = 0; i < 28; i++) {
      g.fillRect(Phaser.Math.Between(0, 60), Phaser.Math.Between(0, 60), 2, 4);
    }
    g.generateTexture('grass', 64, 64);
    g.clear();

    g.fillStyle(0xa77444, 1);
    g.fillRect(0, 0, 64, 64);
    g.lineStyle(3, 0x84542d, 1);
    [16, 32, 48].forEach(y => { g.beginPath(); g.moveTo(0, y); g.lineTo(64, y); g.strokePath(); });
    g.generateTexture('boardwalk', 64, 64);
    g.clear();

    g.fillStyle(0x8a5a31, 1);
    g.fillRect(26, 28, 12, 34);
    g.fillStyle(0x2aae4f, 1);
    g.fillEllipse(32, 20, 54, 18);
    g.fillEllipse(18, 26, 32, 12);
    g.fillEllipse(46, 26, 32, 12);
    g.fillEllipse(24, 12, 22, 10);
    g.fillEllipse(40, 12, 22, 10);
    g.generateTexture('palm', 64, 64);
    g.clear();

    g.fillStyle(0x8d99a3, 1);
    g.fillEllipse(32, 32, 48, 36);
    g.fillStyle(0xb3bcc4, 1);
    g.fillEllipse(24, 24, 14, 10);
    g.generateTexture('rock', 64, 64);
    g.clear();

    g.fillStyle(0x6d58ff, 1);
    g.fillEllipse(32, 34, 36, 46);
    g.lineStyle(4, 0xbcb2ff, 1);
    g.strokeEllipse(32, 34, 36, 46);
    g.generateTexture('portal', 64, 64);
    g.clear();

    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 18, 64, 28);
    g.fillStyle(0xff7a00, 1);
    for (let i = 0; i < 6; i++) {
      g.fillRect(i * 12, 19 + ((i % 2) * 8), 9, 6);
      g.fillRect(i * 12 + 3, 34 + ((i % 2) * 8), 9, 6);
    }
    g.generateTexture('barrier', 64, 64);
    g.clear();

    g.fillStyle(0x915b2a, 1);
    g.fillRect(29, 25, 6, 36);
    g.fillStyle(0xf6d54c, 1);
    g.fillRoundedRect(8, 8, 48, 22, 6);
    g.lineStyle(3, 0x272727, 1);
    g.strokeRoundedRect(8, 8, 48, 22, 6);
    g.generateTexture('warning', 64, 64);
    g.clear();

    this.makeCircleTexture('shadow', 74, 0x000000, 0.18);
    this.makePlayerTexture('player-down', 'down', false);
    this.makePlayerTexture('player-down-walk', 'down', true);
    this.makePlayerTexture('player-up', 'up', false);
    this.makePlayerTexture('player-up-walk', 'up', true);
    this.makePlayerTexture('player-left', 'left', false);
    this.makePlayerTexture('player-left-walk', 'left', true);
    this.makePlayerTexture('player-right', 'right', false);
    this.makePlayerTexture('player-right-walk', 'right', true);

    g.destroy();
  }

  makeCircleTexture(key, size, color, alpha) {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(color, alpha);
    g.fillEllipse(size / 2, size / 2, size, size * 0.58);
    g.generateTexture(key, size, size);
    g.destroy();
  }

  makePlayerTexture(key, dir, walking) {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    const body = 0x7fd2e8;
    const belly = 0xe8faff;
    const shoes = 0x1698e6;
    const eye = 0x121212;

    if (dir === 'up') {
      g.fillStyle(body, 1);
      g.fillEllipse(32, 28, 42, 48);
      g.fillTriangle(14, 30, 5, 24, 7, 40);
      g.fillTriangle(50, 30, 59, 24, 57, 40);
      g.fillStyle(belly, 1);
      g.fillEllipse(32, 38, 20, 14);
    } else if (dir === 'left') {
      g.fillStyle(body, 1);
      g.fillEllipse(35, 28, 42, 48);
      g.fillTriangle(18, 31, 7, 24, 9, 40);
      g.fillTriangle(48, 31, 56, 24, 54, 39);
      g.fillStyle(belly, 1);
      g.fillEllipse(35, 35, 22, 18);
      g.fillStyle(eye, 1);
      g.fillCircle(25, 23, 5);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(26, 22, 1.6);
    } else if (dir === 'right') {
      g.fillStyle(body, 1);
      g.fillEllipse(29, 28, 42, 48);
      g.fillTriangle(16, 31, 8, 24, 10, 39);
      g.fillTriangle(46, 31, 57, 24, 55, 40);
      g.fillStyle(belly, 1);
      g.fillEllipse(29, 35, 22, 18);
      g.fillStyle(eye, 1);
      g.fillCircle(39, 23, 5);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(40, 22, 1.6);
    } else {
      g.fillStyle(body, 1);
      g.fillEllipse(32, 28, 42, 48);
      g.fillTriangle(14, 30, 4, 24, 6, 40);
      g.fillTriangle(50, 30, 60, 24, 58, 40);
      g.fillStyle(belly, 1);
      g.fillEllipse(32, 35, 28, 21);
      g.fillStyle(eye, 1);
      g.fillCircle(22, 24, 5);
      g.fillCircle(42, 24, 5);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(23, 23, 1.7);
      g.fillCircle(43, 23, 1.7);
      g.fillStyle(0x111111, 1);
      g.fillCircle(29, 29, 1.2);
      g.fillCircle(35, 29, 1.2);
      g.fillStyle(0xff8f78, 1);
      g.fillEllipse(32, 36, 10, 6);
    }

    const leftX = walking ? 18 : 17;
    const rightX = walking ? 35 : 34;
    const leftY = walking ? 54 : 56;
    const rightY = walking ? 56 : 56;
    g.fillStyle(shoes, 1);
    g.fillRoundedRect(leftX, leftY, 14, 10, 3);
    g.fillRoundedRect(rightX, rightY, 14, 10, 3);
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(leftX - 1, leftY + 7, 16, 4, 2);
    g.fillRoundedRect(rightX - 1, rightY + 7, 16, 4, 2);
    g.lineStyle(1.5, 0xffffff, 1);
    g.beginPath();
    g.moveTo(leftX + 3, leftY + 3); g.lineTo(leftX + 11, leftY + 3);
    g.moveTo(rightX + 3, rightY + 3); g.lineTo(rightX + 11, rightY + 3);
    g.strokePath();

    g.generateTexture(key, 64, 72);
    g.destroy();
  }

  drawMap() {
    const cols = Math.ceil(WORLD_WIDTH / 64);
    const rows = Math.ceil(WORLD_HEIGHT / 64);

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const key = y < 4 ? 'water' : 'sand';
        this.add.image(x * 64 + 32, y * 64 + 32, key);
      }
    }

    for (let y = 14; y < 22; y++) {
      for (let x = 0; x < 9; x++) {
        this.add.image(x * 64 + 32, y * 64 + 32, 'grass');
      }
    }

    for (let x = 7; x < 29; x++) {
      this.add.image(x * 64 + 32, 560, 'boardwalk');
      this.add.image(x * 64 + 32, 624, 'boardwalk');
    }

    [[220,390],[360,710],[500,980],[780,330],[1110,1040],[1480,430],[1720,1000],[1940,780],[1600,1210]].forEach(([x,y]) => {
      this.add.image(x, y + 18, 'shadow').setScale(0.8).setAlpha(0.18);
      const palm = this.obstacles.create(x, y, 'palm');
      palm.body.setSize(28, 26).setOffset(18, 30);
      palm.refreshBody();
    });

    [[930,880],[995,920],[1060,865],[1225,320],[1290,365],[1605,1165]].forEach(([x,y]) => {
      this.add.image(x, y + 12, 'shadow').setScale(0.56).setAlpha(0.16);
      const rock = this.obstacles.create(x, y, 'rock');
      rock.body.setCircle(14, 18, 18);
      rock.refreshBody();
    });

    this.drawUmbrella(430, 530, 0xff5d92);
    this.drawUmbrella(640, 760, 0x4b8aff);
    this.drawUmbrella(1440, 670, 0x6bd66f);
    this.drawUmbrella(1760, 560, 0xffd260);

    this.add.image(1080, 520, 'portal');
    this.add.text(1080, 466, 'Mini Games', {
      fontFamily: 'Arial',
      fontSize: '24px',
      color: '#ffffff',
      stroke: '#112035',
      strokeThickness: 6
    }).setOrigin(0.5);

    this.add.text(320, 520, 'Los Tralaleritos Beach', {
      fontFamily: 'Arial',
      fontSize: '28px',
      color: '#ffffff',
      stroke: '#112035',
      strokeThickness: 6
    }).setOrigin(0.5);
  }

  drawUmbrella(x, y, color) {
    const g = this.add.graphics();
    g.fillStyle(0x7a502f, 1);
    g.fillRect(x - 3, y, 6, 42);
    g.fillStyle(color, 1);
    g.fillCircle(x, y - 8, 32);
    g.fillStyle(0xffffff, 0.18);
    g.fillCircle(x - 10, y - 16, 10);
  }

  createLockedAreas() {
    const areas = [
      { x: 1860, y: 1120, title: 'Coming Soon', subtitle: 'Coral City' },
      { x: 1750, y: 250, title: 'Coming Soon', subtitle: 'Boardwalk Hub' },
      { x: 260, y: 1190, title: 'Coming Soon', subtitle: 'Dune Arena' }
    ];

    areas.forEach(a => {
      this.add.rectangle(a.x, a.y, 260, 180, 0x000000, 0.16).setStrokeStyle(4, 0xffbf3b, 0.7);
      [-64, 0, 64].forEach(offset => {
        const barrier = this.obstacles.create(a.x + offset, a.y + 20, 'barrier');
        barrier.refreshBody();
      });
      const sign = this.obstacles.create(a.x, a.y - 16, 'warning');
      sign.refreshBody();
      this.add.text(a.x, a.y - 74, a.title, {
        fontFamily: 'Arial',
        fontSize: '24px',
        color: '#ffd861',
        stroke: '#201208',
        strokeThickness: 5
      }).setOrigin(0.5);
      this.add.text(a.x, a.y - 42, a.subtitle, {
        fontFamily: 'Arial',
        fontSize: '18px',
        color: '#ffffff',
        stroke: '#112035',
        strokeThickness: 4
      }).setOrigin(0.5);
    });
  }

  createPlayer() {
    this.playerShadow = this.add.image(680, 860, 'shadow').setScale(0.65).setAlpha(0.2);
    this.player = this.physics.add.sprite(680, 860, 'player-down');
    this.player.setCollideWorldBounds(true);
    this.player.body.setSize(28, 20).setOffset(18, 46);
    this.physics.add.collider(this.player, this.obstacles);
    this.facing = 'down';
    this.walkElapsed = 0;
  }

  createUI() {
    this.topPanel = this.add.rectangle(0, 0, this.scale.width, 88, 0x0c1627, 0.82)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(999);

    this.titleText = this.add.text(24, 18, 'LOS TRALALERITOS BEACH HUB', {
      fontFamily: 'Arial',
      fontSize: '28px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setScrollFactor(0).setDepth(1000);

    this.helpText = this.add.text(24, 50, 'WASD / Arrows • Mobile joystick • Future areas are locked', {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: '#a8c4ff'
    }).setScrollFactor(0).setDepth(1000);

    this.zoneText = this.add.text(this.scale.width - 24, 24, 'Starter map', {
      fontFamily: 'Arial',
      fontSize: '20px',
      color: '#ffd861',
      fontStyle: 'bold'
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(1000);

    this.hintText = this.add.text(this.scale.width / 2, this.scale.height - 42, '', {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#ffffff',
      stroke: '#112035',
      strokeThickness: 5
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1000);

    const isTouch = this.sys.game.device.input.touch;
    this.joyBase = this.add.circle(120, this.scale.height - 120, 56, 0xffffff, 0.12)
      .setScrollFactor(0).setDepth(1000).setVisible(isTouch);
    this.joyThumb = this.add.circle(120, this.scale.height - 120, 28, 0xffffff, 0.22)
      .setScrollFactor(0).setDepth(1001).setVisible(isTouch);
    this.goButton = this.add.circle(this.scale.width - 92, this.scale.height - 116, 42, 0x66a6ff, 0.22)
      .setScrollFactor(0).setDepth(1000).setVisible(isTouch);
    this.goText = this.add.text(this.scale.width - 92, this.scale.height - 116, 'GO', {
      fontFamily: 'Arial',
      fontSize: '22px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001).setVisible(isTouch);
  }

  updateFixedUI() {
    this.topPanel.width = this.scale.width;
    this.zoneText.setPosition(this.scale.width - 24, 24);
    this.hintText.setPosition(this.scale.width / 2, this.scale.height - 42);
    if (this.joyBase) {
      this.joyBase.setPosition(120, this.scale.height - 120);
      this.joyThumb.setPosition(120, this.scale.height - 120);
      this.goButton.setPosition(this.scale.width - 92, this.scale.height - 116);
      this.goText.setPosition(this.scale.width - 92, this.scale.height - 116);
    }
  }

  applyResponsiveZoom() {
    const sw = this.scale.width;
    if (sw < 500) this.cameras.main.setZoom(0.78);
    else if (sw < 900) this.cameras.main.setZoom(0.95);
    else this.cameras.main.setZoom(1.12);
  }

  createControls() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D');
    this.joystick = new Phaser.Math.Vector2(0, 0);
    this.touchActive = false;
    this.touchOrigin = new Phaser.Math.Vector2(0, 0);

    this.input.on('pointerdown', (pointer) => {
      if (!this.sys.game.device.input.touch) return;
      if (pointer.x < this.scale.width * 0.45) {
        this.touchActive = true;
        this.touchOrigin.set(pointer.x, pointer.y);
        this.joystick.set(0, 0);
        this.joyBase.setPosition(pointer.x, pointer.y);
        this.joyThumb.setPosition(pointer.x, pointer.y);
      }
    });

    this.input.on('pointermove', (pointer) => {
      if (!this.touchActive || !pointer.isDown) return;
      const dx = pointer.x - this.touchOrigin.x;
      const dy = pointer.y - this.touchOrigin.y;
      const dist = Math.min(Math.sqrt(dx*dx + dy*dy), 44);
      const angle = Math.atan2(dy, dx);
      this.joystick.set(Math.cos(angle) * dist / 44, Math.sin(angle) * dist / 44);
      this.joyThumb.setPosition(this.touchOrigin.x + Math.cos(angle) * dist, this.touchOrigin.y + Math.sin(angle) * dist);
    });

    this.input.on('pointerup', () => {
      if (!this.sys.game.device.input.touch) return;
      this.touchActive = false;
      this.joystick.set(0, 0);
      this.joyThumb.setPosition(this.joyBase.x, this.joyBase.y);
    });
  }

  update(time, delta) {
    const keyboardX = (this.cursors.left.isDown || this.keys.A.isDown ? -1 : 0) + (this.cursors.right.isDown || this.keys.D.isDown ? 1 : 0);
    const keyboardY = (this.cursors.up.isDown || this.keys.W.isDown ? -1 : 0) + (this.cursors.down.isDown || this.keys.S.isDown ? 1 : 0);

    let moveX = keyboardX;
    let moveY = keyboardY;
    if (this.sys.game.device.input.touch && this.joystick.length() > 0.05) {
      moveX = this.joystick.x;
      moveY = this.joystick.y;
    }

    const v = new Phaser.Math.Vector2(moveX, moveY);
    if (v.length() > 1) v.normalize();

    this.player.setVelocity(v.x * PLAYER_SPEED, v.y * PLAYER_SPEED);
    this.playerShadow.setPosition(this.player.x, this.player.y + 28);

    if (v.length() > 0.03) {
      this.walkElapsed += delta;
      if (Math.abs(v.x) > Math.abs(v.y)) this.facing = v.x > 0 ? 'right' : 'left';
      else this.facing = v.y > 0 ? 'down' : 'up';
      const walk = Math.floor(this.walkElapsed / 180) % 2 === 0 ? '' : '-walk';
      this.player.setTexture(`player-${this.facing}${walk}`);
    } else {
      this.player.setTexture(`player-${this.facing}`);
    }

    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, 1080, 520) < 110) {
      this.hintText.setText('Mini Games portal • Coming next');
    } else if (this.player.x > 1650 && this.player.y < 360) {
      this.hintText.setText('Boardwalk Hub • Locked for now');
    } else if (this.player.x > 1710 && this.player.y > 1020) {
      this.hintText.setText('Coral City • Locked for now');
    } else if (this.player.x < 380 && this.player.y > 1070) {
      this.hintText.setText('Dune Arena • Locked for now');
    } else {
      this.hintText.setText('');
    }
  }
}

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#0d1524',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: false
    }
  },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: [BeachHubScene]
};

new Phaser.Game(config);
