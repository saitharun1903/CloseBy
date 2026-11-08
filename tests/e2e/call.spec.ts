import { expect, test } from "@playwright/test";
import { createRoom, enterRoom, inboundStats, inviteUrl, joinAsGuest, newPerson, pair } from "./helpers";

test.describe("two-person call", () => {
  test("both join, see each other, and receive each other's microphone audio", async ({ browser }) => {
    const { host, guest } = await pair(browser);

    // Cameras: real decoded remote video on both sides.
    for (const p of [host.page, guest.page]) {
      await expect(p.locator("[data-testid=tile-remote][data-has-video=true]")).toBeVisible();
      await expect.poll(() => p.locator("[data-testid=video-remote]").evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 20_000 }).toBeGreaterThan(0);
    }

    // Microphones: inbound RTP audio bytes keep increasing in both directions.
    for (const p of [host.page, guest.page]) {
      await expect.poll(async () => (await inboundStats(p, "audio"))?.bytesReceived ?? 0, { timeout: 20_000 }).toBeGreaterThan(0);
      const a = (await inboundStats(p, "audio"))!.bytesReceived;
      await p.waitForTimeout(1500);
      const b = (await inboundStats(p, "audio"))!.bytesReceived;
      expect(b).toBeGreaterThan(a);
    }
  });

  test("a third person cannot join a full room", async ({ browser }) => {
    const { url } = await pair(browser);
    const third = await newPerson(browser);
    await third.page.goto(url);
    await third.page.getByLabel("Your name").fill("Eve");
    await third.page.getByTestId("join-submit").click();
    await expect(third.page.getByRole("heading", { name: "This room is full" })).toBeVisible();
  });

  test("the invite is required, and a tampered invite is rejected", async ({ browser }) => {
    const host = await newPerson(browser);
    await createRoom(host.page);
    await enterRoom(host.page);
    const url = await inviteUrl(host.page);
    const roomPath = new URL(url).pathname;

    const stranger = await newPerson(browser);
    await stranger.page.goto(roomPath);
    await expect(stranger.page.getByRole("heading", { name: "You need an invite" })).toBeVisible();

    await stranger.page.goto(`${roomPath}#invite=${"A".repeat(43)}`);
    await stranger.page.reload();
    await expect(stranger.page.getByRole("heading", { name: "This invite isn’t valid" })).toBeVisible();

    // The API refuses room actions without a session, too.
    const res = await stranger.page.request.get(`/api/rooms/${roomPath.split("/").pop()}/state`);
    expect(res.status()).toBe(401);
    const tok = await stranger.page.request.post(`/api/rooms/${roomPath.split("/").pop()}/token`, { data: {} });
    expect(tok.status()).toBe(401);
  });

  test("PIN-protected rooms require the PIN", async ({ browser }) => {
    const host = await newPerson(browser);
    await createRoom(host.page, "Maya", "4321");
    await enterRoom(host.page);
    const url = await inviteUrl(host.page);
    const guest = await newPerson(browser);
    await guest.page.goto(url);
    await guest.page.getByLabel("Your name").fill("Sam");
    await guest.page.getByLabel("Room PIN").fill("1111");
    await guest.page.getByTestId("join-submit").click();
    await expect(guest.page.getByText("That PIN isn’t right.")).toBeVisible();
    await guest.page.getByLabel("Room PIN").fill("4321");
    await guest.page.getByTestId("join-submit").click();
    await enterRoom(guest.page);
  });

  test("a participant can refresh and reconnect into the same seat", async ({ browser }) => {
    const { host, guest } = await pair(browser);
    await guest.page.reload();
    // Cookie session → straight to the lobby, no invite needed.
    await enterRoom(guest.page);
    await expect(host.page.locator("[data-testid=tile-remote][data-has-video=true]")).toBeVisible({ timeout: 20_000 });
    await expect(guest.page.locator("[data-testid=tile-remote][data-has-video=true]")).toBeVisible();
  });

  test("a guest who leaves frees the seat; mute and camera toggles reach the partner", async ({ browser }) => {
    const { host, guest, url } = await pair(browser);
    await guest.page.getByTestId("ctl-mic").click();
    await expect(host.page.locator("[data-testid=tile-remote]").getByLabel("Microphone off")).toBeVisible();
    await guest.page.getByTestId("ctl-cam").click();
    await expect(host.page.locator("[data-testid=tile-remote][data-has-video=false]")).toBeVisible();

    await guest.page.getByTestId("ctl-leave").click();
    await guest.page.getByTestId("confirm-leave").click();
    await expect(guest.page.getByRole("heading", { name: "You left the room" })).toBeVisible();
    await expect(host.page.getByTestId("waiting-card")).toBeVisible();

    const next = await newPerson(browser);
    await joinAsGuest(next.page, url, "Robin");
    await expect(host.page.locator("[data-testid=tile-remote]")).toContainText("Robin");
  });

  test("the host can end the room for both", async ({ browser }) => {
    const { host, guest, url } = await pair(browser);
    await host.page.getByTestId("ctl-leave").click();
    await host.page.getByTestId("confirm-end").click();
    await expect(host.page.getByRole("heading", { name: "You ended the room" })).toBeVisible();
    await expect(guest.page.getByRole("heading", { name: /ended the room/ })).toBeVisible();
    const late = await newPerson(browser);
    await late.page.goto(url);
    await expect(late.page.getByRole("heading", { name: "This room has ended" })).toBeVisible();
  });

  test("chat and reactions travel between the two", async ({ browser }) => {
    const { host, guest } = await pair(browser);
    await guest.page.getByTestId("ctl-chat").click();
    await guest.page.getByTestId("chat-input").fill("see https://example.com/trailer");
    await guest.page.getByTestId("chat-input").press("Enter");
    await expect(host.page.getByTestId("ctl-chat").getByLabel("1 unread")).toBeVisible();
    await host.page.getByTestId("ctl-chat").click();
    await expect(host.page.getByTestId("chat-list")).toContainText("see https://example.com/trailer");
    await expect(host.page.getByRole("link", { name: /Open example.com in a new tab/ })).toHaveAttribute("rel", /noopener/);

    await host.page.getByTestId("ctl-react").click();
    await host.page.getByRole("button", { name: "Send 🍿" }).click();
    await expect(guest.page.getByText("🍿")).toBeVisible();
  });
});
