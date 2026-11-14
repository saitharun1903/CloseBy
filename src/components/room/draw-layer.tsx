"use client";
import { Pencil, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useController } from "./context";
import { useRoom } from "./store";

type Stroke = { pts: [number, number][]; mine: boolean; endedAt: number | null };

const MINE = "#ffb36b"; // projector amber
const THEIRS = "#7fd4ff"; // a cool blue, so you can tell whose line is whose
const FADE_MS = 3500;

/**
 * Draw together: sketch over the stage and your partner sees it live.
 * Points are sent as fractions of the stage in small batches; lines fade a few
 * seconds after they're finished. Not available over YouTube's player, which
 * may not be drawn on.
 */
export function DrawLayer({ blocked }: { blocked: boolean }) {
  const c = useController();
  const drawing = useRoom((s) => s.drawing) && !blocked;
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef(new Map<string, Stroke>());
  const raf = useRef(0);

  // Redraw loop (only while there's something on screen).
  const kick = () => {
    if (raf.current) return;
    const frame = () => {
      raf.current = 0;
      const cv = canvas.current;
      if (!cv) return;
      const dpr = window.devicePixelRatio || 1;
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      const g = cv.getContext("2d")!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const now = performance.now();
      let alive = false;
      for (const [id, s] of strokes.current) {
        const age = s.endedAt ? now - s.endedAt : 0;
        if (age > FADE_MS) {
          strokes.current.delete(id);
          continue;
        }
        alive = true;
        g.globalAlpha = s.endedAt ? Math.max(0, 1 - age / FADE_MS) : 1;
        g.strokeStyle = s.mine ? MINE : THEIRS;
        g.lineWidth = 5;
        g.lineCap = "round";
        g.lineJoin = "round";
        g.shadowColor = s.mine ? "rgba(255,179,107,0.7)" : "rgba(127,212,255,0.7)";
        g.shadowBlur = 12;
        g.beginPath();
        s.pts.forEach(([x, y], i) => (i ? g.lineTo(x * w, y * h) : g.moveTo(x * w, y * h)));
        if (s.pts.length === 1) g.lineTo(s.pts[0]![0] * w + 0.1, s.pts[0]![1] * h);
        g.stroke();
      }
      if (alive) raf.current = requestAnimationFrame(frame);
    };
    raf.current = requestAnimationFrame(frame);
  };

  // Partner's strokes.
  useEffect(
    () =>
      c.onStroke((s) => {
        const cur = strokes.current.get(s.id) ?? { pts: [], mine: s.mine, endedAt: null };
        cur.pts.push(...s.pts);
        if (s.end) cur.endedAt = performance.now();
        strokes.current.set(s.id, cur);
        kick();
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [c],
  );
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // Esc leaves drawing mode.
  useEffect(() => {
    if (!drawing) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && useRoom.setState({ drawing: false });
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawing]);

  // My strokes.
  const active = useRef<{ id: string; pending: [number, number][]; timer: ReturnType<typeof setInterval> } | null>(null);
  const point = (e: React.PointerEvent): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };
  const flush = (end = false) => {
    const a = active.current;
    if (!a) return;
    if (a.pending.length || end) c.sendStroke(a.id, a.pending.length ? a.pending.splice(0, 64) : [strokes.current.get(`m:${a.id}`)?.pts.at(-1) ?? [0, 0]], end);
  };

  return (
    <>
      <canvas
        ref={canvas}
        aria-hidden={!drawing}
        className="absolute inset-0 z-[25] h-full w-full touch-none"
        style={{ pointerEvents: drawing ? "auto" : "none", cursor: drawing ? "crosshair" : undefined }}
        data-testid="draw-layer"
        onPointerDown={(e) => {
          if (!drawing) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const id = Math.random().toString(36).slice(2, 10);
          const p = point(e);
          strokes.current.set(`m:${id}`, { pts: [p], mine: true, endedAt: null });
          active.current = { id, pending: [p], timer: setInterval(() => flush(), 50) };
          kick();
        }}
        onPointerMove={(e) => {
          const a = active.current;
          if (!a) return;
          const p = point(e);
          strokes.current.get(`m:${a.id}`)?.pts.push(p);
          a.pending.push(p);
          kick();
        }}
        onPointerUp={() => {
          const a = active.current;
          if (!a) return;
          clearInterval(a.timer);
          flush(true);
          const s = strokes.current.get(`m:${a.id}`);
          if (s) s.endedAt = performance.now();
          active.current = null;
          kick();
        }}
      />
      {drawing && (
        <div className="pointer-events-none absolute inset-x-0 top-[calc(var(--safe-top)+64px)] z-30 flex justify-center">
          <div className="glass pointer-events-auto flex items-center gap-2 rounded-full py-1.5 pl-4 pr-1.5 text-[13px] font-medium text-paper" data-testid="draw-hint">
            <Pencil className="size-4 text-lamp" /> Draw anywhere — {useRoom.getState().participants.find((p) => p.id !== useRoom.getState().me.id)?.displayName ?? "your partner"} sees it live
            <button onClick={() => useRoom.setState({ drawing: false })} className="ml-1 grid size-7 place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Stop drawing" data-testid="draw-stop">
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
