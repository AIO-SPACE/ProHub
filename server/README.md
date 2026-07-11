# ProHub Backend

ProHub now has a local JSON-backed API. It runs without Express or other server
dependencies so the app can boot with plain Node.

## Run

```bash
npm run server
```

The default API URL is `http://127.0.0.1:4173/api`.

## Main Endpoints

- `GET /api/health`
- `GET /api/dashboard`
- `GET /api/downloads`
- `POST /api/downloads`
- `PATCH /api/downloads/:id`
- `DELETE /api/downloads/:id`
- `GET /api/music`
- `PATCH /api/music/player`
- `PATCH /api/music/liked/:trackId`
- `PATCH /api/music/languages`
- `GET /api/vpn`
- `POST /api/vpn/connect`
- `POST /api/vpn/disconnect`
- `PATCH /api/vpn/servers/:serverId`
- `GET /api/cloud`
- `PATCH /api/cloud/providers/:providerId`
- `GET /api/apps`
- `POST /api/apps/check`
- `PATCH /api/apps/repos/:repoId`
- `GET /api/settings`
- `PATCH /api/settings`

State is persisted to `server/data/prohub-state.json` on first run.
