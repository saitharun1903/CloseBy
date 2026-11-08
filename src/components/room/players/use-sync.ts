"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { computeCorrection, expectedPosition, type PlaybackIntent } from "@/lib/playback";
import { useController } from "../context";
import { serverNow, useRoom, type SyncState } from "../store";

/** Keep corrections off after a local action while the server confirms it. */
const PENDING_MS = 2500;
const MIN_SEEK_INTERVAL_MS = 1500;
/** Players that can't nudge their rate (YouTube) correct by seeking past this drift. */
const SEEK_ONLY_THRESHOLD = 0.7;
const SEEK_ONLY_INTERVAL_MS = 3000;

function setSync(s: SyncState) {
  if (useRoom.getState().sync !== s) useRoom.setState({ sync: s });
}

/**
 * Steers a player toward the server's playback trajectory and turns local
 * user actions into server intents. Player-agnostic (see MediaAdapter).
 */
export function useSyncEngine(adapter: React.RefObject<import("./adapter").MediaAdapter | null>, mediaId: string | null, ready: boolean) {
  const c = useController();
  const playback = useRoom((s) => s.playback);
  const [needsGesture, setNeedsGesture] = useState(false);
  const pendingUntil = useRef(0);
  const nudging = useRef(false);
  const lastSeekAt = useRef(0);
  /**
   * Last play/pause the engine itself issued, to tell our own state changes
   * from the user's. Seeks are deliberately excluded: a correction seek must
   * never cause a genuine user pause to be ignored.
   */
  const lastCommand = useRef<{ kind: "play" | "pause"; at: number } | null>(null);
  const command = (kind: "play" | "pause") => {
    lastCommand.current = { kind, at: performance.now() };
  };

  const tryPlay = useCallback(async () => {
    const a = adapter.current;
    if (!a) return;
    command("play");
    try {
      await a.play();
      setNeedsGesture(false);
    } catch (e) {
      if ((e as DOMException)?.name === "NotAllowedError") setNeedsGesture(true);
    }
  }, [adapter]);

  const reconcile = useCallback(
    (hard: boolean) => {
      const a = adapter.current;
      if (!a || !a.ready()) return;
      if (!hard && performance.now() < pendingUntil.current) return;
      const st = useRoom.getState().playback;
      if (st.mediaId !== mediaId) return;
      const dur = a.duration();
      const expected = expectedPosition(st, serverNow(), dur);
      const now = performance.now();
      const seek = (t: number) => {
        lastSeekAt.current = now;
        a.seek(t);
      };

      if (st.status === "paused" || (dur && expected >= dur - 0.25)) {
        if (!a.paused()) {
          command("pause");
          a.pause();
        }
        a.setRate(st.rate);
        nudging.current = false;
        if (Math.abs(a.time() - expected) > (a.canNudge ? 0.25 : 0.5)) seek(expected);
        setSync("synced");
        return;
      }

      if (hard) {
        nudging.current = false;
        a.setRate(st.rate);
        if (Math.abs(a.time() - expected) > (a.canNudge ? 0.35 : SEEK_ONLY_THRESHOLD)) seek(expected);
      } else if (!a.stalled()) {
        const drift = a.time() - expected;
        if (!a.canNudge) {
          if (Math.abs(drift) > SEEK_ONLY_THRESHOLD && now - lastSeekAt.current > SEEK_ONLY_INTERVAL_MS) {
            seek(expected + 0.3 * st.rate);
            setSync("correcting");
          } else if (Math.abs(drift) <= SEEK_ONLY_THRESHOLD) setSync("synced");
        } else {
          const corr = computeCorrection({ actualSec: a.time(), expectedSec: expected, nominalRate: st.rate, playing: true, wasNudging: nudging.current });
          if (corr.kind === "seek") {
            if (now - lastSeekAt.current > MIN_SEEK_INTERVAL_MS) {
              seek(corr.targetSec + 0.15 * st.rate);
              setSync("correcting");
            }
            nudging.current = false;
          } else if (corr.kind === "nudge") {
            a.setRate(corr.rate);
            nudging.current = true;
            setSync(Math.abs(corr.driftSec) > 0.3 ? "correcting" : "synced");
          } else {
            a.setRate(st.rate);
            nudging.current = false;
            setSync("synced");
          }
        }
      }
      if (a.paused() && !a.ended()) void tryPlay();
    },
    [adapter, mediaId, tryPlay],
  );

  useEffect(() => {
    if (ready) reconcile(true);
  }, [playback, ready, reconcile]);

  useEffect(() => {
    if (playback.status !== "playing" || !ready) return;
    const t = setInterval(() => reconcile(false), 500);
    return () => clearInterval(t);
  }, [playback.status, ready, reconcile]);

  useEffect(() => {
    const onVis = () => document.visibilityState === "visible" && reconcile(true);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [reconcile]);

  const act = useCallback(
    async (intent: PlaybackIntent) => {
      pendingUntil.current = performance.now() + PENDING_MS;
      await c.sendIntent(intent);
      pendingUntil.current = 0;
      reconcile(true);
    },
    [c, reconcile],
  );

  const togglePlay = useCallback(() => {
    const a = adapter.current;
    if (!a || !a.ready()) return;
    if (useRoom.getState().playback.status === "playing") {
      command("pause");
      a.pause();
      void act({ type: "pause", positionSec: a.time() });
    } else {
      void tryPlay();
      void act({ type: "play", positionSec: a.time() });
    }
  }, [adapter, act, tryPlay]);

  const seekTo = useCallback(
    (t: number) => {
      const a = adapter.current;
      if (!a || !a.ready()) return;
      const dur = a.duration() ?? t;
      const clamped = Math.max(0, Math.min(dur, t));
      a.seek(clamped);
      void act({ type: "seek", positionSec: clamped });
    },
    [adapter, act],
  );

  /**
   * For players with their own UI (a click on the YouTube video toggles it):
   * if the player changed state and we didn't ask it to, it was the user.
   */
  const onPlayerStateChange = useCallback(
    (state: "playing" | "paused") => {
      const a = adapter.current;
      if (!a) return;
      const last = lastCommand.current;
      // Our own command explains this change (players report state asynchronously).
      if (last && last.kind === (state === "playing" ? "play" : "pause") && performance.now() - last.at < 1500) return;
      const server = useRoom.getState().playback.status;
      if (state === "paused" && server === "playing" && !a.ended()) void act({ type: "pause", positionSec: a.time() });
      if (state === "playing" && server === "paused") void act({ type: "play", positionSec: a.time() });
    },
    [adapter, act],
  );

  return { act, togglePlay, seekTo, needsGesture, resolveGesture: tryPlay, reconcile, onPlayerStateChange };
}
