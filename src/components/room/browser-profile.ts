"use client";
/**
 * Opt-in: keep the shared browser's sign-ins (Google/YouTube, etc.) on this
 * device for next time. Stored as a Hyperbeam profile id in localStorage.
 */
const KEY = "cb.browserProfile";
const ON = "cb.browserRemember";

function get(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function set(k: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
}

export const browserProfile = {
  remembering: () => get(ON) === "1",
  setRemembering(on: boolean) {
    set(ON, on ? "1" : null);
    if (!on) set(KEY, null);
  },
  wanted(): "new" | string | undefined {
    if (!this.remembering()) return undefined;
    return get(KEY) ?? "new";
  },
  save(id: string) {
    set(KEY, id || null);
  },
};
