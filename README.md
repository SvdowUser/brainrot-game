# Los Tralaleritos Hub - Full Stack Starter

This package gives you a browser-based 3D hub and a real Node.js multiplayer server.

## What's included

- Guest name entry
- Starter skin picker (3 unlocked, 3 locked placeholders)
- 3D beach hub with structured areas
- Jumping and walk animation
- Global chat + overhead chat bubbles
- MMO-style nameplates
- Mobile joystick + jump button
- Real multiplayer with Socket.IO
- Room cap at 20 players

## Run locally

1. Open the `server` folder
2. Install dependencies:
   npm install
3. Start the server:
   npm start
4. Open `http://localhost:3000`
5. Open the same URL on a second device on the same network if your host is reachable

## GitHub Pages note

GitHub Pages can host the frontend only. The Node.js multiplayer server must run separately on a Node host.
If you want to host the frontend on GitHub Pages, update `SERVER_URL` in `client/src/main.js` to your live backend URL.

## Suggested next upgrades

- Replace primitive player model with GLB/GLTF shark character
- Add real meme gallery media panels
- Add parkour checkpoints and timing
- Add skin inventory and unlocks
- Add server browser with multiple rooms
- Add voice chat later with WebRTC
