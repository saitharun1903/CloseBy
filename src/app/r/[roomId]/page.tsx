import type { Metadata } from "next";
import { RoomGate, type InitialCheck } from "@/components/room/room-gate";
import { AppError } from "@/server/errors";
import { deps, readSession } from "@/server/http";
import { ROOM_ID_RE } from "@/server/crypto";
import { getRoomState } from "@/server/rooms";

export const metadata: Metadata = { title: "Private room", robots: { index: false, follow: false } };

/**
 * Resolve membership while rendering, so the browser doesn't need a second
 * round trip after the page loads (it also wakes the database early).
 */
async function initialCheck(roomId: string): Promise<InitialCheck | null> {
  if (!ROOM_ID_RE.test(roomId)) return null;
  try {
    return { ok: true, state: await getRoomState(deps(), await readSession(roomId), roomId) };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, code: e.code, message: e.message, status: e.status };
    return null; // let the client retry
  }
}

export default async function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  return <RoomGate roomId={roomId} initial={await initialCheck(roomId)} />;
}
