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
  it("search maps results when a key is configured", async () => {
    const s = createYouTubeService("k", fake(200, { items: [{ id: { videoId: "dQw4w9WgXcQ" }, snippet: { title: "Tom &amp; Jerry", channelTitle: "C" } }, { id: {} }] }));
    expect(await s.search!("tom")).toEqual([{ id: "dQw4w9WgXcQ", title: "Tom & Jerry", channel: "C", thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" }]);
  });
});
