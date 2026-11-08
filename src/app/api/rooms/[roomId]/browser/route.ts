import { NextResponse } from "next/server";
import { startBrowserBody } from "@/lib/protocol";
import { assertRoomId, deps, limit, readJson, readSession, route, type RoomCtx } from "@/server/http";
import { RULES } from "@/server/ratelimit";
import { getBrowser, startBrowser, stopBrowser } from "@/server/rooms";

/** The embed URL is a credential, so it's only returned to authorized members. */
export const GET = route(async (_req, { params }: RoomCtx) => {
  const { roomId } = await params;
  assertRoomId(roomId);
  return NextResponse.json(await getBrowser(deps(), await readSession(roomId), roomId));
});

export const POST = route(async (req, { params }: RoomCtx) => {
  const { roomId } = await params;
  assertRoomId(roomId);
  const claims = await readSession(roomId);
  await limit("browser", claims?.pid ?? roomId, RULES.browser);
  const body = await readJson(req, startBrowserBody);
  return NextResponse.json(await startBrowser(deps(), claims, roomId, body.startUrl, body.profile, body.region));
});

export const DELETE = route(async (_req, { params }: RoomCtx) => {
  const { roomId } = await params;
  assertRoomId(roomId);
  return NextResponse.json(await stopBrowser(deps(), await readSession(roomId), roomId));
});
