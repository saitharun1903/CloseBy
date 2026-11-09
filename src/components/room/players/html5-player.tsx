"use client";
import { Captions, FolderOpen, Loader, Maximize2, Pause, Play, TriangleExclamationPoint } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "@/components/toaster";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import type { QueueItemDTO } from "@/lib/protocol";
import { formatBytes, toVtt } from "@/lib/subtitles";
import { useController } from "../context";
import { useRoom } from "../store";
import { explainMediaFailure, mediaErrorReason } from "../use-media-probe";
import type { MediaAdapter } from "./adapter";
import { PlayerControls } from "./controls";
import { usePlayerChrome } from "./use-player-chrome";
import { useSyncEngine } from "./use-sync";
import { useMediaVolume } from "./use-media-volume";

function useSource(item: QueueItemDTO, file: File | undefined) {
  // Created and revoked in the same effect so StrictMode's double-mount can't leave a dead URL.
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const isFile = item.kind === "file";
  useEffect(() => {
    if (!isFile || !file) {
      setBlobUrl(null);
      return;
    }
    const u = URL.createObjectURL(file);
    setBlobUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [isFile, file]);
  return item.kind === "url" ? item.url : blobUrl;
}

export function Html5Player({ item, mode, onExpand }: { item: QueueItemDTO; mode: "main" | "mini"; onExpand: () => void }) {
  const c = useController();
  const file = useRoom((s) => s.localFiles[item.id]);
  const { volume: mediaVolume, muted: mediaMuted } = useMediaVolume();
  const playback = useRoom((s) => s.playback);
  const src = useSource(item, file);
  const videoRef = useRef<HTMLVideoElement>(null);
  const adapter = useRef<MediaAdapter | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(item.durationSec ?? 0);
  const [scrub, setScrub] = useState<number | null>(null);
  const [buffering, setBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subs, setSubs] = useState<{ url: string; name: string } | null>(null);
  const [subsOn, setSubsOn] = useState(true);
  const clickTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const durationHint = useRef(item.durationSec);
  durationHint.current = item.durationSec;
  // Stable adapter that reads the element at call time (never stale, never null-captured).
  adapter.current ??= {
    ready: () => (videoRef.current?.readyState ?? 0) >= 1,
    time: () => videoRef.current?.currentTime ?? 0,
    duration: () => {
      const d = videoRef.current?.duration;
      return d && Number.isFinite(d) && d > 0 ? d : durationHint.current;
    },
    paused: () => videoRef.current?.paused ?? true,
    ended: () => videoRef.current?.ended ?? false,
    stalled: () => {
      const v = videoRef.current;
      return !v || v.readyState < 3 || v.seeking;
    },
    play: () => videoRef.current?.play() ?? Promise.resolve(),
    pause: () => videoRef.current?.pause(),
    seek: (t) => {
      if (videoRef.current) videoRef.current.currentTime = t;
    },
    setRate: (r) => {
      const v = videoRef.current;
      if (v && v.playbackRate !== r) v.playbackRate = r;
    },
    canNudge: true,
  };

  const sync = useSyncEngine(adapter, item.id, loaded && !!src);
  const chrome = usePlayerChrome(mode === "main", sync.togglePlay, sync.seekTo, () => videoRef.current?.currentTime ?? 0);

  useEffect(() => {
    setLoaded(false);
    setError(null);
    setCurrent(0);
    setDuration(item.durationSec ?? 0);
    if (!src) useRoom.setState({ sync: "waiting-file" });
  }, [src, item.durationSec]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = mediaVolume;
    v.muted = mediaMuted;
  }, [mediaVolume, mediaMuted, src]);

  useEffect(() => {
    c.announceMedia({ mediaId: item.id, ready: !!src && loaded && !error, fileName: file?.name ?? null, fileSize: file?.size ?? null, durationSec: duration || null });
  }, [c, item.id, src, loaded, error, file, duration]);

  useEffect(() => {
    const t = videoRef.current?.textTracks[0];
    if (t) t.mode = subsOn ? "showing" : "hidden";
  }, [subsOn, subs]);
  useEffect(() => () => void (subs && URL.revokeObjectURL(subs.url)), [subs]);

  function pickFile(f: File) {
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
    const vtt = toVtt(await f.text());
    setSubs((old) => {
      if (old) URL.revokeObjectURL(old.url);
      return { url: URL.createObjectURL(new Blob([vtt], { type: "text/vtt" })), name: f.name };
    });
    setSubsOn(true);
  }

  const playing = playback.status === "playing";

  return (
    <div
      className={cn("group/player relative h-full w-full overflow-hidden bg-black", mode === "mini" && "rounded-xl", chrome.controlsUp && "controls-up", !chrome.controlsUp && "cursor-none")}
      onPointerMove={chrome.poke}
      onPointerDown={chrome.poke}
      data-testid="player"
      data-sync={useRoom.getState().sync}
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
            v.volume = mediaVolume;
            v.muted = mediaMuted;
            setLoaded(true);
          }}
          onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
          onWaiting={() => {
            setBuffering(true);
            if (useRoom.getState().playback.status === "playing") useRoom.setState({ sync: "buffering" });
          }}
          onPlaying={() => setBuffering(false)}
          onCanPlay={() => setBuffering(false)}
          onEnded={() => chrome.onEnded(item.id)}
          onError={(e) => {
            setError(explainMediaFailure(mediaErrorReason(e.currentTarget.error), item.kind === "file" ? "file" : "url"));
            setBuffering(false);
          }}
          onClick={
            mode === "main"
              ? () => {
                  clearTimeout(clickTimer.current);
                  clickTimer.current = setTimeout(sync.togglePlay, 220);
                }
              : undefined
          }
          onDoubleClick={() => clearTimeout(clickTimer.current)}
          data-testid="player-video"
        >
          {subs && <track kind="subtitles" src={subs.url} label={subs.name} default />}
        </video>
      )}

      {item.kind === "file" && !file && <FilePrompt item={item} onPick={pickFile} compact={mode === "mini"} />}

      {error && (
        <div className="absolute inset-0 grid place-items-center bg-black/85 p-6 text-center" role="alert">
          <div className="max-w-[420px]">
            <TriangleExclamationPoint className="mx-auto size-7 text-danger" />
            <p className="mt-3 text-[17px] font-semibold text-paper">Can’t play “{item.title}”</p>
            <p className="mt-1.5 text-[14px] leading-relaxed text-paper-dim">{error}</p>
            {item.kind === "file" && (
              <label className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-[13px] font-semibold text-paper hover:bg-white/15">
                <FolderOpen className="size-4" /> Choose another file
                <input type="file" accept="video/*,audio/*" className="sr-only" onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0])} />
              </label>
            )}
          </div>
        </div>
      )}

      {sync.needsGesture && !error && <TapToPlay onTap={() => void sync.resolveGesture()} />}

      {buffering && playing && !error && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <Loader className="size-8 animate-spin text-white/80" aria-label="Buffering" />
        </div>
      )}

      {mode === "mini" ? (
        <MiniControls playing={playing} onToggle={sync.togglePlay} onExpand={onExpand} />
      ) : (
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-4 pb-24 pt-16 transition-opacity duration-300 sm:px-6",
            chrome.controlsUp ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          onFocus={chrome.poke}
        >
          <PlayerControls
            playing={playing}
            current={current}
            duration={duration}
            scrub={scrub}
            onScrub={setScrub}
            onSeekCommit={sync.seekTo}
            onToggle={sync.togglePlay}
            rate={playback.rate}
            onRate={(r) => void sync.act({ type: "rate", rate: r })}
            disabled={!loaded || !!error}
            extra={<SubtitlesMenu subs={subs} subsOn={subsOn} setSubsOn={setSubsOn} pickSubs={pickSubs} />}
          />
        </div>
      )}
    </div>
  );
}

export function TapToPlay({ onTap }: { onTap: () => void }) {
  return (
    <button className="absolute inset-0 z-10 grid place-items-center bg-black/55 text-paper" onClick={onTap} data-testid="tap-to-play">
      <span className="flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black shadow-float">
        <Play className="size-4 fill-current" /> Tap to join in
      </span>
    </button>
  );
}

export function MiniControls({ playing, onToggle, onExpand }: { playing: boolean; onToggle: () => void; onExpand: () => void }) {
  return (
    <div className="absolute inset-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/70 via-transparent to-transparent p-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover/player:opacity-100">
      <button aria-label={playing ? "Pause for both of you" : "Play for both of you"} onClick={onToggle} className="glass-light grid size-9 place-items-center rounded-full text-white">
        {playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
      </button>
      <button aria-label="Bring the video back to the big screen" onClick={onExpand} className="glass-light grid size-9 place-items-center rounded-full text-white">
        <Maximize2 className="size-4" />
      </button>
    </div>
  );
}

function SubtitlesMenu({ subs, subsOn, setSubsOn, pickSubs }: { subs: { name: string } | null; subsOn: boolean; setSubsOn: (v: boolean) => void; pickSubs: (f: File) => void }) {
  return (
    <Popover>
      <Tooltip label="Subtitles">
        <PopoverTrigger asChild>
          <button aria-label="Subtitles" className={cn("grid size-10 place-items-center rounded-full hover:bg-white/10", subs && subsOn && "text-lamp")}>
            <Captions className="size-5" />
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent side="top" className="w-64">
        <p className="text-[14px] font-semibold">Subtitles</p>
        <p className="mt-1 text-[12px] leading-snug text-paper-dim">Load a .srt or .vtt file. It shows on your screen only and isn’t uploaded.</p>
        {subs && (
          <label className="mt-3 flex items-center justify-between gap-2 text-[13px]">
            <span className="truncate">{subs.name}</span>
            <input type="checkbox" checked={subsOn} onChange={(e) => setSubsOn(e.target.checked)} className="accent-[var(--color-lamp)]" aria-label="Show subtitles" />
          </label>
        )}
        <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[13px] font-medium hover:bg-white/15">
          <FolderOpen className="size-3.5" /> {subs ? "Replace file" : "Choose file"}
          <input type="file" accept=".srt,.vtt,text/vtt" className="sr-only" onChange={(e) => e.target.files?.[0] && void pickSubs(e.target.files[0])} />
        </label>
      </PopoverContent>
    </Popover>
  );
}

function FilePrompt({ item, onPick, compact }: { item: QueueItemDTO; onPick: (f: File) => void; compact?: boolean }) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={cn("absolute inset-0 grid place-items-center bg-ink-900 p-4 text-center transition-colors", over && "bg-ink-800")}
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
      <div className="max-w-[420px]">
        <p className={cn("font-semibold text-paper", compact ? "text-[13px]" : "text-[24px] tracking-[-0.02em]")}>Choose your copy of “{item.title}”</p>
        {!compact && (
          <p className="mt-2 text-[14px] leading-relaxed text-paper-dim">
            {item.fileName} · {formatBytes(item.fileSize)}. You each play your own copy, so the file never leaves your device.
          </p>
        )}
        <label className={cn("inline-flex cursor-pointer items-center gap-2 rounded-full bg-white font-semibold text-black hover:bg-white/90", compact ? "mt-2 px-3 py-1.5 text-[12px]" : "mt-6 px-5 py-2.5 text-sm")}>
          <FolderOpen className="size-4" /> Choose file
          <input type="file" accept="video/*,audio/*,.mkv,.mov,.m4v" className="sr-only" data-testid="file-input" onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])} />
        </label>
        {!compact && <p className="mt-3 text-[12px] text-paper-faint">or drop it here</p>}
      </div>
    </div>
  );
}
