"use client";
import { useRoom } from "../store";
import { Html5Player } from "./html5-player";
import { YouTubePlayer } from "./youtube-player";

/** Picks the right player for the current watchlist item. */
export function MediaPlayer({ mode, onExpand }: { mode: "main" | "mini"; onExpand: () => void }) {
  const mediaId = useRoom((s) => s.playback.mediaId);
  const item = useRoom((s) => s.queue.find((q) => q.id === s.playback.mediaId) ?? null);
  if (!mediaId) return null;
  if (!item) return <div className="grid h-full w-full place-items-center bg-black text-sm text-paper-dim">That item was removed from the watchlist.</div>;
  if (item.kind === "youtube") return <YouTubePlayer key={item.id} item={item} mode={mode} onExpand={onExpand} />;
  return <Html5Player key={item.id} item={item} mode={mode} onExpand={onExpand} />;
}
