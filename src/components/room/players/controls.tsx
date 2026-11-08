"use client";
import { Gauge, Pause, Play, Volume1, Volume2, VolumeX } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  className?: string;
}) {
  const sync = useRoom((s) => s.sync);
  const partnerMedia = useRoom((s) => s.partnerMedia);
  const mediaId = useRoom((s) => s.playback.mediaId);
  const partnerName = useRoom((s) => s.participants.find((p) => p.id !== s.me.id)?.displayName);
  const partnerNotReady = !!partnerMedia && !!partnerName && (partnerMedia.mediaId !== mediaId || !partnerMedia.ready);
  const shown = scrub ?? current;
  return (
    <div className={cn("text-white", className)}>
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
        <span className="font-mono text-[12px] text-white/90 tabular" data-testid="player-time">
          {formatTime(shown)} <span className="text-white/45">/ {formatTime(duration)}</span>
        </span>
        <SyncChip sync={sync} partnerNotReady={partnerNotReady} partnerName={partnerName} playing={playing} />
        <div className="ml-auto flex items-center gap-0.5">
          <VolumeControl />
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
