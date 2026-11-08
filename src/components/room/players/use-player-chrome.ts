"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/components/toaster";
import { useController } from "../context";
import { useRoom } from "../store";

/** Auto-hiding controls, keyboard shortcuts and end-of-item behaviour shared by players. */
export function usePlayerChrome(isMain: boolean, togglePlay: () => void, seekTo: (t: number) => void, now: () => number) {
  const c = useController();
  const [active, setActive] = useState(true);
  const idle = useRef<ReturnType<typeof setTimeout>>(undefined);
  const playing = useRoom((s) => s.playback.status === "playing");

  const poke = useCallback(() => {
    setActive(true);
    clearTimeout(idle.current);
    idle.current = setTimeout(() => setActive(false), 2800);
  }, []);
  useEffect(() => () => clearTimeout(idle.current), []);

  // Space/K play-pause, ←/→ 10 s — only when nothing editable has focus.
  useEffect(() => {
    if (!isMain) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable=true], [role=slider], [role=menu], [role=dialog]")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === " " || e.key === "k") {
        if (t.tagName === "BUTTON" && e.key === " ") return;
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        seekTo(now() + 10);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        seekTo(now() - 10);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMain, togglePlay, seekTo, now]);

  /** The host advances the queue so the two of us don't both do it. */
  const onEnded = useCallback(
    (itemId: string) => {
      const s = useRoom.getState();
      if (s.me.role !== "host") return;
      const next = s.queue[s.queue.findIndex((x) => x.id === itemId) + 1];
      if (next) {
        toast({ title: `Up next: ${next.title}` });
        void c.sendIntent({ type: "load", mediaId: next.id });
      }
    },
    [c],
  );

  return { poke, controlsUp: active || !playing, onEnded };
}
