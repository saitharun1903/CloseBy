"use client";
import { Captions, FolderOpen, Gauge, Loader, Maximize2, Pause, Play, TriangleExclamationPoint, Volume1, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/components/toaster";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { ALLOWED_RATES, computeCorrection, expectedPosition, formatTime, type PlaybackIntent } from "@/lib/playback";
import type { QueueItemDTO } from "@/lib/protocol";
import { formatBytes, toVtt } from "@/lib/subtitles";
import { useController } from "./context";
import { serverNow, setSound, useRoom, type SyncState } from "./store";
import { explainMediaFailure, mediaErrorReason } from "./use-media-probe";

/** Seconds to keep corrections off after a local action, while the server confirms it. */
const PENDING_MS = 2500;
/** Don't hard-seek more often than this during normal correction. */
const MIN_SEEK_INTERVAL_MS = 1500;

/** iOS Safari ignores programmatic volume. Detect once so we don't show a dead slider. */
let volumeSupport: boolean | null = null;
function canSetVolume() {
  if (volumeSupport !== null) return volumeSupport;
  try {
    const a = document.createElement("audio");
    a.volume = 0.5;
    volumeSupport = a.volume === 0.5;
  } catch {
    volumeSupport = true;
  }
  return volumeSupport;
}

function useSource(item: QueueItemDTO | null, file: File | undefined) {
  const url = useMemo(() => (item?.kind === "file" && file ? URL.createObjectURL(file) : null), [item?.kind, file]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  if (!item) return null;
  return item.kind === "url" ? item.url : url;
}

export function SyncedPlayer({ mode, onExpand }: { mode: "main" | "mini"; onExpand: () => void }) {
  const c = useController();
  const playback = useRoom((s) => s.playback);
  const queue = useRoom((s) => s.queue);
  const item = queue.find((q) => q.id === playback.mediaId) ?? null;
  const file = useRoom((s) => (item ? s.localFiles[item.id] : undefined));
  const sound = useRoom((s) => s.sound);
  const mediaMuted = useRoom((s) => s.mediaMuted);
  const sync = useRoom((s) => s.sync);
  const partnerMedia = useRoom((s) => s.partnerMedia);
  const partnerName = useRoom((s) => s.participants.find((p) => p.id !== s.me.id)?.displayName);
  const isHost = useRoom((s) => s.me.role === "host");
  const src = useSource(item, file);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(true);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(item?.durationSec ?? 0);
  const [scrub, setScrub] = useState<number | null>(null);
  const [buffering, setBuffering] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsGesture, setNeedsGesture] = useState(false);
  const [subs, setSubs] = useState<{ url: string; name: string } | null>(null);
  const [subsOn, setSubsOn] = useState(true);
  const [active, setActive] = useState(true);
  const pendingUntil = useRef(0);
  const nudging = useRef(false);
  const lastSeekAt = useRef(0);
  const idleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const clickTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const setSync = (s: SyncState) => {
    if (useRoom.getState().sync !== s) useRoom.setState({ sync: s });
  };

  const durationOf = useCallback(() => {
    const v = videoRef.current;
    return v && Number.isFinite(v.duration) && v.duration > 0 ? v.duration : (item?.durationSec ?? null);
  }, [item?.durationSec]);

  const tryPlay = useCallback((v: HTMLVideoElement) => {
    v.play()
      .then(() => setNeedsGesture(false))
      .catch((e: DOMException) => {
        if (e.name === "NotAllowedError") setNeedsGesture(true);
      });
  }, []);

  /** Steer the local element toward the server trajectory. `hard` = apply a fresh state immediately. */
  const reconcile = useCallback(
    (hard: boolean) => {
      const v = videoRef.current;
      if (!v || !src || v.readyState < 1) return;
      if (!hard && performance.now() < pendingUntil.current) return;
      const st = useRoom.getState().playback;
      if (st.mediaId !== item?.id) return;
      const dur = durationOf();
      const expected = expectedPosition(st, serverNow(), dur);
      const now = performance.now();

      const seek = (t: number) => {
        lastSeekAt.current = now;
        v.currentTime = t;
      };

      if (st.status === "paused" || (dur && expected >= dur - 0.25)) {
        if (!v.paused) v.pause();
        v.playbackRate = st.rate;
        nudging.current = false;
        if (Math.abs(v.currentTime - expected) > 0.25) seek(expected);
        setSync("synced");
        return;
      }

      if (hard) {
        nudging.current = false;
        v.playbackRate = st.rate;
        if (Math.abs(v.currentTime - expected) > 0.35) seek(expected);
      } else if (v.readyState >= 3 && !v.seeking) {
        const corr = computeCorrection({ actualSec: v.currentTime, expectedSec: expected, nominalRate: st.rate, playing: true, wasNudging: nudging.current });
        if (corr.kind === "seek") {
          if (now - lastSeekAt.current > MIN_SEEK_INTERVAL_MS) {
            // Lead slightly: the decoder needs a moment to resume after a seek.
            seek(corr.targetSec + 0.15 * st.rate);
            setSync("correcting");
          }
          nudging.current = false;
        } else if (corr.kind === "nudge") {
          v.playbackRate = corr.rate;
          nudging.current = true;
          setSync(Math.abs(corr.driftSec) > 0.3 ? "correcting" : "synced");
        } else {
          v.playbackRate = st.rate;
          nudging.current = false;
          setSync("synced");
        }
      }
      if (v.paused && !v.ended) tryPlay(v);
    },
    [src, item?.id, durationOf, tryPlay],
  );

  // Fresh server state → apply now.
  useEffect(() => {
    reconcile(true);
  }, [playback, reconcile]);

  // Continuous drift control while playing.
  useEffect(() => {
    if (playback.status !== "playing") return;
    const t = setInterval(() => reconcile(false), 500);
    return () => clearInterval(t);
  }, [playback.status, reconcile]);

  // Background tabs get throttled; snap back on return.
  useEffect(() => {
    const onVis = () => document.visibilityState === "visible" && reconcile(true);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [reconcile]);

  // Source changes
  useEffect(() => {
    setLoaded(false);
    setError(null);
    setNeedsGesture(false);
    setCurrent(0);
    setDuration(item?.durationSec ?? 0);
    if (!src) setSync(item ? "waiting-file" : "idle");
  }, [src, item]);

  // Volumes are local only.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = sound.mediaVolume;
    v.muted = mediaMuted;
  }, [sound.mediaVolume, mediaMuted, src]);

  // Tell my partner whether I'm ready with this item.
  useEffect(() => {
    c.announceMedia({
      mediaId: item?.id ?? null,
      ready: !!src && loaded && !error,
      fileName: file?.name ?? null,
      fileSize: file?.size ?? null,
      durationSec: durationOf(),
    });
  }, [c, item?.id, src, loaded, error, file, durationOf]);

  // Subtitles visibility
  useEffect(() => {
    const t = videoRef.current?.textTracks[0];
    if (t) t.mode = subsOn ? "showing" : "hidden";
  }, [subsOn, subs]);
  useEffect(() => () => void (subs && URL.revokeObjectURL(subs.url)), [subs]);

  const act = useCallback(
    async (intent: PlaybackIntent) => {
      pendingUntil.current = performance.now() + PENDING_MS;
      await c.sendIntent(intent);
      pendingUntil.current = 0;
      reconcile(true);
    },
    [c, reconcile],
  );

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v || !src) return;
    if (useRoom.getState().playback.status === "playing") {
      v.pause();
      void act({ type: "pause", positionSec: v.currentTime });
    } else {
      tryPlay(v);
      void act({ type: "play", positionSec: v.currentTime });
    }
  }, [act, src, tryPlay]);

  const seekTo = useCallback(
    (t: number) => {
      const v = videoRef.current;
      if (!v) return;
      const dur = durationOf() ?? t;
      const clamped = Math.max(0, Math.min(dur, t));
      v.currentTime = clamped;
      setCurrent(clamped);
      void act({ type: "seek", positionSec: clamped });
    },
    [act, durationOf],
  );

  // Keyboard: Space/K play-pause, ←/→ 10s, only when nothing editable is focused.
  useEffect(() => {
    if (mode !== "main") return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable=true], [role=slider], [role=menu], [role=dialog]")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === " " || e.key === "k") {
        if (t.tagName === "BUTTON" && e.key === " ") return;
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        seekTo((videoRef.current?.currentTime ?? 0) + 10);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        seekTo((videoRef.current?.currentTime ?? 0) - 10);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, togglePlay, seekTo]);

  function poke() {
    setActive(true);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setActive(false), 2600);
  }
  useEffect(() => () => clearTimeout(idleTimer.current), []);

  function onEnded() {
    // The host advances the queue so the two of us don't both do it.
    if (!isHost || !item) return;
    const q = useRoom.getState().queue;
    const next = q[q.findIndex((x) => x.id === item.id) + 1];
    if (next) {
      toast({ title: `Up next: ${next.title}` });
      void c.sendIntent({ type: "load", mediaId: next.id });
    }
  }

  async function pickFile(f: File) {
    if (!item) return;
    if (item.fileSize != null && f.size !== item.fileSize) {
      toast({
        tone: "error",
        title: "This looks like a different file",
        body: `It’s ${formatBytes(f.size)}, but the one in the queue is ${formatBytes(item.fileSize)}. If it’s a different cut or encode, your timelines won’t line up.`,
        durationMs: 9000,
      });
    }
    useRoom.setState((s) => ({ localFiles: { ...s.localFiles, [item.id]: f } }));
  }

  async function pickSubs(f: File) {
    if (f.size > 5 * 1024 * 1024) return toast({ tone: "error", title: "That subtitle file is too large" });
    const text = await f.text();
    const vtt = toVtt(text);
    setSubs((old) => {
      if (old) URL.revokeObjectURL(old.url);
      return { url: URL.createObjectURL(new Blob([vtt], { type: "text/vtt" })), name: f.name };
    });
    setSubsOn(true);
  }

  if (!item) {
    return (
      <div className="grid h-full w-full place-items-center rounded-lg bg-ink-900 text-sm text-paper-dim">
        That item was removed from the queue.
      </div>
    );
  }

  const shown = scrub ?? current;
  const controlsUp = mode === "main" && (active || paused || !!error);
  const partnerNotReady = partnerMedia && partnerName && (partnerMedia.mediaId !== item.id || !partnerMedia.ready);
  const volumeOk = canSetVolume();

  return (
    <div
      className={cn("group/player relative h-full w-full overflow-hidden bg-black", mode === "main" ? "rounded-lg" : "rounded-md", controlsUp && "controls-up", !controlsUp && "cursor-none")}
      onPointerMove={poke}
      onPointerDown={poke}
      data-testid="player"
      data-sync={sync}
    >
      {src && (
        <video
          ref={videoRef}
          src={src}
          playsInline
          preload="auto"
          className="h-full w-full object-contain"
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            setDuration(Number.isFinite(v.duration) ? v.duration : (item.durationSec ?? 0));
            v.volume = sound.mediaVolume;
            v.muted = mediaMuted;
            setLoaded(true);
            reconcile(true);
          }}
          onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
          onPlay={() => setPaused(false)}
          onPause={() => setPaused(true)}
          onWaiting={() => {
            setBuffering(true);
            if (useRoom.getState().playback.status === "playing") setSync("buffering");
          }}
          onPlaying={() => setBuffering(false)}
          onCanPlay={() => setBuffering(false)}
          onEnded={onEnded}
          onError={(e) => {
            setError(explainMediaFailure(mediaErrorReason(e.currentTarget.error), item.kind));
            setBuffering(false);
          }}
          onClick={
            mode === "main"
              ? () => {
                  // Delay so a double-click (used to point at something) doesn't toggle twice.
                  clearTimeout(clickTimer.current);
                  clickTimer.current = setTimeout(togglePlay, 220);
                }
              : undefined
          }
          onDoubleClick={() => clearTimeout(clickTimer.current)}
          data-testid="player-video"
        >
          {subs && <track kind="subtitles" src={subs.url} label={subs.name} default />}
        </video>
      )}

      {/* Choose-your-copy prompt for local files */}
      {item.kind === "file" && !file && (
        <FilePrompt item={item} onPick={pickFile} compact={mode === "mini"} />
      )}

      {error && (
        <div className="absolute inset-0 grid place-items-center bg-ink-950/85 p-6 text-center" role="alert">
          <div className="max-w-[420px]">
            <TriangleExclamationPoint className="mx-auto size-6 text-danger" />
            <p className="mt-3 font-medium text-paper">Can’t play “{item.title}”</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-paper-dim">{error}</p>
            {item.kind === "file" && (
              <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-md bg-ink-800 px-3 py-2 text-[13px] text-paper hover:bg-ink-750">
                <FolderOpen className="size-4" /> Choose another file
                <input type="file" accept="video/*,audio/*" className="sr-only" onChange={(e) => e.target.files?.[0] && void pickFile(e.target.files[0])} />
              </label>
            )}
          </div>
        </div>
      )}

      {needsGesture && !error && (
        <button
          className="absolute inset-0 grid place-items-center bg-ink-950/60 text-paper"
          onClick={() => {
            const v = videoRef.current;
            if (v) tryPlay(v);
            reconcile(true);
          }}
          data-testid="tap-to-play"
        >
          <span className="flex items-center gap-2 rounded-full bg-paper px-4 py-2 text-sm font-medium text-ink-950 shadow-float">
            <Play className="size-4 fill-current" /> Your browser paused autoplay — tap to join in
          </span>
        </button>
      )}

      {buffering && playback.status === "playing" && !error && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <Loader className="size-7 animate-spin text-paper/80" aria-label="Buffering" />
        </div>
      )}

      {mode === "mini" ? (
        <div className="absolute inset-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/70 via-transparent to-transparent p-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover/player:opacity-100">
          <button aria-label={paused ? "Play for both of you" : "Pause for both of you"} onClick={togglePlay} className="grid size-8 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25">
            {playback.status === "playing" ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
          </button>
          <button aria-label="Bring the film back to the big screen" onClick={onExpand} className="grid size-8 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25">
            <Maximize2 className="size-4" />
          </button>
        </div>
      ) : (
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent px-3 pb-2.5 pt-12 transition-opacity duration-300 sm:px-4",
            controlsUp ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          onFocus={poke}
        >
          <Slider
            aria-label="Seek"
            min={0}
            max={Math.max(duration, 0.01)}
            step={0.1}
            value={[Math.min(shown, duration || shown)]}
            onValueChange={([v]) => setScrub(v ?? 0)}
            onValueCommit={([v]) => {
              setScrub(null);
              seekTo(v ?? 0);
            }}
            disabled={!loaded}
            className="mb-1.5"
          />
          <div className="flex items-center gap-1.5 text-white sm:gap-2">
            <Tooltip label={playback.status === "playing" ? "Pause for both" : "Play for both"} shortcut="Space">
              <button
                onClick={togglePlay}
                disabled={!src || !!error}
                aria-label={playback.status === "playing" ? "Pause for both of you" : "Play for both of you"}
                className="grid size-9 place-items-center rounded-full hover:bg-white/10 disabled:opacity-40"
                data-testid="play-toggle"
              >
                {playback.status === "playing" ? <Pause className="size-[18px] fill-current" /> : <Play className="size-[18px] fill-current" />}
              </button>
            </Tooltip>
            <span className="font-mono text-[12px] text-white/85 tabular" data-testid="player-time">
              {formatTime(shown)} <span className="text-white/45">/ {formatTime(duration)}</span>
            </span>
            <SyncChip sync={sync} partnerNotReady={!!partnerNotReady} partnerName={partnerName} status={playback.status} />

            <div className="ml-auto flex items-center gap-0.5">
              <VolumeControl volumeOk={volumeOk} value={sound.mediaVolume} muted={mediaMuted} />
              <Popover>
                <Tooltip label="Speed">
                  <PopoverTrigger asChild>
                    <button aria-label={`Playback speed ${playback.rate}×`} className="flex h-9 items-center gap-1 rounded-full px-2.5 font-mono text-[12px] hover:bg-white/10">
                      <Gauge className="size-4" />
                      {playback.rate}×
                    </button>
                  </PopoverTrigger>
                </Tooltip>
                <PopoverContent side="top" className="w-36 p-1">
                  <p className="px-2 pb-1 pt-1.5 text-[11px] uppercase tracking-wider text-paper-faint">Speed for both</p>
                  {ALLOWED_RATES.map((r) => (
                    <button
                      key={r}
                      onClick={() => void act({ type: "rate", rate: r })}
                      className={cn("flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left font-mono text-[13px] hover:bg-ink-750", r === playback.rate && "text-lamp")}
                    >
                      {r}× {r === playback.rate && <span aria-hidden>•</span>}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
              <Popover>
                <Tooltip label="Subtitles">
                  <PopoverTrigger asChild>
                    <button aria-label="Subtitles" className={cn("grid size-9 place-items-center rounded-full hover:bg-white/10", subs && subsOn && "text-lamp")}>
                      <Captions className="size-[18px]" />
                    </button>
                  </PopoverTrigger>
                </Tooltip>
                <PopoverContent side="top" className="w-64">
                  <p className="text-[13px] font-medium">Subtitles</p>
                  <p className="mt-1 text-[12px] leading-snug text-paper-dim">Load a .srt or .vtt file. It shows on your screen only and isn’t uploaded.</p>
                  {subs && (
                    <label className="mt-3 flex items-center justify-between gap-2 text-[13px]">
                      <span className="truncate">{subs.name}</span>
                      <input type="checkbox" checked={subsOn} onChange={(e) => setSubsOn(e.target.checked)} className="accent-[var(--color-lamp)]" aria-label="Show subtitles" />
                    </label>
                  )}
                  <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-sm bg-ink-750 px-2.5 py-1.5 text-[13px] hover:bg-ink-700">
                    <FolderOpen className="size-3.5" /> {subs ? "Replace file" : "Choose file"}
                    <input type="file" accept=".srt,.vtt,text/vtt" className="sr-only" onChange={(e) => e.target.files?.[0] && void pickSubs(e.target.files[0])} />
                  </label>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SyncChip({ sync, partnerNotReady, partnerName, status }: { sync: SyncState; partnerNotReady: boolean; partnerName?: string; status: string }) {
  let tone = "bg-ok";
  let label = "In sync";
  if (partnerNotReady) {
    tone = "bg-caution";
    label = `${partnerName} isn’t ready yet`;
  } else if (sync === "correcting") {
    tone = "bg-caution animate-pulse";
    label = "Syncing…";
  } else if (sync === "buffering") {
    tone = "bg-caution animate-pulse";
    label = "Buffering…";
  } else if (status !== "playing") {
    tone = "bg-paper-faint";
    label = "Paused for both";
  }
  return (
    <span className="ml-1 hidden items-center gap-1.5 rounded-full bg-black/35 px-2 py-0.5 text-[11px] text-white/85 sm:inline-flex" role="status" aria-live="polite" data-testid="sync-chip">
      <span className={cn("size-1.5 rounded-full", tone)} />
      {label}
    </span>
  );
}

function VolumeControl({ volumeOk, value, muted }: { volumeOk: boolean; value: number; muted: boolean }) {
  const Icon = muted || value === 0 ? VolumeX : value < 0.5 ? Volume1 : Volume2;
  return (
    <div className="group/vol flex items-center">
      <Tooltip label={muted ? "Unmute film" : "Mute film (keeps the call)"}>
        <button
          aria-label={muted ? "Unmute film" : "Mute film"}
          aria-pressed={muted}
          onClick={() => useRoom.setState({ mediaMuted: !muted })}
          className="grid size-9 place-items-center rounded-full hover:bg-white/10"
          data-testid="media-mute"
        >
          <Icon className="size-[18px]" />
        </button>
      </Tooltip>
      {volumeOk && (
        <div className="w-0 overflow-hidden transition-[width] duration-200 group-focus-within/vol:w-24 group-hover/vol:w-24">
          <Slider aria-label="Film volume" min={0} max={1} step={0.01} value={[muted ? 0 : value]} onValueChange={([v]) => { setSound({ mediaVolume: v ?? 0 }); if (muted) useRoom.setState({ mediaMuted: false }); }} className="mx-2 w-20" />
        </div>
      )}
    </div>
  );
}

function FilePrompt({ item, onPick, compact }: { item: QueueItemDTO; onPick: (f: File) => void; compact?: boolean }) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={cn("absolute inset-0 grid place-items-center bg-ink-900 p-4 text-center transition-colors", over && "bg-ink-850")}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onPick(f);
      }}
      data-testid="file-prompt"
    >
      <div className="max-w-[400px]">
        {!compact && <p className="text-[12px] uppercase tracking-[0.14em] text-paper-faint">Your copy needed</p>}
        <p className={cn("text-paper", compact ? "text-[13px]" : "mt-2 font-display text-[28px] leading-tight")}>
          Choose your copy of “{item.title}”
        </p>
        {!compact && (
          <p className="mt-2 text-[13px] leading-relaxed text-paper-dim">
            {item.fileName} · {formatBytes(item.fileSize)}. Each of you plays your own copy, so the film never leaves your device.
          </p>
        )}
        <label className={cn("inline-flex cursor-pointer items-center gap-2 rounded-md bg-lamp font-medium text-lamp-ink hover:bg-lamp-bright", compact ? "mt-2 px-2.5 py-1.5 text-[12px]" : "mt-5 px-4 py-2.5 text-sm")}>
          <FolderOpen className="size-4" /> Choose file
          <input
            type="file"
            accept="video/*,audio/*,.mkv,.mov,.m4v"
            className="sr-only"
            data-testid="file-input"
            onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])}
          />
        </label>
        {!compact && <p className="mt-3 text-[12px] text-paper-faint">or drop it here</p>}
      </div>
    </div>
  );
}
