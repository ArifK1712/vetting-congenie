"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

/** Product mark: navy tile, white glyph, Spark Violet sparkle (inverted in dark mode) — brand guideline p.10. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8 shrink-0", className)} aria-hidden>
      <rect width="32" height="32" rx="9" style={{ fill: "var(--c-ink)" }} />
      <path d="M10 11l6 10 6-10" fill="none" style={{ stroke: "var(--c-ink-inverse)" }} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="22.5" cy="9.5" r="2.6" style={{ fill: "var(--c-accent)" }} />
    </svg>
  );
}

/** Mark + product name. `iconOnly` for narrow rails. */
export function Brand({ iconOnly, className }: { iconOnly?: boolean; className?: string }) {
  const tApp = useTranslations("app");
  return (
    <div className={cn("flex items-center gap-3", iconOnly && "justify-center", className)}>
      <LogoMark />
      {!iconOnly && (
        <div className="min-w-0 leading-tight">
          <p className="text-[15px] font-bold tracking-tight text-nav-strong">{tApp("name")}</p>
          <p className="truncate text-2xs text-nav-muted">{tApp("workspace")}</p>
        </div>
      )}
    </div>
  );
}
