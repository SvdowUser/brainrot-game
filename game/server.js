const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, pingTimeout: 10000, pingInterval: 5000 });

app.use(express.static(path.join(__dirname, 'public')));
app.get('/game', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/health', (req, res) => res.json({ ok: true }));
app.get('/api/status', (req, res) => {
  let total = 0;
  for (const l of lobbies.values()) total += l.players.size;
  res.json({ lobbies: lobbies.size, players: total });
});

// ── CONFIG ──
const COLS = 100, ROWS = 100;
const MAX_PLAYERS = 30;
const BOT_COUNT = 10;        // Bots per lobby
const STEP_MS = 120;         // Faster tick = smoother
const MY_IP = process.env.MY_IP || '89.167.75.175';
const MY_PORT = process.env.PORT || 3000;
const LOBBY_URL = process.env.LOBBY_URL || 'http://46.225.224.163:3000';
const SERVER_ID = `game-${MY_IP}`;

const PLAYER_COLORS = [
  '#3b82f6','#ef4444','#22c55e','#f59e0b','#a855f7','#ec4899',
  '#06b6d4','#84cc16','#f97316','#6366f1','#14b8a6','#e11d48',
  '#0ea5e9','#d946ef','#10b981','#fbbf24','#f43f5e','#8b5cf6',
  '#0891b2','#65a30d','#ea580c','#7c3aed','#0d9488','#be123c',
  '#2563eb','#dc2626','#16a34a','#d97706','#9333ea','#db2777'
];

const BOT_NAMES = ['Tung Sahur','Tralalero','Bombardino','Ballerina','Capuccino',
  'Bombombini','Frigo Camelo','La Vacca','Crocodilo','Brr Brr Patapim'];

// ── SKILLS ──
// 0=Fulmine(Q): speed boost 2 steps/tick for 3s
// 1=Scudo(E): immune to own trail for 4s
// 2=Turbo(R): teleport 4 steps forward instantly
const SKILL_DEFS = [
  { name: 'fulmine', cd: 10, dur: 3 },
  { name: 'scudo',   cd: 14, dur: 5 },
  { name: 'turbo',   cd: 7,  dur: 0 }, // instant
];

// ── GRID HELPERS ──
const gIdx = (x, y) => y * COLS + x;
const cw = (cx, cy) => ({ x: (cx - COLS/2 + .5) * 2.4, z: (cy - ROWS/2 + .5) * 2.4 });

function claimStart(grid, id, cx, cy, r = 3) {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const gx = cx+dx, gy = cy+dy;
    if (gx >= 0 && gx < COLS && gy >= 0 && gy < ROWS) grid[gIdx(gx, gy)] = id;
  }
}

function getSpawn(existing) {
  let best = null, bestD = 0;
  for (let t = 0; t < 100; t++) {
    const x = 8 + Math.floor(Math.random()*(COLS-16)), y = 8 + Math.floor(Math.random()*(ROWS-16));
    let minD = Infinity;
    for (const p of existing) minD = Math.min(minD, Math.hypot(p.x-x, p.y-y));
    if (minD > bestD) { bestD = minD; best = {x, y}; }
  }
  return best || { x: 50, y: 50 };
}

function floodFill(grid, id) {
  const owned = new Set();
  for (let i = 0; i < grid.length; i++) if (grid[i] === id) owned.add(i);
  const vis = new Uint8Array(COLS*ROWS), q = [];
  for (let x = 0; x < COLS; x++) { q.push(gIdx(x,0)); q.push(gIdx(x,ROWS-1)); }
  for (let y = 0; y < ROWS; y++) { q.push(gIdx(0,y)); q.push(gIdx(COLS-1,y)); }
  while (q.length) {
    const i = q.pop();
    if (vis[i] || owned.has(i)) continue;
    vis[i] = 1;
    const x = i%COLS, y = Math.floor(i/COLS);
    if (x>0) q.push(gIdx(x-1,y)); if (x<COLS-1) q.push(gIdx(x+1,y));
    if (y>0) q.push(gIdx(x,y-1)); if (y<ROWS-1) q.push(gIdx(x,y+1));
  }
  const newTiles = [];
  for (let i = 0; i < grid.length; i++) {
    if (!vis[i] && !owned.has(i)) { grid[i] = id; newTiles.push({ x: i%COLS, y: Math.floor(i/COLS) }); }
  }
  return newTiles;
}

// ── LOBBIES ──
const lobbies = new Map();
let lobbyCounter = 0;

function createPlayer(numId, name, color, skin, spawn, isBot = false) {
  return {
    numId, name, color, skin,
    x: spawn.x, y: spawn.y,
    dx: 1, dy: 0,
    trail: [], alive: true, score: 0, isBot,
    // skills
    skillCd: [0, 0, 0],
    skillActive: [false, false, false],
    skillTimer: [0, 0, 0],
    // bot state
    botDir: 0, botTimer: 0,
  };
}

function createLobby() {
  const id = `room-${++lobbyCounter}`;
  const lobby = { id, players: new Map(), grid: new Int16Array(COLS*ROWS).fill(-1), interval: null, colorIndex: 0 };
  lobbies.set(id, lobby);
  // Add bots
  for (let i = 0; i < BOT_COUNT; i++) addBot(lobby);
  return lobby;
}

function addBot(lobby) {
  const numId = lobby.colorIndex++;
  const spawn = getSpawn(Array.from(lobby.players.values()));
  const color = PLAYER_COLORS[numId % PLAYER_COLORS.length];
  const name = BOT_NAMES[numId % BOT_NAMES.length];
  const bot = createPlayer(numId, name, color, Math.floor(Math.random()*6), spawn, true);
  claimStart(lobby.grid, numId, spawn.x, spawn.y);
  lobby.players.set('bot-'+numId, bot);
}

function getAvailableLobby() {
  for (const l of lobbies.values()) if (l.players.size < MAX_PLAYERS) return l;
  return createLobby();
}

// ── BOT AI ──
const DIRS = [{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}];
function botTick(lobby, sid, p) {
  p.botTimer--;
  if (p.botTimer > 0) return;
  p.botTimer = 3 + Math.floor(Math.random()*6);

  // Count own territory around current pos
  const myTiles = [];
  for (let i = 0; i < lobby.grid.length; i++) if (lobby.grid[i] === p.numId) myTiles.push(i);

  // If on own territory and have trail, try to close loop
  const onOwn = lobby.grid[gIdx(p.x, p.y)] === p.numId;
  if (onOwn && p.trail.length > 4) {
    // random direction change
    const validDirs = DIRS.filter(d => {
      const nx = p.x+d.dx, ny = p.y+d.dy;
      return nx>=0&&nx<COLS&&ny>=0&&ny<ROWS && !(d.dx===-p.dx&&d.dy===0) && !(d.dy===-p.dy&&d.dx===0);
    });
    if (validDirs.length) { const d = validDirs[Math.floor(Math.random()*validDirs.length)]; p.dx=d.dx; p.dy=d.dy; }
    return;
  }

  // Move toward empty territory or explore
  const validDirs = DIRS.filter(d => {
    const nx = p.x+d.dx, ny = p.y+d.dy;
    if (nx<0||nx>=COLS||ny<0||ny>=ROWS) return false;
    if (d.dx===-p.dx&&d.dy===0) return false; // no 180
    if (d.dy===-p.dy&&d.dx===0) return false;
    return true;
  });

  // Prefer directions with unclaimed territory
  const scored = validDirs.map(d => {
    let score = 0;
    for (let s = 1; s <= 4; s++) {
      const nx = p.x+d.dx*s, ny = p.y+d.dy*s;
      if (nx<0||nx>=COLS||ny<0||ny>=ROWS) break;
      const cell = lobby.grid[gIdx(nx,ny)];
      if (cell === -1) score += 3;
      else if (cell !== p.numId) score += 1;
      else score -= 1;
    }
    return { d, score };
  });

  scored.sort((a,b) => b.score - a.score);
  if (scored.length) {
    const best = scored[0];
    if (best.score > 0 || Math.random() < 0.3) { p.dx=best.d.dx; p.dy=best.d.dy; }
    else { const d=validDirs[Math.floor(Math.random()*validDirs.length)]; p.dx=d.dx; p.dy=d.dy; }
  }
}

// ── SKILLS SERVER SIDE ──
function tickSkills(p, dt) {
  for (let i = 0; i < 3; i++) {
    if (p.skillActive[i]) { p.skillTimer[i] -= dt; if (p.skillTimer[i] <= 0) p.skillActive[i] = false; }
    if (p.skillCd[i] > 0) p.skillCd[i] = Math.max(0, p.skillCd[i] - dt);
  }
}

function useSkill(lobby, sid, p, skillIdx) {
  const def = SKILL_DEFS[skillIdx];
  if (p.skillCd[skillIdx] > 0 || p.skillActive[skillIdx] || !p.alive) return;
  p.skillCd[skillIdx] = def.cd;
  if (skillIdx === 2) {
    // Turbo: instant teleport 4 steps forward
    const tiles = [], deaths = [];
    for (let s = 0; s < 4; s++) {
      const nx = p.x + p.dx, ny = p.y + p.dy;
      if (nx<0||nx>=COLS||ny<0||ny>=ROWS) break;
      p.x = nx; p.y = ny;
      if (lobby.grid[gIdx(nx,ny)] === p.numId && p.trail.length > 0) {
        p.trail.forEach(t => { lobby.grid[gIdx(t.x,t.y)]=p.numId; tiles.push({x:t.x,y:t.y,color:p.color}); });
        floodFill(lobby.grid, p.numId).forEach(t => tiles.push({x:t.x,y:t.y,color:p.color}));
        p.trail = [];
      } else if (lobby.grid[gIdx(nx,ny)] !== p.numId) {
        p.trail.push({x:nx,y:ny});
      }
    }
    if (tiles.length) io.to(lobby.id).emit('tiles', tiles);
    io.to(lobby.id).emit('skill', { sid, skill: 2, x: p.x, y: p.y });
  } else {
    p.skillActive[skillIdx] = true;
    p.skillTimer[skillIdx] = def.dur;
    io.to(lobby.id).emit('skill', { sid, skill: skillIdx, dur: def.dur });
  }
  const sid2 = sid;
  if (!p.isBot) io.to(sid2).emit('skillCd', { skill: skillIdx, cd: def.cd });
}

// ── GAME STEP ──
function killPlayer(lobby, sid, p, tiles, deaths) {
  if (!p.alive) return;
  p.alive = false;
  p.trail.forEach(t => { if (lobby.grid[gIdx(t.x,t.y)]===p.numId){lobby.grid[gIdx(t.x,t.y)]=-1; tiles.push({x:t.x,y:t.y,color:null});} });
  p.trail = [];
  deaths.push(sid);
}

function stepLobby(lobby) {
  const dt = STEP_MS / 1000;
  const tiles = [], deaths = [], trails = [], positions = [];
  const entries = Array.from(lobby.players.entries());

  for (const [sid, p] of entries) {
    tickSkills(p, dt);
    if (!p.alive) {
      // Auto-respawn bots after 3s
      if (p.isBot) {
        p._deadTimer = (p._deadTimer||0) + dt;
        if (p._deadTimer > 3) {
          const spawn = getSpawn(entries.filter(([,pl])=>pl.alive).map(([,pl])=>pl));
          p.x=spawn.x; p.y=spawn.y; p.trail=[]; p.alive=true; p._deadTimer=0;
          claimStart(lobby.grid, p.numId, spawn.x, spawn.y);
          const colorMap={};for(const[,pl]of lobby.players)colorMap[pl.numId]=pl.color;
          io.to(lobby.id).emit('playerRespawned',{sid,x:p.x,y:p.y,skin:p.skin});
        }
      }
      continue;
    }

    // Bot AI
    if (p.isBot) botTick(lobby, sid, p);

    // Fulmine: double step
    const steps = (p.skillActive[0]) ? 2 : 1;

    for (let s = 0; s < steps; s++) {
      if (!p.alive) break;
      const nx = p.x + p.dx, ny = p.y + p.dy;
      if (nx<0||nx>=COLS||ny<0||ny>=ROWS) { killPlayer(lobby,sid,p,tiles,deaths); break; }

      // Self-trail collision (Scudo protects)
      if (!p.skillActive[1] && p.trail.some(t=>t.x===nx&&t.y===ny)) { killPlayer(lobby,sid,p,tiles,deaths); break; }

      // Enemy cuts your trail
      for (const [oid,op] of lobby.players) {
        if (oid!==sid && op.alive && !op.skillActive[1] && op.trail.some(t=>t.x===p.x&&t.y===p.y)) {
          killPlayer(lobby,oid,op,tiles,deaths);
        }
      }

      if (!p.alive) break;
      p.x=nx; p.y=ny;

      const cell = lobby.grid[gIdx(nx,ny)];
      if (cell===p.numId && p.trail.length>0) {
        p.trail.forEach(t=>{lobby.grid[gIdx(t.x,t.y)]=p.numId; tiles.push({x:t.x,y:t.y,color:p.color});});
        floodFill(lobby.grid,p.numId).forEach(t=>tiles.push({x:t.x,y:t.y,color:p.color}));
        p.trail=[];
        trails.push({sid,trail:[],clear:true});
      } else if (cell!==p.numId) {
        p.trail.push({x:nx,y:ny});
        trails.push({sid,trail:p.trail.slice()});
      }
    }

    positions.push({sid,x:p.x,y:p.y,alive:p.alive});
  }

  // Update scores
  const tot=COLS*ROWS, counts={};
  for (let i=0;i<lobby.grid.length;i++){const o=lobby.grid[i]; if(o>=0)counts[o]=(counts[o]||0)+1;}
  const scores=[];
  for(const[sid,p]of lobby.players){p.score=(counts[p.numId]||0)/tot*100; scores.push({sid,score:p.score});}

  io.to(lobby.id).emit('step',{positions,tiles,deaths,trails,scores});
}

// ── SOCKET ──
io.on('connection', socket => {
  socket.on('join', ({name, skin}) => {
    const lobby = getAvailableLobby();
    const existing = Array.from(lobby.players.values());
    const spawn = getSpawn(existing);
    const numId = lobby.colorIndex++;
    const color = PLAYER_COLORS[numId % PLAYER_COLORS.length];
    const player = createPlayer(numId, (name||'Anonimo').substring(0,16), color, skin||0, spawn);
    claimStart(lobby.grid, numId, spawn.x, spawn.y);
    lobby.players.set(socket.id, player);
    socket.join(lobby.id);
    socket.data.lobbyId = lobby.id;

    const colorMap={};for(const p of lobby.players.values())colorMap[p.numId]=p.color;
    const gridTiles=[];
    for(let i=0;i<lobby.grid.length;i++){const o=lobby.grid[i]; if(o>=0&&colorMap[o])gridTiles.push({x:i%COLS,y:Math.floor(i/COLS),color:colorMap[o]});}
    const playerList=Array.from(lobby.players.entries()).map(([sid,p])=>({sid,numId:p.numId,name:p.name,x:p.x,y:p.y,color:p.color,skin:p.skin,alive:p.alive,score:p.score,trail:p.trail,isBot:p.isBot}));

    socket.emit('init',{mySid:socket.id,myNumId:numId,myColor:color,lobbyId:lobby.id,cols:COLS,rows:ROWS,grid:gridTiles,players:playerList,stepMs:STEP_MS});
    socket.to(lobby.id).emit('playerJoined',{sid:socket.id,numId,name:player.name,x:player.x,y:player.y,color,skin:player.skin,alive:true,score:0,trail:[]});
    if(!lobby.interval) lobby.interval=setInterval(()=>stepLobby(lobby),STEP_MS);
    console.log(`${player.name} joined ${lobby.id} (${lobby.players.size}/${MAX_PLAYERS})`);
  });

  socket.on('dir', ({dx,dy}) => {
    const lobby=lobbies.get(socket.data.lobbyId); if(!lobby)return;
    const p=lobby.players.get(socket.id); if(!p||!p.alive)return;
    if(dx===-p.dx&&dy===0)return; if(dy===-p.dy&&dx===0)return;
    p.dx=dx; p.dy=dy;
  });

  socket.on('skill', ({skill}) => {
    const lobby=lobbies.get(socket.data.lobbyId); if(!lobby)return;
    const p=lobby.players.get(socket.id); if(!p)return;
    useSkill(lobby, socket.id, p, skill);
  });

  socket.on('respawn', ({skin}) => {
    const lobby=lobbies.get(socket.data.lobbyId); if(!lobby)return;
    const p=lobby.players.get(socket.id); if(!p||p.alive)return;
    const spawn=getSpawn(Array.from(lobby.players.values()).filter(x=>x.alive));
    p.x=spawn.x; p.y=spawn.y; p.dx=1; p.dy=0; p.trail=[]; p.alive=true;
    if(skin!==undefined)p.skin=skin;
    claimStart(lobby.grid,p.numId,p.x,p.y);
    const colorMap={};for(const pl of lobby.players.values())colorMap[pl.numId]=pl.color;
    const gridTiles=[];for(let i=0;i<lobby.grid.length;i++){const o=lobby.grid[i]; if(o>=0&&colorMap[o])gridTiles.push({x:i%COLS,y:Math.floor(i/COLS),color:colorMap[o]});}
    socket.emit('respawned',{x:p.x,y:p.y,grid:gridTiles});
    io.to(lobby.id).emit('playerRespawned',{sid:socket.id,x:p.x,y:p.y,skin:p.skin});
  });

  socket.on('disconnect', () => {
    const lobby=lobbies.get(socket.data.lobbyId); if(!lobby)return;
    const p=lobby.players.get(socket.id); if(p)console.log(`${p.name} left`);
    lobby.players.delete(socket.id);
    io.to(lobby.id).emit('playerLeft',socket.id);
    // Keep lobby alive for bots, only delete if no bots either
    const hasPlayers = Array.from(lobby.players.values()).some(p=>!p.isBot);
    if(!hasPlayers){clearInterval(lobby.interval);lobby.interval=null;lobbies.delete(lobby.id);}
  });
});

// ── LOBBY REGISTRATION ──
const httpMod = require('http');
function lobbyPost(path2, body) {
  try {
    const url = new URL(LOBBY_URL+path2), data=JSON.stringify(body);
    const req=httpMod.request({hostname:url.hostname,port:url.port||80,path:url.pathname,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}},()=>{});
    req.on('error',()=>{});req.write(data);req.end();
  } catch{}
}
async function register(){
  lobbyPost('/api/register',{id:SERVER_ID,ip:MY_IP,port:MY_PORT,lobbies:lobbies.size,maxLobbies:10});
  console.log('Registered with lobby');
}

server.listen(MY_PORT,()=>{
  console.log(`🎮 Game server on port ${MY_PORT}`);
  register();
  setInterval(()=>{
    let total=0;for(const l of lobbies.values())total+=l.players.size;
    lobbyPost('/api/heartbeat',{id:SERVER_ID,lobbies:lobbies.size,players:total});
  },10000);
});
