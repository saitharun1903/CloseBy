import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Server clock for NTP-style offset estimation (see lib/playback.ts estimateClockOffset). */
export function GET() {
  return NextResponse.json({ now: Date.now() });
}
