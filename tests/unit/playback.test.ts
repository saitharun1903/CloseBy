import { describe, expect, it } from "vitest";
import {
  applyIntent,
  computeCorrection,
  CONFLICT_WINDOW_MS,
  DRIFT_HARD_SEEK_SEC,
  estimateClockOffset,
  expectedPosition,
  formatTime,
  initialPlaybackState,
  isNewer,
  MAX_NUDGE,
  type PlaybackState,
} from "@/lib/playback";

const T0 = 1_700_000_000_000;
const MEDIA = "11111111-1111-4111-8111-111111111111";

function loaded(over: Partial<PlaybackState> = {}): PlaybackState {
  return { ...initialPlaybackState(T0), mediaId: MEDIA, version: 1, updatedBy: "a", ...over };
}

describe("expectedPosition", () => {
  it("is frozen while paused", () => {
    const s = loaded({ status: "paused", positionSec: 42 });
    expect(expectedPosition(s, T0 + 10_000)).toBe(42);
  });
  it("advances with wall-clock time × rate while playing", () => {
    const s = loaded({ status: "playing", positionSec: 10, rate: 1.5 });
    expect(expectedPosition(s, T0 + 4_000)).toBeCloseTo(16);
  });
  it("clamps to duration and never goes negative", () => {
    const s = loaded({ status: "playing", positionSec: 95 });
    expect(expectedPosition(s, T0 + 60_000, 100)).toBe(100);
    expect(expectedPosition(loaded({ positionSec: -3 }), T0)).toBe(0);
  });
  it("ignores clock readings earlier than the anchor", () => {
    const s = loaded({ status: "playing", positionSec: 5 });
    expect(expectedPosition(s, T0 - 5_000)).toBe(5);
  });
});

describe("applyIntent", () => {
  const ctx = (o: Partial<{ nowMs: number; actorId: string; baseVersion: number; durationSec: number | null }> = {}) => ({
    nowMs: T0 + 5_000,
    actorId: "a",
    baseVersion: 1,
    durationSec: null,
    ...o,
  });

  it("rejects transport intents when nothing is loaded", () => {
    const r = applyIntent(initialPlaybackState(T0), { type: "play", positionSec: 0 }, ctx({ baseVersion: 0 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no_media");
  });

  it("load resets to paused at 0, rate 1, and bumps the version", () => {
    const r = applyIntent(loaded({ status: "playing", positionSec: 50, rate: 2 }), { type: "load", mediaId: null }, ctx());
    expect(r.ok && r.state).toMatchObject({ mediaId: null, status: "paused", positionSec: 0, rate: 1, version: 2 });
  });

  it("play anchors the trajectory at the reported position and server time", () => {
    const r = applyIntent(loaded(), { type: "play", positionSec: 12.5 }, ctx());
    expect(r.ok && r.state).toMatchObject({ status: "playing", positionSec: 12.5, updatedAtMs: T0 + 5_000, updatedBy: "a" });
  });

  it("pause and seek clamp positions into [0, duration]", () => {
    const p = applyIntent(loaded(), { type: "pause", positionSec: 500 }, ctx({ durationSec: 120 }));
    expect(p.ok && p.state.positionSec).toBe(120);
    const s = applyIntent(loaded({ status: "playing" }), { type: "seek", positionSec: 30 }, ctx());
    expect(s.ok && s.state).toMatchObject({ status: "playing", positionSec: 30 });
  });

  it("rate changes re-anchor so position stays continuous", () => {
    const s = loaded({ status: "playing", positionSec: 10, rate: 1 });
    const r = applyIntent(s, { type: "rate", rate: 2 }, ctx({ nowMs: T0 + 3_000 }));
    expect(r.ok && r.state).toMatchObject({ positionSec: 13, rate: 2, updatedAtMs: T0 + 3_000 });
  });

  it("rejects a stale intent that collides with another person's very recent change", () => {
    const s = loaded({ version: 5, updatedBy: "b", updatedAtMs: T0 });
    const r = applyIntent(s, { type: "pause", positionSec: 3 }, ctx({ nowMs: T0 + CONFLICT_WINDOW_MS - 1, baseVersion: 4 }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("conflict");
      expect(r.state.version).toBe(5);
    }
  });

  it("accepts a stale intent once the conflict window has passed (last deliberate action wins)", () => {
    const s = loaded({ version: 5, updatedBy: "b", updatedAtMs: T0 });
    const r = applyIntent(s, { type: "pause", positionSec: 3 }, ctx({ nowMs: T0 + CONFLICT_WINDOW_MS + 1, baseVersion: 4 }));
    expect(r.ok).toBe(true);
  });

  it("never treats your own previous write as a conflict", () => {
    const s = loaded({ version: 5, updatedBy: "a", updatedAtMs: T0 });
    const r = applyIntent(s, { type: "seek", positionSec: 9 }, ctx({ nowMs: T0 + 10, baseVersion: 4 }));
    expect(r.ok).toBe(true);
  });
});

describe("isNewer", () => {
  it("orders by version", () => {
    expect(isNewer(loaded({ version: 3 }), loaded({ version: 2 }))).toBe(true);
    expect(isNewer(loaded({ version: 2 }), loaded({ version: 2 }))).toBe(false);
    expect(isNewer(loaded({ version: 1 }), null)).toBe(true);
  });
});

describe("computeCorrection", () => {
  const base = { nominalRate: 1, playing: true, wasNudging: false };
  it("does nothing inside the dead-band", () => {
    expect(computeCorrection({ ...base, actualSec: 10.05, expectedSec: 10 }).kind).toBe("none");
  });
  it("nudges rate down when ahead and up when behind, capped", () => {
    const ahead = computeCorrection({ ...base, actualSec: 10.5, expectedSec: 10 });
    expect(ahead.kind).toBe("nudge");
    expect(ahead.rate).toBeLessThan(1);
    expect(ahead.rate).toBeGreaterThanOrEqual(1 - MAX_NUDGE);
    const behind = computeCorrection({ ...base, actualSec: 9.2, expectedSec: 10 });
    expect(behind.kind).toBe("nudge");
    expect(behind.rate).toBeGreaterThan(1);
    expect(behind.rate).toBeLessThanOrEqual(1 + MAX_NUDGE);
  });
  it("scales the nudge with the nominal rate", () => {
    const c = computeCorrection({ ...base, nominalRate: 2, actualSec: 10.5, expectedSec: 10 });
    expect(c.rate).toBeLessThan(2);
    expect(c.rate).toBeGreaterThan(1.8);
  });
  it("hard-seeks on large drift", () => {
    const c = computeCorrection({ ...base, actualSec: 10 + DRIFT_HARD_SEEK_SEC + 0.1, expectedSec: 10 });
    expect(c).toMatchObject({ kind: "seek", targetSec: 10 });
  });
  it("uses hysteresis while already nudging", () => {
    expect(computeCorrection({ ...base, actualSec: 10.07, expectedSec: 10 }).kind).toBe("none");
    expect(computeCorrection({ ...base, wasNudging: true, actualSec: 10.07, expectedSec: 10 }).kind).toBe("nudge");
  });
  it("snaps paused players that are noticeably off", () => {
    expect(computeCorrection({ ...base, playing: false, actualSec: 12, expectedSec: 10 }).kind).toBe("seek");
    expect(computeCorrection({ ...base, playing: false, actualSec: 10.1, expectedSec: 10 }).kind).toBe("none");
  });
});

describe("estimateClockOffset", () => {
  it("returns null without samples", () => {
    expect(estimateClockOffset([])).toBeNull();
  });
  it("recovers a known offset, preferring low-RTT samples", () => {
    const offset = 2_500;
    const samples = [
      { t0: 0, t1: 40, server: 20 + offset }, // rtt 40, symmetric
      { t0: 100, t1: 130, server: 115 + offset }, // rtt 30, symmetric
      { t0: 200, t1: 900, server: 300 + offset }, // rtt 700, asymmetric noise
    ];
    const r = estimateClockOffset(samples)!;
    expect(r.offsetMs).toBeCloseTo(offset, 0);
    expect(r.rttMs).toBe(30);
  });
});

describe("formatTime", () => {
  it("formats m:ss and h:mm:ss", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(65.9)).toBe("1:05");
    expect(formatTime(3725)).toBe("1:02:05");
    expect(formatTime(NaN)).toBe("0:00");
  });
});
