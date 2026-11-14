/** Extract a YouTube video id from the URL shapes people actually paste. Pure; shared by client and server. */
const ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function parseYouTubeId(input: string): string | null {
  const s = input.trim();
  if (ID_RE.test(s)) return s;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.split("/")[1] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else {
      const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/);
      id = m?.[1] ?? null;
    }
  }
  return id && ID_RE.test(id) ? id : null;
}

/** Start offset from ?t=90 / ?t=1m30s / &start=90, in seconds. */
export function parseYouTubeStart(input: string): number {
  try {
    const u = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
    const t = u.searchParams.get("t") ?? u.searchParams.get("start");
    if (!t) return 0;
    if (/^\d+$/.test(t)) return Number(t);
    const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    if (!m) return 0;
    return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  } catch {
    return 0;
  }
}

export const youtubeThumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

/**
 * Playlist id from a pasted link (…/playlist?list=PL…, or a watch link with &list=).
 * Auto-generated mixes (RD…) can't be listed by YouTube's API, so they're ignored.
 */
export function parseYouTubePlaylistId(input: string): string | null {
  let u: URL;
  try {
    const s = input.trim();
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m|music)\./, "");
  if (host !== "youtube.com" && host !== "youtu.be") return null;
  const list = u.searchParams.get("list");
  if (!list || !/^[A-Za-z0-9_-]{10,64}$/.test(list) || /^RD/.test(list)) return null;
  return list;
}

export interface Chapter {
  start: number;
  title: string;
}

/**
 * Chapters from a video description, using YouTube's own rules: timestamps at
 * the start of lines, starting at 0:00, ascending, at least three of them.
 */
export function parseChapters(description: string | null | undefined, durationSec?: number | null): Chapter[] {
  if (!description) return [];
  const out: Chapter[] = [];
  for (const raw of description.split(/\r?\n/)) {
    const m = raw.trim().match(/^[([]?((?:\d{1,2}:)?\d{1,2}:\d{2})[)\]]?\s*(?:[-–—:|•.]\s*)?(.+)$/);
    if (!m) continue;
    const parts = m[1]!.split(":").map(Number);
    const start = parts.reduce((acc, n) => acc * 60 + n, 0);
    const title = m[2]!.trim().replace(/\s+/g, " ").slice(0, 80);
    if (!title) continue;
    if (durationSec && start >= durationSec) continue;
    if (out.length && start <= out[out.length - 1]!.start) continue;
    out.push({ start, title });
  }
  if (out.length < 3 || out[0]!.start !== 0) return [];
  return out.slice(0, 100);
}
