import { NextResponse } from "next/server";
import { playbackIntentBody } from "@/lib/protocol";
import { assertRoomId, deps, limit, readJson, readSession, route, type RoomCtx } from "@/server/http";
import { RULES } from "@/server/ratelimit";
import { submitPlaybackIntent } from "@/server/rooms";

export const POST = route(async (req, { params }: RoomCtx) => {
  const { roomId } = await params;
  assertRoomId(roomId);
  const claims = await readSession(roomId);
  await limit("playback", claims?.pid ?? roomId, RULES.playback);
  const body = await readJson(req, playbackIntentBody);
  const r = await submitPlaybackIntent(deps(), claims, roomId, body);
  return NextResponse.json(r, { status: r.accepted ? 200 : 409 });
});
