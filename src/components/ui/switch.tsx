"use client";
import * as S from "@radix-ui/react-switch";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Switch({ className, ...props }: ComponentProps<typeof S.Root>) {
  return (
    <S.Root
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full bg-ink-600 transition-colors data-[state=checked]:bg-lamp",
        className,
      )}
      {...props}
    >
      <S.Thumb className="block size-4 translate-x-0.5 rounded-full bg-paper shadow transition-transform data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-lamp-ink" />
    </S.Root>
  );
}
