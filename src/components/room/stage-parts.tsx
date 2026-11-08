"use client";
import { ConnectionQuality, type Participant, Track } from "livekit-client";
import { AnimatePresence, motion } from "motion/react";
import { Check, Copy, Lock, MonitorOff, Share, Volume2, VolumeX, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/logo";
import { toast } from "@/components/toaster";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useController, useLk } from "./context";
import { QualityBars, screenTrack, TrackVideo } from "./media";
import { useRoom } from "./store";

function useRemaining(expiresAt: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const ms = Math.max(0, new Date(expiresAt).getTime() - now);
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function TopBar({ partner, partnerName }: { partner?: Participant; partnerName?: string }) {
  const roomId = useRoom((s) => s.roomId);
  const expiresAt = useRoom((s) => s.expiresAt);
  const inviteUrl = useRoom((s) => s.inviteUrl);
  const conn = useRoom((s) => s.conn);
  const remaining = useRemaining(expiresAt);
  return (
    <div className="flex h-14 items-center gap-3 px-4 sm:px-5">
      <LogoMark className="text-paper" />
      <div className="flex min-w-0 items-center gap-2 text-[13px]">
        {partner ? (
          <>
            <span className="size-1.5 shrink-0 rounded-full bg-ok" aria-hidden />
            <span className="truncate text-paper">
              With <span className="font-medium">{partnerName}</span>
            </span>
            <QualityBars q={partner.connectionQuality} />
            {partner.connectionQuality === ConnectionQuality.Poor && <span className="text-[12px] text-caution max-sm:hidden">Their connection is weak</span>}
          </>
        ) : (
          <>
            <span className="size-1.5 shrink-0 animate-breathe rounded-full bg-paper-faint" aria-hidden />
            <span className="truncate text-paper-dim">{partnerName ? `Waiting for ${partnerName}` : "Waiting for your guest"}</span>
          </>
        )}
      </div>
      <div className="ml-auto flex items-center gap-3">
        {conn === "reconnecting" && (
          <span className="flex items-center gap-1.5 text-[12px] text-caution" role="status">
            <WifiOff className="size-3.5" /> Reconnecting…
          </span>
        )}
        <span className="hidden font-mono text-[12px] text-paper-faint md:inline" title="Room code">
          {roomId}
        </span>
        <span className="hidden text-[12px] text-paper-faint lg:inline" title="Time until this room is deleted">
          Closes in {remaining}
        </span>
        {inviteUrl && <CopyInvite url={inviteUrl} compact />}
      </div>
    </div>
  );
}

export function CopyInvite({ url, compact }: { url: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast({ tone: "error", title: "Couldn’t copy", body: "Select the link and copy it manually." });
    }
  }
  if (compact)
    return (
      <Button size="sm" variant="secondary" onClick={copy} data-testid="copy-invite">
        {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Invite link"}
      </Button>
    );
  return (
    <div className="flex w-full items-center gap-2 rounded-md border hairline-strong bg-ink-900 p-1.5 pl-3">
      <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-paper-dim" data-testid="invite-url">
        {url}
      </span>
      <Button size="sm" variant={copied ? "secondary" : "primary"} onClick={copy}>
        {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

export function WaitingCard({ partnerName }: { partnerName?: string }) {
  const inviteUrl = useRoom((s) => s.inviteUrl);
  const hasPin = useRoom((s) => s.hasPin);
  const isHost = useRoom((s) => s.me.role === "host");
  const canShare = typeof navigator !== "undefined" && "share" in navigator;
  return (
    <div className="w-full max-w-[460px] text-center" data-testid="waiting-card">
      <div className="mx-auto mb-6 flex w-fit items-center" aria-hidden>
        <span className="size-10 rounded-full border-2 border-paper/80" />
        <span className="-ml-3 size-10 animate-breathe rounded-full border-2 border-dashed border-paper/40" />
      </div>
      <h2 className="font-display text-[34px] leading-[1.05] tracking-[-0.01em]">
        {partnerName ? `Waiting for ${partnerName}` : "Waiting for your guest"}
      </h2>
      {isHost && inviteUrl ? (
        <>
          <p className="mx-auto mt-2 max-w-[360px] text-[14px] text-paper-dim">
            {partnerName ? "They’ll reappear here when they reconnect." : "Send this link to the one person you’d like to join. The room holds just the two of you."}
          </p>
          {!partnerName && (
            <div className="mt-6 space-y-2">
              <CopyInvite url={inviteUrl} />
              {canShare && (
                <Button variant="ghost" size="sm" onClick={() => void navigator.share({ title: "Join me on Closeby", url: inviteUrl }).catch(() => {})}>
                  <Share /> Share…
                </Button>
              )}
              {hasPin && (
                <p className="flex items-center justify-center gap-1.5 text-[12px] text-paper-faint">
                  <Lock className="size-3" /> They’ll also need the PIN you chose — send it separately.
                </p>
              )}
            </div>
          )}
        </>
      ) : (
        <p className="mx-auto mt-2 max-w-[360px] text-[14px] text-paper-dim">They’ll appear here as soon as they’re back. You can queue something to watch in the meantime.</p>
      )}
    </div>
  );
}

/** Shared screen on the stage, with an honest audio indicator. */
export function ScreenStage({ sharer, isLocal, sharerName }: { sharer: Participant; isLocal: boolean; sharerName?: string }) {
  const c = useController();
  useLk();
  const track = screenTrack(sharer);
  const myShareAudio = useRoom((s) => s.myShareAudio);
  const hasAudio = isLocal ? myShareAudio === "with-audio" : !!sharer.getTrackPublication(Track.Source.ScreenShareAudio);
  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg bg-black" data-testid="screen-stage">
      {track ? <TrackVideo track={track} fit="contain" className="bg-black" testId={isLocal ? "screen-local" : "screen-remote"} /> : <div className="grid h-full place-items-center text-sm text-paper-dim">Starting screen share…</div>}
      <div className="absolute left-3 top-3 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[12px] text-white backdrop-blur" role="status">
          <span className="size-1.5 rounded-full bg-danger" aria-hidden />
          {isLocal ? "You’re sharing your screen" : `${sharerName ?? "Your partner"} is sharing`}
        </span>
        <span
          className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] backdrop-blur", hasAudio ? "bg-black/60 text-white" : "bg-[#3a2420]/90 text-[#f0b8aa]")}
          data-testid="share-audio-status"
          data-has-audio={hasAudio}
        >
          {hasAudio ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
          {hasAudio ? "With sound" : "No sound"}
        </span>
        {isLocal && (
          <Button size="sm" variant="secondary" onClick={() => void c.stopScreenShare()} className="h-7">
            <MonitorOff /> Stop
          </Button>
        )}
      </div>
      {isLocal && !hasAudio && <NoAudioHelp />}
    </div>
  );
}

function NoAudioHelp() {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <div className="absolute bottom-3 left-3 max-w-[380px] rounded-lg border hairline bg-ink-850/95 p-3.5 text-[13px] shadow-float backdrop-blur" role="note">
      <p className="font-medium text-paper">Your share has no sound</p>
      <p className="mt-1 leading-snug text-paper-dim">
        Your browser didn’t provide audio for this source. In Chrome or Edge, share a <em>tab</em> and keep “Also share tab audio” on. Window audio can’t be captured; whole-screen audio works on Windows and ChromeOS only. Firefox and Safari don’t share audio.
      </p>
      <button className="mt-2 text-[12px] text-lamp hover:underline" onClick={() => setOpen(false)}>
        Got it
      </button>
    </div>
  );
}

export function ReactionsLayer() {
  const reactions = useRoom((s) => s.reactions);
  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden" aria-hidden>
      <AnimatePresence>
        {reactions.map((r) => (
          <motion.span
            key={r.id}
            initial={{ opacity: 0, y: 0, scale: 0.6 }}
            animate={{ opacity: [0, 1, 1, 0], y: -220, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2.4, ease: [0.25, 1, 0.5, 1] }}
            className="absolute bottom-16 text-[30px] [filter:drop-shadow(0_2px_6px_rgb(0_0_0/0.5))]"
            style={{ left: `${r.x * 100}%` }}
          >
            {r.emoji}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** Double-click anywhere on the stage to point something out to your partner. */
export function PingLayer() {
  const pings = useRoom((s) => s.pings);
  return (
    <div className="pointer-events-none absolute inset-0 z-30" aria-hidden>
      <AnimatePresence>
        {pings.map((p) => (
          <motion.span
            key={p.id}
            initial={{ opacity: 1, scale: 0.2 }}
            animate={{ opacity: 0, scale: 1 }}
            transition={{ duration: 1.6, ease: "easeOut" }}
            className={cn("absolute size-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px]", p.mine ? "border-paper" : "border-lamp")}
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

export function ConnectionOverlay() {
  const c = useController();
  const conn = useRoom((s) => s.conn);
  const end = useRoom((s) => s.end);
  if (conn !== "disconnected" || !end) return null;
  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-ink-950/80 p-6 backdrop-blur-sm" role="alertdialog" aria-label={end.title}>
      <div className="max-w-[380px] text-center">
        <WifiOff className="mx-auto size-6 text-paper-dim" />
        <h2 className="mt-3 font-display text-[30px] leading-tight">{end.title}</h2>
        <p className="mt-2 text-[14px] text-paper-dim">{end.body}</p>
        {end.canRejoin && (
          <Button variant="primary" className="mt-5" onClick={() => void c.rejoin()}>
            Reconnect now
          </Button>
        )}
      </div>
    </div>
  );
}

export function AudioBlockedBanner() {
  const c = useController();
  const blocked = useRoom((s) => s.audioBlocked);
  if (!blocked) return null;
  return (
    <div className="absolute left-1/2 top-3 z-40 -translate-x-1/2">
      <Button variant="primary" onClick={() => void c.startAudio()} data-testid="enable-audio">
        <Volume2 /> Tap to hear your partner
      </Button>
    </div>
  );
}
