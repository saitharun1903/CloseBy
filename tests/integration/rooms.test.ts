import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AppError } from "@/server/errors";
import {
  addQueueItem,
  authorize,
  cleanupExpiredRooms,
  createRoom,
  endRoom,
  getRoomState,
  issueMediaToken,
  joinRoom,
  leaveRoom,
  previewRoom,
  removeQueueItem,
  reorderQueue,
  STALE_SEAT_MS,
  submitPlaybackIntent,
} from "@/server/rooms";
import { FakeGateway, makeDb, makeDeps, truncate } from "./helpers";

const { db, client } = makeDb();
afterAll(() => client.end());
beforeEach(() => truncate(db));

async function code(p: Promise<unknown>) {
  try {
    await p;
    return "ok";
  } catch (e) {
    if (e instanceof AppError) return e.code;
    throw e;
  }
}

describe("room lifecycle", () => {
  it("creates a room with a host seat and a host-only invite link", async () => {
    const d = makeDeps(db);
    const r = await createRoom(d, { displayName: "Maya" });
    expect(r.inviteUrl).toBe(`https://closeby.test/r/${r.roomId}#invite=${r.inviteToken}`);
    const state = await getRoomState(d, r.claims, r.roomId);
    expect(state.me).toMatchObject({ role: "host", displayName: "Maya" });
    expect(state.inviteUrl).toBe(r.inviteUrl);
    expect(state.participants).toHaveLength(1);
    expect(state.playback).toMatchObject({ mediaId: null, status: "paused", version: 0 });
  });

  it("lets the invited guest join and hides the invite link from them", async () => {
    const d = makeDeps(db);
    const r = await createRoom(d, { displayName: "Maya" });
    const preview = await previewRoom(d, r.roomId, r.inviteToken);
    expect(preview).toMatchObject({ hostName: "Maya", requiresPin: false, seatsTaken: 1 });
    const g = await joinRoom(d, r.roomId, { inviteToken: r.inviteToken, displayName: "Sam" });
    const state = await getRoomState(d, g.claims, r.roomId);
    expect(state.me.role).toBe("guest");
    expect(state.inviteUrl).toBeUndefined();
    expect(state.participants.map((p) => p.displayName)).toEqual(["Maya", "Sam"]);
    expect(d.gateway.broadcasts.some((b) => b.msg.kind === "participants")).toBe(true);
  });

  it("rejects wrong invite tokens and unknown rooms", async () => {
    const d = makeDeps(db);
    const r = await createRoom(d, { displayName: "Maya" });
    expect(await code(previewRoom(d, r.roomId, "x".repeat(43)))).toBe("invalid_invite");
    expect(await code(joinRoom(d, r.roomId, { inviteToken: "x".repeat(43), displayName: "Eve" }))).toBe("invalid_invite");
    expect(await code(previewRoom(d, "zzzz-zzzz-zzzz", r.inviteToken))).toBe("not_found");
  });

  it("enforces the PIN", async () => {
    const d = makeDeps(db);
    const r = await createRoom(d, { displayName: "Maya", pin: "2468" });
    expect((await previewRoom(d, r.roomId, r.inviteToken)).requiresPin).toBe(true);
    expect(await code(joinRoom(d, r.roomId, { inviteToken: r.inviteToken, displayName: "Sam" }))).toBe("pin_required");
    expect(await code(joinRoom(d, r.roomId, { inviteToken: r.inviteToken, displayName: "Sam", pin: "1111" }))).toBe("invalid_pin");
    expect(await code(joinRoom(d, r.roomId, { inviteToken: r.inviteToken, displayName: "Sam", pin: "2468" }))).toBe("ok");
  });
});

describe("two-person limit", () => {
  it("refuses a third person", async () => {
    const d = makeDeps(db);
    const r = await createRoom(d, { displayName: "Maya" });
    await joinRoom(d, r.roomId, { inviteToken: r.inviteToken, displayName: "Sam" });
    expect(await code(joinRoom(d, r.roomId, { inviteToken: r.inviteToken, displayName: "Eve" }))).toBe("room_full");
  });

  it("holds under concurrent joins (row lock serialises seat allocation)", async () => {
    const d = makeDeps(db);
    const r = await createRoom(d, { displayName: "Maya" });
    const attempts = await Promise.all(
      Array.from({ length: 8 }, (_, i) => code(joinRoom(d, r.roomId, { inviteToken: r.inviteToken, displayName: `G${i}` }))),
    );
    expect(attempts.filter((a) => a === "ok")).toHaveLength(1);
    expect(attempts.filter((a) => a === "room_full")).toHaveLength(7);
    const state = await getRoomState(d, r.claims, r.roomId);
    expect(state.participants).toHaveLength(2);
  });

  it("reclaims a guest seat only when its holder is disconnected and stale", async () => {
    let now = Date.now();
    const d = makeDeps(db, new FakeGateway(), () => now);
    const r = await createRoom(d, { displayName: "Maya" });
    const g = await joinRoom(d, r.roomId, { inviteToken: r.inviteToken, displayName: "Sam" });

    // Sam is connected → no reclaim.
    d.gateway.connected.set(r.roomId, new Set([r.claims.pid, g.claims.pid]));
    now += STALE_SEAT_MS + 1000;
    expect(await code(joinRoom(d, r.roomId, { inviteToken: r.inviteToken, displayName: "Eve" }))).toBe("room_full");

    // Sam disconnected but recently seen → no reclaim.
    d.gateway.connected.set(r.roomId, new Set([r.claims.pid]));
    now -= STALE_SEAT_MS + 1000;
    expect(await code(joinRoom(d, r.roomId, { inviteToken: r.inviteToken, displayName: "Eve" }))).toBe("room_full");

    // Media server unreachable → fail closed.
    now += STALE_SEAT_MS + 1000;
    d.gateway.reachable = false;
    expect(await code(joinRoom(d, r.roomId, { inviteToken: r.inviteToken, displayName: "Eve" }))).toBe("room_full");

    // Disconnected and stale → seat can be taken; Sam's old session is no longer valid.
    d.gateway.reachable = true;
    const eve = await joinRoom(d, r.roomId, { inviteToken: r.inviteToken, displayName: "Eve" });
    expect(eve.claims.role).toBe("guest");
    expect(await code(authorize(d, g.claims, r.roomId))).toBe("seat_released");
  });

  it("never reclaims the host seat", async () => {
    let now = Date.now();
    const d = makeDeps(db, new FakeGateway(), () => now);
    const r = await createRoom(d, { displayName: "Maya" });
    await joinRoom(d, r.roomId, { inviteToken: r.inviteToken, displayName: "Sam" });
    const state = await getRoomState(d, r.claims, r.roomId);
    const sam = state.participants.find((p) => p.role === "guest")!;
    // Only Sam connected; host gone for ages.
    d.gateway.connected.set(r.roomId, new Set([sam.id]));
    now += 10 * 60_000;
    expect(await code(joinRoom(d, r.roomId, { inviteToken: r.inviteToken, displayName: "Eve" }))).toBe("room_full");
  });

  it("frees the guest seat when the guest leaves", async () => {
    const d = makeDeps(db);
    const r = await createRoom(d, { displayName: "Maya" });
    const g = await joinRoom(d, r.roomId, { inviteToken: r.inviteToken, displayName: "Sam" });
    expect(await leaveRoom(d, g.claims, r.roomId)).toEqual({ released: true });
    expect(d.gateway.removed).toContain(g.claims.pid);
    expect(await code(joinRoom(d, r.roomId, { inviteToken: r.inviteToken, displayName: "Eve" }))).toBe("ok");
  });

  it("host leaving keeps the room and the seat", async () => {
    const d = makeDeps(db);
    const r = await createRoom(d, { displayName: "Maya" });
    expect(await leaveRoom(d, r.claims, r.roomId)).toEqual({ released: false });
    expect(await code(getRoomState(d, r.claims, r.roomId))).toBe("ok");
  });
});

describe("authorization", () => {
  it("rejects missing, foreign, and forged sessions", async () => {
    const d = makeDeps(db);
    const a = await createRoom(d, { displayName: "A" });
    const b = await createRoom(d, { displayName: "B" });
    expect(await code(getRoomState(d, null, a.roomId))).toBe("unauthorized");
    // Session for room B used on room A.
    expect(await code(getRoomState(d, b.claims, a.roomId))).toBe("unauthorized");
    // Right room id but a participant id from another room.
    expect(await code(getRoomState(d, { ...b.claims, rid: a.roomId }, a.roomId))).toBe("unauthorized");
    expect(await code(issueMediaToken(d, null, a.roomId))).toBe("unauthorized");
    expect(await code(submitPlaybackIntent(d, null, a.roomId, { baseVersion: 0, intent: { type: "load", mediaId: null } }))).toBe(
      "unauthorized",
    );
  });

  it("issues media tokens bound to the caller's seat identity", async () => {
    const d = makeDeps(db);
    const r = await createRoom(d, { displayName: "Maya" });
    const t = await issueMediaToken(d, r.claims, r.roomId);
    expect(t.identity).toBe(r.claims.pid);
    expect(t.token).toBe(`fake-token:${r.roomId}:${r.claims.pid}`);
  });

  it("only the host can end the room; ending revokes everyone", async () => {
    const d = makeDeps(db);
    const r = await createRoom(d, { displayName: "Maya" });
    const g = await joinRoom(d, r.roomId, { inviteToken: r.inviteToken, displayName: "Sam" });
    expect(await code(endRoom(d, g.claims, r.roomId))).toBe("forbidden");
    await endRoom(d, r.claims, r.roomId);
    expect(d.gateway.deleted).toContain(r.roomId);
    expect(d.gateway.broadcasts.at(-1)?.msg).toEqual({ kind: "room-ended" });
    expect(await code(getRoomState(d, r.claims, r.roomId))).toBe("room_ended");
    expect(await code(getRoomState(d, g.claims, r.roomId))).toBe("room_ended");
    expect(await code(joinRoom(d, r.roomId, { inviteToken: r.inviteToken, displayName: "Eve" }))).toBe("room_ended");
  });

  it("expired rooms are unusable and get cleaned up", async () => {
    let now = Date.now();
    const d = makeDeps(db, new FakeGateway(), () => now);
    const r = await createRoom(d, { displayName: "Maya" });
    now += 13 * 3600_000;
    expect(await code(getRoomState(d, r.claims, r.roomId))).toBe("room_expired");
    expect(await code(previewRoom(d, r.roomId, r.inviteToken))).toBe("room_expired");
    expect(await cleanupExpiredRooms(d)).toEqual({ deleted: 1 });
    expect(await code(getRoomState(d, r.claims, r.roomId))).toBe("not_found");
  });
});

describe("server-coordinated playback", () => {
  async function setup() {
    let now = 1_800_000_000_000;
    const d = makeDeps(db, new FakeGateway(), () => now);
    const r = await createRoom(d, { displayName: "Maya" });
    const g = await joinRoom(d, r.roomId, { inviteToken: r.inviteToken, displayName: "Sam" });
    const { item } = await addQueueItem(d, r.claims, r.roomId, { kind: "file", fileName: "film.mp4", fileSize: 1234, durationSec: 600 });
    return { d, r, g, item, tick: (ms: number) => (now += ms) };
  }

  it("load → play → pause produces a versioned, broadcast trajectory", async () => {
    const { d, r, g, item, tick } = await setup();
    const load = await submitPlaybackIntent(d, r.claims, r.roomId, { baseVersion: 0, intent: { type: "load", mediaId: item.id } });
    expect(load).toMatchObject({ accepted: true, state: { mediaId: item.id, version: 1 } });
    tick(1000);
    const play = await submitPlaybackIntent(d, g.claims, r.roomId, { baseVersion: 1, intent: { type: "play", positionSec: 0 } });
    expect(play.state).toMatchObject({ status: "playing", version: 2, updatedBy: g.claims.pid });
    tick(5000);
    const pause = await submitPlaybackIntent(d, r.claims, r.roomId, { baseVersion: 2, intent: { type: "pause", positionSec: 5.02 } });
    expect(pause.state).toMatchObject({ status: "paused", positionSec: 5.02, version: 3 });
    const playbackBroadcasts = d.gateway.broadcasts.filter((b) => b.msg.kind === "playback");
    expect(playbackBroadcasts).toHaveLength(3);

    // Late joiner / refresh sees the same state.
    const state = await getRoomState(d, g.claims, r.roomId);
    expect(state.playback).toMatchObject({ status: "paused", positionSec: 5.02, version: 3 });
  });

  it("resolves simultaneous controls: first wins, the colliding stale intent is rejected", async () => {
    const { d, r, g, item, tick } = await setup();
    await submitPlaybackIntent(d, r.claims, r.roomId, { baseVersion: 0, intent: { type: "load", mediaId: item.id } });
    tick(2000);
    // Both based on version 1, 100ms apart.
    const a = await submitPlaybackIntent(d, r.claims, r.roomId, { baseVersion: 1, intent: { type: "play", positionSec: 0 } });
    tick(100);
    const b = await submitPlaybackIntent(d, g.claims, r.roomId, { baseVersion: 1, intent: { type: "seek", positionSec: 300 } });
    expect(a.accepted).toBe(true);
    expect(b.accepted).toBe(false);
    expect(b.reason).toBe("conflict");
    expect(b.state.version).toBe(2);
  });

  it("clamps positions to the item's duration and rejects foreign media ids", async () => {
    const { d, r, item } = await setup();
    await submitPlaybackIntent(d, r.claims, r.roomId, { baseVersion: 0, intent: { type: "load", mediaId: item.id } });
    const s = await submitPlaybackIntent(d, r.claims, r.roomId, { baseVersion: 1, intent: { type: "seek", positionSec: 9999 } });
    expect(s.state.positionSec).toBe(600);
    expect(
      await code(
        submitPlaybackIntent(d, r.claims, r.roomId, {
          baseVersion: 2,
          intent: { type: "load", mediaId: "00000000-0000-4000-8000-000000000000" },
        }),
      ),
    ).toBe("bad_request");
  });
});

describe("shared queue", () => {
  it("adds, reorders, removes, and broadcasts", async () => {
    const d = makeDeps(db);
    const r = await createRoom(d, { displayName: "Maya" });
    const g = await joinRoom(d, r.roomId, { inviteToken: r.inviteToken, displayName: "Sam" });
    const a = await addQueueItem(d, r.claims, r.roomId, { kind: "url", url: "https://cdn.example.com/films/Night%20Walk.mp4" });
    expect(a.item.title).toBe("Night Walk.mp4");
    const b = await addQueueItem(d, g.claims, r.roomId, { kind: "file", fileName: "holiday.mkv", fileSize: 99 });
    expect(b.item.title).toBe("holiday");
    const c = await addQueueItem(d, g.claims, r.roomId, { kind: "url", url: "https://example.com/c.webm", title: "Clip C" });
    expect(c.items.map((i) => i.title)).toEqual(["Night Walk.mp4", "holiday", "Clip C"]);

    const re = await reorderQueue(d, r.claims, r.roomId, [c.item.id, a.item.id]);
    // Unmentioned items are kept at the end.
    expect(re.items.map((i) => i.title)).toEqual(["Clip C", "Night Walk.mp4", "holiday"]);

    const rm = await removeQueueItem(d, g.claims, r.roomId, a.item.id);
    expect(rm.items.map((i) => i.title)).toEqual(["Clip C", "holiday"]);
    expect(d.gateway.broadcasts.filter((x) => x.msg.kind === "queue")).toHaveLength(5);
  });

  it("cannot touch another room's queue", async () => {
    const d = makeDeps(db);
    const a = await createRoom(d, { displayName: "A" });
    const b = await createRoom(d, { displayName: "B" });
    const { item } = await addQueueItem(d, a.claims, a.roomId, { kind: "url", url: "https://example.com/x.mp4" });
    await removeQueueItem(d, b.claims, b.roomId, item.id);
    const state = await getRoomState(d, a.claims, a.roomId);
    expect(state.queue).toHaveLength(1);
  });
});
