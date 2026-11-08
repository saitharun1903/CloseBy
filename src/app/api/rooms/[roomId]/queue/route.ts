import { NextResponse } from "next/server";
import { addQueueItemBody, reorderQueueBody } from "@/lib/protocol";
import { assertRoomId, deps, limit, readJson, readSession, route, type RoomCtx } from "@/server/http";
import { RULES } from "@/server/ratelimit";
import { addQueueItem, reorderQueue } from "@/server/rooms";

export const POST = route(async (req, { params }: RoomCtx) => {
  const { roomId } = await params;
  assertRoomId(roomId);
  const claims = await readSession(roomId);
  await limit("queue", claims?.pid ?? roomId, RULES.queue);
  const body = await readJson(req, addQueueItemBody);
  return NextResponse.json(await addQueueItem(deps(), claims, roomId, body), { status: 201 });
});

export const PATCH = route(async (req, { params }: RoomCtx) => {
  const { roomId } = await params;
  assertRoomId(roomId);
  const claims = await readSession(roomId);
  await limit("queue", claims?.pid ?? roomId, RULES.queue);
  const body = await readJson(req, reorderQueueBody);
  return NextResponse.json(await reorderQueue(deps(), claims, roomId, body.orderedIds));
});
