"use client";
import { ChevronDown, ChevronUp, FolderOpen, Globe, Link as LinkIcon, Loader, Play, Square, Trash } from "lucide-react";
import { useState } from "react";
import { toast } from "@/components/toaster";
import { Button } from "@/components/ui/button";
import { FieldError, Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { formatTime } from "@/lib/playback";
import { httpUrlSchema } from "@/lib/protocol";
import { formatBytes } from "@/lib/subtitles";
import { useController } from "./context";
import { useRoom } from "./store";
import { explainMediaFailure, probeMedia } from "./use-media-probe";

export function QueuePanel() {
  const c = useController();
  const queue = useRoom((s) => s.queue);
  const nowId = useRoom((s) => s.playback.mediaId);
  const localFiles = useRoom((s) => s.localFiles);
  const participants = useRoom((s) => s.participants);
  const meId = useRoom((s) => s.me.id);
  const [adding, setAdding] = useState<null | "link">(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  const who = (id: string | null) => (id === meId ? "you" : (participants.find((p) => p.id === id)?.displayName ?? "someone"));

  async function playNowIfIdle(id: string) {
    if (!useRoom.getState().playback.mediaId) await c.sendIntent({ type: "load", mediaId: id });
  }

  async function addFile(f: File) {
    setBusy(true);
    const objectUrl = URL.createObjectURL(f);
    const probe = await probeMedia(objectUrl);
    URL.revokeObjectURL(objectUrl);
    if (!probe.ok) {
      setBusy(false);
      toast({ tone: "error", title: `Can’t play “${f.name}”`, body: explainMediaFailure(probe.reason, "file"), durationMs: 9000 });
      return;
    }
    try {
      // Only the name, size and duration are sent. The file itself stays here.
      const item = await c.addToQueue({ kind: "file", fileName: f.name, fileSize: f.size, durationSec: probe.durationSec });
      useRoom.setState((s) => ({ localFiles: { ...s.localFiles, [item.id]: f } }));
      await playNowIfIdle(item.id);
    } catch (e) {
      c.handleApiError(e, "Couldn’t add that file");
    } finally {
      setBusy(false);
    }
  }

  async function addLink(e: React.FormEvent) {
    e.preventDefault();
    setUrlError(null);
    const parsed = httpUrlSchema.safeParse(url);
    if (!parsed.success) return setUrlError(parsed.error.issues[0]?.message ?? "Invalid link");
    setBusy(true);
    const probe = await probeMedia(parsed.data);
    if (!probe.ok) {
      setBusy(false);
      setUrlError(explainMediaFailure(probe.reason, "url"));
      return;
    }
    try {
      const item = await c.addToQueue({ kind: "url", url: parsed.data });
      setUrl("");
      setAdding(null);
      await playNowIfIdle(item.id);
    } catch (err) {
      c.handleApiError(err, "Couldn’t add that link");
    } finally {
      setBusy(false);
    }
  }

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
          <div className="grid h-full place-items-center px-4 text-center">
            <div>
              <p className="font-display text-[24px] leading-tight">Nothing queued yet</p>
              <p className="mt-2 text-[13px] leading-relaxed text-paper-dim">
                Add a film from your computer — your partner picks their own copy — or a direct link to a video file.
              </p>
            </div>
          </div>
        ) : (
          <ol className="space-y-1" aria-label="Watchlist" data-testid="queue-list">
            {queue.map((q, i) => {
              const playing = q.id === nowId;
              const missingFile = q.kind === "file" && !localFiles[q.id];
              return (
                <li
                  key={q.id}
                  className={cn("group/q relative flex items-center gap-3 rounded-md px-2.5 py-2.5", playing ? "bg-ink-800 shadow-ring" : "hover:bg-ink-850")}
                  aria-current={playing ? "true" : undefined}
                >
                  <span className={cn("grid size-8 shrink-0 place-items-center rounded-sm", playing ? "bg-lamp text-lamp-ink" : "bg-ink-800 text-paper-faint")}>
                    {q.kind === "file" ? <FolderOpen className="size-4" /> : <Globe className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] text-paper">{q.title}</p>
                    <p className="truncate text-[12px] text-paper-faint">
                      {playing && <span className="text-lamp">Now playing · </span>}
                      {q.kind === "file" ? `File · ${formatBytes(q.fileSize)}` : `Link · ${new URL(q.url!).hostname}`}
                      {q.durationSec ? ` · ${formatTime(q.durationSec)}` : ""}
                      {` · added by ${who(q.addedBy)}`}
                      {missingFile && !playing && " · needs your copy"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover/q:opacity-100 sm:focus-within:opacity-100">
                    {!playing && (
                      <IconBtn label={`Play ${q.title} now`} onClick={() => void c.sendIntent({ type: "load", mediaId: q.id })}>
                        <Play className="fill-current" />
                      </IconBtn>
                    )}
                    <IconBtn label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
                      <ChevronUp />
                    </IconBtn>
                    <IconBtn label="Move down" onClick={() => move(i, 1)} disabled={i === queue.length - 1}>
                      <ChevronDown />
                    </IconBtn>
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

      <div className="space-y-2 border-t hairline p-3">
        {adding === "link" ? (
          <form onSubmit={addLink} noValidate>
            <Input
              autoFocus
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setUrlError(null);
              }}
              placeholder="https://…/film.mp4"
              aria-label="Direct video link"
              aria-invalid={!!urlError}
              className="h-10 font-mono text-[13px]"
              data-testid="queue-url"
            />
            <FieldError>{urlError}</FieldError>
            {urlError && (
              <button
                type="button"
                className="mt-1 text-[12px] text-lamp underline underline-offset-2"
                onClick={() => {
                  void c.sendChat(url);
                  useRoom.setState({ panel: "chat" });
                  setUrl("");
                  setAdding(null);
                }}
              >
                Send it in chat instead, so you can both open it
              </button>
            )}
            <div className="mt-2 flex gap-2">
              <Button type="submit" variant="primary" size="sm" disabled={busy} className="flex-1">
                {busy ? <Loader className="animate-spin" /> : null} {busy ? "Checking link…" : "Add link"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(null)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <label className={cn("inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-sm bg-ink-800 text-[13px] font-medium text-paper shadow-ring hover:bg-ink-750", busy && "pointer-events-none opacity-50")}>
              {busy ? <Loader className="size-3.5 animate-spin" /> : <FolderOpen className="size-3.5" />} Add file
              <input type="file" accept="video/*,audio/*,.mkv,.mov,.m4v" className="sr-only" data-testid="queue-file" onChange={(e) => e.target.files?.[0] && void addFile(e.target.files[0])} />
            </label>
            <Button size="sm" onClick={() => setAdding("link")}>
              <LinkIcon /> Add link
            </Button>
          </div>
        )}
        {nowId && (
          <Button size="sm" variant="ghost" className="w-full" onClick={() => void c.sendIntent({ type: "load", mediaId: null })}>
            <Square className="fill-current" /> Stop watching for both
          </Button>
        )}
        <p className="px-1 text-[11px] leading-snug text-paper-faint">
          Files never leave your device — only their name and size are shared. Links must point straight at a video file; streaming-service pages and DRM-protected video can’t be played here.
        </p>
      </div>
    </div>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="grid size-7 place-items-center rounded-sm text-paper-dim hover:bg-ink-700 hover:text-paper disabled:opacity-30 [&_svg]:size-3.5">
      {children}
    </button>
  );
}
