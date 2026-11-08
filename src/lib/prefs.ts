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
}
export const loadSoundPrefs = (): SoundPrefs => read("sound", { mediaVolume: 0.8, voiceVolume: 1, mirrorSelf: true, hideSelf: false });
export const saveSoundPrefs = (p: SoundPrefs) => write("sound", p);
