# Server starter

This folder is the optional backend starter for:
- email + password accounts
- unique usernames
- simple room list
- 20-player room cap
- basic real-time position sync
- server-driven NPC placeholders

## Run locally

```bash
cd server
npm install
npm run dev
```

Default URL:
`http://localhost:2567`

## Endpoints
- `GET /api/health`
- `GET /api/servers`
- `POST /api/register`
- `POST /api/login`

## Notes
- This is a lightweight starter, not production auth.
- GitHub Pages can host the frontend, but this backend must run on a Node-capable host.
- A next upgrade path would be Colyseus for more advanced room/state sync.
