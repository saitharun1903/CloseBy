"use client";
import { Globe, Loader, Power, TriangleExclamationPoint } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useController } from "./context";
import { setSound, useRoom } from "./store";
import { toast } from "@/components/toaster";
import { useMediaVolume } from "./players/use-media-volume";

type HB = { volume: number; playoutDelay: boolean; ping(): void; destroy(): void; userId: string };
type PeerCursor = { x: number; y: number; at: number };

/**
 * The room's shared cloud browser (Hyperbeam): one real Chrome that both
 * people see, hear and control. Audio comes through the stream, so its volume
 * follows the "video" slider.
 */
export function SharedBrowser({ mode }: { mode: "main" | "mini" }) {
  const c = useController();
  const box = useRef<HTMLDivElement>(null);
  const hb = useRef<HB | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const { volume, muted } = useMediaVolume();
  const startedBy = useRoom((s) => s.participants.find((p) => p.id === s.browser.startedBy)?.displayName);
  const isMe = useRoom((s) => s.browser.startedBy === s.me.id);
  const [attempt, setAttempt] = useState(0);
  // Smooth: a small playout buffer so video doesn't stutter (clicks feel a touch slower).
  const smooth = useRoom((s) => s.sound.smoothBrowser !== false);
  // Smart smoothing: buffer for video only while nobody's using the mouse or keyboard here.
  const [interacting, setInteracting] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [peer, setPeer] = useState<PeerCursor | null>(null);
  const peerName = useRoom((s) => s.participants.find((p) => p.id !== s.me.id)?.displayName ?? "Partner");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError(null);
    (async () => {
      try {
        const embedUrl = await c.getBrowserEmbed();
        if (cancelled) return;
        if (!embedUrl) {
          setStatus("error");
          setError("The shared browser has closed.");
          return;
        }
        const { default: Hyperbeam } = await import("@hyperbeam/web");
        if (cancelled || !box.current) return;
        const s = useRoom.getState();
        const inst = await Hyperbeam(box.current, embedUrl, {
          volume: s.mediaMuted ? 0 : s.sound.mediaVolume,
          playoutDelay: s.sound.smoothBrowser !== false,
          onCursor: (e) => {
            if (cancelled || (hb.current && e.userId === hb.current.userId)) return;
            setPeer({ x: e.x, y: e.y, at: Date.now() });
          },
          onDisconnect: (e) => {
            if (cancelled) return;
            setStatus("error");
            setError(
              e.type === "inactive"
                ? "The shared browser closed because nobody used it for a while."
                : e.type === "absolute"
                  ? "The shared browser reached its time limit."
                  : "The shared browser disconnected.",
            );
            void c.refreshState();
          },
          onCloseWarning: (e) => {
            // Fired with no deadline when the countdown is reset: nothing to warn about.
            if (cancelled || !e.deadline) return;
            toast({
              title: "The shared browser is about to close",
              body: e.type === "absolute" ? "It has reached its time limit." : "Click or type inside it to keep it open.",
            });
          },
          onConnectionStateChange: (e) => {
            if (cancelled) return;
            if (e.state === "playing") setStatus("ready");
            if (e.state === "failed") {
              setStatus("error");
              setError("Couldn’t stream the shared browser. Your network may be blocking it.");
            }
          },
        });
        if (cancelled) {
          inst.destroy();
          return;
        }
        hb.current = inst;
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setError((e as Error)?.message || "The shared browser couldn’t load.");
      }
    })();
    return () => {
      cancelled = true;
      hb.current?.destroy();
      hb.current = null;
    };
  }, [c, attempt]);

  useEffect(() => {
    if (hb.current) hb.current.volume = muted ? 0 : volume;
  }, [volume, muted]);

  useEffect(() => {
    if (hb.current) hb.current.playoutDelay = smooth && !interacting;
  }, [smooth, interacting, status]);

  const onInput = () => {
    if (!interacting) setInteracting(true);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setInteracting(false), 2500);
  };
  useEffect(() => () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
  }, []);

  // Keys go to the cloud browser from anywhere on the page (delegated keyboard), so typing counts as use too.
  useEffect(() => {
    if (status !== "ready") return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.target as HTMLElement)?.closest?.("input, textarea, [contenteditable=true]")) onInput();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Hide the partner's pointer when it goes still.
  useEffect(() => {
    if (!peer) return;
    const t = setTimeout(() => setPeer((p) => (p && Date.now() - p.at >= 3900 ? null : p)), 4000);
    return () => clearTimeout(t);
  }, [peer]);

  // Watching a film means no clicks for a long time: tell the service we're still here.
  useEffect(() => {
    if (status !== "ready") return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") hb.current?.ping();
    }, 4 * 60_000);
    return () => clearInterval(t);
  }, [status]);

  return (
    <div className={cn("relative flex h-full w-full flex-col bg-black", mode === "mini" && "overflow-hidden rounded-xl")} data-testid="shared-browser">
      {mode === "main" && (
        <div className="flex h-11 shrink-0 items-center gap-2 px-4 text-[13px] text-paper-dim">
          <Globe className="size-4 text-lamp" />
          <span className="truncate">
            Shared browser · {isMe ? "you started it" : `started by ${startedBy ?? "your partner"}`}
            <span className="max-md:hidden"> · you can both click and type · sign in with Google inside it</span>
          </span>
          <button
            type="button"
            onClick={() => setSound({ smoothBrowser: !smooth })}
            className="ml-auto flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-white/[0.08] px-3 text-[12px] font-semibold text-paper hover:bg-white/[0.14]"
            title={smooth ? "Smooth video: buffers a little while you're just watching, and switches off the moment you move the mouse or type. Tap to never buffer." : "Responsive: never buffers. Video may stutter. Tap for smooth video."}
            aria-pressed={smooth}
            data-testid="browser-smooth"
          >
            <span className={cn("size-1.5 rounded-full", smooth ? "bg-ok" : "bg-white/40")} />
            {smooth ? "Smooth video" : "Responsive"}
          </button>
          <Button size="sm" variant="secondary" onClick={() => void c.stopBrowser().catch((e) => c.handleApiError(e, "Couldn’t close the browser"))} data-testid="browser-stop">
            <Power /> Close for both
          </Button>
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        <div
          ref={box}
          className="hb-stage absolute inset-0 [&_video]:object-contain"
          onPointerMove={onInput}
          onPointerDown={onInput}
          onWheel={onInput}
          onKeyDown={onInput}
          onTouchStart={onInput}
        />
        {peer && status === "ready" && <PartnerPointer box={box} cursor={peer} name={peerName} />}
        {status === "loading" && (
          <div className="absolute inset-0 grid place-items-center">
            <div className="flex flex-col items-center gap-3 text-paper-dim">
              <Loader className="size-7 animate-spin" />
              <span className="text-[13px]">Starting the shared browser…</span>
            </div>
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center" role="alert">
            <div className="max-w-[380px]">
              <TriangleExclamationPoint className="mx-auto size-7 text-danger" />
              <p className="mt-3 text-[16px] font-semibold">{error}</p>
              <div className="mt-5 flex justify-center gap-2">
                <Button size="sm" variant="primary" onClick={() => setAttempt((n) => n + 1)}>
                  Try again
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void c.stopBrowser().catch(() => {})}>
                  Close it
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The partner's pointer, drawn over the stream. Hyperbeam reports it in the
 * cloud browser's coordinates; we map that onto the letterboxed video.
 */
function PartnerPointer({ box, cursor, name }: { box: React.RefObject<HTMLDivElement | null>; cursor: PeerCursor; name: string }) {
  const el = box.current;
  const video = el?.querySelector("video");
  if (!el || !video) return null;
  const vw = video.videoWidth || 1280;
  const vh = video.videoHeight || 720;
  const bw = el.clientWidth;
  const bh = el.clientHeight;
  const scale = Math.min(bw / vw, bh / vh);
  const left = (bw - vw * scale) / 2;
  const top = (bh - vh * scale) / 2;
  // Fractions (0–1) or pixels of the cloud screen, depending on SDK version.
  const fx = cursor.x <= 1 ? cursor.x : cursor.x / vw;
  const fy = cursor.y <= 1 ? cursor.y : cursor.y / vh;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-10 transition-[left,top] duration-75 ease-linear"
      style={{ left: left + fx * vw * scale, top: top + fy * vh * scale }}
      data-testid="peer-cursor"
    >
      <svg width="18" height="20" viewBox="0 0 18 20" className="drop-shadow-[0_1px_2px_rgb(0_0_0/0.6)]">
        <path d="M1 1 L1 16 L5.2 12.2 L8 19 L10.6 17.9 L7.9 11.3 L13.6 11.3 Z" fill="#ff9f43" stroke="white" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
      <span className="ml-3 mt-0.5 inline-block rounded-full bg-[#ff9f43] px-2 py-0.5 text-[11px] font-semibold text-black shadow">{name}</span>
    </div>
  );
}
