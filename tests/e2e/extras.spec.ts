import { expect, test } from "@playwright/test";
import { closeEveryone, loadFilmForBoth, pair, videoState } from "./helpers";

test.describe("together extras", () => {
  test.afterEach(closeEveryone);

  test("a nudge shows hearts and a message on the partner's screen", async ({ browser }) => {
    const { host, guest } = await pair(browser);
    await host.page.getByTestId("ctl-react").click();
    await host.page.getByTestId("nudge").click();
    await expect(guest.page.getByText("Maya is thinking of you")).toBeVisible();
  });

  test("the sleep timer is shared, counts down for both, and can be cancelled by either", async ({ browser }) => {
    const { host, guest } = await pair(browser);
    await host.page.getByTestId("ctl-more").click();
    await host.page.getByTestId("sleep-30").click();
    await host.page.keyboard.press("Escape");
    for (const p of [host.page, guest.page]) await expect(p.getByTestId("sleep-chip")).toContainText(/^(29|30):\d\d$/);
    await expect(guest.page.getByText("Maya set a sleep timer")).toBeVisible();

    await guest.page.getByTestId("ctl-more").click();
    await guest.page.getByTestId("sleep-off").click();
    for (const p of [host.page, guest.page]) await expect(p.getByTestId("sleep-chip")).toHaveCount(0);
  });

  test("the film dips while someone talks, the room glows with the film, and both can be switched off", async ({ browser }) => {
    const { host, guest } = await pair(browser);
    await loadFilmForBoth(host.page, guest.page);
    // The fake mics beep constantly (that counts as talking): mute them so this test drives "talking" itself.
    for (const p of [host.page, guest.page]) await p.getByTestId("ctl-mic").click();
    await expect(host.page.getByTestId("ctl-mic")).toHaveAccessibleName("Unmute");
    await host.page.waitForTimeout(1500);
    const store = (p: typeof host.page, talking: boolean) =>
      p.evaluate((t) => (window as unknown as { __cbStore: { setState(s: object): void } }).__cbStore.setState({ talking: t }), talking);

    await store(host.page, false);
    await expect.poll(async () => (await videoState(host.page)).volume).toBeCloseTo(0.8, 1);
    await store(host.page, true);
    await expect.poll(async () => (await videoState(host.page)).volume).toBeLessThan(0.35);
    await store(host.page, false);
    await expect.poll(async () => (await videoState(host.page)).volume).toBeCloseTo(0.8, 1);

    // Ambient light glows around the film while it's on screen…
    await expect(host.page.getByTestId("ambient-light")).toBeVisible();

    // Switched off: talking leaves the film alone.
    await host.page.getByTestId("ctl-more").click();
    await host.page.getByTestId("auto-duck").click();
    // …and its switch turns it off.
    await host.page.getByTestId("ambient-toggle").click();
    await expect(host.page.getByTestId("ambient-light")).toHaveCount(0);
    await host.page.keyboard.press("Escape");
    await store(host.page, true);
    await host.page.waitForTimeout(600);
    expect((await videoState(host.page)).volume).toBeCloseTo(0.8, 1);
  });

  test("can be installed as an app", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.ok()).toBe(true);
    const m = await res.json();
    expect(m).toMatchObject({ short_name: "Closeby", display: "standalone", start_url: "/" });
    expect(m.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    for (const i of m.icons) expect((await request.get(i.src)).ok()).toBe(true);
  });

  test("chat: typing shows for the partner, and messages float over the call while chat is closed", async ({ browser }) => {
    const { host, guest } = await pair(browser);
    await host.page.getByTestId("ctl-chat").click();
    await guest.page.getByTestId("ctl-chat").click();
    await guest.page.getByTestId("chat-input").pressSequentially("hel");
    await expect(host.page.getByTestId("typing")).toContainText("Sam is typing");
    await guest.page.getByTestId("chat-input").press("Enter");
    await expect(host.page.getByTestId("typing")).toHaveCount(0);

    // Host closes chat; the next message floats up over the call and opens chat when tapped.
    await host.page.getByRole("button", { name: "Close panel" }).click();
    await guest.page.getByTestId("chat-input").fill("look at this scene!");
    await guest.page.getByTestId("chat-input").press("Enter");
    await expect(host.page.getByTestId("chat-bubble")).toContainText("look at this scene!");
    await host.page.getByTestId("chat-bubble").click();
    await expect(host.page.getByTestId("chat-list")).toContainText("look at this scene!");
  });

  test("3-2-1 countdown shows on both screens, then playback starts for both", async ({ browser }) => {
    const { host, guest } = await pair(browser);
    await loadFilmForBoth(host.page, guest.page);
    await host.page.locator("[data-testid=player]").hover();
    await host.page.getByTestId("countdown-button").click();
    for (const p of [host.page, guest.page]) await expect(p.getByTestId("countdown")).toBeVisible();
    // Still paused during the countdown…
    expect((await videoState(guest.page)).paused).toBe(true);
    // …then both play.
    for (const p of [host.page, guest.page]) await expect.poll(async () => (await videoState(p)).paused, { timeout: 8000 }).toBe(false);
    for (const p of [host.page, guest.page]) await expect(p.getByTestId("countdown")).toHaveCount(0);
  });

  test("photo booth: one snap gives both people the keepsake photo", async ({ browser }) => {
    const { host, guest } = await pair(browser);
    await host.page.getByTestId("ctl-react").click();
    await host.page.getByTestId("snap").click();
    for (const p of [host.page, guest.page]) {
      await expect(p.getByTestId("snap-preview")).toBeVisible();
      await expect.poll(() => p.getByTestId("snap-image").evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(1600);
      await expect(p.getByTestId("snap-save")).toHaveAttribute("download", /closeby-movie-night-\d{4}-\d{2}-\d{2}\.png/);
    }
  });

  test("? shows the keyboard shortcuts", async ({ browser }) => {
    const { host } = await pair(browser);
    await host.page.locator("body").press("?");
    await expect(host.page.getByTestId("shortcuts")).toContainText("Play / pause for both");
  });
});
