"use client";
import * as P from "@radix-ui/react-popover";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverAnchor = P.Anchor;
export const PopoverClose = P.Close;

export function PopoverContent({ className, sideOffset = 10, ...props }: ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn(
          "z-50 rounded-lg border hairline bg-ink-850 p-3 text-sm text-paper shadow-float outline-none",
          "data-[state=open]:animate-fade-in",
          className,
        )}
        {...props}
      />
    </P.Portal>
  );
}
