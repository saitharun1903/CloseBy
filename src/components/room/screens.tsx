"use client";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

/** Calm full-page frame for pre-room and end states. */
export function Screen({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-[-300px] h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(227_166_100/0.07),transparent)]" />
      <header className="relative px-5 pt-[calc(var(--safe-top)+20px)] sm:px-8">
        <Link href="/" aria-label="Closeby home" className="inline-block">
          <Logo />
        </Link>
      </header>
      <main className={`relative mx-auto flex w-full flex-1 flex-col justify-center px-5 py-10 sm:px-8 ${wide ? "max-w-[980px]" : "max-w-[440px]"}`}>{children}</main>
    </div>
  );
}

export function MessageScreen({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <Screen>
      <div className="animate-fade-in text-center" role="status">
        <h1 className="font-display text-[40px] leading-[1.05] tracking-[-0.01em]">{title}</h1>
        <p className="mx-auto mt-3 max-w-[360px] text-paper-dim">{body}</p>
        <div className="mt-8 flex justify-center gap-3">
          {action ?? (
            <Button asChild>
              <Link href="/">Back to Closeby</Link>
            </Button>
          )}
        </div>
      </div>
    </Screen>
  );
}

export function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="grid min-h-dvh place-items-center" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-4">
        <div className="flex gap-1.5" aria-hidden>
          {[0, 1].map((i) => (
            <span key={i} className="size-3 rounded-full border-2 border-paper/70 animate-breathe" style={{ animationDelay: `${i * 0.4}s` }} />
          ))}
        </div>
        <p className="text-sm text-paper-dim">{label}</p>
      </div>
    </div>
  );
}
