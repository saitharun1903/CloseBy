"use client";

/** Minimal typings for the YouTube IFrame Player API we use. */
export interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setPlaybackRate(rate: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  setVolume(v: number): void;
  mute(): void;
  unMute(): void;
  destroy(): void;
  getIframe(): HTMLIFrameElement;
  /** Captions module (long-standing but lightly documented). */
  loadModule?(name: "captions"): void;
  unloadModule?(name: "captions"): void;
}

export const YT_STATE = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const;

interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      host?: string;
      videoId: string;
      width?: string | number;
      height?: string | number;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (e: { target: YTPlayer }) => void;
        onStateChange?: (e: { data: number; target: YTPlayer }) => void;
        onError?: (e: { data: number }) => void;
      };
    },
  ) => YTPlayer;
}

let loading: Promise<YTNamespace> | null = null;

/** Load https://www.youtube.com/iframe_api once. */
export function loadYouTubeApi(): Promise<YTNamespace> {
  const w = window as unknown as { YT?: YTNamespace & { loaded?: number }; onYouTubeIframeAPIReady?: () => void };
  if (w.YT?.Player) return Promise.resolve(w.YT);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(w.YT!);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    s.onerror = () => {
      loading = null;
      reject(new Error("Couldn’t load YouTube. A content blocker or your network may be blocking it."));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export function explainYouTubeError(code: number): string {
  switch (code) {
    case 2:
      return "That YouTube link isn’t valid.";
    case 5:
      return "Your browser couldn’t play this YouTube video.";
    case 100:
      return "This video was removed or is private.";
    case 101:
    case 150:
      return "The video’s owner doesn’t allow it to be played outside YouTube.";
    case 152:
    case 153:
      return "YouTube refused to load the player for this site. Reload the page and try again.";
    default:
      return "YouTube couldn’t play this video.";
  }
}
