"use client";
import { useEffect } from "react";

type Sentinel = { released: boolean; release(): Promise<void>; addEventListener(t: "release", f: () => void): void };

/**
 * Keep the screen on while you're in the room, so a phone or tablet doesn't
 * dim and lock in the middle of a film. Re-acquired when you come back to
 * the tab (browsers drop it whenever the page is hidden).
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock: Sentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      if (cancelled || document.visibilityState !== "visible" || (lock && !lock.released)) return;
      try {
        lock = (await (navigator as unknown as { wakeLock: { request(t: "screen"): Promise<Sentinel> } }).wakeLock.request("screen")) ?? null;
      } catch {
        /* battery saver or not allowed — nothing to do */
      }
    };
    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release().catch(() => {});
    };
  }, [active]);
}
