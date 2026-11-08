import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { WebhookReceiver } from "livekit-server-sdk";
import { getDb } from "@/server/db";
import { participants } from "@/server/db/schema";
import { env } from "@/server/env";

/**
 * Optional LiveKit webhook (configure in livekit.yaml → webhook.urls).
 * Keeps participants.last_seen_at fresh so stale guest seats can be reclaimed
 * promptly. Signature verified with the API secret.
 */
export async function POST(req: Request) {
  const e = env();
  const receiver = new WebhookReceiver(e.LIVEKIT_API_KEY, e.LIVEKIT_API_SECRET);
  let event;
  try {
    event = await receiver.receive(await req.text(), req.headers.get("authorization") ?? undefined);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  const identity = event.participant?.identity;
  const roomId = event.room?.name;
  if (identity && roomId && (event.event === "participant_joined" || event.event === "participant_left")) {
    if (/^[0-9a-f-]{36}$/.test(identity)) {
      await getDb()
        .update(participants)
        .set({ lastSeenAt: new Date() })
        .where(and(eq(participants.id, identity), eq(participants.roomId, roomId)));
    }
  }
  return NextResponse.json({ ok: true });
}
