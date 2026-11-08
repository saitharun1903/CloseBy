import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-12 w-full rounded-md border border-transparent bg-white/[0.07] px-4 text-[15px] text-paper placeholder:text-paper-faint",
      "transition-[border-color,box-shadow] duration-150 outline-none focus:bg-white/[0.09] focus:border-lamp/70 focus:shadow-[0_0_0_4px_rgb(10_132_255/0.18)]",
      "aria-[invalid=true]:border-danger/70",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-2 block text-[13px] font-medium text-paper-dim", className)} {...props} />;
}

export function FieldError({ children, id }: { children?: React.ReactNode; id?: string }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-[13px] text-danger">
      {children}
    </p>
  );
}
