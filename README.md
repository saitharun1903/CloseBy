# Closeby

**Watch together. Feel like you're together.** A private room for exactly two people: HD video calling while you watch YouTube, your own films or direct video links in perfect sync — or browse any website together in a shared cloud browser. Chat, reactions, screen sharing; no accounts, nothing recorded.

- Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Radix primitives (shadcn-style) · Motion
- LiveKit (WebRTC SFU) for camera, microphone and screen share
- PostgreSQL + Drizzle ORM for rooms, seats, watchlist and authoritative playback state
- Redis (optional) for shared rate limits

| Doc | What's in it |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Real-time design, playback sync algorithm, trust boundaries, what's stored |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | LiveKit configuration (TURN, keys, webhooks), production deployment |
| [docs/TESTING.md](docs/TESTING.md) | Automated tests and the manual two-device test plan |
| [docs/FEATURES.md](docs/FEATURES.md) | Checklist: implemented / automatically tested / manual-only / planned |

## Quick start (local development)

Requirements: Node 20.9+, PostgreSQL 14+, a LiveKit server. Redis is optional.

```bash
docker compose up -d          # Postgres, Redis, LiveKit (dev mode)
```

```bash
cp .env.example .env.local    # then set SESSION_SECRET (openssl rand -base64 48)
```

```bash
npm install
```

```bash
npm run db:migrate
```

```bash
npm run dev                   # http://localhost:3000
```

Without Docker, run LiveKit directly: `livekit-server --dev --bind 127.0.0.1 --node-ip 127.0.0.1` (binary from https://github.com/livekit/livekit/releases or `brew install livekit`).

To try it alone, open the room in a normal window and the invite link in a **private window or a second browser** — the seat is bound to a cookie, so two tabs of the same browser profile are the same person (the newer tab replaces the older one, by design).

Camera and microphone require a secure context: `http://localhost` works; any other host needs HTTPS.

## Project layout

```
src/
  app/                      Next.js routes
    page.tsx                Landing
    r/[roomId]/page.tsx     Room (gate → join form → lobby → room)
    api/                    Route handlers (rooms, join, token, playback, queue, time, webhook, cleanup)
  components/
    landing/                Landing page pieces
    room/                   Room client: controller (LiveKit), store, player, tiles, panels, controls
    ui/                     Button, Dialog, Popover, Slider, Tooltip, Switch, Input
  lib/
    playback.ts             Pure sync logic shared by client & server (reducer, drift control, clock)
    protocol.ts             API + realtime message schemas (zod)
  server/
    rooms.ts                Room service: seats, invites, PINs, playback, queue, cleanup
    livekit.ts              LiveKit gateway (tokens, room caps, server→client broadcast)
    session.ts crypto.ts ratelimit.ts http.ts env.ts
    db/schema.ts            Drizzle schema
drizzle/                    SQL migrations
tests/unit · tests/integration · tests/e2e
```

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | TypeScript |
| `npm run db:generate` / `db:migrate` | Create / apply migrations |
| `npm run cleanup` | Delete expired rooms (also available as `POST /api/cron/cleanup`) |
| `npm test` | Unit + integration tests (needs Postgres) |
| `npm run test:e2e` | Two-browser end-to-end tests (needs Postgres + a LiveKit binary) |

## Honest limitations

- **DRM streaming services (Netflix, Prime Video, Disney+) can't be synced**, and usually won't play in the shared browser either. YouTube is built in; for other sites use the shared browser.
- **YouTube ads** play independently for each person; whoever finishes an ad first is caught up automatically afterwards.
- **Shared-screen audio depends on the browser.** Chrome/Edge can share *tab* audio everywhere and whole-screen audio on Windows/ChromeOS; window audio and Firefox/Safari screen audio aren't available. The UI always shows whether audio is actually being shared.
- **Mobile browsers can't share their screen**, so the share button is hidden on phones. iOS Safari ignores programmatic volume, so the film-volume slider is hidden there (use hardware buttons).
- **Echo cancellation is best-effort.** It's on, but speakers + a playing film can still leak into the mic on some devices. Headphones fix it; the app says so.
- Local files must be the *same* file on both sides for frames to line up — the app checks size and warns on mismatch.
