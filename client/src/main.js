// ── tralala.io ─────────────────────────────────────────────────
const SERVER_URL  = 'http://89.167.75.175:3000';
const PROFILE_KEY = 'tralala-v4';
const GRID = 60;
const NONE = -1;
const TOTAL = GRID * GRID;
const CELL_PX = 48;

const SKINS = [
  { name:'Sun',   colorA:'#f5da5a', colorB:'#c9a800', req:0   },
  { name:'Coral', colorA:'#ff9f9f', colorB:'#c0304a', req:120 },
  { name:'Mint',  colorA:'#93f6dc', colorB:'#1a9e7a', req:260 },
  { name:'Sky',   colorA:'#7ec8f7', colorB:'#1a6bb5', req:500 },
];
const NPC_COLORS = [
  ['#e05c3a','#a33018'],['#3a8fe0','#1a5ab0'],['#3ae07a','#1a9040'],
  ['#9b59b6','#6c3483'],['#e0943a','#a05010'],['#1abc9c','#0e7a64'],
  ['#e0456a','#a01040'],['#34c4d8','#0a7a90'],
];

const canvas = document.getElementById('scene');
const ctx    = canvas.getContext('2d');
const G = id => document.getElementById(id);

let profile = { name:'', best:0, coins:0, skinIndex:0 };
try { profile = {...profile, ...JSON.parse(localStorage.getItem(PROFILE_KEY)||'{}')}; } catch{}
const saveProfile = () => localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));

let skinIndex = profile.skinIndex||0, previewIndex = skinIndex;
G('nameInput').value = profile.name||'';
G('menuCoins').textContent = profile.coins||0;
G('bestScore').textContent = profile.best||0;
applySkin(G('heroCube'), SKINS[skinIndex]);
renderSkinCard();

const owners     = new Int16Array(TOTAL).fill(NONE);
const trailCells = new Uint8Array(TOTAL);
let inGame=false, tutShown=false;
let px=30, pz=30, pdir=0, pendingDir=0;
let score=0, lives=3, coins=0;
let moveTimer=0;
const MOVE_SPEED = 0.13;
let socket=null, myId=null;
let remotePlayers = new Map();
let npcs = [];

G('settingsBtn').addEventListener('click', ()=>G('settingsSheet').classList.remove('hidden'));
G('settingsCloseBtn').addEventListener('click', ()=>G('settingsSheet').classList.add('hidden'));
G('openSkinsBtn').addEventListener('click', ()=>{ G('menuScreen').classList.add('hidden'); G('skinsScreen').classList.remove('hidden'); });
G('skinsBackBtn').addEventListener('click', ()=>{ G('skinsScreen').classList.add('hidden'); G('menuScreen').classList.remove('hidden'); });
G('skinPrevBtn').addEventListener('click', ()=>{ previewIndex=(previewIndex-1+SKINS.length)%SKINS.length; renderSkinCard(); });
G('skinNextBtn').addEventListener('click', ()=>{ previewIndex=(previewIndex+1)%SKINS.length; renderSkinCard(); });
G('skinSelectBtn').addEventListener('click', selectSkin);
G('playBtn').addEventListener('click', startGame);
G('closeTutorialBtn')?.addEventListener('click', ()=>G('tutorialCard')?.classList.add('hidden'));
G('leaderboardToggle')?.addEventListener('click', ()=>G('leaderboardPanel')?.classList.toggle('hidden'));

window.addEventListener('keydown', e => {
  if (!inGame) return;
  const m={ArrowRight:0,d:0,D:0,ArrowDown:1,s:1,S:1,ArrowLeft:2,a:2,A:2,ArrowUp:3,w:3,W:3};
  if (m[e.key]!==undefined){ e.preventDefault(); pendingDir=m[e.key]; }
});

function startGame() {
  const name=(G('nameInput').value||'').trim().slice(0,16)||'Guest';
  profile.name=name; saveProfile();
  owners.fill(NONE); trailCells.fill(0);
  remotePlayers.clear(); npcs=[];
  score=0; lives=3; coins=0;
  px=30; pz=30; pdir=0; pendingDir=0; moveTimer=0;
  for(let dz=-2;dz<=2;dz++) for(let dx=-2;dx<=2;dx++) owners[(pz+dz)*GRID+(px+dx)]=0;
  [[10,10],[50,10],[10,50],[50,50],[30,5],[5,30],[55,30],[30,55]].forEach((pos,i)=>{
    const npc={id:-(i+1),x:pos[0],z:pos[1],dir:i%4,c:NPC_COLORS[i%NPC_COLORS.length]};
    for(let dz=-2;dz<=2;dz++) for(let dx=-2;dx<=2;dx++){
      const gx=pos[0]+dx,gz=pos[1]+dz;
      if(gx>=0&&gx<GRID&&gz>=0&&gz<GRID) owners[gz*GRID+gx]=npc.id;
    }
    npcs.push(npc);
  });
  G('menuScreen').classList.add('hidden');
  G('gameHud').classList.remove('hidden');
  if(!tutShown){ G('tutorialCard')?.classList.remove('hidden'); tutShown=true; }
  inGame=true; refreshHUD();
  connectServer(name);
}

function connectServer(name) {
  if(typeof io==='undefined') return;
  try {
    socket=io(SERVER_URL,{transports:['websocket','polling'],timeout:3000});
    socket.on('connect',()=>{ myId=socket.id; socket.emit('join_game',{name,skinIndex}); });
    socket.on('snapshot',({players})=>{ remotePlayers.clear(); players.forEach(p=>{ if(p.id!==myId) remotePlayers.set(p.id,p); }); });
    socket.on('leaderboard',({rows})=>{ const el=G('leaderboardList'); if(el) el.innerHTML=rows.map((r,i)=>`<li>${i+1}. ${r.name} — ${r.score||0}</li>`).join(''); });
    socket.on('room_info',({count,limit})=>{ const el=G('serverBadge'); if(el) el.textContent=`${count}/${limit} online`; });
    socket.on('connect_error',()=>{ socket=null; });
  } catch{ socket=null; }
}

let lastT=0;
function loop(ts){
  const dt=Math.min((ts-lastT)/1000,0.05); lastT=ts;
  if(inGame){ moveTimer-=dt; if(moveTimer<=0){ moveTimer=MOVE_SPEED; tick(); } }
  render(ts/1000);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
window.addEventListener('resize',resize); resize();

function tick(){
  const opp=[2,3,0,1];
  if(pendingDir!==opp[pdir]) pdir=pendingDir;
  const DX=[1,0,-1,0],DZ=[0,1,0,-1];
  const nx=px+DX[pdir],nz=pz+DZ[pdir];
  if(nx<0||nx>=GRID||nz<0||nz>=GRID) return;
  const idx=nz*GRID+nx,onOwn=owners[idx]===0;
  if(trailCells[idx]){ die(); return; }
  if(owners[pz*GRID+px]===0&&!onOwn) trailCells[pz*GRID+px]=1;
  if(!onOwn) trailCells[idx]=1;
  px=nx; pz=nz;
  if(onOwn&&hasTrail()) capture();
  for(const n of npcs){ if((n.x===px&&n.z===pz)||trailCells[n.z*GRID+n.x]){ die(); return; } }
  if(socket) socket.emit('move',{x:px,z:pz,rot:pdir});
  npcs.forEach(n=>{
    if(Math.random()<0.18) n.dir=(n.dir+(Math.random()<0.5?1:3))%4;
    const nnx=n.x+DX[n.dir],nnz=n.z+DZ[n.dir];
    if(nnx<0||nnx>=GRID||nnz<0||nnz>=GRID){ n.dir=(n.dir+2)%4; return; }
    if(trailCells[nnz*GRID+nnx]){ die(); return; }
    n.x=nnx; n.z=nnz;
    if(Math.random()<0.05) owners[nnz*GRID+nnx]=n.id;
  });
}
function hasTrail(){ return trailCells.some(v=>v===1); }
function capture(){
  for(let i=0;i<TOTAL;i++) if(trailCells[i]){ owners[i]=0; trailCells[i]=0; }
  const outside=new Uint8Array(TOTAL),q=[];
  for(let x=0;x<GRID;x++){ q.push(x); q.push((GRID-1)*GRID+x); }
  for(let z=0;z<GRID;z++){ q.push(z*GRID); q.push(z*GRID+GRID-1); }
  while(q.length){ const i=q.pop(); if(outside[i]||owners[i]===0) continue; outside[i]=1; const x=i%GRID,z=Math.floor(i/GRID); if(x>0)q.push(i-1); if(x<GRID-1)q.push(i+1); if(z>0)q.push(i-GRID); if(z<GRID-1)q.push(i+GRID); }
  for(let i=0;i<TOTAL;i++) if(!outside[i]&&owners[i]!==0) owners[i]=0;
  score+=10; coins+=5; profile.coins=(profile.coins||0)+5;
  if(score>profile.best) profile.best=score;
  saveProfile(); refreshHUD();
  if(socket) socket.emit('stats',{score,area:(countMine()/TOTAL*100).toFixed(1),lives});
}
function countMine(){ let c=0; for(let i=0;i<TOTAL;i++) if(owners[i]===0)c++; return c; }
function die(){
  lives--;
  for(let i=0;i<TOTAL;i++) trailCells[i]=0;
  if(lives<=0){
    inGame=false; saveProfile();
    G('gameHud').classList.add('hidden'); G('menuScreen').classList.remove('hidden');
    G('bestScore').textContent=profile.best; G('menuCoins').textContent=profile.coins;
    if(socket){ socket.emit('leave_game'); socket.disconnect(); socket=null; }
  } else refreshHUD();
}
function refreshHUD(){
  const a=(countMine()/TOTAL*100).toFixed(1)+'%';
  const s=G('scoreValue'); if(s) s.textContent=score;
  const av=G('areaValue'); if(av) av.textContent=a;
  const cv=G('coinValue'); if(cv) cv.textContent=coins;
  const lv=G('livesValue'); if(lv) lv.textContent='❤'.repeat(lives)+'♡'.repeat(Math.max(0,3-lives));
}

// ── 3D Renderer ────────────────────────────────────────────────
function project(gx, gz, W, H) {
  const wx = (gx - px) * CELL_PX;
  const wz = (gz - pz) * CELL_PX;
  const horizon = H * 0.42;
  const fov     = H * 1.05;
  const camZ    = 7 * CELL_PX;
  const dz      = camZ + wz;
  if (dz < 20) return null;
  const scale = fov / dz;
  return { x: W*0.5 + wx*scale, y: horizon + wz*scale*0.52, scale };
}

function drawTile(gx, gz, color, W, H) {
  const tl=project(gx,  gz,  W,H), tr=project(gx+1,gz,  W,H);
  const br=project(gx+1,gz+1,W,H), bl=project(gx,  gz+1,W,H);
  if(!tl||!tr||!br||!bl) return;
  if(tl.y>H+10||bl.y<-10) return;
  ctx.beginPath();
  ctx.moveTo(tl.x,tl.y); ctx.lineTo(tr.x,tr.y);
  ctx.lineTo(br.x,br.y); ctx.lineTo(bl.x,bl.y);
  ctx.closePath();
  if(color){ ctx.fillStyle=color; ctx.fill(); }
  ctx.strokeStyle='rgba(0,55,65,0.22)'; ctx.lineWidth=0.6; ctx.stroke();
}

function drawCube3D(gx, gz, colorA, W, H) {
  const tl=project(gx,  gz,  W,H), tr=project(gx+1,gz,  W,H);
  const br=project(gx+1,gz+1,W,H), bl=project(gx,  gz+1,W,H);
  if(!tl||!tr||!br||!bl) return;
  const lift = bl.scale * CELL_PX * 0.58;

  // Shadow
  ctx.save(); ctx.globalAlpha=0.1;
  ctx.fillStyle='#000';
  ctx.beginPath(); ctx.moveTo(tl.x,tl.y); ctx.lineTo(tr.x,tr.y); ctx.lineTo(br.x,br.y); ctx.lineTo(bl.x,bl.y); ctx.closePath(); ctx.fill();
  ctx.restore();

  // Front face
  ctx.fillStyle=colorA;
  ctx.beginPath();
  ctx.moveTo(bl.x,bl.y); ctx.lineTo(br.x,br.y);
  ctx.lineTo(br.x,br.y-lift); ctx.lineTo(bl.x,bl.y-lift);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle='rgba(0,0,0,0.1)'; ctx.lineWidth=0.5; ctx.stroke();

  // Top face
  ctx.fillStyle=lighten(colorA,32);
  ctx.beginPath();
  ctx.moveTo(tl.x,tl.y-lift); ctx.lineTo(tr.x,tr.y-lift);
  ctx.lineTo(br.x,br.y-lift); ctx.lineTo(bl.x,bl.y-lift);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle='rgba(0,0,0,0.08)'; ctx.lineWidth=0.5; ctx.stroke();

  // Highlight
  ctx.fillStyle='rgba(255,255,255,0.14)';
  ctx.beginPath();
  ctx.ellipse((tl.x+tr.x)/2,(tl.y+tr.y)/2-lift, tl.scale*CELL_PX*0.2, tl.scale*CELL_PX*0.07, 0,0,Math.PI*2);
  ctx.fill();
}

function render(time) {
  const W=canvas.width, H=canvas.height;
  ctx.clearRect(0,0,W,H);

  // Teal sky
  const sky=ctx.createLinearGradient(0,0,0,H*0.44);
  sky.addColorStop(0,'#246870'); sky.addColorStop(1,'#2a9298');
  ctx.fillStyle=sky; ctx.fillRect(0,0,W,H*0.44);

  // Horizon shadow
  ctx.fillStyle='rgba(0,0,0,0.12)';
  ctx.beginPath();
  ctx.ellipse(W*0.5,H*0.42,W*0.36+Math.sin(time*0.7)*6,H*0.02,0,0,Math.PI*2);
  ctx.fill();

  // Ground tiles back to front
  for(let gz=pz-22;gz<=pz+22;gz++){
    for(let gx=px-22;gx<=px+22;gx++){
      if(gz<0||gz>=GRID||gx<0||gx>=GRID) continue;
      const i=gz*GRID+gx;
      let color=null;
      if(owners[i]===0)      color=SKINS[skinIndex].colorA+'bb';
      else if(owners[i]!==NONE){ const n=npcs.find(n=>n.id===owners[i]); if(n) color=n.c[0]+'77'; }
      if(trailCells[i])      color=SKINS[skinIndex].colorB+'dd';
      drawTile(gx,gz,color,W,H);
    }
  }

  if(!inGame) return;

  // Cubes sorted back to front
  const cubes=[
    ...npcs.map(n=>({gx:n.x,gz:n.z,c:n.c[0]})),
    ...Array.from(remotePlayers.values()).map(p=>({gx:p.x||30,gz:p.z||30,c:SKINS[(p.skinIndex||0)%SKINS.length].colorA})),
    {gx:px,gz:pz,c:SKINS[skinIndex].colorA},
  ];
  cubes.sort((a,b)=>a.gz-b.gz);
  cubes.forEach(c=>drawCube3D(c.gx,c.gz,c.c,W,H));

  drawMinimap(W,H);
}

function drawMinimap(W,H){
  const ms=Math.min(130,W*0.18),mx=W-ms-12,my=H-ms-12;
  ctx.save(); ctx.globalAlpha=0.88;
  ctx.fillStyle='#0c3b45';
  ctx.beginPath(); ctx.roundRect(mx,my,ms,ms,10); ctx.fill();
  const cs=ms/GRID;
  for(let z=0;z<GRID;z++) for(let x=0;x<GRID;x++){
    const i=z*GRID+x;
    if(owners[i]===0) ctx.fillStyle=SKINS[skinIndex].colorA;
    else if(owners[i]!==NONE){ const n=npcs.find(n=>n.id===owners[i]); ctx.fillStyle=n?n.c[0]:'#555'; }
    else if(trailCells[i]) ctx.fillStyle=SKINS[skinIndex].colorB;
    else continue;
    ctx.fillRect(mx+x*cs,my+z*cs,cs+0.5,cs+0.5);
  }
  npcs.forEach(n=>{ ctx.fillStyle=n.c[0]; ctx.beginPath(); ctx.arc(mx+n.x*cs,my+n.z*cs,2,0,Math.PI*2); ctx.fill(); });
  remotePlayers.forEach(p=>{ const s=SKINS[(p.skinIndex||0)%SKINS.length]; ctx.fillStyle=s.colorA; ctx.beginPath(); ctx.arc(mx+(p.x||30)*cs,my+(p.z||30)*cs,2,0,Math.PI*2); ctx.fill(); });
  ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(mx+px*cs,my+pz*cs,3,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

function lighten(hex,amt){
  if(!hex.startsWith('#')) return hex;
  return `rgb(${Math.min(255,parseInt(hex.slice(1,3),16)+amt)},${Math.min(255,parseInt(hex.slice(3,5),16)+amt)},${Math.min(255,parseInt(hex.slice(5,7),16)+amt)})`;
}
function applySkin(el,skin){ if(!el)return; el.style.background=`linear-gradient(135deg,${skin.colorA},${skin.colorB})`; }
function renderSkinCard(){
  const s=SKINS[previewIndex];
  applySkin(G('skinPreviewCube'),s);
  if(G('skinName')) G('skinName').textContent=s.name;
  const ok=(profile.best||0)>=s.req;
  if(G('skinRequirement')) G('skinRequirement').textContent=ok?'Unlocked':`Requires best score ${s.req}`;
  if(G('skinSelectBtn')) G('skinSelectBtn').disabled=!ok;
}
function selectSkin(){
  if((profile.best||0)<SKINS[previewIndex].req) return;
  skinIndex=previewIndex; profile.skinIndex=skinIndex;
  applySkin(G('heroCube'),SKINS[skinIndex]); saveProfile();
}
function resize(){
  const dpr=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.floor(innerWidth*dpr); canvas.height=Math.floor(innerHeight*dpr);
  canvas.style.width='100%'; canvas.style.height='100%';
}
