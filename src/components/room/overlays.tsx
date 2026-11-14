"use client";
import * as D from "@radix-ui/react-dialog";
import { Keyboard, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { serverNow, useRoom } from "./store";

/** While chat is closed, the partner's messages float up over the call for a moment. */
export function ChatBubbles({ bottom }: { bottom: number }) {
  const bubbles = useRoom((s) => s.bubbles);
  const name = useRoom((s) => s.participants.find((p) => p.id !== s.me.id)?.displayName ?? "Partner");
  const panel = useRoom((s) => s.panel);
  if (panel === "chat") return null;
  return (
    <div className="pointer-events-none absolute left-3 z-30 flex w-[min(360px,calc(100vw-24px))] flex-col items-start gap-2 sm:left-5" style={{ bottom }} aria-live="polite" data-testid="chat-bubbles">
      <AnimatePresence initial={false}>
        {bubbles.map((b) => (
          <motion.button
            key={b.id}
            layout
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, transition: { duration: 0.25 } }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            onClick={() => useRoom.setState({ panel: "chat", unread: 0, bubbles: [] })}
            className="glass pointer-events-auto max-w-full rounded-[20px] rounded-bl-[6px] px-3.5 py-2 text-left shadow-float"
            data-testid="chat-bubble"
          >
            <span className="block text-[11px] font-semibold text-lamp-bright">{name}</span>
            <span className="line-clamp-3 text-[14px] leading-snug text-paper">{b.text}</span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}

/**
 * "3-2-1": a countdown on both screens before playback starts.
 * Over a YouTube player nothing may cover the video, so it sits in a pill at the top instead.
 */
export function CountdownOverlay({ overPlayer }: { overPlayer: boolean }) {
  const at = useRoom((s) => s.countdownAt);
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    if (!at) return setN(null);
    const tick = () => setN(Math.max(0, Math.ceil((at - serverNow()) / 1000)));
    tick();
    const t = setInterval(tick, 80);
    return () => clearInterval(t);
  }, [at]);
  if (!at || n === null) return null;
  const label = n > 0 ? String(n) : "▶";
  if (overPlayer) {
    return (
      <div className="pointer-events-none absolute inset-x-0 top-[calc(var(--safe-top)+64px)] z-40 flex justify-center" data-testid="countdown">
        <span className="glass rounded-full px-5 py-2 font-serif text-[28px] leading-none text-paper">Starting in {label}</span>
      </div>
    );
  }
  return (
    <div className="pointer-events-none absolute inset-0 z-40 grid place-items-center bg-black/35" data-testid="countdown">
      <AnimatePresence mode="popLayout">
        <motion.span
          key={label}
          initial={{ opacity: 0, scale: 1.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.7 }}
          transition={{ duration: 0.35, ease: [0.25, 1, 0.5, 1] }}
          className="font-serif text-[clamp(120px,22vw,260px)] leading-none text-paper drop-shadow-[0_0_60px_rgb(255_179_107/0.55)]"
        >
          {label}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

const SHORTCUTS: [string, string][] = [
  ["Space or K", "Play / pause for both"],
  ["← / →", "Back / forward 10 seconds for both"],
  ["F", "Full screen"],
  ["⌘/Ctrl + D", "Mute / unmute your mic"],
  ["⌘/Ctrl + E", "Camera on / off"],
  ["?", "Show these shortcuts"],
  ["Double-click the video", "Point at something for your partner"],
];

/** "?" opens a list of keyboard shortcuts. */
export function ShortcutsHelp() {
  const open = useRoom((s) => s.shortcutsOpen);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable=true]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "?") {
        e.preventDefault();
        useRoom.setState((s) => ({ shortcutsOpen: !s.shortcutsOpen }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <D.Root open={open} onOpenChange={(o) => useRoom.setState({ shortcutsOpen: o })}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md data-[state=open]:animate-fade-in" />
        <D.Content className="fixed left-1/2 top-1/2 z-50 w-[min(460px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 rounded-[28px] border hairline bg-ink-900 p-6 shadow-float data-[state=open]:animate-fade-in" data-testid="shortcuts" aria-describedby={undefined}>
          <div className="flex items-center gap-2.5">
            <Keyboard className="size-5 text-lamp" />
            <D.Title className="font-serif text-[28px] leading-none">Keyboard shortcuts</D.Title>
            <D.Close className="ml-auto grid size-9 place-items-center rounded-full bg-white/10 text-paper-dim hover:text-paper" aria-label="Close">
              <X className="size-4" />
            </D.Close>
          </div>
          <dl className="mt-5 divide-y divide-white/[0.07]">
            {SHORTCUTS.map(([k, v]) => (
              <div key={k} className="flex items-center gap-4 py-2.5">
                <dt className={cn("min-w-[130px] font-mono text-[12px] text-paper")}>
                  <kbd className="rounded-md bg-white/[0.08] px-2 py-1">{k}</kbd>
                </dt>
                <dd className="text-[14px] text-paper-dim">{v}</dd>
              </div>
            ))}
          </dl>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
