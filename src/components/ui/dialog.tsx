"use client";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  children,
  title,
  description,
  className,
  hideClose,
}: {
  children: ReactNode;
  title: string;
  description?: ReactNode;
  className?: string;
  hideClose?: boolean;
}) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md data-[state=open]:animate-fade-in" />
      <D.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-32px)] max-w-[440px] -translate-x-1/2 -translate-y-1/2",
          "rounded-2xl border hairline bg-ink-850/95 p-7 shadow-float backdrop-blur-2xl data-[state=open]:animate-fade-in",
          "max-h-[calc(100dvh-32px)] overflow-y-auto scrollbar-quiet",
          className,
        )}
      >
        <D.Title className="font-serif text-[30px] font-normal leading-[1.05] tracking-[-0.01em] text-paper">{title}</D.Title>
        {description ? <D.Description className="mt-1.5 text-sm text-paper-dim">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
        <div className="mt-5">{children}</div>
        {!hideClose && (
          <D.Close
            className="absolute right-3 top-3 grid size-8 place-items-center rounded-sm text-paper-faint transition-colors hover:bg-ink-800 hover:text-paper"
            aria-label="Close"
          >
            <X className="size-4" />
          </D.Close>
        )}
      </D.Content>
    </D.Portal>
  );
}
