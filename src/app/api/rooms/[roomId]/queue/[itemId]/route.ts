import { NextResponse } from "next/server";
import { z } from "zod";
import { assertRoomId, deps, limit, readSession, route } from "@/server/http";
import { RULES } from "@/server/ratelimit";
import { removeQueueItem } from "@/server/rooms";

export const DELETE = route(async (_req, { params }: { params: Promise<{ roomId: string; itemId: string }> }) => {
  const { roomId, itemId } = await params;
  assertRoomId(roomId);
  z.string().uuid().parse(itemId);
  const claims = await readSession(roomId);
  await limit("queue", claims?.pid ?? roomId, RULES.queue);
  return NextResponse.json(await removeQueueItem(deps(), claims, roomId, itemId));
});
