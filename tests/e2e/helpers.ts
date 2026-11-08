import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const FILM = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "test-film.webm");
export const FILM_URL = "http://127.0.0.1:3199/test-film.webm";

export async function newPerson(browser: Browser, opts: { viewport?: { width: number; height: number } } = {}): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ permissions: ["camera", "microphone"], viewport: opts.viewport ?? { width: 1360, height: 860 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`[pageerror] ${e.message}`));
  return { ctx, page };
}

export async function createRoom(page: Page, name = "Maya", pin?: string) {
  await page.goto("/");
  await page.getByTestId("create-room").click();
  await page.getByLabel("Your name").fill(name);
  if (pin) {
    await page.getByRole("switch").click();
    await page.getByLabel("Room PIN").fill(pin);
  }
  await page.getByRole("button", { name: "Create room" }).click();
  await page.waitForURL(/\/r\/[a-z0-9-]+$/);
}

export async function enterRoom(page: Page) {
  await page.getByTestId("lobby-join").click();
  await expect(page.locator("[data-testid=room][data-conn=connected]")).toBeVisible({ timeout: 20_000 });
}

export async function inviteUrl(page: Page) {
  return (await page.getByTestId("invite-url").textContent())!.trim();
}

export async function joinAsGuest(page: Page, url: string, name = "Sam", pin?: string) {
  await page.goto(url);
  await page.getByLabel("Your name").fill(name);
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
