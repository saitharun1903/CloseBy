import { NextResponse } from "next/server";
import { createRoomBody } from "@/lib/protocol";
import { clientIp, deps, limit, readJson, route, setSessionCookie } from "@/server/http";
import { RULES } from "@/server/ratelimit";
import { cleanupExpiredRooms, createRoom } from "@/server/rooms";

export const POST = route(async (req) => {
  await limit("create", await clientIp(), RULES.createRoom);
  const body = await readJson(req, createRoomBody);
  const r = await createRoom(deps(), body);
  // Opportunistic cleanup keeps expired rooms from lingering even if the cron runs rarely.
  await cleanupExpiredRooms(deps()).catch((e) => console.warn("[cleanup]", e?.message ?? e));
  const res = NextResponse.json({ roomId: r.roomId, inviteUrl: r.inviteUrl, expiresAt: r.expiresAt.toISOString() }, { status: 201 });
  await setSessionCookie(res, r.claims, r.expiresAt);
  return res;
});
