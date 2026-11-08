"use client";
import type { Participant } from "livekit-client";
import { ArrowLeftRight, EyeOff, Minus, MicOff } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { participantHue, ParticipantTile } from "./media";
import { setSound, useRoom } from "./store";

type Corner = "tl" | "tr" | "bl" | "br";
interface TileState {
  corner: Corner;
  width: number;
  minimized: boolean;
}

const MARGIN = 12;
const GAP = 10;
const ASPECT = 3 / 4; // height / width
const PILL_H = 36;

interface Insets {
  top: number;
  bottom: number;
}

/**
 * Picture-in-picture camera tiles over the stage. Tiles snap to corners and
 * stack when sharing one. Bottom corners sit above the player's controls so
 * the seek bar and subtitles stay clear.
 */
export function FloatingTiles({
  local,
  remote,
  remoteName,
  insets,
}: {
  local: Participant;
  remote?: Participant;
  remoteName?: string;
  insets: Insets;
}) {
  const hideSelf = useRoom((s) => s.sound.hideSelf);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [tiles, setTiles] = useState<Record<"remote" | "local", TileState>>({
    remote: { corner: "tr", width: 0, minimized: false },
    local: { corner: "br", width: 0, minimized: false },
  });
  const [drag, setDrag] = useState<{ id: "remote" | "local"; x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e!.contentRect.width, h: e!.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const defaultWidth = Math.round(Math.min(280, Math.max(120, size.w * 0.2)));
  const maxWidth = Math.round(Math.min(520, size.w * 0.45, (size.h - insets.top - insets.bottom - MARGIN * 2) / ASPECT / 1.05));
  const widthOf = (t: TileState) => Math.max(110, Math.min(maxWidth || 9999, t.width || defaultWidth));
  const heightOf = (t: TileState) => (t.minimized ? PILL_H : Math.round(widthOf(t) * ASPECT));

  const visible: ("remote" | "local")[] = [];
  if (remote) visible.push("remote");
  if (!hideSelf) visible.push("local");

  // Compute positions: tiles in the same corner stack toward the centre.
  const positions: Record<string, { x: number; y: number; w: number; h: number }> = {};
  const stackOffset: Record<Corner, number> = { tl: 0, tr: 0, bl: 0, br: 0 };
  for (const id of visible) {
    const t = tiles[id];
    const w = t.minimized ? Math.min(180, widthOf(t)) : widthOf(t);
    const h = heightOf(t);
    const right = t.corner.endsWith("r");
    const bottom = t.corner.startsWith("b");
    const x = right ? size.w - w - MARGIN : MARGIN;
    const off = stackOffset[t.corner];
    const y = bottom ? size.h - insets.bottom - MARGIN - h - off : insets.top + MARGIN + off;
    stackOffset[t.corner] += h + GAP;
    positions[id] = { x, y, w, h };
  }

  function nearestCorner(cx: number, cy: number): Corner {
    return `${cy < size.h / 2 ? "t" : "b"}${cx < size.w / 2 ? "l" : "r"}` as Corner;
  }

  function startDrag(id: "remote" | "local", e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest("button, [data-resize]")) return;
    const p = positions[id];
    const boxEl = box.current;
    if (!p || !boxEl) return;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const rect = boxEl.getBoundingClientRect();
    const ox = e.clientX - rect.left - p.x;
    const oy = e.clientY - rect.top - p.y;
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;
    const at = (ev: PointerEvent) => ({
      x: Math.max(0, Math.min(size.w - p.w, ev.clientX - rect.left - ox)),
      y: Math.max(0, Math.min(size.h - p.h, ev.clientY - rect.top - oy)),
    });
    const onMove = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
      moved = true;
      setDrag({ id, ...at(ev) });
    };
    const onUp = (ev: PointerEvent) => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      if (moved) {
        const q = at(ev);
        setTiles((s) => ({ ...s, [id]: { ...s[id], corner: nearestCorner(q.x + p.w / 2, q.y + p.h / 2) } }));
      }
      setDrag(null);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
  }

  function startResize(id: "remote" | "local", e: React.PointerEvent) {
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startW = widthOf(tiles[id]);
    const right = tiles[id].corner.endsWith("r");
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const w = Math.max(110, Math.min(maxWidth, startW + (right ? -dx : dx)));
      setTiles((s) => ({ ...s, [id]: { ...s[id], width: w } }));
    };
    const onUp = () => {
      el.removeEventListener("pointermove", onMove);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp, { once: true });
    el.addEventListener("pointercancel", onUp, { once: true });
  }

  function swap() {
    setTiles((s) => ({ remote: { ...s.remote, corner: s.local.corner }, local: { ...s.local, corner: s.remote.corner } }));
  }

  return (
    <div ref={box} className="pointer-events-none absolute inset-0 z-20" data-testid="floating-tiles">
      {size.w > 0 &&
        visible.map((id) => {
          const p = positions[id]!;
          const t = tiles[id];
          const participant = id === "remote" ? remote! : local;
          const dragging = drag?.id === id;
          const x = dragging ? drag.x : p.x;
          const y = dragging ? drag.y : p.y;
          const resizeLeft = t.corner.endsWith("r");
          const resizeTop = t.corner.startsWith("b");
          return (
            <div
              key={id}
              role="group"
              aria-label={id === "remote" ? `${remoteName ?? "Partner"}’s camera` : "Your camera"}
              className={cn(
                "group/tile pointer-events-auto absolute left-0 top-0 touch-none select-none overflow-hidden rounded-lg shadow-float",
                dragging ? "cursor-grabbing transition-none" : "cursor-grab transition-[transform,width,height] duration-300 ease-[cubic-bezier(.25,1,.5,1)]",
              )}
              style={{ transform: `translate3d(${x}px, ${y}px, 0)`, width: p.w, height: p.h }}
              onPointerDown={(e) => startDrag(id, e)}
            >
              {t.minimized ? (
                <MiniPill participant={participant} name={id === "remote" ? remoteName : "You"} onRestore={() => setTiles((s) => ({ ...s, [id]: { ...s[id], minimized: false } }))} />
              ) : (
                <>
                  <ParticipantTile participant={participant} isLocal={id === "local"} name={id === "remote" ? remoteName : undefined} className="rounded-lg" />
                  <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/tile:opacity-100 [@media(hover:none)]:opacity-100">
                    {visible.length === 2 && (
                      <TileButton label="Swap camera positions" onClick={swap}>
                        <ArrowLeftRight />
                      </TileButton>
                    )}
                    {id === "local" && (
                      <TileButton label="Hide your own camera" onClick={() => setSound({ hideSelf: true })}>
                        <EyeOff />
                      </TileButton>
                    )}
                    <TileButton label="Minimize" onClick={() => setTiles((s) => ({ ...s, [id]: { ...s[id], minimized: true } }))}>
                      <Minus />
                    </TileButton>
                  </div>
                  <div
                    data-resize
                    role="separator"
                    aria-label="Resize camera"
                    className={cn(
                      "absolute size-5 opacity-0 transition-opacity group-hover/tile:opacity-100",
                      resizeTop ? "top-0" : "bottom-0",
                      resizeLeft ? "left-0" : "right-0",
                      resizeTop === resizeLeft ? "cursor-nwse-resize" : "cursor-nesw-resize",
                    )}
                    onPointerDown={(e) => startResize(id, e)}
                  >
                    <span className={cn("absolute size-2.5 border-white/70", resizeTop ? "top-1.5 border-t-2" : "bottom-1.5 border-b-2", resizeLeft ? "left-1.5 border-l-2" : "right-1.5 border-r-2")} />
                  </div>
                </>
              )}
            </div>
          );
        })}
    </div>
  );
}

function TileButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid size-7 place-items-center rounded-md bg-black/55 text-white backdrop-blur hover:bg-black/75 [&_svg]:size-3.5"
    >
      {children}
    </button>
  );
}

function MiniPill({ participant, name, onRestore }: { participant: Participant; name?: string; onRestore: () => void }) {
  const hue = participantHue(participant);
  return (
    <button
      type="button"
      onClick={onRestore}
      aria-label={`Restore ${name ?? "camera"}`}
      className={cn("flex h-full w-full items-center gap-2 bg-ink-850/95 px-2 text-left backdrop-blur", participant.isSpeaking && "shadow-[inset_0_0_0_1.5px_var(--color-lamp)]")}
    >
      <span className="grid size-6 shrink-0 place-items-center rounded-full text-[12px] text-paper" style={{ background: `hsl(${hue} 22% 30%)` }}>
        {(name ?? "?").slice(0, 1).toUpperCase()}
      </span>
      <span className="truncate text-[12px] font-medium text-paper">{name}</span>
      {!participant.isMicrophoneEnabled && <MicOff className="ml-auto size-3.5 shrink-0 text-danger" />}
    </button>
  );
}
