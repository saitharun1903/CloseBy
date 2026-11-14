import { parseChapters, youtubeThumb, type Chapter } from "@/lib/youtube";
import { AppError } from "./errors";

export interface YouTubeVideoInfo {
  id: string;
  title: string;
  channel: string | null;
  thumbnailUrl: string;
  durationSec?: number | null;
  views?: number | null;
  publishedAt?: string | null;
}

/** Category chips → YouTube's standard video category ids. */
export const YT_CATEGORIES: Record<string, string | null> = {
  trending: null,
  music: "10",
  movies: "1", // Film & Animation (trailers, shorts, clips)
  gaming: "20",
  comedy: "23",
  entertainment: "24",
  sports: "17",
  news: "25",
  tech: "28",
};

export interface YouTubeService {
  /** Validates the video exists and allows embedding (oEmbed 401/404 otherwise). */
  lookup(id: string): Promise<YouTubeVideoInfo>;
  /** null when not configured (no YOUTUBE_API_KEY). */
  search: ((q: string) => Promise<YouTubeVideoInfo[]>) | null;
  trending: ((category: string) => Promise<YouTubeVideoInfo[]>) | null;
  /** Up to 50 playable videos of a playlist, in order. */
  playlist: ((listId: string) => Promise<{ title: string | null; videos: YouTubeVideoInfo[] }>) | null;
  /** Chapters from the video's description ([] when it has none). */
  chapters: ((videoId: string) => Promise<Chapter[]>) | null;
}

type Fetch = typeof fetch;

/** ISO 8601 duration (PT1H2M3S) → seconds. */
export function parseIsoDuration(d: string | undefined): number | null {
  const m = d?.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  return Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
}

function decodeEntities(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

interface VideoResource {
  id?: string;
  snippet?: { title?: string; channelTitle?: string; publishedAt?: string; liveBroadcastContent?: string; description?: string };
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string };
  status?: { embeddable?: boolean };
}

function toInfo(v: VideoResource): YouTubeVideoInfo | null {
  if (!v.id) return null;
  if (v.status && v.status.embeddable === false) return null;
  return {
    id: v.id,
    title: decodeEntities(v.snippet?.title ?? "Untitled").slice(0, 120),
    channel: v.snippet?.channelTitle ? decodeEntities(v.snippet.channelTitle) : null,
    thumbnailUrl: youtubeThumb(v.id),
    durationSec: parseIsoDuration(v.contentDetails?.duration),
    views: v.statistics?.viewCount ? Number(v.statistics.viewCount) : null,
    publishedAt: v.snippet?.publishedAt ?? null,
  };
}

export function createYouTubeService(
  apiKey: string | undefined,
  f: Fetch = fetch,
  oembedEndpoint = "https://www.youtube.com/oembed",
  opts: { apiBase?: string; region?: string } = {},
): YouTubeService {
  const apiBase = opts.apiBase ?? "https://www.googleapis.com/youtube/v3";
  const region = opts.region ?? "IN";
  // Trending changes slowly; caching keeps quota use tiny (1 unit per refresh).
  const trendingCache = new Map<string, { at: number; items: YouTubeVideoInfo[] }>();
  const chapterCache = new Map<string, { at: number; chapters: Chapter[] }>();

  async function call(path: string, params: Record<string, string>) {
    let res: Response;
    try {
      res = await f(`${apiBase}/${path}?${new URLSearchParams({ ...params, key: apiKey! })}`, { signal: AbortSignal.timeout(8000) });
    } catch {
      throw new AppError("media_unavailable", "Couldn’t reach YouTube.");
    }
    if (res.status === 403) throw new AppError("media_unavailable", "YouTube’s daily limit for this site was reached. Paste a link instead — playback still works.");
    if (res.status === 404) return { items: [] };
    if (!res.ok) throw new AppError("media_unavailable", "YouTube didn’t answer. Try again in a moment.");
    return (await res.json()) as { items?: VideoResource[] & { id?: { videoId?: string } }[] };
  }

  async function details(ids: string[]) {
    if (!ids.length) return [];
    const j = await call("videos", { part: "snippet,contentDetails,statistics,status", id: ids.join(","), maxResults: "50" });
    const byId = new Map((j.items ?? []).map((v) => [v.id, v] as const));
    return ids.map((id) => byId.get(id)).map((v) => (v ? toInfo(v as VideoResource) : null)).filter((x): x is YouTubeVideoInfo => !!x);
  }

  return {
    async lookup(id) {
      const url = `${oembedEndpoint}?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`;
      let res: Response;
      try {
        res = await f(url, { signal: AbortSignal.timeout(6000) });
      } catch {
        throw new AppError("media_unavailable", "Couldn’t reach YouTube. Try again in a moment.");
      }
      if (res.status === 401 || res.status === 403) throw new AppError("bad_request", "This video’s owner doesn’t allow it to be played outside YouTube.");
      if (res.status === 404 || res.status === 400) throw new AppError("bad_request", "That YouTube video doesn’t exist or is private.");
      if (!res.ok) throw new AppError("media_unavailable", "YouTube didn’t answer. Try again in a moment.");
      const j = (await res.json()) as { title?: string; author_name?: string };
      return { id, title: (j.title ?? "YouTube video").slice(0, 120), channel: j.author_name?.slice(0, 80) ?? null, thumbnailUrl: youtubeThumb(id) };
    },
    search: apiKey
      ? async (q) => {
          // search.list costs 100 units; enriching with videos.list (1 unit) adds duration and views
          // and drops anything that can't be embedded.
          const j = (await call("search", { part: "snippet", type: "video", videoEmbeddable: "true", safeSearch: "moderate", maxResults: "24", regionCode: region, q })) as {
            items?: { id?: { videoId?: string } }[];
          };
          const ids = (j.items ?? []).map((i) => i.id?.videoId).filter((x): x is string => !!x);
          return details(ids);
        }
      : null,
    trending: apiKey
      ? async (category) => {
          const key = `${region}:${category}`;
          const hit = trendingCache.get(key);
          if (hit && Date.now() - hit.at < 15 * 60_000) return hit.items;
          const catId = YT_CATEGORIES[category];
          const j = await call("videos", {
            part: "snippet,contentDetails,statistics,status",
            chart: "mostPopular",
            regionCode: region,
            maxResults: "24",
            ...(catId ? { videoCategoryId: catId } : {}),
          });
          const items = (j.items ?? []).map((v) => toInfo(v as VideoResource)).filter((x): x is YouTubeVideoInfo => !!x);
          trendingCache.set(key, { at: Date.now(), items });
          return items;
        }
      : null,
    playlist: apiKey
      ? async (listId) => {
          // playlistItems.list (1 unit) + videos.list (1 unit) for durations and embeddability.
          const [items, meta] = await Promise.all([
            call("playlistItems", { part: "contentDetails", playlistId: listId, maxResults: "50" }) as Promise<{ items?: { contentDetails?: { videoId?: string } }[] }>,
            call("playlists", { part: "snippet", id: listId }) as Promise<{ items?: { snippet?: { title?: string } }[] }>,
          ]);
          const ids = [...new Set((items.items ?? []).map((i) => i.contentDetails?.videoId).filter((x): x is string => !!x))];
          if (!ids.length) throw new AppError("bad_request", "That playlist is empty, private, or can’t be read.");
          const title = meta.items?.[0]?.snippet?.title;
          return { title: title ? decodeEntities(title).slice(0, 120) : null, videos: await details(ids) };
        }
      : null,
    chapters: apiKey
      ? async (videoId) => {
          const hit = chapterCache.get(videoId);
          if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.chapters;
          const j = await call("videos", { part: "snippet,contentDetails", id: videoId });
          const v = (j.items ?? [])[0] as VideoResource | undefined;
          const chapters = parseChapters(v?.snippet?.description, parseIsoDuration(v?.contentDetails?.duration));
          if (chapterCache.size > 500) chapterCache.clear();
          chapterCache.set(videoId, { at: Date.now(), chapters });
          return chapters;
        }
      : null,
  };
}
