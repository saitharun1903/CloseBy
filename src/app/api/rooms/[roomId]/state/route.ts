import { NextResponse } from "next/server";
import { assertRoomId, deps, readSession, route, type RoomCtx } from "@/server/http";
import { getRoomState } from "@/server/rooms";

export const GET = route(async (_req, { params }: RoomCtx) => {
  const { roomId } = await params;
  assertRoomId(roomId);
  return NextResponse.json(await getRoomState(deps(), await readSession(roomId), roomId));
});
