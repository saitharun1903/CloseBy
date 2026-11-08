"use client";
import { useEffect, useRef } from "react";

/** A tiny level meter driven by an AnalyserNode. Renders via rAF without React re-renders. */
export function MicMeter({ track, bars = 5, className }: { track?: MediaStreamTrack | null; bars?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!track || track.readyState === "ended") return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const src = ctx.createMediaStreamSource(new MediaStream([track]));
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    const data = new Uint8Array(an.fftSize);
    let raf = 0;
    const tick = () => {
      an.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += ((v - 128) / 128) ** 2;
      const rms = Math.sqrt(sum / data.length);
      const level = Math.min(1, rms * 6);
      const el = ref.current;
      if (el) {
        const lit = Math.round(level * bars);
        el.querySelectorAll<HTMLElement>("[data-bar]").forEach((b, i) => (b.dataset.on = String(i < lit)));
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      src.disconnect();
      void ctx.close();
    };
  }, [track, bars]);

  return (
    <div ref={ref} className={`flex items-end gap-[3px] ${className ?? ""}`} aria-hidden>
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          data-bar
          data-on="false"
          className="w-[3px] rounded-full bg-paper/25 transition-colors duration-75 data-[on=true]:bg-lamp"
          style={{ height: `${6 + i * 3}px` }}
        />
      ))}
    </div>
  );
}
