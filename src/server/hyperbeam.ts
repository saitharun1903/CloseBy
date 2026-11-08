import { AppError } from "./errors";

/**
 * Shared cloud browser via Hyperbeam (https://docs.hyperbeam.com).
 * One Chromium per room; both people see and control it. Billing is per
 * participant-minute, so sessions are created only on an explicit click and
 * shut down quickly when unused.
 */
export interface BrowserSession {
  sessionId: string;
  embedUrl: string;
  /** Saved-profile id (sign-ins, cookies) when one was requested. */
  profileId?: string;
}

export interface BrowserProvider {
  start(opts: { roomId: string; startUrl: string; region: "NA" | "EU" | "AS"; profile?: "new" | string }): Promise<BrowserSession>;
  stop(sessionId: string): Promise<void>;
}

/** Cost/abuse guards, in seconds. */
export const BROWSER_TIMEOUTS = {
  offline: 120, // nobody connected for 2 min → ends
  // Counts only clicks/keys — a full movie has none, so this must outlast one.
  inactive: 3 * 3600,
  absolute: 4 * 3600, // hard cap per session
  warning: 60,
};

export function createHyperbeamProvider(apiKey: string, f: typeof fetch = fetch): BrowserProvider {
  const base = "https://engine.hyperbeam.com/v0/vm";
  const headers = { authorization: `Bearer ${apiKey}`, "content-type": "application/json" };
  return {
    async start({ roomId, startUrl, region, profile }) {
      let res: Response;
      try {
        res = await f(base, {
          method: "POST",
          headers,
          signal: AbortSignal.timeout(20_000),
          body: JSON.stringify({
            start_url: startUrl,
            // Same tag → Hyperbeam returns the running session instead of starting (and billing) a second one.
            tag: `closeby-${roomId}`,
            region,
            timeout: BROWSER_TIMEOUTS,
            adblock: true,
            dark: true,
            search_engine: "google",
            fps: 30,
            width: 1280,
            height: 720,
            quality: { mode: "smooth" },
            // Saved profile keeps Google/YouTube sign-ins between sessions.
            ...(profile ? { profile: profile === "new" ? true : profile } : {}),
          }),
        });
      } catch {
        throw new AppError("media_unavailable", "Couldn’t reach the shared-browser service. Try again.");
      }
      if (res.status === 401 || res.status === 403) {
        console.error("[hyperbeam] rejected API key (status", res.status, ")");
        throw new AppError("media_unavailable", "The shared browser isn’t set up correctly on this server.");
      }
      if (res.status === 429 || res.status === 402) throw new AppError("media_unavailable", "The shared browser is at capacity right now. Try again later.");
      if (!res.ok) throw new AppError("media_unavailable", "The shared browser couldn’t start. Try again.");
      const j = (await res.json()) as { session_id?: string; embed_url?: string };
      if (!j.session_id || !j.embed_url || !/^https:\/\/[a-z0-9-]+\.hyperbeam\.com\//.test(j.embed_url)) {
        throw new AppError("media_unavailable", "The shared browser returned an unexpected response.");
      }
      return { sessionId: j.session_id, embedUrl: j.embed_url, profileId: profile ? (profile === "new" ? j.session_id : profile) : undefined };
    },
    async stop(sessionId) {
      try {
        await f(`${base}/${encodeURIComponent(sessionId)}`, { method: "DELETE", headers, signal: AbortSignal.timeout(10_000) });
      } catch {
        /* it will time out on its own (offline timeout) */
      }
    },
  };
}
