"use client";

/** Small per-browser conveniences. Never used for anything security-relevant. */
function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`closeby:${key}`);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(`closeby:${key}`, JSON.stringify(value));
  } catch {
    /* private mode */
  }
}

export const loadName = () => read("name", "");
export const saveName = (n: string) => write("name", n);

export interface DevicePrefs {
  audioInput?: string;
  videoInput?: string;
  audioOutput?: string;
  micOn: boolean;
  camOn: boolean;
}
export const loadDevicePrefs = (): DevicePrefs => read("devices", { micOn: true, camOn: true });
export const saveDevicePrefs = (p: DevicePrefs) => write("devices", p);

export interface SoundPrefs {
  mediaVolume: number;
  voiceVolume: number;
  mirrorSelf: boolean;
  hideSelf: boolean;
  /** Shared browser: buffer slightly for smooth video (on unless switched off). */
  smoothBrowser?: boolean;
  /** Lower the film while either of you is talking (on unless switched off). */
  autoDuck?: boolean;
  /** Room glows with the colours of what's playing (on unless switched off). */
  ambient?: boolean;
}
export const loadSoundPrefs = (): SoundPrefs => read("sound", { mediaVolume: 0.8, voiceVolume: 1, mirrorSelf: true, hideSelf: false });
export const saveSoundPrefs = (p: SoundPrefs) => write("sound", p);

/** YouTube videos played on this device, newest first ("Watch again"). */
export interface YouTubeHistoryItem {
  id: string;
  title: string;
  channel: string | null;
  thumbnailUrl: string;
  durationSec?: number | null;
}
const HISTORY_MAX = 20;
export const loadYouTubeHistory = (): YouTubeHistoryItem[] => {
  const h = read<YouTubeHistoryItem[]>("ytHistory", []);
  return Array.isArray(h) ? h.filter((x) => x && typeof x.id === "string" && typeof x.title === "string").slice(0, HISTORY_MAX) : [];
};
export function rememberYouTube(item: YouTubeHistoryItem) {
  write("ytHistory", [item, ...loadYouTubeHistory().filter((x) => x.id !== item.id)].slice(0, HISTORY_MAX));
}
export const clearYouTubeHistory = () => write("ytHistory", []);

/** YouTube captions on/off for this device. */
export const loadYouTubeCaptions = () => read("ytCaptions", false);
export const saveYouTubeCaptions = (on: boolean) => write("ytCaptions", on);
