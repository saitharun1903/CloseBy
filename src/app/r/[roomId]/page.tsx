import type { Metadata } from "next";
import { RoomGate } from "@/components/room/room-gate";

export const metadata: Metadata = { title: "Private room", robots: { index: false, follow: false } };

export default async function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  return <RoomGate roomId={roomId} />;
}
