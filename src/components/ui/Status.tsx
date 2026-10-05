"use client";

import { useTranslations } from "next-intl";
import { BADGE_STATUS_TONE, BADGE_TYPE_TONE, STATUS_TONE, TONE, type Tone } from "@/design/tones";
import type { BadgeStatus, RequestStatus } from "@/domain/types";
import { cn } from "@/lib/cn";

export function Pill({
  tone,
  children,
  size = "sm",
  dot = true,
  className,
}: {
  tone: Tone;
  children: React.ReactNode;
  size?: "sm" | "md";
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap ring-1 ring-inset",
        size === "sm" ? "h-[22px] px-2 text-xs" : "h-7 px-3 text-sm",
        TONE[tone].pill,
        className,
      )}
    >
      {dot && <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", TONE[tone].dot)} />}
      {children}
    </span>
  );
}

export function StatusLabel({ status, className }: { status: RequestStatus; className?: string }) {
  const t = useTranslations("status");
  return (
    <Pill tone={STATUS_TONE[status]} className={className}>
      {t(status)}
    </Pill>
  );
}

/** Larger status shown on the request header. */
export function StatusPill({ status }: { status: RequestStatus }) {
  const t = useTranslations("status");
  return (
    <Pill tone={STATUS_TONE[status]} size="md">
      {t(status)}
    </Pill>
  );
}

export function BadgeStatusLabel({ status }: { status: BadgeStatus }) {
  const t = useTranslations("badgeStatus");
  return <Pill tone={BADGE_STATUS_TONE[status]}>{t(status)}</Pill>;
}

/** Badge type as a small category chip with a stable colour. */
export function BadgeTypeChip({ id, label }: { id: string; label: string }) {
  const tone = BADGE_TYPE_TONE[id] ?? "slate";
  return (
    <span className={cn("inline-flex h-5 items-center rounded-md px-1.5 text-2xs font-semibold whitespace-nowrap", TONE[tone].chip)}>
      {label}
    </span>
  );
}
