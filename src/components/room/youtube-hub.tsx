"use client";
import * as D from "@radix-ui/react-dialog";
import { Clapperboard, Cpu, Flame, Gamepad2, Globe, ListPlus, Loader, Music, Newspaper, Play, Search, Smile, Trophy, TvMinimalPlay, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/components/toaster";
import { Button } from "@/components/ui/button";
import { api, ApiRequestError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatTime } from "@/lib/playback";
import type { YouTubeResultDTO } from "@/lib/protocol";
import { parseYouTubeId } from "@/lib/youtube";
import { useController } from "./context";
import { useRoom } from "./store";

const CATEGORIES: { id: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "trending", label: "Trending", icon: Flame },
  { id: "music", label: "Music", icon: Music },
  { id: "movies", label: "Movies", icon: Clapperboard },
  { id: "entertainment", label: "Shows", icon: TvMinimalPlay },
  { id: "comedy", label: "Comedy", icon: Smile },
  { id: "gaming", label: "Gaming", icon: Gamepad2 },
  { id: "sports", label: "Sports", icon: Trophy },
  { id: "news", label: "News", icon: Newspaper },
  { id: "tech", label: "Tech", icon: Cpu },
];

function compact(n: number) {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [31536000, "year"],
    [2592000, "month"],
    [604800, "week"],
    [86400, "day"],
    [3600, "hour"],
    [60, "minute"],
  ];
  for (const [secs, unit] of units) if (s >= secs) return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(-Math.floor(s / secs), unit);
  return "just now";
}

/** Full-screen YouTube home: browse, search, and play for both. */
export function YouTubeHub() {
  const open = useRoom((s) => s.ytOpen);
  return (
    <D.Root open={open} onOpenChange={(o) => useRoom.setState({ ytOpen: o })}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md data-[state=open]:animate-fade-in" />
        <D.Content
          className="fixed inset-x-0 bottom-0 top-[max(var(--safe-top),12px)] z-50 flex flex-col overflow-hidden rounded-t-[28px] border hairline bg-ink-900 shadow-float data-[state=open]:animate-fade-in sm:inset-6 sm:rounded-[28px]"
          data-testid="youtube-hub"
          aria-describedby={undefined}
        >
          <D.Title className="sr-only">YouTube</D.Title>
          <YouTubeBrowse layout="full" onDone={() => useRoom.setState({ ytOpen: false })} />
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/**
 * Browse/search/paste UI. Used full-screen (YouTube home) and inside the
 * Watch together picker.
 */
export function YouTubeBrowse({ layout, onDone }: { layout: "full" | "embedded"; onDone: () => void }) {
  const c = useController();
  const enabled = useRoom((s) => s.features.youtubeSearch);
  const browserOn = useRoom((s) => s.features.sharedBrowser);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("trending");
  const [mode, setMode] = useState<"browse" | "search">("browse");
  const [results, setResults] = useState<YouTubeResultDTO[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const loadCategory = useCallback(
    async (cat: string) => {
      if (!enabled) return;
      const id = ++reqId.current;
      setLoading(true);
      setError(null);
      try {
        const r = await api<{ results: YouTubeResultDTO[] }>(`/api/rooms/${c.roomId}/youtube/trending?category=${cat}`);
        if (id === reqId.current) setResults(r.results);
      } catch (e) {
        if (id === reqId.current) setError((e as ApiRequestError).message);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [c.roomId, enabled],
  );

  useEffect(() => {
    if (mode === "browse") void loadCategory(category);
  }, [category, mode, loadCategory]);

  async function play(urlOrId: string, now: boolean) {
    setBusy(urlOrId + (now ? ":now" : ":next"));
    setError(null);
    try {
      const item = await c.addToQueue({ kind: "youtube", url: urlOrId });
      if (now || !useRoom.getState().playback.mediaId) {
        await c.sendIntent({ type: "load", mediaId: item.id });
        onDone();
      } else toast({ tone: "success", title: "Added to Up next", body: item.title });
    } catch (e) {
      setError((e as ApiRequestError).message);
    } finally {
      setBusy(null);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = q.trim();
    if (!text) return;
    if (parseYouTubeId(text)) return play(text, true);
    if (!enabled) return setError("Paste a link from YouTube (Share → Copy link). Search isn’t switched on for this site yet.");
    const id = ++reqId.current;
    setMode("search");
    setLoading(true);
    setError(null);
    try {
      const r = await api<{ results: YouTubeResultDTO[] }>(`/api/rooms/${c.roomId}/youtube/search?q=${encodeURIComponent(text)}`);
      if (id === reqId.current) {
        setResults(r.results);
        if (!r.results.length) setError(`No videos found for “${text}”.`);
      }
    } catch (err) {
      if (id === reqId.current) setError((err as ApiRequestError).message);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }

  async function openRealYouTube() {
    setBusy("browser");
    try {
      await c.startBrowser("https://www.youtube.com");
      onDone();
    } catch (e) {
      setError((e as ApiRequestError).message);
    } finally {
      setBusy(null);
    }
  }

  const full = layout === "full";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header: brand + search */}
      <div className={cn("flex shrink-0 items-center gap-3", full ? "px-4 pb-3 pt-4 sm:px-6 sm:pt-5" : "pb-3")}>
        {full && (
          <span className="hidden items-center gap-2 sm:flex">
            <span className="grid h-7 w-10 place-items-center rounded-lg bg-[#ff0033]">
              <Play className="size-3.5 fill-white text-white" />
            </span>
            <span className="text-[18px] font-semibold tracking-[-0.03em]">YouTube</span>
          </span>
        )}
        <form onSubmit={submit} className="relative min-w-0 flex-1 sm:mx-auto sm:max-w-[640px]">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-paper-faint" />
          <input
            autoFocus={full}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setError(null);
              if (!e.target.value) setMode("browse");
            }}
            placeholder={enabled ? "Search YouTube or paste a link" : "Paste a YouTube link"}
            aria-label={enabled ? "Search YouTube or paste a link" : "YouTube link"}
            className="h-11 w-full rounded-full bg-white/[0.08] pl-11 pr-24 text-[15px] outline-none placeholder:text-paper-faint focus:bg-white/[0.11] focus:shadow-[0_0_0_4px_rgb(255_179_107/0.2)]"
            data-testid="yt-input"
          />
          <Button type="submit" size="sm" variant="primary" className="absolute right-1 top-1/2 h-9 -translate-y-1/2" disabled={!q.trim() || !!busy}>
            {parseYouTubeId(q) ? "Play" : enabled ? "Search" : "Play"}
          </Button>
        </form>
        {full && (
          <D.Close className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 text-paper-dim hover:bg-white/15 hover:text-paper" aria-label="Close YouTube">
            <X className="size-5" />
          </D.Close>
        )}
      </div>

      {/* Category chips */}
      {enabled && (
        <div className={cn("flex shrink-0 gap-2 overflow-x-auto pb-3 scrollbar-quiet", full && "px-4 sm:px-6")} role="tablist" aria-label="Categories">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              role="tab"
              aria-selected={mode === "browse" && category === cat.id}
              onClick={() => {
                setMode("browse");
                setQ("");
                setCategory(cat.id);
              }}
              className={cn(
                "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-colors",
                mode === "browse" && category === cat.id ? "bg-white text-black" : "bg-white/[0.08] text-paper hover:bg-white/[0.14]",
              )}
              data-testid={`yt-cat-${cat.id}`}
            >
              <cat.icon className="size-4" />
              {cat.label}
            </button>
          ))}
          {browserOn && (
            <button
              onClick={() => void openRealYouTube()}
              className="ml-auto flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-lamp/15 px-3.5 text-[13px] font-semibold text-lamp-bright hover:bg-lamp/25"
              data-testid="yt-real"
            >
              {busy === "browser" ? <Loader className="size-4 animate-spin" /> : <Globe className="size-4" />} Open real YouTube together
            </button>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className={cn("pb-2 text-[13px] text-[#ffb4ae]", full && "px-4 sm:px-6")}>
          {error}
        </p>
      )}

      {/* Results */}
      <div className={cn("min-h-0 flex-1 overflow-y-auto scrollbar-quiet", full ? "px-4 pb-6 sm:px-6" : "pb-2")}>
        {!enabled ? (
          <NotEnabled browserOn={browserOn} busy={busy === "browser"} onRealYouTube={() => void openRealYouTube()} />
        ) : loading && !results ? (
          <Grid full={full}>
            {Array.from({ length: full ? 12 : 4 }, (_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-video rounded-2xl bg-white/[0.06]" />
                <div className="mt-3 h-3.5 w-4/5 rounded bg-white/[0.06]" />
                <div className="mt-2 h-3 w-1/2 rounded bg-white/[0.05]" />
              </div>
            ))}
          </Grid>
        ) : (
          <Grid full={full} dim={loading}>
            {(results ?? []).map((r) => (
              <VideoCard key={r.id} r={r} busy={busy} onPlay={() => void play(r.id, true)} onQueue={() => void play(r.id, false)} />
            ))}
          </Grid>
        )}
      </div>
    </div>
  );
}

function Grid({ full, dim, children }: { full: boolean; dim?: boolean; children: React.ReactNode }) {
  return (
    <ul className={cn("grid gap-x-4 gap-y-6 transition-opacity", full ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" : "grid-cols-1 sm:grid-cols-2", dim && "opacity-50")} data-testid="yt-results">
      {children}
    </ul>
  );
}

function VideoCard({ r, busy, onPlay, onQueue }: { r: YouTubeResultDTO; busy: string | null; onPlay: () => void; onQueue: () => void }) {
  const meta = [r.channel, r.views != null ? `${compact(r.views)} views` : null, r.publishedAt ? ago(r.publishedAt) : null].filter(Boolean).join(" · ");
  return (
    <li className="group">
      <button onClick={onPlay} className="relative block aspect-video w-full overflow-hidden rounded-2xl bg-ink-800 text-left" aria-label={`Play ${r.title} for both of you`} disabled={!!busy}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={r.thumbnailUrl} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = "hidden")} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        {r.durationSec ? <span className="absolute bottom-2 right-2 rounded-md bg-black/80 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white">{formatTime(r.durationSec)}</span> : null}
        <span className="absolute inset-0 grid place-items-center bg-black/0 opacity-0 transition-all group-hover:bg-black/35 group-hover:opacity-100">
          <span className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-black">
            {busy === r.id + ":now" ? <Loader className="size-4 animate-spin" /> : <Play className="size-4 fill-current" />} Play for both
          </span>
        </span>
      </button>
      <div className="mt-3 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[14px] font-semibold leading-snug text-paper">{r.title}</p>
          {meta && <p className="mt-1 truncate text-[12px] text-paper-faint">{meta}</p>}
        </div>
        <button onClick={onQueue} disabled={!!busy} aria-label={`Add ${r.title} to Up next`} title="Add to Up next" className="grid size-8 shrink-0 place-items-center rounded-full text-paper-dim hover:bg-white/10 hover:text-paper">
          {busy === r.id + ":next" ? <Loader className="size-4 animate-spin" /> : <ListPlus className="size-4" />}
        </button>
      </div>
    </li>
  );
}

function NotEnabled({ browserOn, busy, onRealYouTube }: { browserOn: boolean; busy: boolean; onRealYouTube: () => void }) {
  return (
    <div className="mx-auto max-w-[460px] pt-8 text-center">
      <div className="mx-auto grid h-12 w-16 place-items-center rounded-2xl bg-[#ff0033]">
        <Play className="size-6 fill-white text-white" />
      </div>
      <p className="mt-5 text-[17px] font-semibold">Watch any YouTube video together</p>
      <p className="mt-1.5 text-[14px] leading-relaxed text-paper-dim">
        Copy a link in YouTube (Share → Copy link) and paste it above — it plays in sync for both of you, and either of you can pause or skip.
      </p>
      {browserOn && (
        <div className="mt-6 rounded-2xl bg-white/[0.05] p-4 ring-1 ring-white/[0.07]">
          <p className="text-[14px] font-semibold">Want to browse YouTube itself?</p>
          <p className="mt-1 text-[13px] text-paper-dim">Open the real youtube.com in the shared browser — search, Shorts, your playlists — and both of you can click around.</p>
          <Button variant="primary" size="sm" className="mt-3" onClick={onRealYouTube} disabled={busy} data-testid="yt-real">
            {busy ? <Loader className="animate-spin" /> : <Globe />} Open real YouTube together
          </Button>
        </div>
      )}
    </div>
  );
}
