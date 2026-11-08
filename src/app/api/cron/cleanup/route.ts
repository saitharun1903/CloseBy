import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/server/env";
import { deps, errorResponse } from "@/server/http";
import { cleanupExpiredRooms } from "@/server/rooms";

/** Call periodically (e.g. every 10 min) with `Authorization: Bearer $CRON_SECRET`. */
export async function POST(req: Request) {
  const secret = env().CRON_SECRET;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || got.length !== secret.length || !timingSafeEqual(Buffer.from(got), Buffer.from(secret))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await cleanupExpiredRooms(deps()));
  } catch (e) {
    return errorResponse(e);
  }
}
