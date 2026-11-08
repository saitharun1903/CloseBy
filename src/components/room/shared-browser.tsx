"use client";
import { Globe, Loader, Power, TriangleExclamationPoint } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useController } from "./context";
import { useRoom } from "./store";

type HB = { volume: number; destroy(): void };

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
  const volume = useRoom((s) => s.sound.mediaVolume);
  const muted = useRoom((s) => s.mediaMuted);
  const startedBy = useRoom((s) => s.participants.find((p) => p.id === s.browser.startedBy)?.displayName);
  const isMe = useRoom((s) => s.browser.startedBy === s.me.id);
  const [attempt, setAttempt] = useState(0);

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

  return (
    <div className={cn("relative flex h-full w-full flex-col bg-black", mode === "mini" && "overflow-hidden rounded-xl")} data-testid="shared-browser">
      {mode === "main" && (
        <div className="flex h-11 shrink-0 items-center gap-2 px-4 text-[13px] text-paper-dim">
          <Globe className="size-4 text-lamp" />
          <span className="truncate">
            Shared browser · {isMe ? "you started it" : `started by ${startedBy ?? "your partner"}`} · you can both click and type
          </span>
          <Button size="sm" variant="secondary" className="ml-auto" onClick={() => void c.stopBrowser().catch((e) => c.handleApiError(e, "Couldn’t close the browser"))} data-testid="browser-stop">
            <Power /> Close for both
          </Button>
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        <div ref={box} className="absolute inset-0 [&_video]:object-contain" />
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
