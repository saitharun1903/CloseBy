"use client";
import * as Tabs from "@radix-ui/react-tabs";
import * as D from "@radix-ui/react-dialog";
import { FolderOpen, Globe, Link as LinkIcon, Loader, X } from "lucide-react";
import { useState } from "react";
import { toast } from "@/components/toaster";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";
import type { ApiRequestError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { httpUrlSchema } from "@/lib/protocol";
import { parseYouTubeId } from "@/lib/youtube";
import { useController } from "./context";
import { YouTubeBrowse } from "./youtube-hub";
import { useRoom } from "./store";
import { explainMediaFailure, probeMedia } from "./use-media-probe";

/** Brand-free quick launch tiles for the shared browser. */
const QUICK_SITES = [
  { label: "YouTube", url: "https://www.youtube.com", hue: 0 },
  { label: "Google", url: "https://www.google.com", hue: 217 },
  { label: "Twitch", url: "https://www.twitch.tv", hue: 264 },
  { label: "Wikipedia", url: "https://www.wikipedia.org", hue: 0, mono: true },
  { label: "Reddit", url: "https://www.reddit.com", hue: 16 },
  { label: "Maps", url: "https://www.google.com/maps", hue: 140 },
];

export function WatchPicker() {
  const open = useRoom((s) => s.watchOpen);
  const [tab, setTab] = useState("youtube");
  return (
    <D.Root open={open} onOpenChange={(o) => useRoom.setState({ watchOpen: o })}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md data-[state=open]:animate-fade-in" />
        <D.Content
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t-[28px] border hairline bg-ink-850/95 pb-[var(--safe-bottom)] shadow-float backdrop-blur-2xl data-[state=open]:animate-fade-in sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:h-[min(640px,86dvh)] sm:w-[min(760px,calc(100vw-32px))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[28px]"
          data-testid="watch-picker"
        >
          <div className="flex items-start justify-between px-6 pt-6">
            <div>
              <D.Title className="text-[22px] font-semibold tracking-[-0.02em]">Watch together</D.Title>
              <D.Description className="mt-0.5 text-[14px] text-paper-dim">Everything you pick plays in sync for both of you.</D.Description>
            </div>
            <D.Close className="grid size-9 place-items-center rounded-full bg-white/10 text-paper-dim hover:bg-white/15 hover:text-paper" aria-label="Close">
              <X className="size-4" />
            </D.Close>
          </div>
          <Tabs.Root value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
            <Tabs.List className="mx-6 mt-5 grid grid-cols-3 rounded-full bg-white/[0.07] p-1" aria-label="Source">
              {[
                ["youtube", "YouTube"],
                ["browser", "Shared browser"],
                ["files", "Files & links"],
              ].map(([v, l]) => (
                <Tabs.Trigger
                  key={v}
                  value={v!}
                  className="h-9 rounded-full text-[13px] font-semibold text-paper-dim transition-colors data-[state=active]:bg-white data-[state=active]:text-black"
                  data-testid={`watch-tab-${v}`}
                >
                  {l}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            <Tabs.Content value="youtube" className="flex min-h-0 flex-1 flex-col px-6 pb-4 pt-5">
              <YouTubeBrowse layout="embedded" onDone={close} />
            </Tabs.Content>
            <Tabs.Content value="browser" className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-5 scrollbar-quiet">
              <BrowserTab />
            </Tabs.Content>
            <Tabs.Content value="files" className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-5 scrollbar-quiet">
              <FilesTab />
            </Tabs.Content>
          </Tabs.Root>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

function close() {
  useRoom.setState({ watchOpen: false });
}

function BrowserTab() {
  const c = useController();
  const enabled = useRoom((s) => s.features.sharedBrowser);
  const active = useRoom((s) => s.browser.active);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(startUrl?: string) {
    setBusy(startUrl ?? "go");
    setError(null);
    try {
      await c.startBrowser(startUrl);
      close();
    } catch (e) {
      setError((e as ApiRequestError).message);
    } finally {
      setBusy(null);
    }
  }

  if (!enabled) {
    return (
      <div className="mt-8 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-lamp/15">
          <Globe className="size-6 text-lamp" />
        </div>
        <p className="mt-4 text-[15px] font-semibold">The shared browser isn’t switched on yet</p>
        <p className="mx-auto mt-1 max-w-[400px] text-[13px] leading-relaxed text-paper-dim">
          It runs a real cloud browser you both control, and needs a Hyperbeam key on the server. Until then, use YouTube, or share a browser tab with the screen-share button.
        </p>
      </div>
    );
  }

  if (active) {
    return (
      <div className="mt-8 text-center">
        <p className="text-[15px] font-semibold">The shared browser is open</p>
        <p className="mt-1 text-[13px] text-paper-dim">It’s on the big screen. Open new tabs inside it to go anywhere.</p>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="primary" onClick={close}>
            Go to it
          </Button>
          <Button variant="secondary" onClick={() => void c.stopBrowser().then(close)}>
            Close for both
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[13px] leading-relaxed text-paper-dim">A real browser in the cloud that you both see, hear and control — go anywhere, click, type, scroll.</p>
      <ul className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
        {QUICK_SITES.map((s) => (
          <li key={s.label}>
            <button
              onClick={() => void start(s.url)}
              disabled={!!busy}
              className="flex w-full flex-col items-center gap-2 rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.08] disabled:opacity-50"
              data-testid={`quick-${s.label.toLowerCase()}`}
            >
              <span
                className="grid size-11 place-items-center rounded-xl text-[17px] font-bold text-white"
                style={{ background: s.mono ? "#3a3a40" : `hsl(${s.hue} 75% 45%)` }}
                aria-hidden
              >
                {busy === s.url ? <Loader className="size-4 animate-spin" /> : s.label[0]}
              </span>
              <span className="text-[12px] font-medium">{s.label}</span>
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-5 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = url.trim() ? (/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`) : "";
          if (v && !httpUrlSchema.safeParse(v).success) return setError("That doesn’t look like a web address.");
          void start(v || undefined);
        }}
      >
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Or type an address, e.g. imdb.com"
          aria-label="Web address"
          className="h-11 min-w-0 flex-1 rounded-full bg-white/[0.07] px-4 text-[14px] outline-none placeholder:text-paper-faint focus:bg-white/[0.1]"
        />
        <Button type="submit" variant="primary" disabled={!!busy} data-testid="browser-start">
          {busy === "go" ? <Loader className="animate-spin" /> : <Globe />} Open
        </Button>
      </form>
      <FieldError>{error}</FieldError>
      <p className="mt-4 text-[12px] leading-relaxed text-paper-faint">
        Sites that use DRM — Netflix, Prime Video, Disney+ — usually won’t play here. The browser closes on its own after 15 minutes without use.
      </p>
    </div>
  );
}

function FilesTab() {
  const c = useController();
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);

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
      // Only the name, size and duration are shared. The file stays on this device.
      const item = await c.addToQueue({ kind: "file", fileName: f.name, fileSize: f.size, durationSec: probe.durationSec });
      useRoom.setState((s) => ({ localFiles: { ...s.localFiles, [item.id]: f } }));
      await playNowIfIdle(item.id);
      close();
    } catch (e) {
      c.handleApiError(e, "Couldn’t add that file");
    } finally {
      setBusy(false);
    }
  }

  async function addLink(e: React.FormEvent) {
    e.preventDefault();
    setUrlError(null);
    if (parseYouTubeId(url)) {
      setBusy(true);
      try {
        const item = await c.addToQueue({ kind: "youtube", url });
        await playNowIfIdle(item.id);
        close();
      } catch (err) {
        setUrlError((err as ApiRequestError).message);
      } finally {
        setBusy(false);
      }
      return;
    }
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
      await playNowIfIdle(item.id);
      close();
    } catch (err) {
      c.handleApiError(err, "Couldn’t add that link");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <label
        className={cn(
          "flex cursor-pointer items-center gap-4 rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.08]",
          busy && "pointer-events-none opacity-60",
        )}
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/10">
          {busy ? <Loader className="size-5 animate-spin" /> : <FolderOpen className="size-5" />}
        </span>
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold">A video on your computer</span>
          <span className="block text-[13px] text-paper-dim">You each choose your own copy — nothing is uploaded.</span>
        </span>
        <input type="file" accept="video/*,audio/*,.mkv,.mov,.m4v" className="sr-only" data-testid="queue-file" onChange={(e) => e.target.files?.[0] && void addFile(e.target.files[0])} />
      </label>

      <form onSubmit={addLink} className="rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/[0.06]" noValidate>
        <div className="flex items-center gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/10">
            <LinkIcon className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold">A link to a video file</span>
            <span className="block text-[13px] text-paper-dim">Direct links like …/film.mp4, or any YouTube link.</span>
          </span>
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setUrlError(null);
            }}
            placeholder="https://…"
            aria-label="Video link"
            aria-invalid={!!urlError}
            className="h-11 min-w-0 flex-1 rounded-full bg-white/[0.07] px-4 font-mono text-[13px] outline-none placeholder:text-paper-faint focus:bg-white/[0.1]"
            data-testid="queue-url"
          />
          <Button type="submit" variant="primary" disabled={busy || !url.trim()} data-testid="queue-url-add">
            {busy ? <Loader className="animate-spin" /> : null} Add
          </Button>
        </div>
        <FieldError>{urlError}</FieldError>
        {urlError && (
          <button
            type="button"
            className="mt-1 text-[12px] font-medium text-lamp hover:underline"
            onClick={() => {
              void c.sendChat(url);
              useRoom.setState({ panel: "chat", watchOpen: false });
              setUrl("");
            }}
          >
            Send it in chat instead, so you can both open it
          </button>
        )}
      </form>
    </div>
  );
}
