"use client";
import * as S from "@radix-ui/react-switch";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Switch({ className, ...props }: ComponentProps<typeof S.Root>) {
  return (
    <S.Root
      className={cn(
        "relative h-[22px] w-10 shrink-0 rounded-full bg-ink-600 transition-colors data-[state=checked]:bg-ok",
        className,
      )}
      {...props}
    >
      <S.Thumb className="block size-[18px] translate-x-0.5 rounded-full bg-paper shadow transition-transform data-[state=checked]:translate-x-5 data-[state=checked]:bg-white" />
    </S.Root>
  );
}
