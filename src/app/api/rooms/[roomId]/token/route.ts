import { after, NextResponse } from "next/server";
import { env } from "@/server/env";
import { assertRoomId, deps, limit, readSession, route, type RoomCtx } from "@/server/http";
import { RULES } from "@/server/ratelimit";
import { issueMediaToken } from "@/server/rooms";

export const POST = route(async (_req, { params }: RoomCtx) => {
  const { roomId } = await params;
  assertRoomId(roomId);
  const claims = await readSession(roomId);
  await limit("token", claims?.pid ?? roomId, RULES.token);
  const { token, identity, ensure } = await issueMediaToken(deps(), claims, roomId);
  // Pre-creating the LiveKit room (with its 2-person cap) doesn't need to delay the response.
  after(() => ensure().catch(() => {}));
  return NextResponse.json({ token, identity, url: env().NEXT_PUBLIC_LIVEKIT_URL });
});
