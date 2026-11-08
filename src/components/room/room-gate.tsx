"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api, ApiRequestError } from "@/lib/api";
import type { RoomStateDTO } from "@/lib/protocol";
import type { InitialMedia } from "./controller";
import { JoinForm } from "./join-form";
import { Lobby } from "./lobby";
import { RoomView } from "./room-view";
import { LoadingScreen, MessageScreen } from "./screens";

type Phase =
  | { kind: "checking" }
  | { kind: "invite"; invite: string }
  | { kind: "lobby"; state: RoomStateDTO }
  | { kind: "room"; state: RoomStateDTO; media: InitialMedia }
  | { kind: "left"; state: RoomStateDTO; seatKept: boolean }
  | { kind: "message"; title: string; body: string };

const ROOM_RE = /^[2-9a-hjkmnp-z]{4}-[2-9a-hjkmnp-z]{4}-[2-9a-hjkmnp-z]{4}$/;

function readInvite(): string | null {
  const m = window.location.hash.match(/invite=([A-Za-z0-9_-]{20,128})/);
  return m?.[1] ?? null;
}

export function RoomGate({ roomId }: { roomId: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: "checking" });

  const check = useCallback(async () => {
    if (!ROOM_RE.test(roomId)) {
      setPhase({ kind: "message", title: "Room not found", body: "Check the link you were sent — it may be incomplete." });
      return;
    }
    try {
      const state = await api<RoomStateDTO>(`/api/rooms/${roomId}/state`);
      // Already a member: drop the invite from the address bar so it isn't shared by accident.
      if (window.location.hash) history.replaceState(null, "", window.location.pathname);
      setPhase({ kind: "lobby", state });
    } catch (e) {
      const err = e as ApiRequestError;
      const invite = readInvite();
      if ((err.code === "unauthorized" || err.code === "seat_released") && invite) return setPhase({ kind: "invite", invite });
      setPhase({ kind: "message", ...describe(err) });
    }
  }, [roomId]);

  useEffect(() => {
    void check();
  }, [check]);

  switch (phase.kind) {
    case "checking":
      return <LoadingScreen label="Opening your room…" />;
    case "invite":
      return <JoinForm roomId={roomId} invite={phase.invite} onJoined={check} />;
    case "lobby":
      return <Lobby state={phase.state} onJoin={(media) => setPhase({ kind: "room", state: phase.state, media })} />;
    case "room":
      return (
        <RoomView
          initial={phase.state}
          media={phase.media}
          onLeft={(seatKept) => setPhase({ kind: "left", state: phase.state, seatKept })}
        />
      );
    case "left":
      return (
        <MessageScreen
          title="You left the room"
          body={phase.seatKept ? "Your seat is saved until the room expires — come back any time." : "Your seat has been freed."}
          action={
            <>
              {phase.seatKept && (
                <Button variant="primary" onClick={() => void check()}>
                  Rejoin
                </Button>
              )}
              <Button asChild variant="secondary">
                <Link href="/">Home</Link>
              </Button>
            </>
          }
        />
      );
    case "message":
      return <MessageScreen title={phase.title} body={phase.body} />;
  }
}

export function describe(err: ApiRequestError): { title: string; body: string } {
  switch (err.code) {
    case "room_ended":
      return { title: "This room has ended", body: "The person who created it closed it. Start your own any time." };
    case "room_expired":
      return { title: "This room has expired", body: "Rooms close 12 hours after they’re created, and everything in them is deleted." };
    case "not_found":
      return { title: "Room not found", body: "It may have expired, or the link is incomplete." };
    case "seat_released":
      return {
        title: "Your seat was released",
        body: "You left this room, or another guest joined after you’d been away. Ask for the invite link to try again.",
      };
    case "unauthorized":
      return { title: "You need an invite", body: "This room is private. Open the full invite link you were sent — it includes a secret part after the #." };
    case "network":
      return { title: "You’re offline", body: err.message };
    default:
      return { title: "Something went wrong", body: err.message };
  }
}
