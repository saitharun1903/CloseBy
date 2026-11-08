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
          className="z-[60] flex items-center gap-2 rounded-sm bg-paper px-2 py-1 text-[12px] font-medium text-ink-950 shadow-float data-[state=delayed-open]:animate-fade-in"
        >
          {label}
          {shortcut && <kbd className="rounded-xs bg-ink-950/10 px-1 font-mono text-[11px] text-ink-950/70">{shortcut}</kbd>}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
