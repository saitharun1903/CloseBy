import { cn } from "@/lib/cn";

/** Two overlapping rings — two people — with the shared space between them lit. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 24" aria-hidden className={cn("h-5 w-auto", className)}>
      <circle cx="13" cy="12" r="9.25" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <circle cx="27" cy="12" r="9.25" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <path d="M20 5.95a9.25 9.25 0 0 1 0 12.1a9.25 9.25 0 0 1 0-12.1z" fill="var(--color-ok)" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-paper", className)}>
      <LogoMark />
      <span className="text-[19px] font-semibold tracking-[-0.03em]">Closeby</span>
    </span>
  );
}
