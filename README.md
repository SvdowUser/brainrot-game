# Brainrot Runner Starter

Ein sehr einfacher Starter für ein kostenloses Browsergame mit **Phaser 3**.

## Was schon drin ist
- Startmenü
- simples 2D-Runner-Minispiel
- Coins sammeln
- Hindernissen ausweichen
- freischaltbare Skins
- Speicherung mit `localStorage`
- läuft als statische Website auf **GitHub Pages**

## Dateien
- `index.html`
- `style.css`
- `game.js`

## Lokal testen
Öffne den Ordner in VS Code und starte einen kleinen lokalen Server.

Beispiel mit Python:
```bash
python -m http.server 8000
```

Dann im Browser:
```text
http://localhost:8000
```

## Auf GitHub Pages hochladen
1. Neues GitHub-Repository erstellen
2. Diese Dateien hochladen
3. Repository `Settings` → `Pages`
4. Bei **Build and deployment** `Deploy from a branch`
5. Branch `main` und Folder `/root` auswählen
6. Speichern
7. Nach kurzer Zeit läuft die Seite über `*.github.io`

## Danach als Nächstes
- echte Sprites statt Platzhalter
- eigener Startscreen / Hub
- mehr Skins
- Sound
- tägliche Rewards
- später optional Online-Leaderboard oder kleine Lobby
