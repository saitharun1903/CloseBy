/**
 * Wire protocol between the Closeby app (browsers in the room) and the
 * browser bot, carried over the room's LiveKit data channel.
 * Keep in sync with src/lib/browser-protocol.ts in the app.
 */
export const BOT_IDENTITY_PREFIX = "cb-browser-";
export const TOPIC_INPUT = "cb.browser.in";
export const TOPIC_STATE = "cb.browser.state";

export type InputEvent =
  /** Coordinates are fractions (0–1) of the page area. */
  | { t: "move"; x: number; y: number }
  | { t: "down" | "up"; x: number; y: number; b: 0 | 1 | 2 }
  | { t: "wheel"; x: number; y: number; dx: number; dy: number }
  | { t: "key"; type: "down" | "up"; key: string }
  | { t: "text"; s: string }
  | { t: "nav"; url: string }
  | { t: "back" | "forward" | "reload" | "stop" };

export type BrowserState = { url: string; title: string; canBack: boolean; canForward: boolean; loading: boolean };

const clamp01 = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : null);

/** Validate an incoming event; anything malformed is dropped. */
export function parseInput(raw: unknown): InputEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  switch (e.t) {
    case "move": {
      const x = clamp01(e.x), y = clamp01(e.y);
      return x === null || y === null ? null : { t: "move", x, y };
    }
    case "down":
    case "up": {
      const x = clamp01(e.x), y = clamp01(e.y);
      const b = e.b === 1 || e.b === 2 ? e.b : 0;
      return x === null || y === null ? null : { t: e.t, x, y, b };
    }
    case "wheel": {
      const x = clamp01(e.x), y = clamp01(e.y);
      const dx = typeof e.dx === "number" && Number.isFinite(e.dx) ? Math.max(-4000, Math.min(4000, e.dx)) : 0;
      const dy = typeof e.dy === "number" && Number.isFinite(e.dy) ? Math.max(-4000, Math.min(4000, e.dy)) : 0;
      return x === null || y === null ? null : { t: "wheel", x, y, dx, dy };
    }
    case "key":
      return (e.type === "down" || e.type === "up") && typeof e.key === "string" && e.key.length > 0 && e.key.length <= 32 ? { t: "key", type: e.type, key: e.key } : null;
    case "text":
      return typeof e.s === "string" && e.s.length > 0 && e.s.length <= 2000 ? { t: "text", s: e.s } : null;
    case "nav": {
      const url = normalizeUrl(e.url);
      return url ? { t: "nav", url } : null;
    }
    case "back":
    case "forward":
    case "reload":
    case "stop":
      return { t: e.t };
    default:
      return null;
  }
}

/** What someone typed in the address bar → a URL (or a Google search). http(s) only. */
export function normalizeUrl(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const s = input.trim();
  if (!s || s.length > 2048) return null;
  const looksLikeHost = /^[^\s/]+\.[^\s/]{2,}(\/.*)?$/.test(s) || /^localhost(:\d+)?(\/.*)?$/.test(s);
  let candidate = /^https?:\/\//i.test(s) ? s : looksLikeHost ? `https://${s}` : null;
  if (!candidate) return `https://www.google.com/search?q=${encodeURIComponent(s)}`;
  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    candidate = u.toString();
    return candidate;
  } catch {
    return null;
  }
}

/** Browser KeyboardEvent.key → Playwright key name. */
export function toPlaywrightKey(key: string): string {
  if (key === " ") return "Space";
  if (key === "Esc") return "Escape";
  if (key === "Del") return "Delete";
  if (key === "Left" || key === "Right" || key === "Up" || key === "Down") return `Arrow${key}`;
  return key;
}
