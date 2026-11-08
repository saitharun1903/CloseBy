# Closeby — real-time architecture

## Components

```
 Browser A ──HTTPS──▶ Next.js app (route handlers) ──▶ PostgreSQL
    │  ▲                      │                         (rooms, seats, queue, playback state)
    │  │ server broadcasts    │ RoomService API (Twirp)
    │  └──────────────────────┤
    │                         ▼
    └──── WebRTC (media + data channels) ────▶ LiveKit SFU ◀──── WebRTC ──── Browser B
                                              (TURN/STUN)
```

- **Next.js route handlers** are the only authority for room membership and playback state.
- **LiveKit** carries camera, mic and screen-share tracks, plus two kinds of data messages:
  - *server → clients* (`cb.server` topic) sent through LiveKit's server API: playback state, queue, participants, room-ended;
  - *peer ↔ peer* (`cb.chat`, `cb.react`, `cb.ping`, `cb.media`, `cb.chat.history`).
- **PostgreSQL** stores the room, its two seats, the watchlist and the authoritative playback state. **Redis** (optional) backs rate limits across instances.

## Rooms, seats and access

| Secret | Where it lives | Purpose |
| --- | --- | --- |
| Invite token (256-bit) | URL **fragment** (`/r/<id>#invite=…`) — never sent in requests except as a JSON body field, never logged, never in `Referer` | Proves you were invited |
| `invite_token_hash` | DB (SHA-256) | Verification (constant-time compare) |
| `invite_token_enc` | DB (AES-256-GCM, key derived from `SESSION_SECRET`) | Lets the *host* re-copy the link after a refresh |
| PIN (optional) | DB (scrypt) | Second factor for the link; brute force limited per IP and per room |
| Session cookie `cb_s_<room>` | HttpOnly, SameSite=Lax, Secure in prod, expires with the room | Binds a browser to one seat; HS256 JWT with audience = room id |
| LiveKit token | Issued per connect, ≤15-minute TTL, identity = seat id, restricted publish sources, cannot update own metadata | Media access |

**Two-person limit** is enforced three times: (1) `joinRoom` locks the room row (`SELECT … FOR UPDATE`) and counts active seats, so concurrent joins serialise (tested with 8 simultaneous joiners — exactly one wins); (2) LiveKit rooms are created with `max_participants = 2`; (3) LiveKit tokens are only minted for an existing seat.

**Seat reclaim.** If a guest vanishes without leaving, their seat is reclaimable only when the media server confirms they're *not connected* **and** they haven't been seen for 45 s. If LiveKit can't be reached, the check fails closed (room stays full). The host seat is never reclaimed.

**Every room API call** re-reads the seat and room from the DB (seat not released, room open and unexpired). Mutating requests also require a same-origin `Origin` header. All inputs are validated with zod. Rate limits: room creation, preview, join, PIN failures, token minting, playback intents and queue edits.

**Trust boundary for realtime messages.** Clients only accept `cb.server` messages that arrive *without* a sending participant (i.e. from the server API). A peer cannot forge playback or membership changes; peer messages are schema-validated and only affect cosmetic/local things (chat, reactions, pointer pings, "I've loaded the file").

## Playback synchronisation

Implemented in `src/lib/playback.ts` (pure, unit-tested) and `src/components/room/synced-player.tsx`.

**State is a trajectory, not a snapshot.** The server stores `{ mediaId, status, positionSec, rate, updatedAtMs, version, updatedBy }`. When playing, the expected position at server time *T* is `positionSec + (T − updatedAtMs)/1000 × rate`.

**Intents, not mirrored events.** A click on play/pause/seek/speed sends an *intent* (`POST /playback` with `baseVersion`). The server, inside a row lock, applies it with `applyIntent`, stamps it with its own clock, bumps `version`, persists, and broadcasts the new state. The sender applies its action optimistically and suppresses corrections for up to 2.5 s until the authoritative state arrives; if the request fails, the player snaps back to server state (no fake success).

**Conflict resolution.** If an intent's `baseVersion` is stale *and* a different person changed the state less than 600 ms ago, it's rejected (`409`) and the sender adopts the winner's state with a small "Sam got there first" notice. Outside that window, the latest deliberate action wins.

**Clock sync.** Each client estimates `serverTime − clientTime` NTP-style from 5 `/api/time` samples (lowest-RTT half, median), refreshed every 60 s and after reconnects.

**Drift control** (every 500 ms while playing):

| Drift | Action |
| --- | --- |
| ≤ 100 ms (≤ 40 ms once correcting) | nothing |
| 100 ms – 1 s | nudge `playbackRate` by up to ±6 % (proportional) until converged |
| ≥ 1 s | hard seek (+150 ms × rate lead for decoder restart), at most once per 1.5 s |

A paused player more than 250 ms off is re-seeked. Background tabs are re-synced on `visibilitychange`. The UI shows *In sync / Syncing… / Buffering… / Sam isn't ready yet*.

**Late join, reconnection and missed messages.** On connect, refresh, LiveKit `Reconnected`, tab focus, and every 10 s while connected, the client refetches `/state`. Server broadcasts are therefore an optimisation for latency, not a correctness dependency: a dropped broadcast is repaired within 10 s, and version-based merging means a stale response can never roll playback back. Readiness (`cb.media`) is re-announced so the partner's indicator is right.

**End of item.** Only the host advances to the next queue item (avoids double-advancing).

## Audio design

- The film is decoded **locally on each device** (local file or direct URL). It never goes through WebRTC, so there's no duplicated playback or loop, and film volume/mute are purely local.
- The partner's microphone and the partner's screen-share audio are attached to separate `<audio>` elements, with independent gain via `RemoteParticipant.setVolume(v, source)`. "Film & shared audio" and "Partner's voice" are two independent sliders; muting the film never touches the mic and vice versa.
- Microphones use `echoCancellation`, `noiseSuppression`, `autoGainControl`. Screen-share audio disables them (it's content, not speech).
- Screen-share audio is only *claimed* when a `ScreenShareAudio` track was actually published; otherwise the UI says "No sound" and explains the browser's rules.
- Autoplay restrictions: LiveKit's `AudioPlaybackStatusChanged` shows "Tap to hear your partner"; a blocked `video.play()` shows "Tap to join in".

## What is stored, and for how long

| Data | Where | Lifetime |
| --- | --- | --- |
| Room id, hashed/encrypted invite, hashed PIN, expiry | Postgres | Until expiry (default 12 h); ended rooms are emptied immediately and the tombstone removed within 24 h |
| Display names, avatar hue, last-seen time | Postgres | Same |
| Watchlist: titles, direct URLs, local-file **name/size/duration** only | Postgres | Same (deleted immediately when the host ends the room) |
| Playback position/state | Postgres | Same |
| Rate-limit counters (keyed by IP or seat id) | Redis or memory | ≤ 15 min |
| Chat | Only the two browsers' memory | Fades after 60 min; gone when the tab closes. A rejoining partner receives the other side's copy peer-to-peer |
| Video, audio, screen, files | Never stored | — |

Expired rooms are removed by `POST /api/cron/cleanup` (or `npm run cleanup`), which also deletes the LiveKit room.

## Reliability map

| Situation | Behaviour |
| --- | --- |
| Network blip | LiveKit resumes ICE; banner "Reconnecting…"; state refetched on `Reconnected` |
| LiveKit gives up | "Connection lost" overlay, automatic rejoin with exponential backoff (2 s → 30 s) and on `online` |
| Refresh | Cookie → lobby → same seat |
| Same person opens a 2nd tab | LiveKit `DUPLICATE_IDENTITY` → older tab explains and offers to reconnect |
| Partner leaves / drops | Tile disappears, waiting card returns; guest seat freed on explicit leave |
| Room ended / expired | Every client gets a clear end screen; APIs return 410 |
| Permission denied / device busy / unplugged | Specific guidance; join without devices allowed; auto-switch on unplug |
| Screen share cancelled / unsupported | Friendly notice; button hidden on mobile |
| Bad file or link | Probed before adding; playback errors explain format/CORS/DRM causes |
| Different local files | Size mismatch warning |
