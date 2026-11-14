"use client";
import { Gauge, ListVideo, Pause, Play, Timer, Volume1, Volume2, VolumeX } from "lucide-react";
import { useController } from "../context";
import type { Chapter } from "@/lib/youtube";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { ALLOWED_RATES, formatTime } from "@/lib/playback";
import { setSound, useRoom, type SyncState } from "../store";

/** iOS Safari ignores programmatic volume; don't show a dead slider there. */
let volumeSupport: boolean | null = null;
export function canSetVolume() {
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

export function PlayerControls({
  playing,
  current,
  duration,
  scrub,
  onScrub,
  onSeekCommit,
  onToggle,
  onRate,
  rate,
  disabled,
  extra,
  chapters,
  className,
}: {
  playing: boolean;
  current: number;
  duration: number;
  scrub: number | null;
  onScrub: (v: number | null) => void;
  onSeekCommit: (v: number) => void;
  onToggle: () => void;
  onRate: (r: number) => void;
  rate: number;
  disabled?: boolean;
  extra?: React.ReactNode;
  /** Optional chapters: markers on the seek bar, the current one by the time, and a menu. */
  chapters?: Chapter[];
  className?: string;
}) {
  const sync = useRoom((s) => s.sync);
  const partnerMedia = useRoom((s) => s.partnerMedia);
  const mediaId = useRoom((s) => s.playback.mediaId);
  const partnerName = useRoom((s) => s.participants.find((p) => p.id !== s.me.id)?.displayName);
  const partnerNotReady = !!partnerMedia && !!partnerName && (partnerMedia.mediaId !== mediaId || !partnerMedia.ready);
  const shown = scrub ?? current;
  const marks = chapters && chapters.length > 1 && duration > 0 ? chapters : null;
  const currentChapter = marks ? [...marks].reverse().find((ch) => ch.start <= shown) : null;
  return (
    <div className={cn("text-white", className)}>
      <div className="relative">
      {marks && (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -mt-[3px] h-1.5" data-testid="chapter-marks">
          {marks.slice(1).map((ch) => (
            <span key={ch.start} className="absolute top-0 h-full w-[3px] -translate-x-1/2 bg-black/80" style={{ left: `${(ch.start / duration) * 100}%` }} />
          ))}
        </div>
      )}
      <Slider
        aria-label="Seek"
        min={0}
        max={Math.max(duration, 0.01)}
        step={0.1}
        value={[Math.min(shown, duration || shown)]}
        onValueChange={([v]) => onScrub(v ?? 0)}
        onValueCommit={([v]) => {
          onScrub(null);
          onSeekCommit(v ?? 0);
        }}
        disabled={disabled}
        className="mb-1"
      />
      </div>
      <div className="flex items-center gap-1 sm:gap-2">
        <Tooltip label={playing ? "Pause for both" : "Play for both"} shortcut="Space">
          <button
            onClick={onToggle}
            disabled={disabled}
            aria-label={playing ? "Pause for both of you" : "Play for both of you"}
            className="grid size-10 place-items-center rounded-full hover:bg-white/10 disabled:opacity-40"
            data-testid="play-toggle"
          >
            {playing ? <Pause className="size-5 fill-current" /> : <Play className="size-5 fill-current" />}
          </button>
        </Tooltip>
        {!playing && !disabled && <CountdownButton />}
        <span className="shrink-0 font-mono text-[12px] text-white/90 tabular" data-testid="player-time">
          {formatTime(shown)} <span className="text-white/45">/ {formatTime(duration)}</span>
        </span>
        {currentChapter && (
          <span className="hidden min-w-0 max-w-[260px] truncate text-[12px] font-medium text-white/80 md:inline" data-testid="current-chapter">
            · {currentChapter.title}
          </span>
        )}
        <SyncChip sync={sync} partnerNotReady={partnerNotReady} partnerName={partnerName} playing={playing} />
        <div className="ml-auto flex items-center gap-0.5">
          <VolumeControl />
          {marks && <ChapterMenu chapters={marks} current={currentChapter ?? null} onSeek={onSeekCommit} />}
          <RateMenu rate={rate} onRate={onRate} />
          {extra}
        </div>
      </div>
    </div>
  );
}

function SyncChip({ sync, partnerNotReady, partnerName, playing }: { sync: SyncState; partnerNotReady: boolean; partnerName?: string; playing: boolean }) {
  let tone = "bg-ok";
  let label = "In sync";
  if (partnerNotReady) {
    tone = "bg-caution";
    label = `${partnerName} is getting ready`;
  } else if (sync === "correcting") {
    tone = "bg-caution animate-pulse";
    label = "Syncing…";
  } else if (sync === "buffering") {
    tone = "bg-caution animate-pulse";
    label = "Buffering…";
  } else if (!playing) {
    tone = "bg-white/50";
    label = "Paused for both";
  }
  return (
    <span className="ml-1 hidden items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/90 sm:inline-flex" role="status" aria-live="polite" data-testid="sync-chip">
      <span className={cn("size-1.5 rounded-full", tone)} />
      {label}
    </span>
  );
}

export function VolumeControl() {
  const value = useRoom((s) => s.sound.mediaVolume);
  const muted = useRoom((s) => s.mediaMuted);
  const Icon = muted || value === 0 ? VolumeX : value < 0.5 ? Volume1 : Volume2;
  const volumeOk = canSetVolume();
  return (
    <div className="group/vol flex items-center">
      <Tooltip label={muted ? "Unmute video" : "Mute video (keeps the call)"}>
        <button
          aria-label={muted ? "Unmute video" : "Mute video"}
          aria-pressed={muted}
          onClick={() => useRoom.setState({ mediaMuted: !muted })}
          className="grid size-10 place-items-center rounded-full hover:bg-white/10"
          data-testid="media-mute"
        >
          <Icon className="size-5" />
        </button>
      </Tooltip>
      {volumeOk && (
        <div className="w-0 overflow-hidden transition-[width] duration-200 group-focus-within/vol:w-24 group-hover/vol:w-24">
          <Slider
            aria-label="Video volume"
            min={0}
            max={1}
            step={0.01}
            value={[muted ? 0 : value]}
            onValueChange={([v]) => {
              setSound({ mediaVolume: v ?? 0 });
              if (muted) useRoom.setState({ mediaMuted: false });
            }}
            className="mx-2 w-20"
          />
        </div>
      )}
    </div>
  );
}

function RateMenu({ rate, onRate }: { rate: number; onRate: (r: number) => void }) {
  return (
    <Popover>
      <Tooltip label="Speed">
        <PopoverTrigger asChild>
          <button aria-label={`Playback speed ${rate}×`} className="flex h-10 items-center gap-1 rounded-full px-2.5 font-mono text-[12px] hover:bg-white/10">
            <Gauge className="size-4" />
            {rate}×
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent side="top" className="w-36 p-1">
        <p className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wider text-paper-faint">Speed for both</p>
        {ALLOWED_RATES.map((r) => (
          <button
            key={r}
            onClick={() => onRate(r)}
            className={cn("flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left font-mono text-[13px] hover:bg-white/10", r === rate && "text-lamp")}
          >
            {r}× {r === rate && <span aria-hidden>•</span>}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** Jump to a chapter — for both of you. */
function ChapterMenu({ chapters, current, onSeek }: { chapters: Chapter[]; current: Chapter | null; onSeek: (t: number) => void }) {
  return (
    <Popover>
      <Tooltip label="Chapters">
        <PopoverTrigger asChild>
          <button aria-label="Chapters" className="grid size-10 place-items-center rounded-full hover:bg-white/10" data-testid="chapters-button">
            <ListVideo className="size-5" />
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent side="top" align="end" className="max-h-[50vh] w-72 overflow-y-auto p-1 scrollbar-quiet">
        <p className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wider text-paper-faint">Chapters · jumps for both</p>
        {chapters.map((ch) => (
          <PopoverClose asChild key={ch.start}>
            <button
              onClick={() => onSeek(ch.start)}
              className={cn("flex w-full items-baseline gap-3 rounded-md px-2 py-2 text-left text-[13px] hover:bg-white/10", current?.start === ch.start && "bg-white/[0.08] text-lamp")}
              data-testid="chapter-item"
            >
              <span className="w-12 shrink-0 font-mono text-[12px] text-paper-faint">{formatTime(ch.start)}</span>
              <span className="min-w-0 flex-1 leading-snug">{ch.title}</span>
            </button>
          </PopoverClose>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** "3-2-1": start together with a countdown on both screens. */
function CountdownButton() {
  const c = useController();
  const running = useRoom((s) => !!s.countdownAt);
  return (
    <Tooltip label="Play for both with a 3-2-1 countdown">
      <button
        onClick={() => c.startCountdown()}
        disabled={running}
        aria-label="Play for both with a 3-2-1 countdown"
        className="hidden h-9 items-center gap-1.5 rounded-full bg-white/10 px-3 text-[12px] font-semibold hover:bg-white/15 disabled:opacity-40 min-[420px]:flex"
        data-testid="countdown-button"
      >
        <Timer className="size-4" /> 3·2·1
      </button>
    </Tooltip>
  );
}
