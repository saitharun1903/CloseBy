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

  test("the film dips while someone talks and comes back after (and can be switched off)", async ({ browser }) => {
    const { host, guest } = await pair(browser);
    await loadFilmForBoth(host.page, guest.page);
    const store = (p: typeof host.page, talking: boolean) =>
      p.evaluate((t) => (window as unknown as { __cbStore: { setState(s: object): void } }).__cbStore.setState({ talking: t }), talking);

    await store(host.page, false);
    await expect.poll(async () => (await videoState(host.page)).volume).toBeCloseTo(0.8, 1);
    await store(host.page, true);
    await expect.poll(async () => (await videoState(host.page)).volume).toBeLessThan(0.35);
    await store(host.page, false);
    await expect.poll(async () => (await videoState(host.page)).volume).toBeCloseTo(0.8, 1);

    // Switched off: talking leaves the film alone.
    await host.page.getByTestId("ctl-more").click();
    await host.page.getByTestId("auto-duck").click();
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
});
