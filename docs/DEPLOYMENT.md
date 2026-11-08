# Deploying Closeby

You need three things: the Next.js app, PostgreSQL, and LiveKit (self-hosted or LiveKit Cloud). Redis is recommended once you run more than one app instance.

## 1. LiveKit

### Option A — LiveKit Cloud (simplest)
1. Create a project at cloud.livekit.io. Copy the **API key**, **API secret** and **WebSocket URL** (`wss://<project>.livekit.cloud`).
2. Set `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_API_URL=https://<project>.livekit.cloud`, `NEXT_PUBLIC_LIVEKIT_URL=wss://<project>.livekit.cloud`.
3. (Optional) Add a webhook to `https://<your-app>/api/livekit/webhook` — it keeps "last seen" fresh so abandoned guest seats free up promptly.

TURN, TLS and global edge routing are handled for you.

### Option B — self-hosted
1. Install `livekit-server` (release binary or the `livekit/livekit-server` image) on a host with a public IP.
2. Start from `livekit.example.yaml`. Generate keys with `livekit-server generate-keys`.
3. **TURN is required for real-world reliability** (corporate networks, symmetric NATs). Enable the embedded TURN server with TLS on 443/5349 and a certificate for `turn.<domain>`.
4. Open firewall ports: 7881/tcp (ICE-TCP), the UDP range (e.g. 50000–60000), 3478/udp and 5349/tcp (TURN).
5. Put the signalling port (7880) behind TLS (Caddy/nginx) so browsers connect with `wss://`.
6. Never use `--dev` in production; the app refuses to start in production with the dev secret.

Rooms are created by the app with `max_participants: 2`, `empty_timeout: 300 s`, `departure_timeout: 60 s`. Adaptive stream, dynacast and simulcast (180p/360p/720p layers) are enabled client-side, so a weak link receives a lower layer instead of freezing.

## 2. Database

Any PostgreSQL 14+. Apply migrations on deploy:

```bash
DATABASE_URL=postgres://… npm run db:migrate
```

## 3. The app

Environment (see `.env.example`):

| Variable | Notes |
| --- | --- |
| `APP_URL` | Public **https** origin, used for invite links and origin checks |
| `SESSION_SECRET` | ≥ 32 random chars. Rotating it signs everyone out and invalidates hosts' stored invite links |
| `ROOM_TTL_HOURS` | 1–24, default 12 |
| `DATABASE_URL`, `REDIS_URL` | |
| `LIVEKIT_*`, `NEXT_PUBLIC_LIVEKIT_URL` | **wss://** in production |
| `CRON_SECRET` | Bearer token for the cleanup endpoint |

Build and run:

```bash
npm ci && npm run build && npm start
```

Production hardening already in place: HSTS, a strict CSP (connect-src limited to self + your LiveKit host), `frame-ancestors 'none'`, `Referrer-Policy: no-referrer`, a Permissions-Policy allowing camera/mic/display-capture only for this origin, `Secure` HttpOnly cookies, env validation that refuses `http://` / `ws://` in production.

Behind a proxy/load balancer:
- Terminate TLS in front of the app. WebSockets go directly to LiveKit, not through the app.
- Make sure `X-Forwarded-For` is set by *your* proxy (and not passed through from clients), since rate limiting keys on the first hop.
- With more than one instance, set `REDIS_URL`.

Schedule cleanup every ~10 minutes:

```bash
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/cleanup
```

Health check: `GET /api/health` (checks the database).

### Vercel / serverless
Works as-is (route handlers are stateless). Use a pooled Postgres URL, set `REDIS_URL` (e.g. Upstash Redis over the Redis protocol), and use Vercel Cron for the cleanup call.

## Checklist before going live
- [ ] HTTPS on the app and `wss://` on LiveKit
- [ ] TURN reachable on 443/TLS (test from a restrictive network)
- [ ] Non-default LiveKit keys; `SESSION_SECRET` and `CRON_SECRET` from a secret manager
- [ ] Migrations applied; cleanup cron scheduled
- [ ] Manual two-device pass from [TESTING.md](TESTING.md)
