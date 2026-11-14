"use client";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { useRoom } from "./store";

type Source = "media" | "browser" | "screen";

/** Where to find the picture for each kind of content. */
const SELECTORS: Record<Source, string> = {
  media: "[data-testid=player-video]",
  browser: "[data-testid=shared-browser] video",
  screen: "[data-testid=screen-remote], [data-testid=screen-local]",
};

const W = 48;
const H = 27;

/**
 * Ambient light: the room glows with the colours of what you're watching,
 * like a TV with backlights. A tiny copy of the picture is drawn a few times a
 * second, blended over the last frame so colour changes drift rather than
 * flicker, then blown up and blurred behind the content.
 * (Only drawn, never read back, so cross-origin videos work too.)
 * YouTube's player is a sealed iframe, so for YouTube we glow with the
 * video's thumbnail instead.
 */
export function AmbientLight({ source, className }: { source: Source | null; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const on = useRoom((s) => s.sound.ambient !== false);
  const thumb = useRoom((s) => {
    const item = s.queue.find((q) => q.id === s.playback.mediaId);
    return item?.kind === "youtube" ? item.thumbnailUrl : null;
  });

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d", { alpha: false });
    if (!on || !source || !c || !ctx) return;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    let img: HTMLImageElement | null = null;
    if (source === "media" && thumb) {
      img = new Image();
      img.src = thumb;
    }

    const draw = () => {
      if (document.visibilityState !== "visible") return;
      const v = document.querySelector<HTMLVideoElement>(SELECTORS[source]);
      ctx.globalAlpha = 0.35; // temporal smoothing
      try {
        if (v && v.readyState >= 2 && v.videoWidth > 0) ctx.drawImage(v, 0, 0, W, H);
        else if (img?.complete && img.naturalWidth > 0) ctx.drawImage(img, 0, 0, W, H);
      } catch {
        /* frame not available yet */
      }
      ctx.globalAlpha = 1;
    };
    draw();
    const t = setInterval(draw, 160);
    return () => clearInterval(t);
  }, [on, source, thumb]);

  if (!on || !source) return null;
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} data-testid="ambient-light">
      <canvas
        ref={canvas}
        width={W}
        height={H}
        className="absolute inset-[-12%] h-[124%] w-[124%] opacity-60 [filter:blur(56px)_saturate(1.6)_brightness(0.85)] motion-safe:transition-opacity motion-safe:duration-700"
      />
      {/* Keep the edges dark so the glow reads as light spill, not a second picture. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgb(0_0_0/0.65)_100%)]" />
    </div>
  );
}
