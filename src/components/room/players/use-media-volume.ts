"use client";
import { useEffect, useRef, useState } from "react";
import { useRoom } from "../store";

/** How far the film drops while someone talks (fraction of your volume). */
export const DUCK_LEVEL = 0.35;

/**
 * The film volume to actually play at: your slider, muted state, and — when
 * auto-lower is on — a smooth dip while either of you is talking.
 * Fades down quickly (so the first words are heard) and back up gently.
 */
export function useMediaVolume(): { volume: number; muted: boolean } {
  const base = useRoom((s) => s.sound.mediaVolume);
  const muted = useRoom((s) => s.mediaMuted);
  const duck = useRoom((s) => s.talking && s.sound.autoDuck !== false);
  const target = base * (duck ? DUCK_LEVEL : 1);
  const [volume, setVolume] = useState(target);
  const current = useRef(target);

  useEffect(() => {
    const from = current.current;
    if (Math.abs(from - target) < 0.005) {
      current.current = target;
      setVolume(target);
      return;
    }
    const ms = target < from ? 250 : 900;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - (1 - t) * (1 - t);
      current.current = from + (target - from) * eased;
      setVolume(current.current);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return { volume, muted };
}
