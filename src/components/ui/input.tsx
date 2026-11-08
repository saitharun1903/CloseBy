import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-11 w-full rounded-md border hairline-strong bg-ink-900 px-3.5 text-[15px] text-paper placeholder:text-paper-ghost",
      "transition-[border-color,box-shadow] duration-150 outline-none focus:border-lamp/60 focus:shadow-[0_0_0_3px_rgb(227_166_100/0.14)]",
      "aria-[invalid=true]:border-danger/70",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-[13px] font-medium text-paper-dim", className)} {...props} />;
}

export function FieldError({ children, id }: { children?: React.ReactNode; id?: string }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-[13px] text-danger">
      {children}
    </p>
  );
}
