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

  test("draw together: my lines appear on my partner's screen", async ({ browser }) => {
    const { host, guest } = await pair(browser);
    await host.page.getByTestId("ctl-react").click();
    await host.page.getByTestId("draw-toggle").click();
    await expect(host.page.getByTestId("draw-hint")).toBeVisible();
    const box = (await host.page.getByTestId("draw-layer").boundingBox())!;
    await host.page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4);
    await host.page.mouse.down();
    for (let i = 1; i <= 12; i++) await host.page.mouse.move(box.x + box.width * (0.3 + i * 0.02), box.y + box.height * 0.4, { steps: 2 });
    await host.page.mouse.up();
    // Ink on the guest's canvas.
    await expect
      .poll(() =>
        guest.page.getByTestId("draw-layer").evaluate((c: HTMLCanvasElement) => {
          const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
          for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) return true;
          return false;
        }),
      )
      .toBe(true);
    await host.page.getByTestId("draw-stop").click();
    await expect(host.page.getByTestId("draw-hint")).toHaveCount(0);
  });

  test("ask each other: the same card on both screens; either can flip or close it", async ({ browser }) => {
    const { host, guest } = await pair(browser);
    await host.page.getByTestId("ctl-react").click();
    await host.page.getByTestId("ask").click();
    const first = await host.page.getByTestId("question-text").textContent();
    await expect(guest.page.getByTestId("question-text")).toHaveText(first!);
    await guest.page.getByTestId("question-next").click();
    await expect(guest.page.getByTestId("question-text")).not.toHaveText(first!);
    const second = await guest.page.getByTestId("question-text").textContent();
    await expect(host.page.getByTestId("question-text")).toHaveText(second!);
    await host.page.getByTestId("question-close").click();
    for (const p of [host.page, guest.page]) await expect(p.getByTestId("question-card")).toHaveCount(0);
  });

  test("reactions during a film become moments on both timelines; leaving shows tonight's recap", async ({ browser }) => {
    const { host, guest } = await pair(browser);
    await loadFilmForBoth(host.page, guest.page);
    await host.page.locator("[data-testid=player]").hover();
    await host.page.getByTestId("play-toggle").click();
    await expect.poll(async () => (await videoState(guest.page)).paused).toBe(false);
    await host.page.waitForTimeout(1500);
    await host.page.mouse.move(300, 300);
    await host.page.getByTestId("ctl-react").click();
    await host.page.getByRole("button", { name: "Send 😂" }).click();
    await host.page.keyboard.press("Escape");
    for (const p of [host.page, guest.page]) {
      await p.locator("[data-testid=player]").hover();
      await expect(p.getByTestId("moment")).toContainText("😂");
    }
    await guest.page.mouse.move(300, 300);
    await guest.page.getByTestId("ctl-leave").click();
    await expect(guest.page.getByTestId("recap")).toContainText("1 film");
    await expect(guest.page.getByTestId("recap")).toContainText("1 reaction");
  });
});
