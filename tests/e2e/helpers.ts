import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const FILM = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "test-film.webm");
export const FILM_URL = "http://127.0.0.1:3199/test-film.webm";

const openContexts = new Set<BrowserContext>();

/** Close every browser context a test opened (each holds camera/mic captures and a LiveKit connection). */
export async function closeEveryone() {
  await Promise.all([...openContexts].map((c) => c.close().catch(() => {})));
  openContexts.clear();
}

export async function newPerson(browser: Browser, opts: { viewport?: { width: number; height: number } } = {}): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ permissions: ["camera", "microphone"], viewport: opts.viewport ?? { width: 1360, height: 860 } });
  openContexts.add(ctx);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`[pageerror] ${e.message}`));
  return { ctx, page };
}

export async function createRoom(page: Page, name = "Maya", pin?: string) {
  await page.goto("/");
  // Retry until hydrated: a click before React attaches handlers does nothing.
  await expect(async () => {
    await page.getByTestId("create-room").click();
    await expect(page.getByLabel("Your name")).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 60_000 });
  await page.getByLabel("Your name").fill(name);
  if (pin) {
    await page.getByRole("switch").click();
    await page.getByLabel("Room PIN").fill(pin);
  }
  await page.getByRole("button", { name: "Create room" }).click();
  await page.waitForURL(/\/r\/[a-z0-9-]+$/);
}

export async function enterRoom(page: Page) {
  // Retry until hydrated (a pre-hydration click on a freshly compiled route is lost).
  await expect(async () => {
    if (await page.getByTestId("lobby-join").isVisible()) await page.getByTestId("lobby-join").click({ timeout: 2000 });
    await expect(page.getByTestId("room")).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 60_000 });
  await expect(page.locator("[data-testid=room][data-conn=connected]")).toBeVisible({ timeout: 20_000 });
}

export async function inviteUrl(page: Page) {
  return (await page.getByTestId("invite-url").textContent())!.trim();
}

export async function joinAsGuest(page: Page, url: string, name = "Sam", pin?: string) {
  await page.goto(url);
  await page.getByLabel("Your name").fill(name, { timeout: 60_000 });
  if (pin) await page.getByLabel("Room PIN").fill(pin);
  await page.getByTestId("join-submit").click();
  await enterRoom(page);
}

/** Host creates a room and a guest joins it; both are connected. */
export async function pair(browser: Browser) {
  const host = await newPerson(browser);
  const guest = await newPerson(browser);
  await createRoom(host.page);
  await enterRoom(host.page);
  const url = await inviteUrl(host.page);
  await joinAsGuest(guest.page, url);
  await expect(host.page.locator("[data-testid=tile-remote]")).toBeVisible();
  return { host, guest, url };
}

/** Real WebRTC inbound stats for the partner's track of the given kind. */
export async function inboundStats(page: Page, kind: "audio" | "video") {
  return page.evaluate(async (k) => {
    const cb = (window as unknown as { __cb?: { room: { remoteParticipants: Map<string, { trackPublications: Map<string, { kind: string; source: string; track?: { getRTCStatsReport(): Promise<RTCStatsReport | undefined> } }> }> } } }).__cb;
    const p = cb && [...cb.room.remoteParticipants.values()][0];
    if (!p) return null;
    const pub = [...p.trackPublications.values()].find((t) => t.kind === k && (t.source === "microphone" || t.source === "camera"));
    const report = await pub?.track?.getRTCStatsReport();
    type Out = { bytesReceived: number; audioLevel?: number; framesDecoded?: number };
    const found: Out[] = [];
    report?.forEach((s: Record<string, unknown>) => {
      if (s.type === "inbound-rtp") found.push({ bytesReceived: Number(s.bytesReceived), audioLevel: s.audioLevel as number, framesDecoded: s.framesDecoded as number });
    });
    return found[0] ?? null;
  }, kind);
}

export async function videoState(page: Page) {
  return page.locator("[data-testid=player-video]").evaluate((v: HTMLVideoElement) => ({
    t: v.currentTime,
    paused: v.paused,
    rate: v.playbackRate,
    volume: v.volume,
    muted: v.muted,
    ready: v.readyState,
  }));
}

/** Add the fixture film from the host's watchlist panel and have the guest pick their copy. */
export async function loadFilmForBoth(host: Page, guest: Page) {
  await host.getByTestId("ctl-queue").click();
  await host.getByTestId("queue-file").setInputFiles(FILM);
  await expect(host.locator("[data-testid=player-video]")).toBeVisible();
  await expect(guest.getByTestId("file-prompt")).toBeVisible();
  await guest.getByTestId("file-input").setInputFiles(FILM);
  await expect(guest.locator("[data-testid=player-video]")).toBeVisible();
  for (const p of [host, guest]) await expect.poll(async () => (await videoState(p)).ready).toBeGreaterThanOrEqual(1);
  await host.getByTestId("ctl-queue").click(); // close panel
}

/**
 * Local player position minus where the server trajectory says it should be,
 * computed in-page at a single instant (no cross-page timing skew).
 */
export async function drift(page: Page) {
  return page.evaluate(() => {
    const store = (window as unknown as { __cbStore: { getState(): { playback: { status: string; positionSec: number; rate: number; updatedAtMs: number }; clockOffsetMs: number } } }).__cbStore.getState();
    const v = document.querySelector("[data-testid=player-video]") as HTMLVideoElement;
    const pb = store.playback;
    const now = Date.now() + store.clockOffsetMs;
    const expected = pb.status === "playing" ? pb.positionSec + ((now - pb.updatedAtMs) / 1000) * pb.rate : pb.positionSec;
    return { drift: v.currentTime - expected, rate: v.playbackRate, nominal: pb.rate, buffering: v.readyState < 3 };
  });
}
