# Deploying Closeby

## Step-by-step: closeby.tech (Vercel + Neon + LiveKit Cloud + Upstash)

This is the recommended path: every piece has a free tier, TLS and TURN are handled for you, and nothing needs a server you maintain. Pick regions close to your users (Mumbai `ap-south-1` / Vercel `bom1` for India).

### 1. Accounts
Vercel (sign in with GitHub), Neon (Postgres), LiveKit Cloud, Upstash (Redis). Vercel's free Hobby plan is for personal, non-commercial projects.

### 2. LiveKit Cloud
1. cloud.livekit.io → **New project**.
2. **Settings → Keys → Create key.** Save the **API key**, **API secret** and **WebSocket URL** (`wss://<project>.livekit.cloud`).

### 3. Database (Neon)
1. New project, region **AWS ap-south-1 (Mumbai)**.
2. Copy both connection strings: the **pooled** one (host contains `-pooler`) for the app, and the **direct** one for migrations. Keep `?sslmode=require`.
3. Nothing to run by hand: every Vercel build runs `npm run db:migrate` first (the `vercel-build` script), using `DIRECT_URL` if set, otherwise `DATABASE_URL`. Already-applied migrations are skipped. Add both URLs to Vercel (see step 5).

### 4. Redis (Upstash, recommended)
Create a Redis database in **ap-south-1** and copy the `rediss://…` URL. On Vercel your app runs on many short-lived instances, so in-memory rate limits wouldn't be shared without it.

### 5. Vercel project (deploy on the vercel.app URL first)
1. **Add New → Project → import `saitharun1903/CloseBy`.** Framework: Next.js (auto-detected). The production branch is `main`, so merge the work into `main` first.
2. **Settings → Functions → Region:** `bom1` (next to the database).
3. **Settings → Environment Variables** (Production and Preview):

   | Name | Value |
   | --- | --- |
   | `APP_URL` | `https://<project>.vercel.app` for now; switched to `https://closeby.tech` in step 7 |
   | `SESSION_SECRET` | output of `openssl rand -base64 48` |
   | `DATABASE_URL` | the Neon pooled URL (host contains `-pooler`) |
   | `DIRECT_URL` | the Neon direct URL (used only for migrations during the build) |
   | `REDIS_URL` | the Upstash `rediss://` URL |
   | `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | from step 2 |
   | `LIVEKIT_API_URL` | `https://<project>.livekit.cloud` |
   | `NEXT_PUBLIC_LIVEKIT_URL` | `wss://<project>.livekit.cloud` |
   | `CRON_SECRET` | output of `openssl rand -hex 24` |
   | `ROOM_TTL_HOURS` | `12` (optional) |

   `NEXT_PUBLIC_LIVEKIT_URL` is baked into the build (it shapes the CSP), so **redeploy after changing it**.
4. **Deploy.** `vercel.json` registers a daily cleanup cron; Vercel sends `Authorization: Bearer $CRON_SECRET` to `GET /api/cron/cleanup` automatically. Expired rooms are also purged whenever a new room is created.

### 6. Verify on the vercel.app URL, before the domain points at it
1. `https://<project>.vercel.app/api/health` → `{"ok":true}` (database reachable).
2. Run the **manual two-device pass** in [TESTING.md](TESTING.md) with two real devices, ideally on different networks (Wi-Fi + mobile hotspot). At minimum: both see and hear each other; a film plays in sync and either side can pause or seek; film and voice volumes are independent; Chrome tab share with sound; a third browser is refused; refresh rejoins; ending the room kicks both.
3. If the call won't connect: check the LiveKit key/secret/URL variables and **redeploy**. The browser console will show any CSP block.

### 7. Point closeby.tech at Vercel
1. Vercel → **Settings → Domains → Add** `closeby.tech` (and `www.closeby.tech`, set to redirect to the apex).
2. Vercel then shows the exact DNS records to create. Typically:

   | Type | Host | Value |
   | --- | --- | --- |
   | A | `@` | `76.76.21.21` |
   | CNAME | `www` | `cname.vercel-dns.com` |

   **Use the values Vercel displays for your project if they differ.**
3. At the registrar (Namify → closeby.tech → **DNS**): delete any existing parking/default `A`, `AAAA` or `CNAME` records for `@` and `www`, then add the records above. Don't turn on Domain Forwarding: it conflicts with these records.
4. Wait until Vercel shows **Valid Configuration** (minutes to a few hours). The HTTPS certificate is issued automatically.
5. Change `APP_URL` to `https://closeby.tech` and **redeploy**, so invite links use the real domain.
6. Optional: in LiveKit Cloud **Settings → Webhooks**, add `https://closeby.tech/api/livekit/webhook` (signed with your API key) so abandoned guest seats free up faster.

### 8. After launch
- Create a room at https://closeby.tech, open the invite on your phone over mobile data, and make sure the call connects.
- Note: HSTS with `preload` is sent, so closeby.tech must stay HTTPS-only (it will on Vercel).

---

## General reference

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
See the step-by-step guide at the top. Route handlers are stateless; use a pooled Postgres URL and `REDIS_URL`.

## Checklist before going live
- [ ] HTTPS on the app and `wss://` on LiveKit
- [ ] TURN reachable on 443/TLS (test from a restrictive network)
- [ ] Non-default LiveKit keys; `SESSION_SECRET` and `CRON_SECRET` from a secret manager
- [ ] Migrations applied; cleanup cron scheduled
- [ ] Manual two-device pass from [TESTING.md](TESTING.md)
