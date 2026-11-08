"use client";
import { AnimatePresence, motion } from "motion/react";
import { CircleExclamationPoint, Check, Info, X } from "lucide-react";
import { create } from "zustand";
import { cn } from "@/lib/cn";

type Tone = "info" | "success" | "error";
interface Toast {
  id: number;
  tone: Tone;
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void };
  durationMs: number;
}

const useToasts = create<{ toasts: Toast[] }>(() => ({ toasts: [] }));
let seq = 0;

export function toast(t: { title: string; body?: string; tone?: Tone; action?: Toast["action"]; durationMs?: number; id?: number }) {
  const id = t.id ?? ++seq;
  const item: Toast = { id, tone: t.tone ?? "info", title: t.title, body: t.body, action: t.action, durationMs: t.durationMs ?? 4500 };
  useToasts.setState((s) => ({ toasts: [...s.toasts.filter((x) => x.id !== id), item].slice(-4) }));
  if (item.durationMs > 0) setTimeout(() => dismissToast(id), item.durationMs);
  return id;
}

export function dismissToast(id: number) {
  useToasts.setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
}

const ICON = { info: Info, success: Check, error: CircleExclamationPoint };

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-[calc(var(--safe-top)+12px)] z-[70] flex flex-col items-center gap-2 px-4"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = ICON[t.tone];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }}
              transition={{ type: "spring", stiffness: 500, damping: 38 }}
              className="pointer-events-auto flex w-full max-w-[420px] items-start gap-3 rounded-lg border hairline bg-ink-850/95 px-3.5 py-3 shadow-float backdrop-blur"
              role={t.tone === "error" ? "alert" : "status"}
            >
              <Icon className={cn("mt-0.5 size-4 shrink-0", t.tone === "error" ? "text-danger" : t.tone === "success" ? "text-ok" : "text-lamp")} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-paper">{t.title}</p>
                {t.body && <p className="mt-0.5 text-[13px] leading-snug text-paper-dim">{t.body}</p>}
              </div>
              {t.action && (
                <button
                  className="shrink-0 rounded-sm px-2 py-1 text-[13px] font-medium text-lamp hover:bg-lamp/10"
                  onClick={() => {
                    t.action!.onClick();
                    dismissToast(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              )}
              <button aria-label="Dismiss" onClick={() => dismissToast(t.id)} className="-mr-1 shrink-0 rounded-sm p-1 text-paper-faint hover:text-paper">
                <X className="size-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
