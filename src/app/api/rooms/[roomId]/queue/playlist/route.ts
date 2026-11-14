import { NextResponse } from "next/server";
import { z } from "zod";
import { assertRoomId, deps, limit, readJson, readSession, route, type RoomCtx } from "@/server/http";
import { RULES } from "@/server/ratelimit";
import { addYouTubePlaylist } from "@/server/rooms";

const body = z.object({ url: z.string().trim().min(10).max(500) });

/** Add a whole YouTube playlist to Up next. */
export const POST = route(async (req, { params }: RoomCtx) => {
  const { roomId } = await params;
  assertRoomId(roomId);
  const claims = await readSession(roomId);
  await limit("search", claims?.pid ?? roomId, RULES.search);
  const b = await readJson(req, body);
  return NextResponse.json(await addYouTubePlaylist(deps(), claims, roomId, b.url), { status: 201 });
});
