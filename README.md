# Los Tralaleritos 3D Beach Hub Starter

A browser-first 3D social hub starter for **GitHub Pages**.

## What this version includes
- fullscreen Three.js beach hub
- animated water
- structured beach zones
- top UI bar with avatar + username
- local username modal
- desktop movement: WASD / arrows / drag to look
- mobile movement: virtual joystick
- circular **COMING SOON** markers
- placeholder 3D Los Tralaleritos-inspired character:
  - baby shark style
  - **no tail fin**
  - blue sneakers

## What is NOT live yet
- real multiplayer
- real chat
- email accounts
- unique usernames on a server
- room list / server select
- NPC backend logic

Those need a backend in the next phase.

## GitHub Pages
Upload these files directly to your repo root:
- `index.html`
- `style.css`
- `.nojekyll`
- `src/`
- `assets/`

Then enable **Settings → Pages → Deploy from a branch → main → /(root)**.

## Asset replacement plan
Right now the scene uses code-generated 3D shapes.
Later you can replace them with your own assets:

- `assets/models/player/los_tralaleritos.glb`
- `assets/models/map/beach_props.glb`
- `assets/textures/water/water_normal.png`
- `assets/ui/avatar.png`

## Suggested next step
Build **Phase 2**:
1. replace the placeholder shark with a real 3D character model
2. replace code-made props with proper beach assets
3. add a real start screen
4. add backend for server rooms and chat
