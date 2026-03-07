
const socket = io();
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const dpr = Math.min(window.devicePixelRatio || 1, 2);

const ui = {
  menu: document.getElementById("menu"),
  joinBtn: document.getElementById("joinBtn"),
  nameInput: document.getElementById("nameInput"),
  skinPrev: document.getElementById("skinPrev"),
  skinNext: document.getElementById("skinNext"),
  skinPreview: document.getElementById("skinPreview"),
  skinName: document.getElementById("skinName"),
  skinStatus: document.getElementById("skinStatus"),
  skinDots: document.getElementById("skinDots"),
  hud: document.getElementById("hud"),
  hudName: document.getElementById("hudName"),
  portraitAvatar: document.getElementById("portraitAvatar"),
  coinCount: document.getElementById("coinCount"),
  cellCount: document.getElementById("cellCount"),
  leaderboard: document.getElementById("leaderboard"),
  chatLog: document.getElementById("chatLog"),
  chatInput: document.getElementById("chatInput"),
  chatSend: document.getElementById("chatSend"),
  settingsBtn: document.getElementById("settingsBtn"),
  settingsPanel: document.getElementById("settingsPanel"),
  closeSettings: document.getElementById("closeSettings"),
  joystick: document.getElementById("joystick"),
  joystickKnob: document.getElementById("joystickKnob"),
  bgm: document.getElementById("bgm")
};

const fallbackSkins = [
  { id: "aqua", name: "Aqua", color: "#39B8FF", accent: "#8EDCFF", unlocked: true },
  { id: "lime", name: "Lime", color: "#5EDB2A", accent: "#A7FF8A", unlocked: true },
  { id: "sunset", name: "Sunset", color: "#FF8B3D", accent: "#FFD06B", unlocked: true },
  { id: "void-1", name: "Coming Soon", color: "#1E2430", accent: "#FFFFFF", unlocked: false },
  { id: "void-2", name: "Coming Soon", color: "#1E2430", accent: "#FFFFFF", unlocked: false },
  { id: "void-3", name: "Coming Soon", color: "#1E2430", accent: "#FFFFFF", unlocked: false }
];

const state = {
  joined: false,
  myId: null,
  config: { grid: { w: 72, h: 42 }, skins: fallbackSkins },
  world: { grid: { w: 72, h: 42 }, players: [], leaderboard: [] },
  selectedSkin: 0,
  dir: "right"
};

function getSkins() {
  return state.config.skins?.length ? state.config.skins : fallbackSkins;
}

function resize() {
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";
}
resize();
window.addEventListener("resize", resize);

function sanitizeName(v) {
  return String(v || "").replace(/[^a-zA-Z0-9 _-]/g, "").trim().slice(0, 14);
}

function makeSkinCard(skin) {
  const el = document.createElement("div");
  el.style.cssText = `
    width:100%;height:100%;border-radius:26px;position:relative;
    background:linear-gradient(135deg, ${skin.color}, ${skin.accent});
    box-shadow: inset 0 1px 0 rgba(255,255,255,.35), 0 18px 30px rgba(0,0,0,.22);
    overflow:hidden;
  `;
  el.innerHTML = `
    <div style="position:absolute;left:20px;top:16px;width:64px;height:64px;border-radius:18px;background:rgba(255,255,255,.14);"></div>
    <div style="position:absolute;left:40px;top:38px;width:56px;height:56px;border-radius:18px;background:rgba(0,0,0,.18);transform:rotate(12deg);"></div>
    <div style="position:absolute;right:14px;bottom:14px;width:58px;height:14px;border-radius:20px;background:rgba(255,255,255,.2);"></div>
    ${skin.unlocked ? "" : '<div style="position:absolute;inset:0;display:grid;place-items:center;color:white;font-size:42px;background:rgba(0,0,0,.35)">🔒</div>'}
  `;
  return el;
}

function updateSkinUI() {
  const skin = getSkins()[state.selectedSkin];
  ui.skinPreview.innerHTML = "";
  ui.skinPreview.appendChild(makeSkinCard(skin));
  ui.skinName.textContent = skin.name;
  ui.skinStatus.textContent = skin.unlocked ? "Starter skin" : "Locked · coming soon";
  ui.skinDots.innerHTML = "";
  getSkins().forEach((_, i) => {
    const dot = document.createElement("div");
    dot.className = "dot" + (i === state.selectedSkin ? " active" : "");
    ui.skinDots.appendChild(dot);
  });
}
function moveSkin(d) {
  state.selectedSkin = (state.selectedSkin + d + getSkins().length) % getSkins().length;
  updateSkinUI();
}
ui.skinPrev.addEventListener("click", () => moveSkin(-1));
ui.skinNext.addEventListener("click", () => moveSkin(1));
updateSkinUI();

function addChat(text, system = false) {
  const row = document.createElement("div");
  row.style.marginBottom = "8px";
  row.style.color = system ? "#91b5d9" : "#ffffff";
  row.textContent = text;
  ui.chatLog.appendChild(row);
  ui.chatLog.scrollTop = ui.chatLog.scrollHeight;
}

function renderPortrait() {
  ui.portraitAvatar.innerHTML = "";
  ui.portraitAvatar.appendChild(makeSkinCard(getSkins()[state.selectedSkin]));
}

function renderLeaderboard() {
  ui.leaderboard.innerHTML = `<div style="font-weight:900;font-size:18px;margin:0 0 8px">Leaderboard</div>`;
  state.world.leaderboard.forEach((row) => {
    const el = document.createElement("div");
    el.className = "lb-row" + (row.id === state.myId ? " you" : "");
    el.innerHTML = `
      <div>${row.rank}</div>
      <div style="display:flex;align-items:center;gap:8px;min-width:0">
        <div class="lb-color" style="background:${row.color}"></div>
        <div class="lb-name">${row.name}${row.id === state.myId ? " you" : ""}</div>
      </div>
      <div>${row.score}</div>
    `;
    ui.leaderboard.appendChild(el);
  });
}

ui.joinBtn.addEventListener("click", () => {
  const skin = getSkins()[state.selectedSkin];
  if (!skin.unlocked) return;
  socket.emit("join", { name: sanitizeName(ui.nameInput.value) || "Guest", skinId: skin.id });
});
ui.nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    ui.joinBtn.click();
  }
});
ui.chatSend.addEventListener("click", sendChat);
ui.chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendChat();
  }
  if (e.key === "Escape") ui.chatInput.blur();
});
ui.settingsBtn.addEventListener("click", () => ui.settingsPanel.classList.toggle("hidden"));
ui.closeSettings.addEventListener("click", () => ui.settingsPanel.classList.add("hidden"));

function sendChat() {
  const text = ui.chatInput.value.trim();
  if (!text) return;
  socket.emit("chat", { text });
  ui.chatInput.value = "";
}

socket.on("config", (config) => {
  state.config = config;
  updateSkinUI();
});
socket.on("joinError", ({ message }) => alert(message || "Join failed"));
socket.on("joined", ({ id }) => {
  state.myId = id;
  state.joined = true;
  ui.menu.classList.add("hidden");
  ui.hud.classList.remove("hidden");
  ui.hudName.textContent = sanitizeName(ui.nameInput.value) || "Guest";
  renderPortrait();
  ui.bgm.volume = 0.15;
  ui.bgm.play().catch(() => {});
});
socket.on("systemMessage", ({ text }) => addChat(text, true));
socket.on("chatMessage", ({ from, text }) => addChat(`${from}: ${text}`));
socket.on("state", (world) => {
  state.world = world;
  const me = world.players.find(p => p.id === state.myId);
  if (me) {
    ui.coinCount.textContent = me.coins;
    ui.cellCount.textContent = me.score;
  }
  renderLeaderboard();
});

let joy = { active:false, x:0, y:0, id:null };
ui.joystick.addEventListener("pointerdown", (e) => {
  joy.active = true;
  joy.id = e.pointerId;
  ui.joystick.setPointerCapture(e.pointerId);
});
ui.joystick.addEventListener("pointermove", (e) => {
  if (!joy.active || e.pointerId !== joy.id) return;
  const rect = ui.joystick.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let dx = e.clientX - cx;
  let dy = e.clientY - cy;
  const max = rect.width * 0.28;
  const len = Math.hypot(dx, dy) || 1;
  if (len > max) { dx = dx / len * max; dy = dy / len * max; }
  joy.x = dx / max;
  joy.y = dy / max;
  ui.joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
});
function resetJoy() {
  joy = { active:false, x:0, y:0, id:null };
  ui.joystickKnob.style.transform = "translate(-50%, -50%)";
}
ui.joystick.addEventListener("pointerup", resetJoy);
ui.joystick.addEventListener("pointercancel", resetJoy);

const keyToDir = { w:"up", ArrowUp:"up", s:"down", ArrowDown:"down", a:"left", ArrowLeft:"left", d:"right", ArrowRight:"right" };
window.addEventListener("keydown", (e) => {
  if (!state.joined) return;
  if (document.activeElement === ui.chatInput) return;
  if (e.key === "Enter") {
    e.preventDefault();
    ui.chatInput.focus();
    return;
  }
  const dir = keyToDir[e.key];
  if (!dir) return;
  e.preventDefault();
  socket.emit("input", { dir });
});
setInterval(() => {
  if (!state.joined || !joy.active) return;
  const ax = Math.abs(joy.x), ay = Math.abs(joy.y);
  if (ax < 0.2 && ay < 0.2) return;
  const dir = ax > ay ? (joy.x > 0 ? "right" : "left") : (joy.y > 0 ? "down" : "up");
  socket.emit("input", { dir });
}, 100);

function roundRect(x, y, w, h, r, color) {
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
  ctx.fillStyle = color;
  ctx.fill();
}

function wrapText(text, maxChars = 18) {
  const words = String(text).split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function drawPlayer(px, py, p, cell) {
  const s = cell * 0.82;
  const x = px + cell * 0.09;
  const y = py + cell * 0.09;
  ctx.fillStyle = "rgba(0,0,0,.18)";
  ctx.fillRect(x + 4, y + s - 4, s, 10);
  ctx.fillStyle = p.accent;
  ctx.beginPath();
  ctx.moveTo(x + 10, y + 2);
  ctx.lineTo(x + s - 2, y + 2);
  ctx.lineTo(x + s - 10, y + 10);
  ctx.lineTo(x + 2, y + 10);
  ctx.closePath();
  ctx.fill();
  roundRect(x, y + 8, s, s - 8, 8, p.color);

  if (!p.alive) {
    ctx.fillStyle = "rgba(255,255,255,.65)";
    ctx.font = `700 ${Math.floor(cell * 0.7)}px Inter`;
    ctx.textAlign = "left";
    ctx.fillText("✖", x + s * 0.32, y + s * 0.78);
  }

  ctx.font = `700 ${Math.max(12, Math.floor(cell * 0.45))}px Inter`;
  const text = p.name;
  const tagW = Math.max(54, ctx.measureText(text).width + 18);
  const tagX = x + s / 2 - tagW / 2;
  const tagY = y - 22;
  roundRect(tagX, tagY, tagW, 20, 10, "rgba(255,255,255,.16)");
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  ctx.fillText(text, x + s / 2, tagY + 14);

  if (p.bubble) {
    const lines = wrapText(p.bubble, 20);
    const bubbleW = Math.max(...lines.map(line => ctx.measureText(line).width), 50) + 20;
    const bubbleH = 16 + lines.length * 16;
    const bx = x + s / 2 - bubbleW / 2;
    const by = tagY - bubbleH - 10;
    roundRect(bx, by, bubbleW, bubbleH, 12, "rgba(255,255,255,.92)");
    ctx.fillStyle = "#0B1620";
    lines.forEach((line, i) => ctx.fillText(line, x + s / 2, by + 18 + i * 15));
  }
}

function drawLandmark(x, y, txt, cell, ox, oy) {
  const px = ox + x * cell;
  const py = oy + y * cell;
  roundRect(px, py, cell * 4.3, cell * 1.1, 12, "rgba(8,17,28,.66)");
  ctx.fillStyle = "#fff";
  ctx.font = `700 ${Math.max(12, cell * 0.42)}px Inter`;
  ctx.textAlign = "center";
  ctx.fillText(txt, px + cell * 2.15, py + cell * 0.72);
}

function render() {
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const gridW = state.world.grid?.w || state.config.grid.w;
  const gridH = state.world.grid?.h || state.config.grid.h;
  const cell = Math.min(w / gridW, h / gridH);
  const ox = (w - gridW * cell) / 2;
  const oy = (h - gridH * cell) / 2;

  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#122c31");
  bg.addColorStop(0.5, "#153a35");
  bg.addColorStop(1, "#10222d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "rgba(255,255,255,.02)";
  for (let x = 0; x <= gridW; x++) ctx.fillRect(ox + x * cell, oy, 1, gridH * cell);
  for (let y = 0; y <= gridH; y++) ctx.fillRect(ox, oy + y * cell, gridW * cell, 1);

  for (const p of state.world.players) {
    ctx.fillStyle = p.color + "44";
    for (const k of p.territory) {
      const [x, y] = k.split(",").map(Number);
      ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
    }
    if (p.trail?.length) {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(3, cell * 0.28);
      ctx.lineJoin = "round";
      ctx.beginPath();
      p.trail.forEach((step, i) => {
        const tx = ox + step.x * cell + cell / 2;
        const ty = oy + step.y * cell + cell / 2;
        if (i === 0) ctx.moveTo(tx, ty); else ctx.lineTo(tx, ty);
      });
      ctx.stroke();
    }
  }

  drawLandmark(3, 4, "Gallery", cell, ox, oy);
  drawLandmark(gridW - 8, 5, "Parkour", cell, ox, oy);
  drawLandmark(Math.floor(gridW / 2) - 2, gridH - 4, "Mid Zone", cell, ox, oy);

  for (const p of state.world.players) {
    drawPlayer(ox + p.x * cell, oy + p.y * cell, p, cell);
  }

  requestAnimationFrame(render);
}
render();
