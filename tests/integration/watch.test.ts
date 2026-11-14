import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AppError } from "@/server/errors";
import type { BrowserProvider } from "@/server/hyperbeam";
import { addQueueItem, addYouTubePlaylist, youtubeChapters, createRoom, endRoom, getBrowser, getRoomState, joinRoom, searchYouTube, startBrowser, youtubeTrending, stopBrowser, submitPlaybackIntent } from "@/server/rooms";
import type { YouTubeService } from "@/server/youtube";
import { makeDb, makeDeps, truncate } from "./helpers";

const { db, client } = makeDb();
afterAll(() => client.end());
beforeEach(() => truncate(db));

class FakeBrowser implements BrowserProvider {
  started: { roomId: string; startUrl: string }[] = [];
  stopped: string[] = [];
  async start({ roomId, startUrl }: { roomId: string; startUrl: string }) {
    this.started.push({ roomId, startUrl });
    return { sessionId: `sess-${this.started.length}`, embedUrl: `https://abc${this.started.length}.hyperbeam.com/x?token=secret${this.started.length}` };
  }
  async stop(id: string) {
    this.stopped.push(id);
  }
}

const fakeYouTube: YouTubeService = {
  async lookup(id) {
    if (id === "NoEmbed0000") throw new AppError("bad_request", "This video’s owner doesn’t allow it to be played outside YouTube.");
    return { id, title: `Video ${id}`, channel: "Chan", thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` };
  },
  search: async (q) => [{ id: "dQw4w9WgXcQ", title: `Result for ${q}`, channel: null, thumbnailUrl: "t" }],
  trending: async (c) => [{ id: "dQw4w9WgXcQ", title: `Top in ${c}`, channel: null, thumbnailUrl: "t" }],
  playlist: async (listId) => ({
    title: `List ${listId}`,
    videos: ["aaaaaaaaaa1", "aaaaaaaaaa2", "aaaaaaaaaa3"].map((id) => ({ id, title: `Video ${id}`, channel: "Chan", thumbnailUrl: "t", durationSec: 60 })),
  }),
  chapters: async () => [
    { start: 0, title: "Intro" },
    { start: 30, title: "Middle" },
    { start: 50, title: "End" },
  ],
};

async function setup() {
  const browser = new FakeBrowser();
  const d = { ...makeDeps(db), youtube: fakeYouTube, browser };
  const r = await createRoom(d, { displayName: "Maya" });
  const g = await joinRoom(d, r.roomId, { inviteToken: r.inviteToken, displayName: "Sam" });
  return { d, r, g, browser };
}

describe("YouTube in the watchlist", () => {
  it("adds a pasted YouTube link with title and thumbnail", async () => {
    const { d, r } = await setup();
    const { item } = await addQueueItem(d, r.claims, r.roomId, { kind: "youtube", url: "https://youtu.be/dQw4w9WgXcQ?t=10" });
    expect(item).toMatchObject({ kind: "youtube", externalId: "dQw4w9WgXcQ", title: "Video dQw4w9WgXcQ", thumbnailUrl: expect.stringContaining("ytimg") });
  });
  it("rejects non-YouTube links and non-embeddable videos", async () => {
    const { d, r } = await setup();
    await expect(addQueueItem(d, r.claims, r.roomId, { kind: "youtube", url: "https://vimeo.com/123" })).rejects.toThrow(/doesn’t look like/);
    await expect(addQueueItem(d, r.claims, r.roomId, { kind: "youtube", url: "https://youtu.be/NoEmbed0000" })).rejects.toThrow(/doesn’t allow/);
  });
  it("search is member-only and reports when disabled", async () => {
    const { d, r } = await setup();
    expect((await searchYouTube(d, r.claims, r.roomId, "cats")).results[0]!.title).toBe("Result for cats");
    await expect(searchYouTube(d, null, r.roomId, "cats")).rejects.toThrow();
    await expect(searchYouTube({ ...d, youtube: { ...fakeYouTube, search: null } }, r.claims, r.roomId, "cats")).rejects.toThrow(/isn’t enabled/);
  });
  it("trending is member-only", async () => {
    const { d, r } = await setup();
    expect((await youtubeTrending(d, r.claims, r.roomId, "music")).results[0]!.title).toBe("Top in music");
    await expect(youtubeTrending(d, null, r.roomId, "music")).rejects.toThrow();
  });
  it("adds a whole playlist to Up next in order, with durations", async () => {
    const { d, r } = await setup();
    await addQueueItem(d, r.claims, r.roomId, { kind: "youtube", url: "https://youtu.be/dQw4w9WgXcQ" });
    const res = await addYouTubePlaylist(d, r.claims, r.roomId, "https://www.youtube.com/playlist?list=PLabcdefghij");
    expect(res.playlistTitle).toBe("List PLabcdefghij");
    expect(res.added.map((i) => i.externalId)).toEqual(["aaaaaaaaaa1", "aaaaaaaaaa2", "aaaaaaaaaa3"]);
    expect(res.added[0]!.durationSec).toBe(60);
    // Appended after what was already queued, in playlist order.
    expect(res.items.map((i) => i.externalId)).toEqual(["dQw4w9WgXcQ", "aaaaaaaaaa1", "aaaaaaaaaa2", "aaaaaaaaaa3"]);
  });
  it("refuses non-playlist links, strangers, and works only with search switched on", async () => {
    const { d, r } = await setup();
    await expect(addYouTubePlaylist(d, r.claims, r.roomId, "https://youtu.be/dQw4w9WgXcQ")).rejects.toThrow(/playlist link/);
    await expect(addYouTubePlaylist(d, null, r.roomId, "https://www.youtube.com/playlist?list=PLabcdefghij")).rejects.toThrow();
    await expect(addYouTubePlaylist({ ...d, youtube: { ...fakeYouTube, playlist: null } }, r.claims, r.roomId, "https://www.youtube.com/playlist?list=PLabcdefghij")).rejects.toThrow(/switched on/);
  });
  it("serves chapters to members, and never fails playback over them", async () => {
    const { d, r } = await setup();
    expect((await youtubeChapters(d, r.claims, r.roomId, "dQw4w9WgXcQ")).chapters.map((c) => c.title)).toEqual(["Intro", "Middle", "End"]);
    await expect(youtubeChapters(d, null, r.roomId, "dQw4w9WgXcQ")).rejects.toThrow();
    const broken = { ...fakeYouTube, chapters: async () => Promise.reject(new Error("quota")) };
    expect((await youtubeChapters({ ...d, youtube: broken }, r.claims, r.roomId, "dQw4w9WgXcQ")).chapters).toEqual([]);
  });
});

describe("shared browser", () => {
  it("starts once per room; both members get the same embed; others get nothing", async () => {
    const { d, r, g, browser } = await setup();
    const a = await startBrowser(d, r.claims, r.roomId, "https://www.wikipedia.org");
    const b = await startBrowser(d, g.claims, r.roomId);
    expect(browser.started).toEqual([{ roomId: r.roomId, startUrl: "https://www.wikipedia.org" }]);
    expect(b.embedUrl).toBe(a.embedUrl);
    expect((await getBrowser(d, g.claims, r.roomId)).embedUrl).toBe(a.embedUrl);
    await expect(getBrowser(d, null, r.roomId)).rejects.toThrow();
    const state = await getRoomState(d, g.claims, r.roomId);
    expect(state.browser.active).toBe(true);
    expect(JSON.stringify(state)).not.toContain("token=secret"); // never in general room state
    expect(d.gateway.broadcasts.map((x) => JSON.stringify(x.msg)).join()).not.toContain("token=secret"); // never broadcast
  });

  it("starting the browser unloads the video; loading a video closes the browser", async () => {
    const { d, r, browser } = await setup();
    const { item } = await addQueueItem(d, r.claims, r.roomId, { kind: "youtube", url: "dQw4w9WgXcQ" });
    await submitPlaybackIntent(d, r.claims, r.roomId, { baseVersion: 0, intent: { type: "load", mediaId: item.id } });
    await startBrowser(d, r.claims, r.roomId);
    expect((await getRoomState(d, r.claims, r.roomId)).playback.mediaId).toBeNull();
    const pb = (await getRoomState(d, r.claims, r.roomId)).playback;
    await submitPlaybackIntent(d, r.claims, r.roomId, { baseVersion: pb.version, intent: { type: "load", mediaId: item.id } });
    expect(browser.stopped).toEqual(["sess-1"]);
    expect((await getRoomState(d, r.claims, r.roomId)).browser.active).toBe(false);
  });

  it("stops on request and when the room ends", async () => {
    const { d, r, browser } = await setup();
    await startBrowser(d, r.claims, r.roomId);
    await stopBrowser(d, r.claims, r.roomId);
    expect(browser.stopped).toEqual(["sess-1"]);
    await startBrowser(d, r.claims, r.roomId);
    await endRoom(d, r.claims, r.roomId);
    expect(browser.stopped).toEqual(["sess-1", "sess-2"]);
  });

  it("is reported as unavailable when not configured", async () => {
    const { d, r } = await setup();
    await expect(startBrowser({ ...d, browser: null }, r.claims, r.roomId)).rejects.toThrow(/isn’t enabled/);
    expect((await getRoomState({ ...d, browser: null }, r.claims, r.roomId)).features.sharedBrowser).toBe(false);
  });
});
