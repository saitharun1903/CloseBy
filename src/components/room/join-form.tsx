"use client";
import { ArrowRight, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { api, ApiRequestError } from "@/lib/api";
import { loadName, saveName } from "@/lib/prefs";
import { describe } from "./room-gate";
import { LoadingScreen, MessageScreen, Screen } from "./screens";

interface Preview {
  hostName: string | null;
  requiresPin: boolean;
  seatsTaken: number;
  maxParticipants: number;
  alreadyMember: boolean;
}

export function JoinForm({ roomId, invite, onJoined }: { roomId: string; invite: string; onJoined: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [fatal, setFatal] = useState<{ title: string; body: string } | null>(null);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field?: "name" | "pin"; message: string } | null>(null);

  useEffect(() => {
    setName(loadName());
    api<Preview>(`/api/rooms/${roomId}/preview`, { body: { inviteToken: invite } })
      .then((p) => (p.alreadyMember ? onJoined() : setPreview(p)))
      .catch((e: ApiRequestError) =>
        setFatal(e.code === "invalid_invite" ? { title: "This invite isn’t valid", body: "The link may have been copied incompletely. Ask for a fresh one." } : describe(e)),
      );
  }, [roomId, invite, onJoined]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError({ field: "name", message: "Add a name so they know it’s you." });
    if (preview?.requiresPin && !pin) return setError({ field: "pin", message: "Enter the room PIN." });
    setBusy(true);
    try {
      await api(`/api/rooms/${roomId}/join`, { body: { inviteToken: invite, displayName: name.trim(), pin: pin || undefined } });
      saveName(name.trim());
      history.replaceState(null, "", window.location.pathname);
      onJoined();
    } catch (err) {
      const e = err as ApiRequestError;
      setBusy(false);
      if (e.code === "invalid_pin" || e.code === "pin_required") return setError({ field: "pin", message: e.message });
      if (e.code === "too_many_attempts") return setError({ field: "pin", message: e.message });
      if (e.code === "room_full")
        return setFatal({ title: "This room is full", body: "Closeby rooms are for two, and both seats are taken. If that’s a mistake, ask the host to send a new room link." });
      if (["room_ended", "room_expired", "not_found", "invalid_invite"].includes(e.code)) return setFatal(describe(e));
      setError({ message: e.message });
    }
  }

  if (fatal) return <MessageScreen title={fatal.title} body={fatal.body} />;
  if (!preview) return <LoadingScreen label="Checking your invite…" />;

  const full = preview.seatsTaken >= preview.maxParticipants;
  return (
    <Screen>
      <form onSubmit={submit} noValidate className="animate-fade-in">
        <p className="inline-flex items-center gap-2 rounded-full bg-white/[0.07] px-3 py-1 text-[13px] font-medium text-paper-dim">
          <span className="size-1.5 rounded-full bg-ok" /> You’re invited
        </p>
        <h1 className="mt-5 font-serif text-[44px] font-normal leading-[0.98] tracking-[-0.015em]">{preview.hostName ? `${preview.hostName} invited you` : "Join the room"}</h1>
        <p className="mt-3 text-paper-dim">
          A private room for two. You’ll check your camera and microphone before anyone sees or hears you.
        </p>
        {full && (
          <p className="mt-4 rounded-md border hairline bg-ink-850 px-3 py-2.5 text-[13px] text-paper-dim">
            Both seats look taken right now. If someone just left, you may still be able to join.
          </p>
        )}

        <div className="mt-8">
          <Label htmlFor="join-name">Your name</Label>
          <Input
            id="join-name"
            autoFocus
            autoComplete="nickname"
            maxLength={32}
            placeholder="e.g. Sam"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={error?.field === "name"}
          />
          {error?.field === "name" && <FieldError>{error.message}</FieldError>}
        </div>

        {preview.requiresPin && (
          <div className="mt-4">
            <Label htmlFor="join-pin" className="flex items-center gap-1.5">
              <Lock className="size-3.5" /> Room PIN
            </Label>
            <Input
              id="join-pin"
              inputMode="numeric"
              autoComplete="off"
              maxLength={8}
              placeholder="Ask your host"
              className="font-mono tracking-[0.3em]"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              aria-invalid={error?.field === "pin"}
            />
            {error?.field === "pin" && <FieldError>{error.message}</FieldError>}
          </div>
        )}
        {error && !error.field && <FieldError>{error.message}</FieldError>}

        <Button type="submit" variant="primary" size="lg" className="mt-7 w-full" disabled={busy} data-testid="join-submit">
          {busy ? "Joining…" : "Continue"} {!busy && <ArrowRight />}
        </Button>
      </form>
    </Screen>
  );
}
