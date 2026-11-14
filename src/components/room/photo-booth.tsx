"use client";
import * as D from "@radix-ui/react-dialog";
import { Download, Share2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/toaster";
import { useRoom } from "./store";

const W = 1600;
const H = 1000;

type Person = { name: string; video: HTMLVideoElement | null; hue: number };

/**
 * Photo booth: when either of you presses "Snap", both screens flash and each
 * of you gets the same keepsake card — your two faces side by side, the film's
 * name and the date — to save or share. Made locally from the live video; it
 * never touches our servers.
 */
export function PhotoBooth() {
  const seq = useRoom((s) => s.snapSeq);
  const [flash, setFlash] = useState(false);
  const [photo, setPhoto] = useState<{ url: string; blob: Blob } | null>(null);
  const first = useRef(seq);

  useEffect(() => {
    if (seq === first.current) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 450);
    void compose()
      .then((blob) => {
        if (!blob) return;
        setPhoto((old) => {
          if (old) URL.revokeObjectURL(old.url);
          return { url: URL.createObjectURL(blob), blob };
        });
      })
      .catch(() => toast({ tone: "error", title: "Couldn’t take the photo", body: "Try again in a moment." }));
    return () => clearTimeout(t);
  }, [seq]);

  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fileName = `closeby-movie-night-${new Date().toISOString().slice(0, 10)}.png`;
  const canShare = typeof navigator !== "undefined" && !!navigator.canShare && !!photo && navigator.canShare({ files: [new File([photo.blob], fileName, { type: "image/png" })] });

  return (
    <>
      {flash && <div aria-hidden className="pointer-events-none fixed inset-0 z-[70] animate-[flash_450ms_ease-out_forwards] bg-white" data-testid="snap-flash" />}
      <D.Root
        open={!!photo}
        onOpenChange={(o) => {
          if (!o && photo) {
            URL.revokeObjectURL(photo.url);
            setPhoto(null);
          }
        }}
      >
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-md data-[state=open]:animate-fade-in" />
          <D.Content className="fixed left-1/2 top-1/2 z-[60] w-[min(720px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 rounded-[28px] border hairline bg-ink-900 p-4 shadow-float data-[state=open]:animate-fade-in sm:p-5" data-testid="snap-preview" aria-describedby={undefined}>
            <div className="mb-3 flex items-center">
              <D.Title className="font-serif text-[26px] leading-none">A little keepsake</D.Title>
              <D.Close className="ml-auto grid size-9 place-items-center rounded-full bg-white/10 text-paper-dim hover:text-paper" aria-label="Close">
                <X className="size-4" />
              </D.Close>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {photo && <img src={photo.url} alt="Photo of the two of you" className="w-full rounded-2xl ring-1 ring-white/10" data-testid="snap-image" />}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              {canShare && (
                <Button
                  variant="secondary"
                  onClick={() => void navigator.share({ files: [new File([photo!.blob], fileName, { type: "image/png" })], title: "Movie night" }).catch(() => {})}
                >
                  <Share2 /> Share
                </Button>
              )}
              <Button variant="primary" asChild>
                <a href={photo?.url} download={fileName} data-testid="snap-save">
                  <Download /> Save photo
                </a>
              </Button>
            </div>
          </D.Content>
        </D.Portal>
      </D.Root>
    </>
  );
}

/** Build the card from what's on screen right now. */
async function compose(): Promise<Blob | null> {
  const s = useRoom.getState();
  const me = s.participants.find((p) => p.id === s.me.id);
  const partner = s.participants.find((p) => p.id !== s.me.id);
  const local: Person = { name: me?.displayName ?? "You", video: document.querySelector("[data-testid=video-local]"), hue: me?.avatarHue ?? 30 };
  const remote: Person = { name: partner?.displayName ?? "Partner", video: document.querySelector("[data-testid=video-remote]"), hue: partner?.avatarHue ?? 200 };
  // Same order on both screens: host on the left.
  const people = s.me.role === "host" ? [local, remote] : [remote, local];
  const title = s.queue.find((q) => q.id === s.playback.mediaId)?.title ?? null;

  await document.fonts?.load?.('64px "Instrument Serif"').catch(() => {});
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;

  // Backdrop: warm velvet with projector light, plus the film's own colours when we may use them.
  g.fillStyle = "#0b0908";
  g.fillRect(0, 0, W, H);
  const film = document.querySelector<HTMLVideoElement>("[data-testid=player-video]");
  if (film && film.readyState >= 2 && film.videoWidth && canUse(film)) {
    g.save();
    g.filter = "blur(60px) saturate(1.4) brightness(0.55)";
    g.drawImage(film, -100, -100, W + 200, H + 200);
    g.restore();
  }
  const glow = g.createRadialGradient(W / 2, -120, 40, W / 2, -120, 900);
  glow.addColorStop(0, "rgba(255,190,120,0.45)");
  glow.addColorStop(1, "rgba(255,179,107,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);

  // Two frames.
  const fw = 680;
  const fh = 510;
  const gap = 60;
  const x0 = (W - (fw * 2 + gap)) / 2;
  const y0 = 120;
  people.forEach((p, i) => drawFrame(g, p, x0 + i * (fw + gap), y0, fw, fh, i === 0 ? -1.6 : 1.6));

  // Caption.
  g.textAlign = "center";
  g.fillStyle = "#f4ede3";
  g.font = '86px "Instrument Serif", Georgia, serif';
  g.fillText(`${people[0]!.name} & ${people[1]!.name}`, W / 2, y0 + fh + 150);
  g.font = 'italic 40px "Instrument Serif", Georgia, serif';
  g.fillStyle = "#ffc98f";
  const date = new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  g.fillText(title ? `watching “${truncate(title, 48)}” · ${date}` : `movie night · ${date}`, W / 2, y0 + fh + 212);
  g.font = "600 22px Inter, system-ui, sans-serif";
  g.fillStyle = "rgba(244,237,227,0.45)";
  g.fillText("closeby.tech", W / 2, H - 40);

  return new Promise((resolve) => c.toBlob((b) => resolve(b), "image/png"));
}

function drawFrame(g: CanvasRenderingContext2D, p: Person, x: number, y: number, w: number, h: number, tilt: number) {
  g.save();
  g.translate(x + w / 2, y + h / 2);
  g.rotate((tilt * Math.PI) / 180);
  g.translate(-w / 2, -h / 2);
  // Photo-paper border and shadow.
  g.shadowColor = "rgba(0,0,0,0.6)";
  g.shadowBlur = 50;
  g.shadowOffsetY = 20;
  g.fillStyle = "#f4ede3";
  roundRect(g, -14, -14, w + 28, h + 28, 30);
  g.fill();
  g.shadowColor = "transparent";
  roundRect(g, 0, 0, w, h, 20);
  g.clip();
  const v = p.video;
  if (v && v.readyState >= 2 && v.videoWidth) {
    // Cover-crop, unmirrored: both of you get the same picture.
    const s = Math.max(w / v.videoWidth, h / v.videoHeight);
    const dw = v.videoWidth * s;
    const dh = v.videoHeight * s;
    g.drawImage(v, (w - dw) / 2, (h - dh) / 2, dw, dh);
  } else {
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, `hsl(${p.hue} 35% 26%)`);
    bg.addColorStop(1, "#141210");
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#f4ede3";
    g.textAlign = "center";
    g.font = '200px "Instrument Serif", Georgia, serif';
    g.fillText(p.name.slice(0, 1).toUpperCase(), w / 2, h / 2 + 70);
  }
  g.restore();
}

/** A video from another site without CORS can be shown but not copied into a photo. */
function canUse(v: HTMLVideoElement) {
  try {
    const t = document.createElement("canvas");
    t.width = t.height = 1;
    const tg = t.getContext("2d")!;
    tg.drawImage(v, 0, 0, 1, 1);
    tg.getImageData(0, 0, 1, 1);
    return true;
  } catch {
    return false;
  }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
