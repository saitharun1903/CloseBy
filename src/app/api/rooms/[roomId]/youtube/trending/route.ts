import { NextResponse } from "next/server";
import { z } from "zod";
import { assertRoomId, deps, limit, readSession, route, type RoomCtx } from "@/server/http";
import { RULES } from "@/server/ratelimit";
import { youtubeTrending } from "@/server/rooms";
import { YT_CATEGORIES } from "@/server/youtube";

export const GET = route(async (req, { params }: RoomCtx) => {
  const { roomId } = await params;
  assertRoomId(roomId);
  const claims = await readSession(roomId);
  await limit("search", claims?.pid ?? roomId, RULES.search);
  const category = z
    .string()
    .refine((c) => c in YT_CATEGORIES, "Unknown category")
    .parse(new URL(req.url).searchParams.get("category") ?? "trending");
  return NextResponse.json(await youtubeTrending(deps(), claims, roomId, category));
});
