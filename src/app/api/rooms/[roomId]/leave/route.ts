import { NextResponse } from "next/server";
import { assertRoomId, clearSessionCookie, deps, readSession, route, type RoomCtx } from "@/server/http";
import { leaveRoom } from "@/server/rooms";

export const POST = route(async (_req, { params }: RoomCtx) => {
  const { roomId } = await params;
  assertRoomId(roomId);
  const r = await leaveRoom(deps(), await readSession(roomId), roomId);
  const res = NextResponse.json(r);
  if (r.released) clearSessionCookie(res, roomId);
  return res;
});
