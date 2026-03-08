diff --git a/README.md b/README.md
index 5932d02ec148e6830d384b64e5061297c03edd1c..3cafee0df3181ea6ef365dd338246615fe2eb7ca 100644
--- a/README.md
+++ b/README.md
@@ -1,39 +1,42 @@
-# Los Tralaleritos Hub - Full Stack Starter
+# tralala.io - 3D Territory Multiplayer Prototype
 
-This package gives you a browser-based 3D hub and a real Node.js multiplayer server.
+Ein professioneller, erweiterbarer 3D-Prototyp im Stil von Territory-Capture-Games.
 
-## What's included
+## Features
 
-- Guest name entry
-- Starter skin picker (3 unlocked, 3 locked placeholders)
-- 3D beach hub with structured areas
-- Jumping and walk animation
-- Global chat + overhead chat bubbles
-- MMO-style nameplates
-- Mobile joystick + jump button
-- Real multiplayer with Socket.IO
-- Room cap at 20 players
+- 3D Grid-Map (größer als vorher)
+- Trail schließen => Fläche einnehmen
+- Farb-Skins (später als Würfel-Skins/Model-Skins erweiterbar)
+- Intelligente NPCs (Trail-Jagd + Rückkehr zur Home-Zone)
+- Multiplayer-Lobby mit bis zu **30 Spielern**
+- Große Mini-Map oben rechts
+- 3 Leben pro Runde; bei 0 Leben zurück zum Startscreen
+- Kamera folgt dem eigenen Spieler
+- Austauschbare PNG-Icons in `client/assets/ui/`
 
-## Run locally
+## Lokal starten
 
-1. Open the `server` folder
-2. Install dependencies:
-   npm install
-3. Start the server:
-   npm start
-4. Open `http://localhost:3000`
-5. Open the same URL on a second device on the same network if your host is reachable
+```bash
+cd server
+npm install
+npm start
+```
 
-## GitHub Pages note
+Dann öffnen:
 
-GitHub Pages can host the frontend only. The Node.js multiplayer server must run separately on a Node host.
-If you want to host the frontend on GitHub Pages, update `SERVER_URL` in `client/src/main.js` to your live backend URL.
+- `http://localhost:3000`
 
-## Suggested next upgrades
+## Hetzner / Public Server
 
-- Replace primitive player model with GLB/GLTF shark character
-- Add real meme gallery media panels
-- Add parkour checkpoints and timing
-- Add skin inventory and unlocks
-- Add server browser with multiple rooms
-- Add voice chat later with WebRTC
+Dein Server laut Angabe:
+
+- IPv4: `89.167.75.175`
+- IPv6: `2a01:4f9:c012:c7e6::/64`
+
+Der Node-Server hört auf `0.0.0.0`, damit er von außen erreichbar ist.
+
+Wenn du Frontend separat (z.B. GitHub Pages) hostest, setzt der Client automatisch als Backend:
+
+- `http://89.167.75.175:3000`
+
+Das kannst du in `client/src/main.js` über `SERVER_URL` ändern.
