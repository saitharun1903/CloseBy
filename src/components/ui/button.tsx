"use client";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background-color,color,box-shadow,transform,opacity] duration-150 ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-lamp text-lamp-ink hover:bg-lamp-bright shadow-[0_1px_0_0_rgb(255_255_255/0.25)_inset]",
        secondary: "bg-ink-800 text-paper hover:bg-ink-750 shadow-ring",
        ghost: "text-paper-dim hover:text-paper hover:bg-ink-800",
        outline: "border hairline-strong text-paper hover:bg-ink-850",
        danger: "bg-danger text-ink-950 hover:bg-[#e8806a]",
        "danger-ghost": "text-danger hover:bg-danger/10",
      },
      size: {
        sm: "h-8 rounded-sm px-3 text-[13px] [&_svg]:size-3.5",
        md: "h-10 rounded-md px-4 text-sm [&_svg]:size-4",
        lg: "h-12 rounded-md px-5 text-[15px] [&_svg]:size-[18px]",
        icon: "size-9 rounded-md [&_svg]:size-4",
        "icon-sm": "size-8 rounded-sm [&_svg]:size-4",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, type = "button", asChild, ...props }, ref) =>
  asChild ? (
    <Slot ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ) : (
    <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";
