import { NextResponse } from "next/server";
import { z } from "zod";
import { assertRoomId, deps, limit, readSession, route, type RoomCtx } from "@/server/http";
import { RULES } from "@/server/ratelimit";
import { searchYouTube } from "@/server/rooms";

export const GET = route(async (req, { params }: RoomCtx) => {
  const { roomId } = await params;
  assertRoomId(roomId);
  const claims = await readSession(roomId);
  await limit("search", claims?.pid ?? roomId, RULES.search);
  const q = z.string().trim().min(1).max(100).parse(new URL(req.url).searchParams.get("q") ?? "");
  return NextResponse.json(await searchYouTube(deps(), claims, roomId, q));
});
