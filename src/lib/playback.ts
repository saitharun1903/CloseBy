/**
 * Playback synchronisation — pure logic shared by server and client.
 *
 * Model: the server owns a single PlaybackState per room. A state is a
 * *trajectory*, not a snapshot: when playing, the expected position at server
 * time T is `positionSec + (T - updatedAtMs) / 1000 * rate`. Clients never
 * mirror each other's player events; they send intents to the server and then
 * steer their local <video> toward the trajectory.
 */

export type PlaybackStatus = "playing" | "paused";

export interface PlaybackState {
  mediaId: string | null;
  status: PlaybackStatus;
  positionSec: number;
  rate: number;
  /** Server clock (ms since epoch) at which positionSec was true. */
  updatedAtMs: number;
  /** Monotonic, incremented by the server for every accepted intent. */
  version: number;
  /** Participant id of the last writer. */
  updatedBy: string | null;
}

export type PlaybackIntent =
  | { type: "play"; positionSec: number }
  | { type: "pause"; positionSec: number }
  | { type: "seek"; positionSec: number }
  | { type: "rate"; rate: number }
  | { type: "load"; mediaId: string | null };

export const ALLOWED_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
export const MIN_RATE = 0.5;
export const MAX_RATE = 2;

/**
 * If another participant changed the state within this window and the
 * incoming intent was based on an older version, the intent is rejected and
 * the sender adopts the newer state. Outside the window, last intent wins —
 * a deliberate action a second later should not be swallowed.
 */
export const CONFLICT_WINDOW_MS = 600;

export function initialPlaybackState(nowMs: number): PlaybackState {
  return {
    mediaId: null,
    status: "paused",
    positionSec: 0,
    rate: 1,
    updatedAtMs: nowMs,
    version: 0,
    updatedBy: null,
  };
}

/** Where the media *should* be at server time `serverNowMs`. */
export function expectedPosition(state: PlaybackState, serverNowMs: number, durationSec?: number | null): number {
  let pos = state.positionSec;
  if (state.status === "playing") {
    pos += (Math.max(0, serverNowMs - state.updatedAtMs) / 1000) * state.rate;
  }
  pos = Math.max(0, pos);
  if (durationSec && Number.isFinite(durationSec) && durationSec > 0) pos = Math.min(pos, durationSec);
  return pos;
}

function sanitisePosition(p: number, durationSec?: number | null): number {
  if (!Number.isFinite(p) || p < 0) return 0;
  if (durationSec && Number.isFinite(durationSec) && durationSec > 0) return Math.min(p, durationSec);
  return p;
}

export function clampRate(r: number): number {
  if (!Number.isFinite(r)) return 1;
  return Math.min(MAX_RATE, Math.max(MIN_RATE, r));
}

export type ApplyResult =
  | { ok: true; state: PlaybackState }
  | { ok: false; reason: "conflict" | "no_media"; state: PlaybackState };

/**
 * Server-side reducer. Pure: the caller provides `nowMs` (server clock),
 * persists the result, and broadcasts it.
 */
export function applyIntent(
  state: PlaybackState,
  intent: PlaybackIntent,
  ctx: { nowMs: number; actorId: string; baseVersion: number; durationSec?: number | null },
): ApplyResult {
  const { nowMs, actorId, baseVersion, durationSec } = ctx;

  const stale = baseVersion < state.version;
  const otherRecentWriter =
    state.updatedBy !== null && state.updatedBy !== actorId && nowMs - state.updatedAtMs < CONFLICT_WINDOW_MS;
  if (stale && otherRecentWriter) {
    return { ok: false, reason: "conflict", state };
  }

  if (intent.type !== "load" && state.mediaId === null) {
    return { ok: false, reason: "no_media", state };
  }

  const base = { version: state.version + 1, updatedAtMs: nowMs, updatedBy: actorId };

  switch (intent.type) {
    case "load":
      return {
        ok: true,
        state: { ...state, ...base, mediaId: intent.mediaId, status: "paused", positionSec: 0, rate: 1 },
      };
    case "play":
      return {
        ok: true,
        state: { ...state, ...base, status: "playing", positionSec: sanitisePosition(intent.positionSec, durationSec) },
      };
    case "pause":
      return {
        ok: true,
        state: { ...state, ...base, status: "paused", positionSec: sanitisePosition(intent.positionSec, durationSec) },
      };
    case "seek":
      return {
        ok: true,
        state: { ...state, ...base, positionSec: sanitisePosition(intent.positionSec, durationSec) },
      };
    case "rate": {
      // Re-anchor the trajectory at "now" so the position is continuous.
      const here = expectedPosition(state, nowMs, durationSec);
      return { ok: true, state: { ...state, ...base, positionSec: here, rate: clampRate(intent.rate) } };
    }
  }
}

/** Newer-wins merge for states arriving over different paths (HTTP response vs broadcast). */
export function isNewer(incoming: PlaybackState, current: PlaybackState | null): boolean {
  if (!current) return true;
  if (incoming.mediaId !== current.mediaId && incoming.version === current.version) return true;
  return incoming.version > current.version;
}

/* ───────────────────────────── Drift control ───────────────────────────── */

export const DRIFT_DEADBAND_SEC = 0.1;
export const DRIFT_RELEASE_SEC = 0.04;
export const DRIFT_HARD_SEEK_SEC = 1.0;
export const MAX_NUDGE = 0.06; // ±6% playback rate

export type Correction =
  | { kind: "none"; rate: number }
  | { kind: "nudge"; rate: number; driftSec: number }
  | { kind: "seek"; targetSec: number; rate: number; driftSec: number };

/**
 * Decide how to steer the local player.
 *  - small drift: do nothing (avoids audible rate wobble)
 *  - medium drift: nudge playbackRate by up to ±6% until converged
 *  - large drift: hard seek
 * `wasNudging` adds hysteresis so we keep correcting down to a tighter band.
 */
export function computeCorrection(args: {
  actualSec: number;
  expectedSec: number;
  nominalRate: number;
  playing: boolean;
  wasNudging: boolean;
}): Correction {
  const { actualSec, expectedSec, nominalRate, playing, wasNudging } = args;
  const drift = actualSec - expectedSec; // >0 → we are ahead
  const abs = Math.abs(drift);

  if (!playing) {
    return abs > 0.25 ? { kind: "seek", targetSec: expectedSec, rate: nominalRate, driftSec: drift } : { kind: "none", rate: nominalRate };
  }
  if (abs >= DRIFT_HARD_SEEK_SEC) {
    return { kind: "seek", targetSec: expectedSec, rate: nominalRate, driftSec: drift };
  }
  const threshold = wasNudging ? DRIFT_RELEASE_SEC : DRIFT_DEADBAND_SEC;
  if (abs <= threshold) return { kind: "none", rate: nominalRate };

  // Proportional controller: correct ~35% of the error per second, capped.
  const adjust = Math.max(-MAX_NUDGE, Math.min(MAX_NUDGE, drift * 0.35));
  return { kind: "nudge", rate: nominalRate * (1 - adjust), driftSec: drift };
}

/* ───────────────────────────── Clock sync ───────────────────────────── */

export interface ClockSample {
  /** client clock when request was sent */
  t0: number;
  /** server clock reported in response */
  server: number;
  /** client clock when response arrived */
  t1: number;
}

/**
 * NTP-style offset estimate. Uses the lowest-RTT samples (least queueing
 * noise) and takes their median offset. serverTime ≈ clientTime + offset.
 */
export function estimateClockOffset(samples: ClockSample[]): { offsetMs: number; rttMs: number } | null {
  const valid = samples.filter((s) => s.t1 >= s.t0 && Number.isFinite(s.server));
  if (valid.length === 0) return null;
  const sorted = [...valid].sort((a, b) => a.t1 - a.t0 - (b.t1 - b.t0));
  const best = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 2)));
  const offsets = best.map((s) => s.server - (s.t0 + s.t1) / 2).sort((a, b) => a - b);
  const mid = Math.floor(offsets.length / 2);
  const offsetMs = offsets.length % 2 ? offsets[mid]! : (offsets[mid - 1]! + offsets[mid]!) / 2;
  const rttMs = best[0]!.t1 - best[0]!.t0;
  return { offsetMs, rttMs };
}

export function formatTime(totalSec: number): string {
  if (!Number.isFinite(totalSec) || totalSec < 0) totalSec = 0;
  const s = Math.floor(totalSec % 60);
  const m = Math.floor((totalSec / 60) % 60);
  const h = Math.floor(totalSec / 3600);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
