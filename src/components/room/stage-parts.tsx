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
import { participantHue, QualityBars, screenTrack, TrackVideo } from "./media";
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

/** Floating status pills, FaceTime-style. */
export function TopBar({ partner, partnerName }: { partner?: Participant; partnerName?: string }) {
  const roomId = useRoom((s) => s.roomId);
  const expiresAt = useRoom((s) => s.expiresAt);
  const inviteUrl = useRoom((s) => s.inviteUrl);
  const conn = useRoom((s) => s.conn);
  const nowTitle = useRoom((s) => s.queue.find((q) => q.id === s.playback.mediaId)?.title);
  const browserOn = useRoom((s) => s.browser.active);
  const remaining = useRemaining(expiresAt);
  const activity = browserOn ? "Browsing together" : nowTitle ? `Watching · ${nowTitle}` : partner ? "Connected" : null;
  return (
    <div className="flex items-center gap-2 px-3 pt-3 sm:px-4">
      <div className="glass flex min-w-0 items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-4">
        {partner ? (
          <span className="grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-semibold text-white" style={{ background: `hsl(${participantHue(partner)} 45% 42%)` }}>
            {(partnerName ?? "?").slice(0, 1).toUpperCase()}
          </span>
        ) : (
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/10">
            <LogoMark className="h-3.5 text-white" />
          </span>
        )}
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[13px] font-semibold text-white">{partner ? partnerName : partnerName ? `Waiting for ${partnerName}` : "Waiting for your guest"}</p>
          {activity && <p className="truncate text-[11px] text-white/60">{activity}</p>}
        </div>
        {partner && <QualityBars q={partner.connectionQuality} className="ml-1" />}
      </div>
      {partner?.connectionQuality === ConnectionQuality.Poor && <span className="glass hidden rounded-full px-3 py-1.5 text-[12px] text-caution sm:inline">Weak connection</span>}
      <div className="ml-auto flex items-center gap-2">
        {conn === "reconnecting" && (
          <span className="glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium text-caution" role="status">
            <WifiOff className="size-3.5" /> Reconnecting…
          </span>
        )}
        <span className="glass hidden rounded-full px-3 py-1.5 text-[12px] text-white/70 lg:inline" title={`Room ${roomId}`}>
          Closes in {remaining}
        </span>
        {inviteUrl && !partner && <CopyInvite url={inviteUrl} compact />}
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
      <button onClick={copy} className="glass flex h-9 items-center gap-2 rounded-full px-3.5 text-[13px] font-semibold text-white hover:bg-white/20" data-testid="copy-invite">
        {copied ? <Check className="size-4 text-ok" /> : <Copy className="size-4" />}
        {copied ? "Copied" : "Invite"}
      </button>
    );
  return (
    <div className="flex w-full items-center gap-2 rounded-full bg-white/[0.08] p-1.5 pl-4">
      <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-white/70" data-testid="invite-url">
        {url}
      </span>
      <Button size="sm" variant="primary" onClick={copy}>
        {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy link"}
      </Button>
    </div>
  );
}

/** Centered frosted card over your own (dimmed) camera while you wait. */
export function WaitingCard({ partnerName }: { partnerName?: string }) {
  const inviteUrl = useRoom((s) => s.inviteUrl);
  const hasPin = useRoom((s) => s.hasPin);
  const isHost = useRoom((s) => s.me.role === "host");
  const canShare = typeof navigator !== "undefined" && "share" in navigator;
  return (
    <div className="glass w-full max-w-[440px] rounded-[28px] p-7 text-center" data-testid="waiting-card">
      <div className="mx-auto mb-5 flex w-fit items-center" aria-hidden>
        <span className="size-11 rounded-full border-2 border-white/90" />
        <span className="-ml-3.5 size-11 animate-breathe rounded-full border-2 border-dashed border-white/50" />
      </div>
      <h2 className="text-[24px] font-semibold tracking-[-0.025em] text-white">{partnerName ? `Waiting for ${partnerName}` : "Invite someone"}</h2>
      {isHost && inviteUrl && !partnerName ? (
        <>
          <p className="mx-auto mt-1.5 max-w-[340px] text-[14px] leading-relaxed text-white/65">Send this link to the one person you’d like to join. The room fits just the two of you.</p>
          <div className="mt-6 space-y-3">
            <CopyInvite url={inviteUrl} />
            {canShare && (
              <Button variant="secondary" size="sm" onClick={() => void navigator.share({ title: "Join me on Closeby", url: inviteUrl }).catch(() => {})}>
                <Share /> Share…
              </Button>
            )}
            {hasPin && (
              <p className="flex items-center justify-center gap-1.5 text-[12px] text-white/55">
                <Lock className="size-3" /> They’ll also need your PIN — send it separately.
              </p>
            )}
          </div>
        </>
      ) : (
        <p className="mx-auto mt-1.5 max-w-[340px] text-[14px] leading-relaxed text-white/65">They’ll appear here as soon as they’re back. You can pick something to watch in the meantime.</p>
      )}
      <Button variant="secondary" size="sm" className="mt-4" onClick={() => useRoom.setState({ watchOpen: true })}>
        Pick something to watch
      </Button>
    </div>
  );
}

/** Shared screen, with an honest audio indicator. */
export function ScreenStage({ sharer, isLocal, sharerName }: { sharer: Participant; isLocal: boolean; sharerName?: string }) {
  const c = useController();
  useLk();
  const track = screenTrack(sharer);
  const myShareAudio = useRoom((s) => s.myShareAudio);
  const hasAudio = isLocal ? myShareAudio === "with-audio" : !!sharer.getTrackPublication(Track.Source.ScreenShareAudio);
  return (
    <div className="relative h-full w-full overflow-hidden bg-black" data-testid="screen-stage">
      {track ? <TrackVideo track={track} fit="contain" className="bg-black" testId={isLocal ? "screen-local" : "screen-remote"} /> : <div className="grid h-full place-items-center text-sm text-white/60">Starting screen share…</div>}
      <div className="absolute left-1/2 top-16 flex -translate-x-1/2 flex-wrap items-center justify-center gap-2">
        <span className="glass flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px] font-medium text-white" role="status">
          <span className="size-2 rounded-full bg-danger" aria-hidden />
          {isLocal ? "You’re sharing your screen" : `${sharerName ?? "Your partner"} is sharing`}
        </span>
        <span
          className={cn("glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium", hasAudio ? "text-white" : "text-[#ffb4ae]")}
          data-testid="share-audio-status"
          data-has-audio={hasAudio}
        >
          {hasAudio ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
          {hasAudio ? "With sound" : "No sound"}
        </span>
        {isLocal && (
          <button onClick={() => void c.stopScreenShare()} className="glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-white/20">
            <MonitorOff className="size-3.5" /> Stop
          </button>
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
    <div className="glass absolute left-4 top-28 max-w-[360px] rounded-2xl p-4 text-[13px]" role="note">
      <p className="font-semibold text-white">Your share has no sound</p>
      <p className="mt-1 leading-snug text-white/70">
        For YouTube or websites, use <b className="text-white">Watch together</b> instead — it has sound and stays sharp. To share a tab with sound, use Chrome or Edge, pick a <em>tab</em>, and keep “Also share tab audio” on. Safari and Firefox can’t share sound.
      </p>
      <div className="mt-3 flex gap-3">
        <button className="text-[12px] font-semibold text-lamp hover:underline" onClick={() => useRoom.setState({ watchOpen: true })}>
          Open Watch together
        </button>
        <button className="text-[12px] text-white/60 hover:text-white" onClick={() => setOpen(false)}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

export function ReactionsLayer({ className }: { className?: string }) {
  const reactions = useRoom((s) => s.reactions);
  return (
    <div className={cn("pointer-events-none absolute inset-0 z-30 overflow-hidden", className)} aria-hidden>
      <AnimatePresence>
        {reactions.map((r) => (
          <motion.span
            key={r.id}
            initial={{ opacity: 0, y: 0, scale: 0.5 }}
            animate={{ opacity: [0, 1, 1, 0], y: -240, scale: 1.1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2.4, ease: [0.25, 1, 0.5, 1] }}
            className="absolute bottom-28 text-[34px] [filter:drop-shadow(0_4px_10px_rgb(0_0_0/0.5))]"
            style={{ left: `${r.x * 100}%` }}
          >
            {r.emoji}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}

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
            className={cn("absolute size-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px]", p.mine ? "border-white" : "border-lamp")}
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
    <div className="absolute inset-0 z-40 grid place-items-center bg-black/70 p-6 backdrop-blur-md" role="alertdialog" aria-label={end.title}>
      <div className="glass max-w-[400px] rounded-[28px] p-7 text-center">
        <WifiOff className="mx-auto size-7 text-white/70" />
        <h2 className="mt-3 text-[22px] font-semibold tracking-[-0.02em]">{end.title}</h2>
        <p className="mt-1.5 text-[14px] text-white/65">{end.body}</p>
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
    <div className="absolute left-1/2 top-20 z-40 -translate-x-1/2">
      <Button variant="primary" onClick={() => void c.startAudio()} data-testid="enable-audio">
        <Volume2 /> Tap to hear your partner
      </Button>
    </div>
  );
}
