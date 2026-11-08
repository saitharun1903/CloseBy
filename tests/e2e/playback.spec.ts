import { expect, test, type Page } from "@playwright/test";
import { createRoom, enterRoom, FILM, FILM_URL, inviteUrl, joinAsGuest, loadFilmForBoth, newPerson, pair, videoState } from "./helpers";

async function gap(a: Page, b: Page) {
  const [x, y] = await Promise.all([videoState(a), videoState(b)]);
  return Math.abs(x.t - y.t);
}

test.describe("synchronised playback", () => {
  test("either person controls play, pause, seek and speed; both stay in sync", async ({ browser }) => {
    const { host, guest } = await pair(browser);
    await loadFilmForBoth(host.page, guest.page);
    // Partner readiness is shared.
    await expect(host.page.getByTestId("sync-chip")).not.toContainText("isn’t ready");

    // Host presses play.
    await host.page.getByTestId("play-toggle").click();
    await expect.poll(async () => (await videoState(guest.page)).paused).toBe(false);
    await host.page.waitForTimeout(3000);
    expect((await videoState(host.page)).t).toBeGreaterThan(2);
    expect(await gap(host.page, guest.page)).toBeLessThan(0.35);

    // Guest pauses: host pauses at (nearly) the same frame.
    await guest.page.locator("[data-testid=player]").hover();
    await guest.page.getByTestId("play-toggle").click();
    await expect.poll(async () => (await videoState(host.page)).paused).toBe(true);
    await expect.poll(() => gap(host.page, guest.page)).toBeLessThan(0.3);

    // Guest seeks with the keyboard (→ = +10s) while paused.
    const before = (await videoState(guest.page)).t;
    await guest.page.locator("body").press("ArrowRight");
    await expect.poll(async () => (await videoState(host.page)).t).toBeGreaterThan(before + 9);
    await expect.poll(() => gap(host.page, guest.page)).toBeLessThan(0.3);

    // Host changes speed; both run at 1.5×.
    await host.page.locator("[data-testid=player]").hover();
    await host.page.getByRole("button", { name: /Playback speed/ }).click();
    await host.page.getByRole("button", { name: "1.5×" }).click();
    await host.page.keyboard.press("Escape");
    await host.page.locator("[data-testid=player]").hover();
    await host.page.getByTestId("play-toggle").click();
    await expect.poll(async () => (await videoState(guest.page)).paused).toBe(false);
    await expect.poll(async () => (await videoState(guest.page)).rate, { timeout: 10_000 }).toBeGreaterThan(1.4);
    await guest.page.waitForTimeout(3000);
    expect(await gap(host.page, guest.page)).toBeLessThan(0.4);
  });

  test("drift is corrected: a small drift is nudged, a large one is re-seeked", async ({ browser }) => {
    const { host, guest } = await pair(browser);
    await loadFilmForBoth(host.page, guest.page);
    await host.page.getByTestId("play-toggle").click();
    await expect.poll(async () => (await videoState(guest.page)).paused).toBe(false);
    await guest.page.waitForTimeout(1500);

    // Large drift: jump the guest's element 5s ahead behind the app's back.
    await guest.page.locator("[data-testid=player-video]").evaluate((v: HTMLVideoElement) => (v.currentTime += 5));
    await expect.poll(() => gap(host.page, guest.page), { timeout: 8000 }).toBeLessThan(0.4);

    // Small drift: 0.5s behind → corrected by a gentle rate change rather than a jump.
    await guest.page.waitForTimeout(2000);
    await guest.page.locator("[data-testid=player-video]").evaluate((v: HTMLVideoElement) => (v.currentTime -= 0.5));
    await expect.poll(async () => (await videoState(guest.page)).rate, { timeout: 5000 }).toBeGreaterThan(1.0);
    await expect.poll(() => gap(host.page, guest.page), { timeout: 15_000 }).toBeLessThan(0.15);
  });

  test("a late joiner lands at the current position", async ({ browser }) => {
    const host = await newPerson(browser);
    await createRoom(host.page);
    await enterRoom(host.page);
    const url = await inviteUrl(host.page);
    await host.page.getByTestId("ctl-queue").click();
    await host.page.getByTestId("queue-file").setInputFiles(FILM);
    await host.page.getByTestId("ctl-queue").click();
    await host.page.getByTestId("play-toggle").click();
    await host.page.waitForTimeout(5000);

    const guest = await newPerson(browser);
    await joinAsGuest(guest.page, url);
    await guest.page.getByTestId("file-input").setInputFiles(FILM);
    await expect.poll(async () => (await videoState(guest.page)).t, { timeout: 10_000 }).toBeGreaterThan(4);
    await expect.poll(() => gap(host.page, guest.page), { timeout: 10_000 }).toBeLessThan(0.4);
  });

  test("film volume, film mute and partner voice volume are independent of each other and of the mic", async ({ browser }) => {
    const { host, guest } = await pair(browser);
    await loadFilmForBoth(host.page, guest.page);

    // Guest mutes the film: their mic stays on, host's film is unaffected.
    await guest.page.locator("[data-testid=player]").hover();
    await guest.page.getByTestId("media-mute").click();
    expect((await videoState(guest.page)).muted).toBe(true);
    expect((await videoState(host.page)).muted).toBe(false);
    await expect(guest.page.getByTestId("ctl-mic")).toHaveAccessibleName("Mute microphone");

    // Guest mutes their mic: film stays as it was.
    await guest.page.getByTestId("ctl-mic").click();
    await guest.page.getByTestId("media-mute").click({ force: true });
    expect((await videoState(guest.page)).muted).toBe(false);

    // Volumes from the settings panel.
    await guest.page.getByTestId("ctl-settings").click();
    const media = guest.page.getByTestId("vol-media").getByRole("slider");
    await media.focus();
    for (let i = 0; i < 30; i++) await media.press("ArrowLeft");
    const voice = guest.page.getByTestId("vol-voice").getByRole("slider");
    await voice.focus();
    for (let i = 0; i < 60; i++) await voice.press("ArrowLeft");
    const v = await videoState(guest.page);
    expect(v.volume).toBeCloseTo(0.5, 1);
    // Partner's mic element on the guest side follows the voice slider; the film doesn't.
    const partnerVoice = await guest.page.evaluate(() => [...document.querySelectorAll("audio")].map((a) => a.volume));
    expect(partnerVoice.some((x) => Math.abs(x - 0.4) < 0.02)).toBe(true);
    expect((await videoState(host.page)).volume).toBeCloseTo(0.8, 1);
  });

  test("direct links play for both; non-video links are refused with an explanation", async ({ browser }) => {
    const { host, guest } = await pair(browser);
    await guest.page.getByTestId("ctl-queue").click();
    await guest.page.getByRole("button", { name: "Add link" }).click();
    await guest.page.getByTestId("queue-url").fill("http://127.0.0.1:3199/not-a-video.html");
    await guest.page.getByRole("button", { name: "Add link" }).click();
    await expect(guest.page.getByText(/couldn’t be played here/)).toBeVisible();

    await guest.page.getByTestId("queue-url").fill(FILM_URL);
    await guest.page.getByRole("button", { name: "Add link" }).click();
    for (const p of [host.page, guest.page]) await expect.poll(async () => (await videoState(p)).ready, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
    await host.page.getByTestId("play-toggle").click();
    await host.page.waitForTimeout(2500);
    expect(await gap(host.page, guest.page)).toBeLessThan(0.4);
  });

  test("the watchlist is shared: add, reorder, play next, remove", async ({ browser }) => {
    const { host, guest } = await pair(browser);
    await host.page.getByTestId("ctl-queue").click();
    await guest.page.getByTestId("ctl-queue").click();
    await host.page.getByTestId("queue-file").setInputFiles(FILM);
    await expect(guest.page.getByTestId("queue-list")).toContainText("test-film");
    await guest.page.getByRole("button", { name: "Add link" }).click();
    await guest.page.getByTestId("queue-url").fill(FILM_URL);
    await guest.page.getByRole("button", { name: "Add link" }).click();
    await expect(host.page.getByTestId("queue-list").locator("li")).toHaveCount(2);

    // Currently playing is marked for both.
    await expect(guest.page.locator("li[aria-current=true]")).toContainText("test-film");
    // Reorder from the host; the guest sees the new order.
    await host.page.getByTestId("queue-list").locator("li").nth(1).hover();
    await host.page.getByRole("button", { name: "Move up" }).nth(1).click();
    await expect(guest.page.getByTestId("queue-list").locator("li").first()).toContainText("Link");
    // Guest plays the link item now.
    await guest.page.getByTestId("queue-list").locator("li").first().hover();
    await guest.page.getByRole("button", { name: /^Play .* now$/ }).first().click();
    await expect(host.page.locator("li[aria-current=true]")).toContainText("Link");
    // Remove the file item.
    await host.page.getByRole("button", { name: /^Remove test-film$/ }).click();
    await expect(guest.page.getByTestId("queue-list").locator("li")).toHaveCount(1);
  });
});
