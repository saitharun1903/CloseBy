"use client";
import { ArrowRight, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FieldError, Input, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api, ApiRequestError } from "@/lib/api";
import { loadName, saveName } from "@/lib/prefs";

export function CreateRoomDialog({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [usePin, setUsePin] = useState(false);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const displayName = name.trim();
    if (!displayName) return setError({ field: "displayName", message: "What should your guest call you?" });
    if (usePin && !/^\d{4,8}$/.test(pin)) return setError({ field: "pin", message: "Use 4–8 digits." });
    setBusy(true);
    try {
      const r = await api<{ roomId: string }>("/api/rooms", { body: { displayName, pin: usePin ? pin : undefined } });
      saveName(displayName);
      router.push(`/r/${r.roomId}`);
    } catch (err) {
      const e = err as ApiRequestError;
      setError({ field: (e.body as { error?: { field?: string } })?.error?.field, message: e.message });
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o && !name) setName(loadName());
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent title="Open a private room" description="You’ll get a link to send to one person. No account needed.">
        <form onSubmit={submit} noValidate>
          <Label htmlFor="create-name">Your name</Label>
          <Input
            id="create-name"
            autoFocus
            autoComplete="nickname"
            maxLength={32}
            placeholder="e.g. Maya"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={error?.field === "displayName"}
          />
          {error?.field === "displayName" && <FieldError>{error.message}</FieldError>}

          <div className="mt-5 rounded-md border hairline bg-ink-850 p-3.5">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="create-pin-toggle" className="flex items-start gap-2.5">
                <Lock className="mt-0.5 size-4 text-paper-faint" />
                <span>
                  <span className="block text-sm font-medium text-paper">Add a PIN</span>
                  <span className="block text-[13px] text-paper-dim">Your guest needs the link and the PIN.</span>
                </span>
              </label>
              <Switch id="create-pin-toggle" checked={usePin} onCheckedChange={setUsePin} />
            </div>
            {usePin && (
              <div className="mt-3">
                <Input
                  aria-label="Room PIN"
                  inputMode="numeric"
                  autoComplete="off"
                  pattern="\d*"
                  maxLength={8}
                  placeholder="4–8 digits"
                  className="font-mono tracking-[0.3em]"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  aria-invalid={error?.field === "pin"}
                />
                {error?.field === "pin" && <FieldError>{error.message}</FieldError>}
              </div>
            )}
          </div>

          {error && !error.field && <FieldError>{error.message}</FieldError>}

          <Button type="submit" variant="primary" size="lg" className="mt-6 w-full" disabled={busy}>
            {busy ? "Opening room…" : "Create room"}
            {!busy && <ArrowRight />}
          </Button>
          <p className="mt-3 text-center text-[12px] text-paper-faint">Rooms hold two people and close automatically after 12 hours.</p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
