import { expect, test } from "@playwright/test";
import { closeEveryone, loadFilmForBoth, pair } from "./helpers";

test.describe("screen sharing and layouts", () => {
  test.afterEach(closeEveryone);

  test("sharing reaches the partner, shows an honest audio indicator, and stops cleanly", async ({ browser }) => {
    const { host, guest } = await pair(browser);
    const supported = await host.page.evaluate(async () => {
      try {
        const s = await navigator.mediaDevices.getDisplayMedia({ video: true });
        s.getTracks().forEach((t) => t.stop());
        return true;
      } catch {
        return false;
      }
    });
    test.skip(!supported, "This headless browser can't capture a screen — covered by the manual test plan.");

    await host.page.getByTestId("ctl-share").click();
    await expect(host.page.getByTestId("screen-stage")).toBeVisible();
    await expect(guest.page.getByTestId("screen-stage")).toBeVisible();
    await expect(guest.page.locator("[data-testid=stage]")).toHaveAttribute("data-layout", "screen");
    await expect.poll(() => guest.page.locator("[data-testid=screen-remote]").evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 20_000 }).toBeGreaterThan(0);
    // Indicator reflects whether an audio track was actually published (never assumed).
    const hostHasAudio = await host.page.getByTestId("share-audio-status").getAttribute("data-has-audio");
    await expect(guest.page.getByTestId("share-audio-status")).toHaveAttribute("data-has-audio", hostHasAudio!);
    // Cameras stay visible as floating tiles during the share.
    await expect(guest.page.getByTestId("floating-tiles").locator("[data-testid=tile-remote]")).toBeVisible();

    await host.page.getByTestId("ctl-share").click();
    await expect(guest.page.getByTestId("screen-stage")).toHaveCount(0);
  });

  test("switching layouts never interrupts the call or playback", async ({ browser }) => {
    const { host, guest } = await pair(browser);
    await loadFilmForBoth(host.page, guest.page);
    await host.page.getByTestId("play-toggle").click();
    const stage = host.page.locator("[data-testid=stage]");
    await expect(stage).toHaveAttribute("data-layout", "cinema");

    for (const layout of ["face", "compact", "cinema"] as const) {
      await host.page.getByTestId("ctl-more").click();
      await host.page.getByTestId(`layout-${layout}`).click();
      await expect(stage).toHaveAttribute("data-layout", layout);
      await expect(host.page.locator("[data-testid=room]")).toHaveAttribute("data-conn", "connected");
      await expect(host.page.locator("[data-testid=tile-remote][data-has-video=true]").first()).toBeVisible();
      const paused = await host.page.locator("[data-testid=player-video]").evaluate((v: HTMLVideoElement) => v.paused);
      expect(paused).toBe(false);
    }
  });

  test("on a phone the room uses the compact layout", async ({ browser }) => {
    const { host, guest } = await pair(browser);
    await loadFilmForBoth(host.page, guest.page);
    await guest.page.setViewportSize({ width: 390, height: 844 });
    await expect(guest.page.locator("[data-testid=stage]")).toHaveAttribute("data-layout", "compact");
    const overflow = await guest.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });
});
