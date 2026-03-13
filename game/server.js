const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingTimeout: 10000,
  pingInterval: 5000
});

app.use(express.static(path.join(__dirname, 'public')));

// ── CONFIG ──
const COLS = 100, ROWS = 100;
const MAX_PLAYERS = 30;
const STEP_MS = 280;
const MY_IP = process.env.MY_IP || '89.167.75.175';
const MY_PORT = process.env.PORT || 3000;
const LOBBY_URL = process.env.LOBBY_URL || 'http://46.225.224.163:3000';
const SERVER_ID = `game-${MY_IP}`;

const PLAYER_COLORS = [
  '#3b82f6','#ef4444','#22c55e','#f59e0b','#a855f7','#ec4899',
  '#06b6d4','#84cc16','#f97316','#6366f1','#14b8a6','#e11d48',
  '#0ea5e9','#d946ef','#10b981','#fbbf24','#f43f5e','#8b5cf6',
  '#0891b2','#65a30d','#ea580c','#7c3aed','#0d9488','#be123c'
];

// ── REGISTER WITH LOBBY ──
const http2 = require('http');
function lobbyRequest(method, path, body) {
  return new Promise((resolve) => {
    try {
      const url = new URL(LOBBY_URL + path);
      const data = body ? JSON.stringify(body) : null;
      const options = {
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname,
        method,
        headers: { 'Content-Type': 'application/json', 'Content-Length': data ? Buffer.byteLength(data) : 0 }
      };
      const req = http2.request(options, res => { resolve(true); });
      req.on('error', () => resolve(false));
      if (data) req.write(data);
      req.end();
    } catch { resolve(false); }
  });
}

async function registerWithLobby() {
  const ok = await lobbyRequest('POST', '/api/register', {
    id: SERVER_ID,
    ip: MY_IP,
    port: MY_PORT,
    lobbies: lobbies.size,
    maxLobbies: 10
  });
  if (ok) console.log('✅ Registered with lobby server');
  else console.log('⚠️ Could not reach lobby server - running standalone');
}

async function sendHeartbeat() {
  let totalPlayers = 0;
  for (const l of lobbies.values()) totalPlayers += l.players.size;
  await lobbyRequest('POST', '/api/heartbeat', {
    id: SERVER_ID,
    lobbies: lobbies.size,
    players: totalPlayers
  });
}

// ── LOBBIES ──
const lobbies = new Map();
let lobbyCounter = 0;

function createLobby() {
  const id = `room-${++lobbyCounter}`;
  const lobby = { id, players: new Map(), grid: new Int16Array(COLS * ROWS).fill(-1), interval: null, colorIndex: 0 };
  lobbies.set(id, lobby);
  return lobby;
}

function getAvailableLobby() {
  for (const l of lobbies.values()) if (l.players.size < MAX_PLAYERS) return l;
  return createLobby();
}

// ── GRID HELPERS ──
function gIdx(x,y){return y*COLS+x;}
function cw(cx,cy){return{x:(cx-COLS/2+.5)*2.4,z:(cy-ROWS/2+.5)*2.4};}

function claimStart(grid,id,cx,cy,r=3){
  for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
    const gx=cx+dx,gy=cy+dy;
    if(gx>=0&&gx<COLS&&gy>=0&&gy<ROWS)grid[gIdx(gx,gy)]=id;
  }
}

function getSpawn(existing){
  let best=null,bestD=0;
  for(let t=0;t<80;t++){
    const x=8+Math.floor(Math.random()*(COLS-16)),y=8+Math.floor(Math.random()*(ROWS-16));
    let minD=Infinity;
    for(const p of existing)minD=Math.min(minD,Math.hypot(p.x-x,p.y-y));
    if(minD>bestD){bestD=minD;best={x,y};}
  }
  return best||{x:50,y:50};
}

function floodFill(grid,id){
  const owned=new Set();
  for(let i=0;i<grid.length;i++)if(grid[i]===id)owned.add(i);
  const vis=new Uint8Array(COLS*ROWS),q=[];
  for(let x=0;x<COLS;x++){q.push(gIdx(x,0));q.push(gIdx(x,ROWS-1));}
  for(let y=0;y<ROWS;y++){q.push(gIdx(0,y));q.push(gIdx(COLS-1,y));}
  while(q.length){
    const i=q.pop();if(vis[i]||owned.has(i))continue;vis[i]=1;
    const x=i%COLS,y=Math.floor(i/COLS);
    if(x>0)q.push(gIdx(x-1,y));if(x<COLS-1)q.push(gIdx(x+1,y));
    if(y>0)q.push(gIdx(x,y-1));if(y<ROWS-1)q.push(gIdx(x,y+1));
  }
  const newTiles=[];
  for(let i=0;i<grid.length;i++)if(!vis[i]&&!owned.has(i)){grid[i]=id;newTiles.push({x:i%COLS,y:Math.floor(i/COLS)});}
  return newTiles;
}

function killPlayer(lobby,sid,p,tiles,deaths){
  if(!p.alive)return;
  p.alive=false;
  p.trail.forEach(t=>{if(lobby.grid[gIdx(t.x,t.y)]===p.numId){lobby.grid[gIdx(t.x,t.y)]=-1;tiles.push({x:t.x,y:t.y,color:null});}});
  p.trail=[];deaths.push(sid);
}

function stepLobby(lobby){
  if(!lobby.players.size)return;
  const tiles=[],deaths=[],trails=[];
  for(const[sid,p]of lobby.players){
    if(!p.alive)continue;
    const nx=p.x+p.dx,ny=p.y+p.dy;
    if(nx<0||nx>=COLS||ny<0||ny>=ROWS){killPlayer(lobby,sid,p,tiles,deaths);continue;}
    if(p.trail.some(t=>t.x===nx&&t.y===ny)){killPlayer(lobby,sid,p,tiles,deaths);continue;}
    for(const[oid,op]of lobby.players)if(oid!==sid&&op.alive&&op.trail.some(t=>t.x===nx&&t.y===ny))killPlayer(lobby,oid,op,tiles,deaths);
    if(!p.alive)continue;
    p.x=nx;p.y=ny;
    const cell=lobby.grid[gIdx(nx,ny)];
    if(cell===p.numId&&p.trail.length>0){
      p.trail.forEach(t=>{lobby.grid[gIdx(t.x,t.y)]=p.numId;tiles.push({x:t.x,y:t.y,color:p.color});});
      floodFill(lobby.grid,p.numId).forEach(t=>tiles.push({x:t.x,y:t.y,color:p.color}));
      trails.push({sid,trail:[],clear:true});p.trail=[];
    }else if(cell!==p.numId){p.trail.push({x:nx,y:ny});trails.push({sid,trail:p.trail.slice()});}
  }
  const tot=COLS*ROWS,counts={};
  for(let i=0;i<lobby.grid.length;i++){const o=lobby.grid[i];if(o>=0)counts[o]=(counts[o]||0)+1;}
  const playerStates=[];
  for(const[sid,p]of lobby.players){p.score=(counts[p.numId]||0)/tot*100;playerStates.push({sid,x:p.x,y:p.y,score:p.score,alive:p.alive});}
  io.to(lobby.id).emit('step',{players:playerStates,tiles,deaths,trails});
}

// ── SOCKET ──
io.on('connection',socket=>{
  socket.on('join',({name,skin})=>{
    const lobby=getAvailableLobby();
    const existing=Array.from(lobby.players.values());
    const spawn=getSpawn(existing);
    const numId=lobby.colorIndex++;
    const color=PLAYER_COLORS[numId%PLAYER_COLORS.length];
    const player={numId,x:spawn.x,y:spawn.y,dx:1,dy:0,trail:[],alive:true,name:(name||'Anonimo').substring(0,16),color,skin:skin||0,score:0};
    claimStart(lobby.grid,numId,spawn.x,spawn.y);
    lobby.players.set(socket.id,player);
    socket.join(lobby.id);
    socket.data.lobbyId=lobby.id;

    const colorMap={};for(const p of lobby.players.values())colorMap[p.numId]=p.color;
    const gridTiles=[];
    for(let i=0;i<lobby.grid.length;i++){const o=lobby.grid[i];if(o>=0&&colorMap[o])gridTiles.push({x:i%COLS,y:Math.floor(i/COLS),color:colorMap[o]});}
    const playerList=Array.from(lobby.players.entries()).map(([sid,p])=>({sid,numId:p.numId,name:p.name,x:p.x,y:p.y,color:p.color,skin:p.skin,alive:p.alive,score:p.score,trail:p.trail}));

    socket.emit('init',{mySid:socket.id,myNumId:numId,myColor:color,lobbyId:lobby.id,cols:COLS,rows:ROWS,grid:gridTiles,players:playerList});
    socket.to(lobby.id).emit('playerJoined',{sid:socket.id,numId,name:player.name,x:player.x,y:player.y,color,skin:player.skin,alive:true,score:0,trail:[]});
    if(!lobby.interval)lobby.interval=setInterval(()=>stepLobby(lobby),STEP_MS);
    console.log(`${player.name} joined ${lobby.id} (${lobby.players.size}/${MAX_PLAYERS})`);
  });

  socket.on('dir',({dx,dy})=>{
    const lobby=lobbies.get(socket.data.lobbyId);if(!lobby)return;
    const p=lobby.players.get(socket.id);if(!p||!p.alive)return;
    if(dx===-p.dx&&dy===0)return;if(dy===-p.dy&&dx===0)return;
    p.dx=dx;p.dy=dy;
  });

  socket.on('respawn',({skin})=>{
    const lobby=lobbies.get(socket.data.lobbyId);if(!lobby)return;
    const p=lobby.players.get(socket.id);if(!p||p.alive)return;
    const spawn=getSpawn(Array.from(lobby.players.values()).filter(x=>x.alive));
    p.x=spawn.x;p.y=spawn.y;p.dx=1;p.dy=0;p.trail=[];p.alive=true;
    if(skin!==undefined)p.skin=skin;
    claimStart(lobby.grid,p.numId,p.x,p.y);
    const colorMap={};for(const pl of lobby.players.values())colorMap[pl.numId]=pl.color;
    const gridTiles=[];for(let i=0;i<lobby.grid.length;i++){const o=lobby.grid[i];if(o>=0&&colorMap[o])gridTiles.push({x:i%COLS,y:Math.floor(i/COLS),color:colorMap[o]});}
    socket.emit('respawned',{x:p.x,y:p.y,grid:gridTiles});
    io.to(lobby.id).emit('playerRespawned',{sid:socket.id,x:p.x,y:p.y,skin:p.skin});
  });

  socket.on('disconnect',()=>{
    const lobby=lobbies.get(socket.data.lobbyId);if(!lobby)return;
    const p=lobby.players.get(socket.id);if(p)console.log(`${p.name} left`);
    lobby.players.delete(socket.id);
    io.to(lobby.id).emit('playerLeft',socket.id);
    if(!lobby.players.size){clearInterval(lobby.interval);lobby.interval=null;lobbies.delete(lobby.id);}
  });
});

app.get('/api/status',(req,res)=>res.json({lobbies:lobbies.size,players:Array.from(lobbies.values()).reduce((a,l)=>a+l.players.size,0)}));
app.get('/health',(req,res)=>res.json({ok:true}));

server.listen(MY_PORT,async()=>{
  console.log(`🎮 Game server on port ${MY_PORT}`);
  await registerWithLobby();
  setInterval(sendHeartbeat,10000);
});
