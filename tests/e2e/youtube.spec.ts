import { expect, test, type Page } from "@playwright/test";
import { closeEveryone, drift, fakeYouTube, openWatch, pair, videoState } from "./helpers";

/**
 * YouTube watching. The YouTube IFrame API is replaced by a local stand-in
 * with the same interface (see fake-youtube.js), so this exercises our
 * integration — adding links, sync, user-action detection, policy-compliant
 * layout — but not YouTube itself. Real YouTube is in the manual test plan.
 */
async function bothInSync(a: Page, b: Page, tol: number) {
  const [x, y] = await Promise.all([drift(a), drift(b)]);
  return Math.abs(x.drift) < tol && Math.abs(y.drift) < tol;
}

test.describe("YouTube together", () => {
  test.afterEach(closeEveryone);

  test("paste a link, both load it, and it plays in sync for both", async ({ browser }) => {
    const { host, guest } = await pair(browser);
    for (const p of [host.page, guest.page]) await fakeYouTube(p);

    await openWatch(host.page, "youtube");
    await host.page.getByTestId("yt-input").fill("https://youtu.be/dQw4w9WgXcQ");
    await host.page.getByTestId("yt-input").press("Enter");
    await expect(host.page.getByTestId("watch-picker")).toBeHidden();

    for (const p of [host.page, guest.page]) {
      await expect(p.locator("[data-player=youtube] [data-fake-youtube=dQw4w9WgXcQ]")).toBeAttached({ timeout: 15_000 });
      await expect.poll(async () => (await videoState(p)).ready).toBeGreaterThanOrEqual(1);
    }
    // YouTube forbids overlays on its player: cameras move to a rail, no floating tiles.
    await expect(host.page.getByRole("complementary", { name: "Cameras" })).toBeVisible();
    await expect(host.page.getByTestId("floating-tiles")).toHaveCount(0);
    await expect(host.page.getByTestId("ctl-more")).toBeVisible();

    await host.page.getByTestId("play-toggle").click();
    await expect.poll(async () => (await videoState(guest.page)).paused).toBe(false);
    await expect.poll(() => bothInSync(host.page, guest.page, 0.75), { timeout: 10_000 }).toBe(true);

    // Clicking the video itself (YouTube's own UI) is detected and shared.
    await guest.page.locator("[data-fake-youtube]").evaluate((v: HTMLVideoElement) => v.pause());
    await expect.poll(async () => (await videoState(host.page)).paused, { timeout: 8000 }).toBe(true);

    // Our seek control, below the player, seeks both.
    await host.page.locator("body").press("ArrowRight");
    await expect.poll(async () => (await videoState(guest.page)).t, { timeout: 8000 }).toBeGreaterThan(9);
  });

  test("drift on YouTube is corrected by seeking (it has no fine-grained speed control)", async ({ browser }) => {
    const { host, guest } = await pair(browser);
    for (const p of [host.page, guest.page]) await fakeYouTube(p);
    await openWatch(host.page, "youtube");
    await host.page.getByTestId("yt-input").fill("dQw4w9WgXcQ");
    await host.page.getByTestId("yt-input").press("Enter");
    for (const p of [host.page, guest.page]) await expect.poll(async () => (await videoState(p)).ready, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
    await host.page.getByTestId("play-toggle").click();
    await expect.poll(async () => (await videoState(guest.page)).paused).toBe(false);
    await guest.page.waitForTimeout(1500);
    await guest.page.locator("[data-fake-youtube]").evaluate((v: HTMLVideoElement) => (v.currentTime += 4));
    await expect.poll(() => bothInSync(host.page, guest.page, 0.75), { timeout: 10_000 }).toBe(true);
  });

  test("the YouTube home: browse categories, search, and play for both", async ({ browser }) => {
    const { host, guest } = await pair(browser);
    for (const p of [host.page, guest.page]) await fakeYouTube(p);

    await host.page.getByTestId("ctl-youtube").click();
    const hub = host.page.getByTestId("youtube-hub");
    // The top video is featured; the rest of the shelf is in the grid below.
    await expect(hub.getByTestId("yt-hero")).toContainText("Top video (all)");
    await expect(hub.getByTestId("yt-hero")).toContainText("123.5K views");
    await expect(hub.getByTestId("yt-results")).toContainText("Second video (all)");
    await expect(hub.getByTestId("yt-results")).toContainText("2:00");

    await hub.getByTestId("yt-cat-music").click();
    await expect(hub.getByTestId("yt-hero")).toContainText("Top video (10)");

    await hub.getByTestId("yt-input").fill("lofi");
    await hub.getByTestId("yt-input").press("Enter");
    await expect(hub.getByTestId("yt-results")).toContainText("Result for search");

    await hub.getByRole("button", { name: /^Play Result for search for both of you$/ }).click();
    await expect(hub).toBeHidden();
    for (const p of [host.page, guest.page]) await expect(p.locator("[data-fake-youtube=srchsrch001]")).toBeAttached({ timeout: 15_000 });
    // The partner is told what started.
    await expect(guest.page.getByText("Maya started something")).toBeVisible();
  });

  test("videos that can't be embedded are refused with a reason", async ({ browser }) => {
    const { host } = await pair(browser);
    await fakeYouTube(host.page);
    await openWatch(host.page, "youtube");
    await host.page.getByTestId("yt-input").fill("https://www.youtube.com/watch?v=NoEmbed0000");
    await host.page.getByTestId("yt-input").press("Enter");
    await expect(host.page.getByText(/doesn’t allow it to be played outside YouTube/)).toBeVisible();
  });

  test("the shared browser explains when it isn't switched on", async ({ browser }) => {
    const { host } = await pair(browser);
    await openWatch(host.page, "browser");
    await expect(host.page.getByText("The shared browser isn’t switched on yet")).toBeVisible();
  });

  test("YouTube home: a featured pick, whole playlists, and Watch again", async ({ browser }) => {
    const { host, guest } = await pair(browser);
    for (const p of [host.page, guest.page]) await fakeYouTube(p);

    // The top trending video is featured big; playing it plays for both.
    await host.page.getByTestId("ctl-youtube").click();
    await expect(host.page.getByTestId("yt-hero")).toContainText("Top video (all)");
    await host.page.getByTestId("yt-hero-play").click();
    await expect(host.page.getByTestId("youtube-hub")).toBeHidden();
    for (const p of [host.page, guest.page]) await expect(p.locator("[data-fake-youtube=trend000001]")).toBeAttached({ timeout: 15_000 });

    // A playlist link adds every video to Up next, in order.
    await host.page.getByTestId("ctl-youtube").click();
    await host.page.getByTestId("yt-input").fill("https://www.youtube.com/playlist?list=PLroadtrip01");
    await expect(host.page.getByRole("button", { name: /Add playlist/ })).toBeVisible();
    await host.page.getByTestId("yt-input").press("Enter");
    await expect(host.page.getByText("3 videos added to Up next")).toBeVisible();
    const queue = await host.page.evaluate(() =>
      (window as unknown as { __cbStore: { getState(): { queue: { externalId: string | null }[] } } }).__cbStore.getState().queue.map((q) => q.externalId),
    );
    expect(queue).toEqual(["trend000001", "plist000001", "plist000002", "plist000003"]);

    // What you played shows up under Watch again (with the title YouTube reports for it).
    await expect(host.page.getByTestId("yt-history")).toContainText("Test YouTube Video");
  });

  test("chapters jump for both, and subtitles are each person's own choice", async ({ browser }) => {
    const { host, guest } = await pair(browser);
    for (const p of [host.page, guest.page]) await fakeYouTube(p);
    await openWatch(host.page, "youtube");
    await host.page.getByTestId("yt-input").fill("https://youtu.be/chap0000001");
    await host.page.getByTestId("yt-input").press("Enter");
    for (const p of [host.page, guest.page]) await expect.poll(async () => (await videoState(p)).ready, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);

    // Chapter markers on the seek bar, and the current chapter next to the time.
    await expect(host.page.getByTestId("chapter-marks").locator("span")).toHaveCount(2);
    await expect(host.page.getByTestId("current-chapter")).toContainText("Intro");

    // Jumping to a chapter moves both players there.
    await host.page.getByTestId("chapters-button").click();
    await host.page.getByTestId("chapter-item").filter({ hasText: "Finale" }).click();
    for (const p of [host.page, guest.page]) await expect.poll(async () => (await videoState(p)).t, { timeout: 8000 }).toBeGreaterThan(79);
    await expect(host.page.getByTestId("current-chapter")).toContainText("Finale");

    // Subtitles: the guest's toggle doesn't touch the host's player.
    await guest.page.getByTestId("yt-captions").click();
    await expect(guest.page.locator("[data-fake-youtube]")).toHaveAttribute("data-captions", "on");
    await expect(host.page.locator("[data-fake-youtube]")).not.toHaveAttribute("data-captions", "on");
  });
});
