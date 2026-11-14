"use client";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

/** Calm full-page frame for pre-room and end states. */
export function Screen({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-clip">
      {/* Projector light and film grain, as on the landing page. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[900px] overflow-hidden">
        <div className="absolute left-1/2 top-[-120px] h-[800px] w-[1200px] -translate-x-1/2 animate-flicker bg-[conic-gradient(from_180deg_at_50%_0%,transparent_160deg,rgb(255_179_107/0.1)_172deg,rgb(255_211_161/0.16)_180deg,rgb(255_179_107/0.1)_188deg,transparent_200deg)] blur-2xl" />
        <div className="absolute left-1/2 top-[-300px] h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(255_179_107/0.14),transparent)]" />
      </div>
      <div aria-hidden className="grain pointer-events-none fixed inset-0 z-50 opacity-[0.06] mix-blend-overlay" />
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
        <h1 className="font-serif text-[40px] font-normal leading-[1.02] tracking-[-0.015em]">{title}</h1>
        <p className="mx-auto mt-3 max-w-[380px] text-[16px] leading-relaxed text-paper-dim">{body}</p>
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
            <span key={i} className="size-3.5 rounded-full border-2 border-white/80 animate-breathe" style={{ animationDelay: `${i * 0.4}s` }} />
          ))}
        </div>
        <p className="text-sm text-paper-dim">{label}</p>
      </div>
    </div>
  );
}
