# Los Tralaleritos Beach Hub

A cleaner Phaser-based beach hub starter for your GitHub Pages project.

## What is already improved
- fullscreen layout
- English-only UI
- animated beach water
- structured map zones
- circular **Coming Soon** markers
- top-left avatar + username bar
- desktop movement
- mobile joystick
- cleaner baby-shark placeholder sprite with blue sneakers
- replaceable assets folder
- backend starter folder for real auth + rooms later

## Frontend vs backend
This repository can be hosted as a static site on GitHub Pages.

For **real** features like:
- unique usernames across users
- email login
- live player counts
- real multiplayer rooms
- server-driven NPCs

you need the included `server/` folder on a Node host.

## Asset replacement
Replace these files with your own art later:

### Player
- `assets/sprites/player/los_tralaleritos_sheet.png`

Frame layout:
- row 1: down (3 frames)
- row 2: left (3 frames)
- row 3: right (3 frames)
- row 4: up (3 frames)

Each frame is `64x64`.

### NPCs
- `assets/sprites/npcs/npc_beachbot_sheet.png`

### UI
- `assets/ui/avatar_player.png`
- `assets/ui/coming_soon_circle.png`
- `assets/ui/sign_minigames.png`
- `assets/ui/sign_npc.png`
- `assets/ui/sign_social.png`

### Tiles
- `assets/tiles/sand.png`
- `assets/tiles/water.png`
- `assets/tiles/boardwalk.png`
- `assets/tiles/grass.png`

### Objects
- `assets/objects/palm.png`
- `assets/objects/rock.png`
- `assets/objects/umbrella_pink.png`
- `assets/objects/umbrella_blue.png`
- `assets/objects/tent.png`
- `assets/objects/fence.png`
- `assets/objects/bonfire.png`
- `assets/objects/crate.png`

## GitHub Pages
Because this is a static frontend, it can go directly on GitHub Pages.
Add `.nojekyll` in the repo root so the site is deployed directly if needed.

## Next best upgrade order
1. replace placeholder shark sprite with your final 4-direction sheet
2. replace beach objects with your own art
3. connect frontend login/server select to the backend
4. move fake players to real networked players
5. later swap the backend to Colyseus if you want stronger room/state handling
