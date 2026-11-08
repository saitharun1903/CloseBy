# Feature checklist

Legend: **✅ Auto** — implemented and covered by automated tests that were run · **✅ Impl** — implemented, verified by hand in a browser during development but not by an automated test · **🧪 Manual** — implemented; needs real devices/networks to verify (see TESTING.md) · **⏳ Planned** — not built.

## Rooms & access
| Feature | Status |
| --- | --- |
| Landing page, create room, join with link | ✅ Auto |
| Unique room id + 256-bit invite token in URL fragment | ✅ Auto |
| Optional PIN (scrypt) with brute-force limits | ✅ Auto (PIN flow); rate limits ✅ Auto (unit) |
| Server-enforced two-person limit (row lock + LiveKit cap) | ✅ Auto (incl. concurrent race) |
| Guest join without account; display names; avatar colours | ✅ Auto |
| Waiting screen with copy/share invite | ✅ Auto |
| Host ends room for both | ✅ Auto |
| Expiry (12 h default) + cleanup endpoint/script | ✅ Auto (integration) |
| Refresh / rejoin into same seat; duplicate-tab handling | ✅ Auto (refresh); duplicate tab ✅ Impl |
| Stale guest-seat reclaim | ✅ Auto (integration) |
| Optional user accounts | ⏳ Planned |

## Calling
| Feature | Status |
| --- | --- |
| Real two-way camera + mic over LiveKit | ✅ Auto (decoded video + audio RTP bytes both ways) |
| Lobby: camera preview, mic meter, device selection, permission guidance | ✅ Impl; join path ✅ Auto |
| Mute/unmute, camera on/off | ✅ Auto |
| In-call device switching, unplug detection | ✅ Impl · 🧪 Manual |
| Connection quality bars; reconnecting banner; backoff rejoin | ✅ Impl · 🧪 Manual (#8) |
| Echo cancellation / noise suppression / AGC | ✅ Impl (browser-provided) · 🧪 Manual (#2) |
| Adaptive stream, dynacast, simulcast | ✅ Impl |

## Watching together
| Feature | Status |
| --- | --- |
| Local files (never uploaded; each picks own copy; size-mismatch warning) | ✅ Auto |
| Direct media URLs (probed before adding; clear failure reasons) | ✅ Auto |
| Server-coordinated play/pause/seek/speed with versioning | ✅ Auto |
| Simultaneous-control conflict resolution | ✅ Auto (integration + unit) |
| Clock-offset estimation; drift nudge & hard-seek correction | ✅ Auto |
| Late join / reconnect state restoration | ✅ Auto (late join) · reconnect ✅ Impl |
| Sync indicator (in sync / syncing / buffering / partner not ready) | ✅ Impl |
| Autoplay-blocked "tap to join in" | ✅ Impl |
| Local subtitles (.srt/.vtt), lifted above controls | ✅ Impl (converter ✅ Auto) |
| Independent film volume, film mute, partner voice volume; mic independent | ✅ Auto |
| Shared queue: add / remove / reorder / play next / now-playing / host auto-advance | ✅ Auto (auto-advance ✅ Impl) |
| Streaming-service integrations (DRM) | ⏳ Not possible without licensed provider SDKs; deliberately unsupported |

## Screen sharing & browsing
| Feature | Status |
| --- | --- |
| Share tab/window/screen via native picker (explicit click only) | ✅ Auto (Chromium) · 🧪 Manual per browser (#5–7) |
| Shared audio only when actually provided; honest indicator + browser-specific help | ✅ Auto (indicator consistency) · 🧪 Manual (#5–7) |
| One sharer at a time; cancel/deny handled | ✅ Impl |
| Hidden on mobile (unsupported) | ✅ Impl |
| Share links in chat → each opens in own browser (`noopener`) | ✅ Auto |
| Point at things on the shared stage (double-click ping) | ✅ Impl |
| Co-browsing / remote control of third-party sites | ⏳ Not built — browsers' same-origin isolation forbids it; would need a separate, secured virtual-browser service |

## Chat, reactions, layouts
| Feature | Status |
| --- | --- |
| Peer-to-peer chat, unread badge, link cards, 60-min fade, history handed to a rejoining partner | ✅ Auto (send/receive/unread/links) · history ✅ Impl |
| Reactions floating over the stage | ✅ Auto |
| Cinema / Face-to-face / Screen share / Compact layouts, switch without interruption | ✅ Auto |
| Floating tiles: drag, snap-to-corner, stack, resize, minimize, swap, hide self | ✅ Impl (visible as floating tiles ✅ Auto) |
| Cinema mode: fullscreen, chrome fades while playing, `F`/`Esc` | ✅ Impl · 🧪 Manual (#15) |
| Responsive mobile/tablet, safe areas, bottom-sheet panel | ✅ Auto (compact, no overflow) · 🧪 Manual (#10–11) |
| Keyboard: Space/K, ←/→, F, ⌘D, ⌘E | ✅ Auto (→ seek) · rest ✅ Impl |

## Security & ops
| Feature | Status |
| --- | --- |
| HttpOnly room-scoped session cookie; per-request DB re-authorization | ✅ Auto |
| Short-lived, identity-bound LiveKit tokens with restricted sources | ✅ Impl |
| Server-only trust for playback/membership broadcasts | ✅ Impl |
| Origin check on mutations; zod validation; rate limits; Redis option | ✅ Auto (validation, limiter) · origin ✅ Impl |
| HSTS, CSP, Permissions-Policy, no-referrer, frame-ancestors none (production) | ✅ Verified on a local production build over HTTPS (headers present, no CSP violations through create → lobby → invite → join → token). Live LiveKit Cloud connection: 🧪 verify on the preview deploy |
| LiveKit webhook (signature-verified) for presence | ✅ Impl (untested against LiveKit Cloud) |
| No recording, no uploads, no chat storage | ✅ By design |
