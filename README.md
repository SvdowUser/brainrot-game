 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/README.md b/README.md
index 5932d02ec148e6830d384b64e5061297c03edd1c..dceca1c5d3a5d82374c9083330c10e19345a0950 100644
--- a/README.md
+++ b/README.md
@@ -1,39 +1,26 @@
-# Los Tralaleritos Hub - Full Stack Starter
+# tralala.io (3D Territory Prototype)
 
-This package gives you a browser-based 3D hub and a real Node.js multiplayer server.
+Dieses Projekt ist jetzt ein spielbarer Prototype im Stil von Territory-Games:
 
-## What's included
+- 3D Grid-Arena mit Flächeneroberung
+- Trail/Loop-Mechanik (Fläche schließen)
+- KI-NPCs mit einfachem Jagd-/Rückkehr-Verhalten
+- Coins + Kills + Live-Bestenliste
+- Startscreen mit langsam rotierendem Character-Preview
+- Skins über Farbpalette
 
-- Guest name entry
-- Starter skin picker (3 unlocked, 3 locked placeholders)
-- 3D beach hub with structured areas
-- Jumping and walk animation
-- Global chat + overhead chat bubbles
-- MMO-style nameplates
-- Mobile joystick + jump button
-- Real multiplayer with Socket.IO
-- Room cap at 20 players
+## Starten
 
-## Run locally
+```bash
+cd server
+npm install
+npm start
+```
 
-1. Open the `server` folder
-2. Install dependencies:
-   npm install
-3. Start the server:
-   npm start
-4. Open `http://localhost:3000`
-5. Open the same URL on a second device on the same network if your host is reachable
+Dann im Browser öffnen: <http://localhost:3000>
 
-## GitHub Pages note
+## Später erweiterbar
 
-GitHub Pages can host the frontend only. The Node.js multiplayer server must run separately on a Node host.
-If you want to host the frontend on GitHub Pages, update `SERVER_URL` in `client/src/main.js` to your live backend URL.
+Eine Anleitung für spätere echte 3D-Modell-Uploads liegt hier:
 
-## Suggested next upgrades
-
-- Replace primitive player model with GLB/GLTF shark character
-- Add real meme gallery media panels
-- Add parkour checkpoints and timing
-- Add skin inventory and unlocks
-- Add server browser with multiple rooms
-- Add voice chat later with WebRTC
+- `client/src/modelPipeline.md`
 
EOF
)
