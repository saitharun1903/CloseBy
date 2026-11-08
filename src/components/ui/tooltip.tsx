"use client";
import * as T from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

export const TooltipProvider = T.Provider;

export function Tooltip({ label, children, side = "top", shortcut }: { label: ReactNode; children: ReactNode; side?: "top" | "bottom" | "left" | "right"; shortcut?: string }) {
  return (
    <T.Root delayDuration={350}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={8}
          collisionPadding={8}
          className="z-[60] flex items-center gap-2 rounded-md bg-ink-750/95 px-2.5 py-1.5 text-[12px] font-medium text-paper shadow-float backdrop-blur data-[state=delayed-open]:animate-fade-in"
        >
          {label}
          {shortcut && <kbd className="rounded-xs bg-white/10 px-1 font-mono text-[11px] text-paper-dim">{shortcut}</kbd>}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
