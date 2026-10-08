import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  iconOnly?: boolean;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-on-accent shadow-accent hover:bg-accent-hover disabled:bg-violet-300 disabled:shadow-none",
  secondary:
    "bg-surface text-ink ring-1 ring-inset ring-line-strong shadow-xs hover:bg-subtle disabled:text-ink-3",
  ghost: "text-ink-2 hover:bg-hover hover:text-ink disabled:text-ink-3",
  danger:
    "bg-surface text-rose-700 ring-1 ring-inset ring-rose-200 shadow-xs hover:bg-rose-50 disabled:text-ink-3 disabled:ring-line",
  success:
    "bg-emerald-600 text-white shadow-[0_1px_2px_rgb(4_120_87/0.3),inset_0_1px_0_rgb(255_255_255/0.12)] hover:bg-emerald-700 disabled:bg-emerald-300 disabled:shadow-none",
};

const sizes: Record<Size, string> = {
  sm: "h-7 px-2.5 text-xs gap-1.5 rounded-md",
  md: "h-9 px-3.5 text-sm gap-2 rounded-lg",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", iconOnly, className, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        iconOnly && (size === "sm" ? "w-7 px-0" : "w-9 px-0"),
        className,
      )}
      {...props}
    />
  );
});
