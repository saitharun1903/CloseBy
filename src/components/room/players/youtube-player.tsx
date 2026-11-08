"use client";
import { Loader, Maximize2, Pause, Play, TriangleExclamationPoint } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { QueueItemDTO } from "@/lib/protocol";
import { useController } from "../context";
import { useRoom } from "../store";
import type { MediaAdapter } from "./adapter";
import { PlayerControls } from "./controls";
import { TapToPlay } from "./html5-player";
import { usePlayerChrome } from "./use-player-chrome";
import { useSyncEngine } from "./use-sync";
import { explainYouTubeError, loadYouTubeApi, YT_STATE, type YTPlayer } from "./youtube-api";

/**
 * Synced YouTube player (IFrame Player API).
 * YouTube's policies forbid drawing anything over the embedded player, so our
 * controls live in a strip *below* the video and nothing floats on top of it.
 */
export function YouTubePlayer({ item, mode, onExpand }: { item: QueueItemDTO; mode: "main" | "mini"; onExpand: () => void }) {
  const c = useController();
  const mount = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const stateRef = useRef<number>(YT_STATE.UNSTARTED);
  const adapter = useRef<MediaAdapter | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null);
  const [buffering, setBuffering] = useState(false);
  const playback = useRoom((s) => s.playback);
  const volume = useRoom((s) => s.sound.mediaVolume);
  const muted = useRoom((s) => s.mediaMuted);
  const playing = playback.status === "playing";

  adapter.current ??= {
    ready: () => !!player.current,
    time: () => player.current?.getCurrentTime() ?? 0,
    duration: () => {
      const d = player.current?.getDuration();
      return d && d > 0 ? d : null;
    },
    paused: () => stateRef.current !== YT_STATE.PLAYING && stateRef.current !== YT_STATE.BUFFERING,
    ended: () => stateRef.current === YT_STATE.ENDED,
    stalled: () => stateRef.current === YT_STATE.BUFFERING,
    play: () =>
      new Promise<void>((resolve, reject) => {
        const p = player.current;
        if (!p) return resolve();
        p.playVideo();
        // YouTube doesn't reject on autoplay blocks; detect "didn't start".
        const started = Date.now();
        const check = () => {
          const s = stateRef.current;
          if (s === YT_STATE.PLAYING || s === YT_STATE.BUFFERING) return resolve();
          if (Date.now() - started > 2500) return reject(new DOMException("Playback was blocked", "NotAllowedError"));
          setTimeout(check, 150);
        };
        check();
      }),
    pause: () => player.current?.pauseVideo(),
    seek: (t) => player.current?.seekTo(t, true),
    setRate: (r) => player.current?.setPlaybackRate(r),
    canNudge: false,
  };

  const sync = useSyncEngine(adapter, item.id, ready);
  const chrome = usePlayerChrome(mode === "main", sync.togglePlay, sync.seekTo, () => player.current?.getCurrentTime() ?? 0);
  const syncRef = useRef(sync);
  syncRef.current = sync;
  const chromeRef = useRef(chrome);
  chromeRef.current = chrome;

  // Create the player once per video.
  useEffect(() => {
    let cancelled = false;
    let created: YTPlayer | null = null;
    setReady(false);
    setError(null);
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !mount.current || !item.externalId) return;
        const host = document.createElement("div");
        mount.current.replaceChildren(host);
        created = new YT.Player(host, {
          host: "https://www.youtube-nocookie.com",
          videoId: item.externalId,
          width: "100%",
          height: "100%",
          playerVars: {
            controls: 0, // our controls sit below the player, never on top of it
            disablekb: 1,
            fs: 0, // full screen is the whole room (cinema mode), so cameras stay visible
            rel: 0,
            playsinline: 1,
            iv_load_policy: 3,
            enablejsapi: 1,
            origin: window.location.origin,
            autoplay: 0,
          },
          events: {
            onReady: (e) => {
              if (cancelled) return;
              player.current = e.target;
              e.target.setVolume(Math.round(useRoom.getState().sound.mediaVolume * 100));
              if (useRoom.getState().mediaMuted) e.target.mute();
              setDuration(e.target.getDuration() || 0);
              setReady(true);
            },
            onStateChange: (e) => {
              stateRef.current = e.data;
              setBuffering(e.data === YT_STATE.BUFFERING);
              if (e.data === YT_STATE.PLAYING) {
                setDuration(e.target.getDuration() || 0);
                syncRef.current.onPlayerStateChange("playing");
              } else if (e.data === YT_STATE.PAUSED) syncRef.current.onPlayerStateChange("paused");
              else if (e.data === YT_STATE.ENDED) chromeRef.current.onEnded(item.id);
              if (e.data === YT_STATE.BUFFERING && useRoom.getState().playback.status === "playing") useRoom.setState({ sync: "buffering" });
            },
            onError: (e) => setError(explainYouTubeError(e.data)),
          },
        });
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
      try {
        (player.current ?? created)?.destroy();
      } catch {
        /* already gone */
      }
      player.current = null;
    };
  }, [item.externalId, item.id]);

  // Local volume only.
  useEffect(() => {
    const p = player.current;
    if (!p || !ready) return;
    p.setVolume(Math.round(volume * 100));
    if (muted) p.mute();
    else p.unMute();
  }, [volume, muted, ready]);

  // Progress for our controls.
  useEffect(() => {
    if (!ready) return;
    const t = setInterval(() => {
      const p = player.current;
      if (p) setCurrent(p.getCurrentTime() || 0);
    }, 250);
    return () => clearInterval(t);
  }, [ready]);

  useEffect(() => {
    c.announceMedia({ mediaId: item.id, ready: ready && !error, fileName: null, fileSize: null, durationSec: duration || null });
  }, [c, item.id, ready, error, duration]);

  return (
    <div className={cn("flex h-full w-full flex-col bg-black", mode === "mini" && "overflow-hidden rounded-xl")} onPointerMove={chrome.poke} data-testid="player" data-player="youtube">
      <div className="relative min-h-0 flex-1">
        <div ref={mount} className="absolute inset-0 [&>iframe]:h-full [&>iframe]:w-full" data-testid="yt-mount" />
        {/* Status surfaces replace the player rather than covering it. */}
        {!ready && !error && (
          <div className="absolute inset-0 grid place-items-center bg-black">
            <Loader className="size-7 animate-spin text-white/70" aria-label="Loading YouTube" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 grid place-items-center bg-black p-6 text-center" role="alert">
            <div className="max-w-[420px]">
              <TriangleExclamationPoint className="mx-auto size-7 text-danger" />
              <p className="mt-3 text-[17px] font-semibold">Can’t play “{item.title}”</p>
              <p className="mt-1.5 text-[14px] text-paper-dim">{error}</p>
            </div>
          </div>
        )}
        {sync.needsGesture && !error && <TapToPlay onTap={() => void sync.resolveGesture()} />}
      </div>
      {mode === "main" ? (
        <div className="shrink-0 px-4 pb-1 pt-2 sm:px-5">
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
            disabled={!ready || !!error}
          />
          {buffering && <span className="sr-only">Buffering</span>}
        </div>
      ) : (
        <div className="flex shrink-0 items-center justify-between gap-2 bg-ink-850 px-2 py-1.5">
          <button aria-label={playing ? "Pause for both of you" : "Play for both of you"} onClick={sync.togglePlay} className="grid size-8 place-items-center rounded-full hover:bg-white/10">
            {playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
          </button>
          <span className="min-w-0 flex-1 truncate text-[12px] text-paper-dim">{item.title}</span>
          <button aria-label="Bring the video back to the big screen" onClick={onExpand} className="grid size-8 place-items-center rounded-full hover:bg-white/10">
            <Maximize2 className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
