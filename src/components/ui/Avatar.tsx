import { AVATAR_TONES, TONE } from "@/design/tones";
import { cn } from "@/lib/cn";

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function initials(name: string) {
  const parts = name.replace(/\b(Al|El)-/g, "").split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const sizes = {
    xs: "size-5 text-[9px]",
    sm: "size-7 text-[10.5px]",
    md: "size-8 text-[11px]",
    lg: "size-11 text-sm",
    xl: "size-14 text-base",
  };
  const tone = AVATAR_TONES[hash(name) % AVATAR_TONES.length];
  return (
    <span
      aria-hidden
      className={cn(
        "ltr-data inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-2 ring-surface",
        TONE[tone].chip,
        sizes[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
