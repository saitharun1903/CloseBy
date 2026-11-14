import { NextResponse } from "next/server";
import { z } from "zod";
import { assertRoomId, deps, limit, readSession, route, type RoomCtx } from "@/server/http";
import { RULES } from "@/server/ratelimit";
import { youtubeChapters } from "@/server/rooms";

/** Chapters of a YouTube video (from its description). */
export const GET = route(async (req, { params }: RoomCtx) => {
  const { roomId } = await params;
  assertRoomId(roomId);
  const claims = await readSession(roomId);
  await limit("generic", claims?.pid ?? roomId, RULES.generic);
  const v = z.string().regex(/^[A-Za-z0-9_-]{11}$/).parse(new URL(req.url).searchParams.get("v") ?? "");
  return NextResponse.json(await youtubeChapters(deps(), claims, roomId, v));
});
