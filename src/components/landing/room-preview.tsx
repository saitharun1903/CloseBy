import { Captions, Heart, MessageSquare, Mic, MonitorUp, Pause, Video } from "lucide-react";

/**
 * Illustrative preview of the room UI for the landing page. Purely visual
 * (aria-hidden) — built from the same tokens as the real room, with an
 * abstract, original "film still" rather than any real footage.
 */
export function RoomPreview() {
  return (
    <figure className="relative" aria-label="A preview of a Closeby room: a film playing with both people's cameras floating in the corners">
      <div aria-hidden className="relative overflow-hidden rounded-xl border hairline bg-ink-900 shadow-float">
        {/* The film still: dusk over layered hills */}
        <div className="grain relative aspect-[16/9] w-full overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(180deg,#2a2130_0%,#4a3038_34%,#a8634a_58%,#e1a067_68%,#3a2a26_69%)]" />
          <div className="absolute left-[58%] top-[44%] aspect-square w-[8%] -translate-x-1/2 rounded-full bg-[#f6d39a] blur-[1px] [box-shadow:0_0_60px_30px_rgb(246_190_120/0.35)]" />
          <svg viewBox="0 0 160 90" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
            <path d="M0 62 C 20 55, 34 58, 52 54 S 88 50, 104 56 S 140 52, 160 57 L160 90 L0 90Z" fill="#2b1f1e" />
            <path d="M0 70 C 26 64, 46 70, 70 66 S 118 62, 160 69 L160 90 L0 90Z" fill="#1c1514" />
            <path d="M0 79 C 30 75, 64 80, 96 77 S 140 76, 160 79 L160 90 L0 90Z" fill="#120e0d" />
          </svg>
          <p className="absolute inset-x-0 bottom-[18%] text-center">
            <span className="rounded-xs bg-black/60 px-2 py-0.5 text-[clamp(9px,1.4vw,14px)] text-white/95">You waited for the whole sunset?</span>
          </p>

          {/* Floating cameras */}
          <Tile className="right-[3%] top-[5%]" hue={196} initial="S" name="Sam" />
          <Tile className="bottom-[19%] right-[3%]" hue={24} initial="M" name="You" speaking />

          {/* Player bar */}
          <div className="absolute inset-x-[3%] bottom-[4%] flex items-center gap-[1.5%] text-paper">
            <Pause className="size-[clamp(10px,1.6vw,16px)] fill-current" />
            <div className="relative h-[3px] flex-1 rounded-full bg-white/20">
              <div className="absolute inset-y-0 left-0 w-[38%] rounded-full bg-paper" />
              <div className="absolute left-[38%] top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-paper" />
            </div>
            <span className="font-mono text-[clamp(8px,1.1vw,11px)] text-paper/80 tabular">41:07 / 1:48:20</span>
            <span className="hidden items-center gap-1 rounded-full bg-black/35 px-2 py-0.5 text-[clamp(8px,1vw,11px)] text-paper/85 sm:flex">
              <span className="size-1.5 rounded-full bg-ok" /> In sync
            </span>
            <Captions className="size-[clamp(10px,1.5vw,15px)] text-paper/70" />
          </div>
        </div>

        {/* Room controls */}
        <div className="flex items-center justify-center gap-2 border-t hairline bg-ink-900 px-3 py-2.5">
          {[Mic, Video, MonitorUp].map((I, i) => (
            <span key={i} className="grid size-8 place-items-center rounded-full bg-ink-800 text-paper-dim sm:size-9">
              <I className="size-4" />
            </span>
          ))}
          <span className="mx-1 h-5 w-px bg-[var(--line-strong)]" />
          <span className="grid size-8 place-items-center rounded-full bg-ink-800 text-paper-dim sm:size-9">
            <Heart className="size-4" />
          </span>
          <span className="relative grid size-8 place-items-center rounded-full bg-ink-800 text-paper-dim sm:size-9">
            <MessageSquare className="size-4" />
            <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-lamp" />
          </span>
        </div>
      </div>
      <figcaption className="sr-only">Illustration of the room</figcaption>
    </figure>
  );
}

function Tile({ className, hue, initial, name, speaking }: { className: string; hue: number; initial: string; name: string; speaking?: boolean }) {
  return (
    <div
      className={`absolute w-[19%] overflow-hidden rounded-[clamp(4px,0.9vw,10px)] shadow-float ${speaking ? "ring-[1.5px] ring-lamp/80" : "ring-1 ring-white/10"} ${className}`}
    >
      <div
        className="relative grid aspect-[4/3] place-items-center"
        style={{ background: `radial-gradient(120% 90% at 50% 20%, hsl(${hue} 22% 34%), hsl(${hue} 18% 14%))` }}
      >
        {/* abstract head-and-shoulders silhouette */}
        <svg viewBox="0 0 40 30" className="absolute inset-0 h-full w-full">
          <circle cx="20" cy="13" r="6" fill={`hsl(${hue} 16% 52% / .55)`} />
          <path d="M6 30 C 8 22, 14 20, 20 20 S 32 22, 34 30Z" fill={`hsl(${hue} 16% 52% / .45)`} />
        </svg>
        <span className="sr-only">{initial}</span>
        <span className="absolute bottom-[6%] left-[6%] rounded-xs bg-black/45 px-1 text-[clamp(7px,0.9vw,10px)] text-white/90">{name}</span>
      </div>
    </div>
  );
}
