import { describe, expect, it } from "vitest";
import { parseYouTubeId, parseYouTubeStart } from "@/lib/youtube";
import { createYouTubeService } from "@/server/youtube";
import { AppError } from "@/server/errors";

describe("parseYouTubeId", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PL1", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://music.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?si=abc", "dQw4w9WgXcQ"],
    ["youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/live/dQw4w9WgXcQ?feature=share", "dQw4w9WgXcQ"],
    ["dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("%s", (url, id) => expect(parseYouTubeId(url)).toBe(id));

  it.each(["https://example.com/watch?v=dQw4w9WgXcQ", "https://youtube.com/channel/UC123", "https://youtu.be/short", "not a url", "javascript:alert(1)"])(
    "rejects %s",
    (url) => expect(parseYouTubeId(url)).toBeNull(),
  );

  it("reads start offsets", () => {
    expect(parseYouTubeStart("https://youtu.be/dQw4w9WgXcQ?t=90")).toBe(90);
    expect(parseYouTubeStart("https://youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s")).toBe(90);
    expect(parseYouTubeStart("https://youtube.com/watch?v=dQw4w9WgXcQ")).toBe(0);
  });
});

describe("YouTube service", () => {
  const fake = (status: number, body: unknown = {}) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  it("returns title/channel/thumbnail for embeddable videos", async () => {
    const s = createYouTubeService(undefined, fake(200, { title: "A film", author_name: "Chan" }));
    expect(await s.lookup("dQw4w9WgXcQ")).toEqual({ id: "dQw4w9WgXcQ", title: "A film", channel: "Chan", thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" });
    expect(s.search).toBeNull();
  });
  it("explains non-embeddable and missing videos", async () => {
    await expect(createYouTubeService(undefined, fake(401)).lookup("dQw4w9WgXcQ")).rejects.toThrow(/doesn’t allow/);
    await expect(createYouTubeService(undefined, fake(404)).lookup("dQw4w9WgXcQ")).rejects.toBeInstanceOf(AppError);
  });
});

describe("YouTube browse", () => {
  it("parses ISO 8601 durations", async () => {
    const { parseIsoDuration } = await import("@/server/youtube");
    expect(parseIsoDuration("PT1H2M3S")).toBe(3723);
    expect(parseIsoDuration("PT45S")).toBe(45);
    expect(parseIsoDuration("P1DT1M")).toBe(86460);
    expect(parseIsoDuration(undefined)).toBeNull();
  });

  it("trending maps details, drops non-embeddable videos, and caches", async () => {
    let calls = 0;
    const f = (async (url: string) => {
      calls++;
      expect(String(url)).toContain("chart=mostPopular");
      expect(String(url)).toContain("videoCategoryId=10");
      expect(String(url)).toContain("regionCode=IN");
      return new Response(
        JSON.stringify({
          items: [
            { id: "aaaaaaaaaaa", snippet: { title: "Song", channelTitle: "Artist", publishedAt: "2026-11-01T00:00:00Z" }, contentDetails: { duration: "PT3M30S" }, statistics: { viewCount: "1200" }, status: { embeddable: true } },
            { id: "bbbbbbbbbbb", snippet: { title: "Blocked" }, status: { embeddable: false } },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const s = createYouTubeService("k", f);
    const r = await s.trending!("music");
    expect(r).toEqual([
      { id: "aaaaaaaaaaa", title: "Song", channel: "Artist", thumbnailUrl: "https://i.ytimg.com/vi/aaaaaaaaaaa/hqdefault.jpg", durationSec: 210, views: 1200, publishedAt: "2026-11-01T00:00:00Z" },
    ]);
    await s.trending!("music");
    expect(calls).toBe(1);
  });

  it("search enriches results with durations and views", async () => {
    const f = (async (url: string) => {
      if (String(url).includes("/search?")) return new Response(JSON.stringify({ items: [{ id: { videoId: "ccccccccccc" } }] }), { status: 200 });
      return new Response(JSON.stringify({ items: [{ id: "ccccccccccc", snippet: { title: "Found" }, contentDetails: { duration: "PT10M" }, statistics: { viewCount: "5" } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await createYouTubeService("k", f).search!("x");
    expect(r[0]).toMatchObject({ id: "ccccccccccc", title: "Found", durationSec: 600, views: 5 });
  });

  it("reports quota exhaustion clearly", async () => {
    const f = (async () => new Response("{}", { status: 403 })) as unknown as typeof fetch;
    await expect(createYouTubeService("k", f).trending!("trending")).rejects.toThrow(/daily limit/);
  });
});
