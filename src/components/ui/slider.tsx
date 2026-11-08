"use client";
import * as S from "@radix-ui/react-slider";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Slider({ className, "aria-label": ariaLabel, ...props }: ComponentProps<typeof S.Root> & { "aria-label": string }) {
  return (
    <S.Root className={cn("relative flex h-5 w-full touch-none select-none items-center", className)} {...props}>
      <S.Track className="relative h-[3px] grow overflow-hidden rounded-full bg-ink-600">
        <S.Range className="absolute h-full rounded-full bg-paper" />
      </S.Track>
      <S.Thumb
        aria-label={ariaLabel}
        className="block size-3.5 rounded-full bg-paper shadow-[0_1px_4px_rgb(0_0_0/0.5)] outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-lamp"
      />
    </S.Root>
  );
}
