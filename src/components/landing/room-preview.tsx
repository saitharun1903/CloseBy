import { Ellipsis, Heart, MessageSquare, Mic, PhoneOff, Tv, Video } from "lucide-react";

/**
 * Illustration of a room for the landing page (aria-hidden visuals).
 * Built from the same tokens as the real room, with an abstract, original
 * "video" rather than real footage.
 */
export function RoomPreview() {
  return (
    <figure className="relative" aria-label="A Closeby room: a video playing full screen, both people's cameras in the corner, and call controls floating at the bottom">
      <div aria-hidden className="relative overflow-hidden rounded-[28px] bg-black shadow-[0_50px_140px_-30px_rgb(255_179_107/0.35),0_30px_80px_-20px_rgb(0_0_0/0.9)] ring-1 ring-[#ffd3a1]/15">
        <div className="relative aspect-[16/10] w-full overflow-hidden">
          {/* abstract scene */}
          <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_30%_10%,#8a4b2c_0%,#3a1c14_42%,#0a0605_100%)]" />
          <div className="absolute -left-[10%] top-[30%] h-[70%] w-[70%] rounded-full bg-[#ff6a3d]/35 blur-[60px]" />
          <div className="absolute right-[5%] top-[10%] h-[50%] w-[45%] rounded-full bg-[#ffc27a]/30 blur-[70px]" />
          <svg viewBox="0 0 160 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
            <path d="M0 72 C 30 62, 52 68, 80 60 S 130 56, 160 64 L160 100 L0 100Z" fill="#140a07" opacity="0.85" />
            <path d="M0 82 C 34 76, 70 84, 104 78 S 140 76, 160 80 L160 100 L0 100Z" fill="#060403" />
          </svg>

          {/* top pills */}
          <div className="absolute left-[3%] top-[4%] flex items-center gap-2 rounded-full bg-black/35 py-1 pl-1 pr-3 backdrop-blur-xl">
            <span className="grid size-[clamp(14px,2vw,22px)] place-items-center rounded-full bg-[hsl(196_45%_42%)] text-[clamp(7px,0.9vw,10px)] font-semibold text-white">S</span>
            <span className="leading-tight">
              <span className="block text-[clamp(7px,0.95vw,11px)] font-semibold text-white">Sam</span>
              <span className="block text-[clamp(6px,0.75vw,9px)] text-white/60">Watching · Northern Lights</span>
            </span>
          </div>

          {/* PiP faces */}
          <Face className="right-[3%] top-[4%]" hue={196} label="Sam" />
          <Face className="right-[3%] top-[36%]" hue={24} label="You" speaking />

          {/* control pill */}
          <div className="absolute bottom-[5%] left-1/2 flex -translate-x-1/2 items-center gap-[clamp(3px,0.6vw,8px)] rounded-full bg-[#1e1e22]/70 p-[clamp(3px,0.5vw,6px)] backdrop-blur-xl">
            {[Mic, Video, Tv, Heart, MessageSquare, Ellipsis].map((I, i) => (
              <span key={i} className={`grid size-[clamp(16px,2.6vw,32px)] place-items-center rounded-full ${i === 2 ? "bg-white text-black" : "bg-white/15 text-white"}`}>
                <I className="size-[45%]" />
              </span>
            ))}
            <span className="grid size-[clamp(16px,2.6vw,32px)] place-items-center rounded-full bg-[#ff453a] text-white">
              <PhoneOff className="size-[45%]" />
            </span>
          </div>
        </div>
      </div>
      <figcaption className="sr-only">Illustration of the room</figcaption>
    </figure>
  );
}

function Face({ className, hue, label, speaking }: { className: string; hue: number; label: string; speaking?: boolean }) {
  return (
    <div className={`absolute w-[18%] overflow-hidden rounded-[clamp(6px,1.2vw,14px)] shadow-2xl ${speaking ? "ring-2 ring-[#30d158]" : "ring-1 ring-white/15"} ${className}`}>
      <div className="relative grid aspect-[4/3] place-items-center" style={{ background: `radial-gradient(120% 90% at 50% 20%, hsl(${hue} 35% 38%), hsl(${hue} 30% 12%))` }}>
        <svg viewBox="0 0 40 30" className="absolute inset-0 h-full w-full">
          <circle cx="20" cy="13" r="6" fill={`hsl(${hue} 30% 70% / .55)`} />
          <path d="M6 30 C 8 22, 14 20, 20 20 S 32 22, 34 30Z" fill={`hsl(${hue} 30% 70% / .45)`} />
        </svg>
        <span className="absolute bottom-[6%] left-[6%] rounded-full bg-black/45 px-1.5 text-[clamp(6px,0.8vw,9px)] font-semibold text-white">{label}</span>
      </div>
    </div>
  );
}
