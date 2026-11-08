import { and, asc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { applyIntent, initialPlaybackState, type PlaybackIntent, type PlaybackState } from "@/lib/playback";
import type { ParticipantDTO, QueueItemDTO, RoomStateDTO } from "@/lib/protocol";
import { decryptString, encryptString, hashPin, newRoomId, newSecretToken, safeEqualHex, sha256, verifyPin } from "./crypto";
import type { DB } from "./db";
import { participants, playbackStates, queueItems, rooms, type Participant, type PlaybackStateRow, type QueueItem, type Room } from "./db/schema";
import { AppError } from "./errors";
import type { BrowserProvider } from "./hyperbeam";
import type { RealtimeGateway } from "./livekit";
import type { YouTubeService } from "./youtube";
import { parseYouTubeId } from "@/lib/youtube";
import type { BrowserStateDTO } from "@/lib/protocol";
import type { SessionClaims } from "./session";

export interface RoomDeps {
  db: DB;
  gateway: RealtimeGateway;
  secret: string;
  appUrl: string;
  ttlHours: number;
  now?: () => number;
  youtube?: YouTubeService;
  /** null/undefined when the shared browser isn't configured (no HYPERBEAM_API_KEY). */
  browser?: BrowserProvider | null;
  browserRegion?: "NA" | "EU" | "AS";
}

/** A guest seat whose holder is not connected and hasn't been seen for this long can be reclaimed. */
export const STALE_SEAT_MS = 45_000;

const clock = (d: RoomDeps) => (d.now ? d.now() : Date.now());

/* ─────────────────────────── mappers ─────────────────────────── */

export function toParticipantDTO(p: Participant): ParticipantDTO {
  return { id: p.id, role: p.role, displayName: p.displayName, avatarHue: p.avatarHue };
}

export function toQueueDTO(q: QueueItem): QueueItemDTO {
  return {
    id: q.id,
    kind: q.kind,
    title: q.title,
    url: q.url,
    externalId: q.externalId,
    thumbnailUrl: q.thumbnailUrl,
    fileName: q.fileName,
    fileSize: q.fileSize,
    durationSec: q.durationSec,
    addedBy: q.addedBy,
  };
}

export function toPlaybackState(r: PlaybackStateRow): PlaybackState {
  return {
    mediaId: r.mediaId,
    status: r.status,
    positionSec: r.positionSec,
    rate: r.rate,
    updatedAtMs: r.updatedAtMs,
    version: r.version,
    updatedBy: r.updatedBy,
  };
}

function pickHue(taken: number[] = []): number {
  // Warm-to-cool palette of hues that read well on charcoal.
  const hues = [24, 38, 152, 196, 340, 12, 172, 210];
  const free = hues.filter((h) => !taken.includes(h));
  const pool = free.length ? free : hues;
  return pool[Math.floor(Math.random() * pool.length)]!;
}

export function inviteUrlFor(appUrl: string, roomId: string, token: string) {
  // Token rides in the fragment: never sent to servers, never in access logs or Referer.
  return `${appUrl.replace(/\/$/, "")}/r/${roomId}#invite=${token}`;
}

function assertRoomUsable(room: Room | undefined, nowMs: number): asserts room is Room {
  if (!room) throw new AppError("not_found", "This room doesn’t exist.");
  if (room.status === "ended") throw new AppError("room_ended", "This room has ended.");
  if (room.expiresAt.getTime() <= nowMs) throw new AppError("room_expired", "This room has expired.");
}

/* ─────────────────────────── create / preview / join ─────────────────────────── */

export async function createRoom(d: RoomDeps, input: { displayName: string; pin?: string }) {
  const nowMs = clock(d);
  const inviteToken = newSecretToken();
  const expiresAt = new Date(nowMs + d.ttlHours * 3600_000);
  const pinHash = input.pin ? await hashPin(input.pin) : null;

  let roomId = newRoomId();
  const result = await d.db.transaction(async (tx) => {
    // Vanishingly unlikely collision, but be correct anyway.
    for (let i = 0; i < 3; i++) {
      const exists = await tx.select({ id: rooms.id }).from(rooms).where(eq(rooms.id, roomId));
      if (!exists.length) break;
      roomId = newRoomId();
    }
    await tx.insert(rooms).values({
      id: roomId,
      inviteTokenHash: sha256(inviteToken),
      inviteTokenEnc: encryptString(inviteToken, d.secret),
      pinHash,
      maxParticipants: 2,
      createdAt: new Date(nowMs),
      expiresAt,
    });
    const [host] = await tx
      .insert(participants)
      .values({ roomId, role: "host", displayName: input.displayName, avatarHue: pickHue(), lastSeenAt: new Date(nowMs) })
      .returning();
    const init = initialPlaybackState(nowMs);
    await tx.insert(playbackStates).values({ roomId, ...init });
    return host!;
  });

  return {
    // Best effort, run after the response: the LiveKit room is also auto-created on first connect.
    ensure: () => d.gateway.ensureRoom(roomId, 2, d.ttlHours * 3600),
    roomId,
    inviteToken,
    inviteUrl: inviteUrlFor(d.appUrl, roomId, inviteToken),
    expiresAt,
    claims: { rid: roomId, pid: result.id, role: "host" } satisfies SessionClaims,
  };
}

async function loadRoom(d: RoomDeps, roomId: string) {
  const [room] = await d.db.select().from(rooms).where(eq(rooms.id, roomId));
  return room;
}

function checkInvite(room: Room, inviteToken: string) {
  if (!safeEqualHex(sha256(inviteToken), room.inviteTokenHash)) {
    throw new AppError("invalid_invite", "This invite link isn’t valid. Ask for a fresh link.");
  }
}

/** What a guest sees before joining. Requires a valid invite token. */
export async function previewRoom(d: RoomDeps, roomId: string, inviteToken: string) {
  const room = await loadRoom(d, roomId);
  assertRoomUsable(room, clock(d));
  checkInvite(room, inviteToken);
  const active = await activeParticipants(d.db, roomId);
  const host = active.find((p) => p.role === "host");
  return {
    hostName: host?.displayName ?? null,
    requiresPin: !!room.pinHash,
    seatsTaken: active.length,
    maxParticipants: room.maxParticipants,
    expiresAt: room.expiresAt.toISOString(),
  };
}

async function activeParticipants(db: DB | Parameters<Parameters<DB["transaction"]>[0]>[0], roomId: string) {
  return db
    .select()
    .from(participants)
    .where(and(eq(participants.roomId, roomId), isNull(participants.releasedAt)))
    .orderBy(asc(participants.createdAt));
}

/**
 * Claim the guest seat. Serialised per room with SELECT … FOR UPDATE so two
 * simultaneous joiners can't both get in. The PIN is verified by the caller's
 * rate-limited path *before* this (see verifyRoomPin).
 */
export async function joinRoom(d: RoomDeps, roomId: string, input: { inviteToken: string; displayName: string; pin?: string }) {
  const nowMs = clock(d);

  // Ask the media server who is actually connected (outside the lock; network call).
  const connected = await d.gateway.connectedIdentities(roomId);

  const guest = await d.db.transaction(async (tx) => {
    const [room] = await tx.select().from(rooms).where(eq(rooms.id, roomId)).for("update");
    assertRoomUsable(room, nowMs);
    checkInvite(room, input.inviteToken);
    if (room.pinHash) {
      if (!input.pin) throw new AppError("pin_required", "This room is protected with a PIN.");
      if (!(await verifyPin(input.pin, room.pinHash))) throw new AppError("invalid_pin", "That PIN isn’t right.");
    }

    const active = await activeParticipants(tx, roomId);
    if (active.length >= room.maxParticipants) {
      // A guest seat may be reclaimed only if its holder is provably gone:
      // not connected to the media server AND not seen recently. Host seats are never reclaimed.
      const reclaimable = connected
        ? active.filter(
            (p) => p.role === "guest" && !connected.has(p.id) && nowMs - p.lastSeenAt.getTime() > STALE_SEAT_MS,
          )
        : [];
      const victim = reclaimable[0];
      if (!victim || active.length - 1 >= room.maxParticipants) {
        throw new AppError("room_full", "This room already has two people in it.");
      }
      await tx.update(participants).set({ releasedAt: new Date(nowMs) }).where(eq(participants.id, victim.id));
    }

    const [p] = await tx
      .insert(participants)
      .values({
        roomId,
        role: "guest",
        displayName: input.displayName,
        avatarHue: pickHue(active.map((a) => a.avatarHue)),
        lastSeenAt: new Date(nowMs),
      })
      .returning();
    return { participant: p!, room };
  });

  await broadcastParticipants(d, roomId);
  return {
    expiresAt: guest.room.expiresAt,
    claims: { rid: roomId, pid: guest.participant.id, role: "guest" } satisfies SessionClaims,
  };
}

/* ─────────────────────────── session-scoped operations ─────────────────────────── */

/** Re-validate a cookie session against the DB on every request. */
export async function authorize(d: RoomDeps, claims: SessionClaims | null, roomId: string) {
  if (!claims || claims.rid !== roomId) throw new AppError("unauthorized", "You’re not a member of this room.");
  const room = await loadRoom(d, roomId);
  assertRoomUsable(room, clock(d));
  const [me] = await d.db.select().from(participants).where(and(eq(participants.id, claims.pid), eq(participants.roomId, roomId)));
  if (!me) throw new AppError("unauthorized", "You’re not a member of this room.");
  if (me.releasedAt) throw new AppError("seat_released", "Your seat in this room was released.");
  return { room, me };
}

export async function getRoomState(d: RoomDeps, claims: SessionClaims | null, roomId: string): Promise<RoomStateDTO> {
  const { room, me } = await authorize(d, claims, roomId);
  const [active, [pb], queue] = await Promise.all([
    activeParticipants(d.db, roomId),
    d.db.select().from(playbackStates).where(eq(playbackStates.roomId, roomId)),
    d.db.select().from(queueItems).where(eq(queueItems.roomId, roomId)).orderBy(asc(queueItems.sortKey)),
  ]);
  const dto: RoomStateDTO = {
    room: { id: room.id, expiresAt: room.expiresAt.toISOString(), hasPin: !!room.pinHash, maxParticipants: room.maxParticipants },
    me: toParticipantDTO(me),
    participants: active.map(toParticipantDTO),
    playback: pb ? toPlaybackState(pb) : initialPlaybackState(clock(d)),
    queue: queue.map(toQueueDTO),
    serverNowMs: clock(d),
    browser: browserState(room),
    features: { youtubeSearch: !!d.youtube?.search, sharedBrowser: !!d.browser },
  };
  if (me.role === "host") dto.inviteUrl = inviteUrlFor(d.appUrl, room.id, decryptString(room.inviteTokenEnc, d.secret));
  return dto;
}

/** Short-lived LiveKit token for the caller's seat. */
export async function issueMediaToken(d: RoomDeps, claims: SessionClaims | null, roomId: string) {
  const { room, me } = await authorize(d, claims, roomId);
  const nowMs = clock(d);
  await d.db.update(participants).set({ lastSeenAt: new Date(nowMs) }).where(eq(participants.id, me.id));
  // Short TTL: only used to connect; LiveKit refreshes tokens for live sessions.
  const ttlSec = Math.max(60, Math.min(15 * 60, Math.floor((room.expiresAt.getTime() - nowMs) / 1000)));
  const token = await d.gateway.issueToken({
    roomId,
    identity: me.id,
    name: me.displayName,
    metadata: JSON.stringify({ role: me.role, hue: me.avatarHue }),
    ttlSec,
  });
  return { token, identity: me.id, ensure: () => d.gateway.ensureRoom(roomId, room.maxParticipants, Math.floor((room.expiresAt.getTime() - nowMs) / 1000)) };
}

export async function touch(d: RoomDeps, participantId: string) {
  await d.db.update(participants).set({ lastSeenAt: new Date(clock(d)) }).where(eq(participants.id, participantId));
}

/** Guest leaves for good: frees the seat. Host leaving keeps the room (they can come back). */
export async function leaveRoom(d: RoomDeps, claims: SessionClaims | null, roomId: string) {
  const { me } = await authorize(d, claims, roomId);
  if (me.role === "guest") {
    await d.db.update(participants).set({ releasedAt: new Date(clock(d)) }).where(eq(participants.id, me.id));
    await d.gateway.removeParticipant(roomId, me.id);
    await broadcastParticipants(d, roomId);
  }
  return { released: me.role === "guest" };
}

export async function endRoom(d: RoomDeps, claims: SessionClaims | null, roomId: string) {
  const { me, room } = await authorize(d, claims, roomId);
  if (me.role !== "host") throw new AppError("forbidden", "Only the person who created the room can end it.");
  const nowMs = clock(d);
  await d.db.transaction(async (tx) => {
    await tx.update(rooms).set({ status: "ended", endedAt: new Date(nowMs) }).where(eq(rooms.id, roomId));
    await tx.update(participants).set({ releasedAt: new Date(nowMs) }).where(and(eq(participants.roomId, roomId), isNull(participants.releasedAt)));
    // Room content (queue, playback) is deleted immediately; the room row remains as a tombstone until cleanup.
    await tx.delete(queueItems).where(eq(queueItems.roomId, roomId));
    await tx.delete(playbackStates).where(eq(playbackStates.roomId, roomId));
  });
  if (room.browserSessionId && d.browser) await d.browser.stop(room.browserSessionId);
  await d.db.update(rooms).set({ browserSessionId: null, browserEmbedEnc: null, browserStartedAt: null, browserStartedBy: null }).where(eq(rooms.id, roomId));
  await d.gateway.broadcast(roomId, { kind: "room-ended" });
  await d.gateway.deleteRoom(roomId);
}

async function broadcastParticipants(d: RoomDeps, roomId: string) {
  const active = await activeParticipants(d.db, roomId);
  await d.gateway.broadcast(roomId, { kind: "participants", participants: active.map(toParticipantDTO) });
}

/* ─────────────────────────── playback ─────────────────────────── */

export async function submitPlaybackIntent(
  d: RoomDeps,
  claims: SessionClaims | null,
  roomId: string,
  body: { baseVersion: number; intent: PlaybackIntent },
): Promise<{ accepted: boolean; reason?: string; state: PlaybackState; serverNowMs: number }> {
  const { me } = await authorize(d, claims, roomId);
  const nowMs = clock(d);

  const out = await d.db.transaction(async (tx) => {
    const [row] = await tx.select().from(playbackStates).where(eq(playbackStates.roomId, roomId)).for("update");
    const current = row ? toPlaybackState(row) : initialPlaybackState(nowMs);

    let durationSec: number | null = null;
    const mediaId = body.intent.type === "load" ? body.intent.mediaId : current.mediaId;
    if (mediaId) {
      const [item] = await tx
        .select()
        .from(queueItems)
        .where(and(eq(queueItems.id, mediaId), eq(queueItems.roomId, roomId)));
      if (!item) throw new AppError("bad_request", "That item isn’t in this room’s queue.");
      durationSec = item.durationSec;
    }

    const res = applyIntent(current, body.intent, { nowMs, actorId: me.id, baseVersion: body.baseVersion, durationSec });
    if (!res.ok) return { accepted: false, reason: res.reason, state: res.state };

    const s = res.state;
    const values = {
      mediaId: s.mediaId,
      status: s.status,
      positionSec: s.positionSec,
      rate: s.rate,
      updatedAtMs: s.updatedAtMs,
      version: s.version,
      updatedBy: s.updatedBy,
    };
    if (row) await tx.update(playbackStates).set(values).where(eq(playbackStates.roomId, roomId));
    else await tx.insert(playbackStates).values({ roomId, ...values });
    return { accepted: true, state: s };
  });

  if (out.accepted) await d.gateway.broadcast(roomId, { kind: "playback", state: out.state });
  // Starting a video closes the shared browser: one activity (and one bill) at a time.
  if (out.accepted && body.intent.type === "load" && body.intent.mediaId) {
    const [room] = await d.db.select().from(rooms).where(eq(rooms.id, roomId));
    if (room?.browserSessionId) await stopBrowser(d, claims, roomId).catch(() => {});
  }
  return { ...out, serverNowMs: nowMs };
}

/* ─────────────────────────── queue ─────────────────────────── */

async function listQueue(d: RoomDeps, roomId: string) {
  const rows = await d.db.select().from(queueItems).where(eq(queueItems.roomId, roomId)).orderBy(asc(queueItems.sortKey));
  return rows.map(toQueueDTO);
}

export const MAX_QUEUE = 100;

function titleFromUrl(u: string) {
  try {
    const url = new URL(u);
    const last = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "");
    return (last || url.hostname).slice(0, 120);
  } catch {
    return "Untitled";
  }
}

export async function addQueueItem(
  d: RoomDeps,
  claims: SessionClaims | null,
  roomId: string,
  body:
    | { kind: "url"; url: string; title?: string }
    | { kind: "youtube"; url: string }
    | { kind: "file"; fileName: string; fileSize: number; durationSec?: number | null; title?: string },
) {
  const { me } = await authorize(d, claims, roomId);
  let yt: { id: string; title: string; thumbnailUrl: string } | null = null;
  if (body.kind === "youtube") {
    const id = parseYouTubeId(body.url);
    if (!id) throw new AppError("bad_request", "That doesn’t look like a YouTube video link.");
    if (!d.youtube) throw new AppError("media_unavailable", "YouTube isn’t available right now.");
    yt = await d.youtube.lookup(id);
  }
  const item = await d.db.transaction(async (tx) => {
    await tx.select({ id: rooms.id }).from(rooms).where(eq(rooms.id, roomId)).for("update");
    const [{ count, maxKey }] = (await tx
      .select({ count: sql<number>`count(*)::int`, maxKey: sql<number | null>`max(${queueItems.sortKey})` })
      .from(queueItems)
      .where(eq(queueItems.roomId, roomId))) as [{ count: number; maxKey: number | null }];
    if (count >= MAX_QUEUE) throw new AppError("bad_request", `The queue is limited to ${MAX_QUEUE} items.`);
    const [row] = await tx
      .insert(queueItems)
      .values(
        body.kind === "youtube"
          ? {
              roomId,
              kind: "youtube" as const,
              externalId: yt!.id,
              url: `https://www.youtube.com/watch?v=${yt!.id}`,
              title: yt!.title,
              thumbnailUrl: yt!.thumbnailUrl,
              sortKey: (maxKey ?? 0) + 1,
              addedBy: me.id,
            }
          : body.kind === "url"
          ? { roomId, kind: "url" as const, url: body.url, title: body.title ?? titleFromUrl(body.url), sortKey: (maxKey ?? 0) + 1, addedBy: me.id }
          : {
              roomId,
              kind: "file" as const,
              fileName: body.fileName,
              fileSize: body.fileSize,
              durationSec: body.durationSec ?? null,
              title: body.title ?? body.fileName.replace(/\.[a-z0-9]{2,5}$/i, ""),
              sortKey: (maxKey ?? 0) + 1,
              addedBy: me.id,
            },
      )
      .returning();
    return row!;
  });
  const items = await listQueue(d, roomId);
  await d.gateway.broadcast(roomId, { kind: "queue", items });
  return { item: toQueueDTO(item), items };
}

export async function removeQueueItem(d: RoomDeps, claims: SessionClaims | null, roomId: string, itemId: string) {
  await authorize(d, claims, roomId);
  await d.db.delete(queueItems).where(and(eq(queueItems.id, itemId), eq(queueItems.roomId, roomId)));
  const items = await listQueue(d, roomId);
  await d.gateway.broadcast(roomId, { kind: "queue", items });
  return { items };
}

export async function reorderQueue(d: RoomDeps, claims: SessionClaims | null, roomId: string, orderedIds: string[]) {
  await authorize(d, claims, roomId);
  await d.db.transaction(async (tx) => {
    await tx.select({ id: rooms.id }).from(rooms).where(eq(rooms.id, roomId)).for("update");
    const existing = await tx.select({ id: queueItems.id }).from(queueItems).where(eq(queueItems.roomId, roomId)).orderBy(asc(queueItems.sortKey));
    const known = new Set(existing.map((e) => e.id));
    // Keep any items the client didn't know about (added concurrently) at the end, in their current order.
    const order = [...orderedIds.filter((id) => known.has(id)), ...existing.map((e) => e.id).filter((id) => !orderedIds.includes(id))];
    for (let i = 0; i < order.length; i++) {
      await tx.update(queueItems).set({ sortKey: i + 1 }).where(and(eq(queueItems.id, order[i]!), eq(queueItems.roomId, roomId)));
    }
  });
  const items = await listQueue(d, roomId);
  await d.gateway.broadcast(roomId, { kind: "queue", items });
  return { items };
}

/* ─────────────────────────── cleanup ─────────────────────────── */

/**
 * Deletes rooms that expired, and ended rooms older than a day (tombstones).
 * Cascades to participants, queue, and playback state.
 */
export async function cleanupExpiredRooms(d: RoomDeps) {
  const nowMs = clock(d);
  const expired = await d.db
    .select({ id: rooms.id, browserSessionId: rooms.browserSessionId })
    .from(rooms)
    .where(or(lt(rooms.expiresAt, new Date(nowMs)), and(eq(rooms.status, "ended"), lt(rooms.endedAt, new Date(nowMs - 24 * 3600_000)))));
  for (const r of expired) {
    if (r.browserSessionId && d.browser) await d.browser.stop(r.browserSessionId);
    await d.gateway.broadcast(r.id, { kind: "room-ended" });
    await d.gateway.deleteRoom(r.id);
  }
  if (expired.length) {
    await d.db.delete(rooms).where(inArray(rooms.id, expired.map((r) => r.id)));
  }
  return { deleted: expired.length };
}

/* ─────────────────────────── shared browser ─────────────────────────── */

export function browserState(room: Room): BrowserStateDTO {
  return {
    active: !!room.browserSessionId,
    startedBy: room.browserStartedBy,
    startedAt: room.browserStartedAt?.toISOString() ?? null,
  };
}

/**
 * Start (or join) the room's shared browser. Starting it stops any synced
 * video so there's one thing on screen — and one bill — at a time.
 */
export async function startBrowser(d: RoomDeps, claims: SessionClaims | null, roomId: string, startUrl?: string, profile?: string, region?: "NA" | "EU" | "AS") {
  const { room, me } = await authorize(d, claims, roomId);
  if (!d.browser) throw new AppError("media_unavailable", "The shared browser isn’t enabled on this server.");
  if (room.browserSessionId && room.browserEmbedEnc) {
    return { embedUrl: decryptString(room.browserEmbedEnc, d.secret), browser: browserState(room), profileId: null as string | null };
  }
  const session = await d.browser.start({ roomId, startUrl: startUrl ?? "https://www.youtube.com", region: region ?? d.browserRegion ?? "AS", profile });
  const nowMs = clock(d);
  const [updated] = await d.db
    .update(rooms)
    .set({
      browserSessionId: session.sessionId,
      browserEmbedEnc: encryptString(session.embedUrl, d.secret),
      browserStartedAt: new Date(nowMs),
      browserStartedBy: me.id,
    })
    .where(eq(rooms.id, roomId))
    .returning();
  const state = browserState(updated!);
  // One activity at a time: unload any synced video.
  const [pb] = await d.db.select().from(playbackStates).where(eq(playbackStates.roomId, roomId));
  if (pb?.mediaId) {
    await submitPlaybackIntent(d, claims, roomId, { baseVersion: pb.version, intent: { type: "load", mediaId: null } }).catch(() => {});
  }
  await d.gateway.broadcast(roomId, { kind: "browser", browser: state });
  return { embedUrl: session.embedUrl, browser: state, profileId: session.profileId ?? null };
}

/** The embed URL is a bearer credential: only handed to authorized members, never broadcast. */
export async function getBrowser(d: RoomDeps, claims: SessionClaims | null, roomId: string) {
  const { room } = await authorize(d, claims, roomId);
  return { embedUrl: room.browserEmbedEnc ? decryptString(room.browserEmbedEnc, d.secret) : null, browser: browserState(room) };
}

export async function stopBrowser(d: RoomDeps, claims: SessionClaims | null, roomId: string) {
  const { room } = await authorize(d, claims, roomId);
  if (room.browserSessionId && d.browser) await d.browser.stop(room.browserSessionId);
  const [updated] = await d.db
    .update(rooms)
    .set({ browserSessionId: null, browserEmbedEnc: null, browserStartedAt: null, browserStartedBy: null })
    .where(eq(rooms.id, roomId))
    .returning();
  const state = browserState(updated!);
  await d.gateway.broadcast(roomId, { kind: "browser", browser: state });
  return { browser: state };
}

export async function searchYouTube(d: RoomDeps, claims: SessionClaims | null, roomId: string, q: string) {
  await authorize(d, claims, roomId);
  if (!d.youtube?.search) throw new AppError("media_unavailable", "Search isn’t enabled. Paste a YouTube link instead.");
  return { results: await d.youtube.search(q) };
}

export async function youtubeTrending(d: RoomDeps, claims: SessionClaims | null, roomId: string, category: string) {
  await authorize(d, claims, roomId);
  if (!d.youtube?.trending) throw new AppError("media_unavailable", "Browsing YouTube isn’t enabled. Paste a link instead.");
  return { results: await d.youtube.trending(category) };
}
