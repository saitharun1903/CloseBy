import { youtubeThumb } from "@/lib/youtube";
import { AppError } from "./errors";

export interface YouTubeVideoInfo {
  id: string;
  title: string;
  channel: string | null;
  thumbnailUrl: string;
}

export interface YouTubeService {
  /** Validates the video exists and allows embedding (oEmbed 401/404 otherwise). */
  lookup(id: string): Promise<YouTubeVideoInfo>;
  /** null when search isn't configured (no YOUTUBE_API_KEY). */
  search: ((q: string) => Promise<YouTubeVideoInfo[]>) | null;
}

type Fetch = typeof fetch;

export function createYouTubeService(apiKey: string | undefined, f: Fetch = fetch, oembedEndpoint = "https://www.youtube.com/oembed"): YouTubeService {
  return {
    async lookup(id) {
      const url = `${oembedEndpoint}?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`;
      let res: Response;
      try {
        res = await f(url, { signal: AbortSignal.timeout(6000) });
      } catch {
        throw new AppError("media_unavailable", "Couldn’t reach YouTube. Try again in a moment.");
      }
      if (res.status === 401 || res.status === 403)
        throw new AppError("bad_request", "This video’s owner doesn’t allow it to be played outside YouTube.");
      if (res.status === 404 || res.status === 400) throw new AppError("bad_request", "That YouTube video doesn’t exist or is private.");
      if (!res.ok) throw new AppError("media_unavailable", "YouTube didn’t answer. Try again in a moment.");
      const j = (await res.json()) as { title?: string; author_name?: string };
      return { id, title: (j.title ?? "YouTube video").slice(0, 120), channel: j.author_name?.slice(0, 80) ?? null, thumbnailUrl: youtubeThumb(id) };
    },
    search: apiKey
      ? async (q) => {
          const params = new URLSearchParams({
            part: "snippet",
            type: "video",
            videoEmbeddable: "true",
            safeSearch: "moderate",
            maxResults: "12",
            q,
            key: apiKey,
          });
          let res: Response;
          try {
            res = await f(`https://www.googleapis.com/youtube/v3/search?${params}`, { signal: AbortSignal.timeout(6000) });
          } catch {
            throw new AppError("media_unavailable", "Couldn’t reach YouTube search.");
          }
          if (res.status === 403) throw new AppError("media_unavailable", "YouTube search is unavailable right now (daily limit reached). Paste a link instead.");
          if (!res.ok) throw new AppError("media_unavailable", "YouTube search failed. Paste a link instead.");
          const j = (await res.json()) as { items?: { id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string } }[] };
          return (j.items ?? [])
            .filter((i) => i.id?.videoId)
            .map((i) => ({
              id: i.id!.videoId!,
              title: decodeEntities(i.snippet?.title ?? "Untitled").slice(0, 120),
              channel: i.snippet?.channelTitle ? decodeEntities(i.snippet.channelTitle) : null,
              thumbnailUrl: youtubeThumb(i.id!.videoId!),
            }));
        }
      : null,
  };
}

function decodeEntities(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
