"use client";
import { Room } from "livekit-client";
import { api } from "@/lib/api";

/**
 * While you're in the lobby we fetch the call token and pre-warm the LiveKit
 * connection (DNS, TLS, region lookup), so pressing Join connects right away.
 */
let cache: { roomId: string; token: string; url: string; at: number } | null = null;
let inflight: Promise<void> | null = null;
const FRESH_MS = 8 * 60_000; // tokens live 15 min; use well within that

export function prefetchToken(roomId: string) {
  if (cache && cache.roomId === roomId && Date.now() - cache.at < FRESH_MS) return;
  if (inflight) return;
  inflight = (async () => {
    try {
      const r = await api<{ token: string; url: string }>(`/api/rooms/${roomId}/token`, { method: "POST", body: {} });
      cache = { roomId, token: r.token, url: r.url, at: Date.now() };
      await new Room().prepareConnection(r.url, r.token).catch(() => {});
    } catch {
      /* the room will fetch its own token */
    } finally {
      inflight = null;
    }
  })();
}

/** One-shot: hand the prefetched token to the room connection. */
export function takeToken(roomId: string): { token: string; url: string } | null {
  if (cache && cache.roomId === roomId && Date.now() - cache.at < FRESH_MS) {
    const t = cache;
    cache = null;
    return t;
  }
  return null;
}
