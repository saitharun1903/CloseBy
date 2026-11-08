import { NextResponse } from "next/server";
import { joinRoomBody } from "@/lib/protocol";
import { AppError } from "@/server/errors";
import { assertRoomId, clientIp, deps, limit, readJson, readSession, route, setSessionCookie, type RoomCtx } from "@/server/http";
import { hit, peek, RULES } from "@/server/ratelimit";
import { authorize, joinRoom } from "@/server/rooms";

const ROOM_PIN_RULE = { limit: 20, windowSec: 900 };

export const POST = route(async (req, { params }: RoomCtx) => {
  const { roomId } = await params;
  assertRoomId(roomId);
  const ip = await clientIp();
  await limit("join", `${roomId}:${ip}`, RULES.join);
  const body = await readJson(req, joinRoomBody);
  const d = deps();

  // Duplicate join from a browser that already holds a seat → reuse it.
  try {
    const { me } = await authorize(d, await readSession(roomId), roomId);
    return NextResponse.json({ roomId, participantId: me.id, rejoined: true });
  } catch {
    /* proceed with a fresh join */
  }

  // PIN brute-force protection: per IP and per room.
  const [perIp, perRoom] = await Promise.all([
    peek("pinfail", `${roomId}:${ip}`, RULES.pinFailure),
    peek("pinfail-room", roomId, ROOM_PIN_RULE),
  ]);
  if (!perIp.ok || !perRoom.ok) {
    throw new AppError("too_many_attempts", "Too many incorrect PIN attempts. Please wait a few minutes.", {
      retryAfterSec: Math.max(perIp.retryAfterSec, perRoom.retryAfterSec),
    });
  }

  try {
    const r = await joinRoom(d, roomId, body);
    const res = NextResponse.json({ roomId, participantId: r.claims.pid, rejoined: false }, { status: 201 });
    await setSessionCookie(res, r.claims, r.expiresAt);
    return res;
  } catch (e) {
    if (e instanceof AppError && e.code === "invalid_pin") {
      await Promise.all([hit("pinfail", `${roomId}:${ip}`, RULES.pinFailure), hit("pinfail-room", roomId, ROOM_PIN_RULE)]);
    }
    throw e;
  }
});
