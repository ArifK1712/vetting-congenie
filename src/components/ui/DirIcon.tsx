import type { LucideIcon, LucideProps } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Directional icons (chevrons, arrows) point "forward" in reading order.
 * Write them for LTR; they are mirrored automatically in RTL.
 * Non-directional icons (check, clock, shield) should not use this.
 */
export function DirIcon({ icon: Icon, className, ...props }: LucideProps & { icon: LucideIcon }) {
  return <Icon className={cn("rtl:-scale-x-100", className)} {...props} />;
}
