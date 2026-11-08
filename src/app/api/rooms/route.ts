import { NextResponse } from "next/server";
import { createRoomBody } from "@/lib/protocol";
import { clientIp, deps, limit, readJson, route, setSessionCookie } from "@/server/http";
import { RULES } from "@/server/ratelimit";
import { createRoom } from "@/server/rooms";

export const POST = route(async (req) => {
  await limit("create", await clientIp(), RULES.createRoom);
  const body = await readJson(req, createRoomBody);
  const r = await createRoom(deps(), body);
  const res = NextResponse.json({ roomId: r.roomId, inviteUrl: r.inviteUrl, expiresAt: r.expiresAt.toISOString() }, { status: 201 });
  await setSessionCookie(res, r.claims, r.expiresAt);
  return res;
});
