import { NextResponse } from "next/server";
import { previewRoomBody } from "@/lib/protocol";
import { assertRoomId, clientIp, deps, limit, readJson, readSession, route, type RoomCtx } from "@/server/http";
import { RULES } from "@/server/ratelimit";
import { authorize, previewRoom } from "@/server/rooms";

/** Invite token travels in the POST body (never a query string) so it can't leak into logs. */
export const POST = route(async (req, { params }: RoomCtx) => {
  const { roomId } = await params;
  assertRoomId(roomId);
  await limit("preview", await clientIp(), RULES.preview);
  const { inviteToken } = await readJson(req, previewRoomBody);
  const preview = await previewRoom(deps(), roomId, inviteToken);
  // Tell the client if this browser already holds a seat (e.g. refresh, or host opening their own link).
  let alreadyMember = false;
  try {
    await authorize(deps(), await readSession(roomId), roomId);
    alreadyMember = true;
  } catch {
    /* not a member */
  }
  return NextResponse.json({ ...preview, alreadyMember });
});
