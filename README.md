# MSF Planner

A free-to-play progression planner for Marvel Strike Force. Log in with your Scopely account and it reads your roster, inventory and current events through the official MSF API, so it can show what you need to build next.

**Status:** v0.1. Login, roster sync, a sortable roster view, and event requirement checks are done. The gap report, roadmap and team builder come next.

## Run it locally

```bash
npm install
cp .env.example .env.local   # then fill in your client ID and API key
npm run dev
```

Open https://localhost:5173. The dev server uses a self-signed certificate, because the OAuth redirect registered with Scopely is `https://localhost:5173/callback`. Accept the browser warning once.

Click **Try with demo data** to explore without logging in. The demo roster is made up.

## How it works

- **Login:** OAuth2 Authorization Code with PKCE against Scopely's auth server. It uses a public client, so there is no secret. Tokens live in your browser's localStorage. Refreshes go through `/util/v1/gatedRefresh`, because refresh tokens are single-use. See `src/auth/auth.ts`.
- **API:** every call sends the `x-api-key` and a bearer token. Put your client ID and API key from the MSF developer portal in `.env.local` (copy `.env.example`). Settings live in `src/config.ts`, and the client is `src/api/client.ts`.
- **Endpoints used:** `/player/v1/card`, `/player/v1/roster`, `/player/v1/inventory`, `/player/v1/events`, and `/game/v1/characters`.
- **Requirement matching:** `src/planner/requirements.ts` checks the API's event `Requirements` and `CharacterFilter` objects against your roster.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on https://localhost:5173 |
| `npm run build` | Typecheck and production build to `dist/` |
| `npm test` | Unit tests (Vitest) |
