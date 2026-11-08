import { NextResponse } from "next/server";
import { assertRoomId, clearSessionCookie, deps, readSession, route, type RoomCtx } from "@/server/http";
import { endRoom } from "@/server/rooms";

export const POST = route(async (_req, { params }: RoomCtx) => {
  const { roomId } = await params;
  assertRoomId(roomId);
  await endRoom(deps(), await readSession(roomId), roomId);
  const res = NextResponse.json({ ended: true });
  clearSessionCookie(res, roomId);
  return res;
});
