"use client";
import { ChevronDown, ChevronUp, FolderOpen, Globe, Play, Plus, Square, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatTime } from "@/lib/playback";
import type { QueueItemDTO } from "@/lib/protocol";
import { formatBytes } from "@/lib/subtitles";
import { useController } from "./context";
import { useRoom } from "./store";

function Thumb({ q, playing }: { q: QueueItemDTO; playing: boolean }) {
  if (q.thumbnailUrl)
    return (
      <span className="relative block aspect-video w-24 shrink-0 overflow-hidden rounded-lg bg-ink-700">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={q.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        {playing && <span className="absolute inset-0 grid place-items-center bg-black/45 text-[10px] font-bold uppercase tracking-wider">Playing</span>}
      </span>
    );
  return (
    <span className={cn("grid aspect-video w-24 shrink-0 place-items-center rounded-lg", playing ? "bg-lamp text-white" : "bg-white/[0.07] text-paper-dim")}>
      {q.kind === "file" ? <FolderOpen className="size-5" /> : <Globe className="size-5" />}
    </span>
  );
}

export function QueuePanel() {
  const c = useController();
  const queue = useRoom((s) => s.queue);
  const nowId = useRoom((s) => s.playback.mediaId);
  const localFiles = useRoom((s) => s.localFiles);
  const participants = useRoom((s) => s.participants);
  const meId = useRoom((s) => s.me.id);
  const who = (id: string | null) => (id === meId ? "you" : (participants.find((p) => p.id === id)?.displayName ?? "someone"));

  function move(i: number, d: -1 | 1) {
    const ids = queue.map((q) => q.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    void c.reorderQueue(ids);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="scrollbar-quiet min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {queue.length === 0 ? (
          <div className="grid h-full place-items-center px-6 text-center">
            <div>
              <p className="text-[17px] font-semibold">Nothing up next</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-paper-dim">Add YouTube videos, a film from your computer, or a video link — both of you can add and reorder.</p>
              <Button variant="primary" size="sm" className="mt-5" onClick={() => useRoom.setState({ watchOpen: true })}>
                <Plus /> Add something
              </Button>
            </div>
          </div>
        ) : (
          <ol className="space-y-1" aria-label="Watchlist" data-testid="queue-list">
            {queue.map((q, i) => {
              const playing = q.id === nowId;
              const missingFile = q.kind === "file" && !localFiles[q.id];
              return (
                <li key={q.id} className={cn("group/q relative flex items-center gap-3 rounded-xl p-2", playing ? "bg-white/[0.08]" : "hover:bg-white/[0.05]")} aria-current={playing ? "true" : undefined}>
                  <Thumb q={q} playing={playing} />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[13px] font-medium leading-snug text-paper">{q.title}</p>
                    <p className="mt-0.5 truncate text-[11px] text-paper-faint">
                      {q.kind === "youtube" ? "YouTube" : q.kind === "file" ? `File · ${formatBytes(q.fileSize)}` : `Link · ${new URL(q.url!).hostname}`}
                      {q.durationSec ? ` · ${formatTime(q.durationSec)}` : ""} · {who(q.addedBy)}
                      {missingFile && !playing && " · needs your copy"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover/q:opacity-100 sm:focus-within:opacity-100">
                    {!playing && (
                      <IconBtn label={`Play ${q.title} now`} onClick={() => void c.sendIntent({ type: "load", mediaId: q.id })}>
                        <Play className="fill-current" />
                      </IconBtn>
                    )}
                    <div className="flex">
                      <IconBtn label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
                        <ChevronUp />
                      </IconBtn>
                      <IconBtn label="Move down" onClick={() => move(i, 1)} disabled={i === queue.length - 1}>
                        <ChevronDown />
                      </IconBtn>
                    </div>
                    <IconBtn label={`Remove ${q.title}`} onClick={() => void c.removeFromQueue(q.id).catch((e) => c.handleApiError(e, "Couldn’t remove"))}>
                      <Trash />
                    </IconBtn>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
      {queue.length > 0 && (
        <div className="flex gap-2 border-t hairline p-3">
          <Button size="sm" variant="primary" className="flex-1" onClick={() => useRoom.setState({ watchOpen: true })}>
            <Plus /> Add
          </Button>
          {nowId && (
            <Button size="sm" variant="secondary" onClick={() => void c.sendIntent({ type: "load", mediaId: null })}>
              <Square className="fill-current" /> Stop for both
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="grid size-7 place-items-center rounded-full text-paper-dim hover:bg-white/10 hover:text-paper disabled:opacity-30 [&_svg]:size-3.5">
      {children}
    </button>
  );
}
