# Testing Closeby

## Automated

| Suite | Command | Needs | Covers |
| --- | --- | --- | --- |
| Unit | `npm run test:unit` | — | Playback reducer & conflict window, expected-position math, drift controller (dead-band, nudge, hysteresis, hard seek), NTP clock estimate, PIN hashing, invite encryption/tamper detection, session JWT scoping & expiry, input validation, rate limiter, SRT→VTT |
| Integration | `npm run test:integration` | Postgres (`closeby_test` DB, migrated) | Room service against a real DB with a fake media gateway: create/preview/join, wrong invites, PIN, **two-seat limit incl. 8 concurrent joiners**, stale-seat reclaim rules (connected / recently seen / media server unreachable / host never), leave, end, expiry & cleanup, cross-room authorization, playback versioning & conflicts & clamping, queue add/reorder/remove/isolation |
| End-to-end | `npm run test:e2e` | Postgres + `livekit-server` binary (`LIVEKIT_BIN=/path/to/livekit-server`) | Two (or three) isolated Chromium contexts with fake camera/mic against a **real LiveKit SFU** — see below |

Set up the test DB once:

```bash
createdb closeby_test && DATABASE_URL=postgres://closeby:closeby@localhost:5432/closeby_test npm run db:migrate
```

E2E starts LiveKit (`--dev`), a dedicated Next dev server on :3123 and a tiny fixture server on :3199 automatically. It expects `tests/e2e/fixtures/test-film.webm`; generate it with:

```bash
ffmpeg -f lavfi -i "testsrc2=size=480x270:rate=24" -f lavfi -i "sine=frequency=330:sample_rate=48000" -t 120 -c:v libvpx-vp9 -deadline realtime -cpu-used 8 -b:v 300k -c:a libopus tests/e2e/fixtures/test-film.webm
```

(WebM because Playwright's open-source Chromium has no H.264/AAC decoder.)

Stop any `npm run dev` in the same checkout before running E2E (the test server uses the same build directory). Don’t point the dev server at a custom `distDir`: Turbopack then watches its own output and reloads endlessly. The E2E server also raises rate limits (`RATE_LIMIT_SCALE=50`), because the suite creates far more rooms from one IP than the real limit allows.

### E2E scenarios

`call.spec.ts`
- Both join; each **decodes the other's camera** (videoWidth > 0) and **receives the other's microphone** (inbound-rtp audio bytes increasing, read from real WebRTC stats)
- A third person is refused ("This room is full")
- No invite → "You need an invite"; tampered invite → rejected; `/state` and `/token` return 401 without a session
- PIN: wrong PIN refused, right PIN admitted
- Refresh → back into the same seat, video restored on both sides
- Mic mute / camera off reflected on the partner's tile; guest leave frees the seat for someone new
- Host ends the room → both see the end screen; the link is dead
- Chat (incl. safe `rel=noopener` link card, unread badge) and reactions travel both ways

`playback.spec.ts`
- Either person plays / pauses / seeks (keyboard) / changes speed; positions agree within 0.3–0.4 s
- **Drift**: a +5 s jump is re-seeked; a −0.5 s lag is corrected by a playback-rate nudge to < 150 ms
- Late joiner lands at the live position
- Film mute, film volume, partner-voice volume and mic are independent (checked on the actual `<video>`/`<audio>` elements, both sides)
- Direct link plays in sync; a non-video link is refused with an explanation
- Watchlist: add (file + link), now-playing marker, reorder, play-now, remove — all mirrored

`screenshare-layout.spec.ts`
- Screen share reaches the partner as decoded video; the audio indicator matches whether an audio track was really published; cameras stay as floating tiles; stopping removes it
- Switching cinema → face-to-face → compact → cinema keeps the call connected and the film playing
- Phone viewport uses the compact layout with no horizontal overflow

## Manual — requires two real devices

Fake devices can't tell you about echo, real networks or mobile browsers. Do this pass before each release, ideally on two different networks (e.g. home Wi-Fi + phone hotspot).

| # | Check | Pass when |
| --- | --- | --- |
| 1 | Both cameras/mics on real hardware | Faces are clear; you can talk over each other without cut-outs |
| 2 | Echo with speakers | Play a film with speakers on one side; partner hears little/no film echo. If they do, headphones remove it (expected, documented) |
| 3 | Film + voice together | Both hear the film locally *and* each other; film slider doesn't change voice level and vice versa |
| 4 | Sync by ear | Count down a loud moment together — within a few frames |
| 5 | Screen share — Chrome tab with audio | Partner sees the tab and hears it; indicator says "With sound" |
| 6 | Screen share — window on macOS | Partner sees it; indicator says "No sound" and the help card explains why |
| 7 | Screen share — Firefox / Safari | Video works; "No sound" shown |
| 8 | Network drop | Toggle Wi-Fi off 10 s, on: "Reconnecting…", then call and playback resume and resync |
| 9 | Restrictive network | Through a corporate/hotel network (TURN over TLS) the call still connects |
| 10 | iPhone Safari | Join, talk, watch (compact layout, safe areas OK, rotate to landscape → cinema); no screen-share button; tap-to-play/tap-to-hear prompts work |
| 11 | Android Chrome | Same as above |
| 12 | Unplug the mic/camera mid-call | Toast, switches to another device if present |
| 13 | Deny camera permission in the lobby | Clear guidance; can still join to watch and chat |
| 14 | Different local files | Size-mismatch warning shown |
| 15 | Cinema mode | Full screen; chrome fades while playing; mouse reveals; `Esc`/`F` exits |
