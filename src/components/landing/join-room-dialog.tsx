"use client";
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FieldError, Input, Label } from "@/components/ui/input";

const ROOM_RE = /\/r\/([2-9a-hjkmnp-z]{4}-[2-9a-hjkmnp-z]{4}-[2-9a-hjkmnp-z]{4})/;

/** Parses a pasted invite link. The invite token lives in the URL fragment. */
export function parseInvite(input: string): { roomId: string; invite: string | null } | null {
  const s = input.trim();
  const m = s.match(ROOM_RE);
  if (!m) return null;
  const inv = s.match(/[#&]invite=([A-Za-z0-9_-]{20,128})/);
  return { roomId: m[1]!, invite: inv?.[1] ?? null };
}

export function JoinRoomDialog({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseInvite(value);
    if (!parsed) return setError("Paste the full invite link you were sent — it starts with this site’s address and contains /r/.");
    router.push(`/r/${parsed.roomId}${parsed.invite ? `#invite=${parsed.invite}` : ""}`);
  }

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent title="Join a room" description="Paste the invite link someone sent you.">
        <form onSubmit={submit} noValidate>
          <Label htmlFor="join-link">Invite link</Label>
          <Input
            id="join-link"
            autoFocus
            spellCheck={false}
            autoComplete="off"
            placeholder="https://…/r/xxxx-xxxx-xxxx#invite=…"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            aria-invalid={!!error}
            className="font-mono text-[13px]"
          />
          <FieldError>{error}</FieldError>
          <Button type="submit" variant="primary" size="lg" className="mt-6 w-full">
            Continue <ArrowRight />
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
