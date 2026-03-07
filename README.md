# tralala.io - 3D Territory Multiplayer Prototype

Ein professioneller, erweiterbarer 3D-Prototyp im Stil von Territory-Capture-Games.

## Features

- 3D Grid-Map (größer als vorher)
- Trail schließen => Fläche einnehmen
- Farb-Skins (später als Würfel-Skins/Model-Skins erweiterbar)
- Intelligente NPCs (Trail-Jagd + Rückkehr zur Home-Zone)
- Multiplayer-Lobby mit bis zu **30 Spielern**
- Große Mini-Map oben rechts
- 3 Leben pro Runde; bei 0 Leben zurück zum Startscreen
- Kamera folgt dem eigenen Spieler
- Austauschbare PNG-Icons in `client/assets/ui/`

## Lokal starten

```bash
cd server
npm install
npm start
```

Dann öffnen:

- `http://localhost:3000`

## Hetzner / Public Server

Dein Server laut Angabe:

- IPv4: `89.167.75.175`
- IPv6: `2a01:4f9:c012:c7e6::/64`

Der Node-Server hört auf `0.0.0.0`, damit er von außen erreichbar ist.

Wenn du Frontend separat (z.B. GitHub Pages) hostest, setzt der Client automatisch als Backend:

- `http://89.167.75.175:3000`

Das kannst du in `client/src/main.js` über `SERVER_URL` ändern.
