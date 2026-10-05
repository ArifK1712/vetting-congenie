"use client";

import { Clock, CornerDownLeft, Eye, Gauge, ShieldAlert, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/Avatar";
import type { ProgressStep } from "@/domain/progress";
import type { ScreeningDisplay } from "@/domain/queue";
import type { Database, WatchlistLevel } from "@/domain/types";
import { TONE } from "@/design/tones";
import { useFormat } from "@/i18n/format";
import { cn } from "@/lib/cn";

export function ScreeningIndicator({
  screening,
  level,
  compact,
}: {
  screening: ScreeningDisplay;
  level: WatchlistLevel | null;
  compact?: boolean;
}) {
  const t = useTranslations("screening");
  if (screening === "clear") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-3">
        <ShieldCheck className="size-3.5 text-emerald-500" strokeWidth={2} />
        {t("clear")}
      </span>
    );
  }
  if (screening === "watchlist") {
    const levelText = t(`level.${level ?? "low"}`);
    return (
      <span title={`${t("watchlist")} · ${levelText}`} className={cn("inline-flex h-[22px] items-center gap-1 rounded-full px-2 text-xs font-semibold whitespace-nowrap ring-1 ring-inset", TONE[level === "high" ? "orange" : "amber"].pill)}>
        <Eye className="size-3.5 shrink-0" strokeWidth={2.25} />
        {compact ? levelText : `${t("watchlist")} · ${levelText}`}
      </span>
    );
  }
  return (
    <span className={cn("inline-flex h-[22px] items-center gap-1 rounded-full px-2 text-xs font-semibold whitespace-nowrap ring-1 ring-inset", TONE[screening === "blacklist" ? "red" : "slate"].pill)}>
      <ShieldAlert className="size-3.5 shrink-0" strokeWidth={2.25} />
      {compact && screening === "blacklist" ? t("blacklistShort") : t(screening)}
    </span>
  );
}

export function RequestFlags({
  late,
  timeLimitHours,
  responseReceived,
  awaitingCapacity,
}: {
  late: boolean;
  timeLimitHours: number | null;
  responseReceived: boolean;
  awaitingCapacity: boolean;
}) {
  const t = useTranslations("queue");
  if (!late && !responseReceived && !awaitingCapacity) return null;
  return (
    <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs">
      {late && (
        <span className="inline-flex items-center gap-1 font-medium text-attention" title={timeLimitHours ? t("lateBy", { h: timeLimitHours }) : undefined}>
          <Clock className="size-3" strokeWidth={2.25} />
          {t("late")}
        </span>
      )}
      {responseReceived && (
        <span className="inline-flex items-center gap-1 text-accent-text">
          <CornerDownLeft className="size-3 rtl:-scale-x-100" strokeWidth={2.25} />
          {t("responseReceived")}
        </span>
      )}
      {awaitingCapacity && (
        <span className="inline-flex items-center gap-1 text-attention">
          <Gauge className="size-3" strokeWidth={2.25} />
          {t("awaitingCapacity")}
        </span>
      )}
    </span>
  );
}

const STEP_MARK: Record<ProgressStep["state"], string> = {
  done: "bg-emerald-500 border-emerald-500",
  current: "bg-surface border-accent ring-4 ring-indigo-100",
  held: "bg-surface border-red-500 ring-4 ring-red-100",
  upcoming: "bg-surface border-line-strong",
  rejected: "bg-rose-500 border-rose-500",
  skipped: "bg-surface border-line border-dashed",
};

/** Vertical timeline of stages. `compact` hides per-visit detail. */
export function StageProgress({
  steps,
  db,
  now,
  compact,
}: {
  steps: ProgressStep[];
  db: Database;
  now: number;
  compact?: boolean;
}) {
  const t = useTranslations("requestDetail.progress");
  const fmt = useFormat();

  return (
    <ol className="relative">
      {steps.map((step, i) => {
        const last = step.visits[step.visits.length - 1];
        const isLast = i === steps.length - 1;
        const name = step.kind === "final" ? t("finalApproval") : fmt.text(step.name);
        const reviewer = last?.assignedUserId ? db.users[last.assignedUserId] : undefined;
        const returned = step.visits.filter((v) => v.outcome === "moreInfo").length;

        let caption: string | null = null;
        if (step.state === "done" && last?.completedAt) {
          caption = last.outcome === "escalate" ? t("escalated") : `${t("completed")} · ${fmt.dateTime(last.completedAt)}`;
        } else if (step.state === "rejected" && last?.completedAt) {
          caption = `${t("rejected")} · ${fmt.dateTime(last.completedAt)}`;
        } else if ((step.state === "current" || step.state === "held") && last) {
          caption = t("waitingFor", { time: fmt.duration(now - Date.parse(last.enteredAt)) });
        } else if (step.kind === "final" && step.state === "upcoming" && !compact) {
          caption = t("finalApprovalHint");
        }

        return (
          <li key={`${step.nodeId}-${i}`} className="relative flex gap-3 pb-4 last:pb-0">
            {!isLast && <span aria-hidden className="absolute start-[5px] top-4 bottom-0 w-px bg-line" />}
            <span aria-hidden className={cn("relative z-[1] mt-1 size-[11px] shrink-0 rounded-full border-2", STEP_MARK[step.state])} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span
                  className={cn(
                    "text-sm",
                    step.state === "current" || step.state === "held" ? "font-medium text-ink" : step.state === "upcoming" || step.state === "skipped" ? "text-ink-3" : "text-ink",
                    step.state === "skipped" && "line-through decoration-line-strong",
                  )}
                >
                  {name}
                </span>
                {step.kind === "escalation" && <span className="text-xs text-attention">{t("escalation")}</span>}
                {!compact && step.mandatory && step.kind !== "final" && (
                  <span className="text-2xs text-ink-3">{t("mandatory")}</span>
                )}
              </div>
              {caption && <p className="text-xs text-ink-3">{caption}</p>}
              {!compact && reviewer && step.state !== "upcoming" && (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-2">
                  <Avatar name={reviewer.name} size="xs" />
                  {reviewer.name}
                  {last?.claimedAt && last.completedAt && (
                    <span className="text-ink-3">· {t("timeSpent", { time: fmt.duration(Date.parse(last.completedAt) - Date.parse(last.enteredAt)) })}</span>
                  )}
                </p>
              )}
              {!compact && returned > 0 && <p className="mt-1 text-xs text-ink-3">{t("returned")} ×{returned}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
