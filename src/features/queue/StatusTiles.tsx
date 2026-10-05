"use client";

import {
  ArrowUpRight,
  BadgeCheck,
  CircleDashed,
  CircleX,
  Clock,
  Layers,
  MessageCircleQuestion,
  ScanEye,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { STATUS_TONE, TONE, type Tone } from "@/design/tones";
import { OPEN_STATUSES } from "@/domain/status";
import type { RequestStatus } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { cn } from "@/lib/cn";

export type TileKey = "open" | RequestStatus;

const ICONS: Record<RequestStatus, LucideIcon> = {
  pending_review: CircleDashed,
  under_review: ScanEye,
  more_info_required: MessageCircleQuestion,
  escalated: ArrowUpRight,
  screening_hold: ShieldAlert,
  approved: BadgeCheck,
  rejected: CircleX,
  withdrawn: CircleX,
  configuration_error: ShieldAlert,
};

const IN_PROGRESS: RequestStatus[] = ["pending_review", "under_review", "more_info_required", "escalated", "screening_hold"];
const DECIDED: RequestStatus[] = ["approved", "rejected"];

export function tileStatuses(tile: TileKey): RequestStatus[] {
  return tile === "open" ? OPEN_STATUSES : [tile];
}

export function activeTile(statuses: RequestStatus[]): TileKey | null {
  if (statuses.length === OPEN_STATUSES.length && OPEN_STATUSES.every((s) => statuses.includes(s))) return "open";
  return statuses.length === 1 ? statuses[0] : null;
}

/**
 * KPI panel that doubles as the status filter: one surface, a summary block
 * with the open-work breakdown, then each status with a line of context.
 * Screening Hold is omitted for viewers without Blacklist View, so the count
 * never reveals that a list match exists.
 */
export function StatusTiles({
  counts,
  late,
  active,
  showHold,
  onSelect,
}: {
  counts: Record<RequestStatus, number>;
  late: Record<RequestStatus, number>;
  active: TileKey | null;
  showHold: boolean;
  onSelect: (tile: TileKey) => void;
}) {
  const t = useTranslations("status");
  const tq = useTranslations("queue");
  const tk = useTranslations("queue.kpi");
  const fmt = useFormat();

  const openTotal = OPEN_STATUSES.reduce((s, x) => s + counts[x], 0);
  const openLate = OPEN_STATUSES.reduce((s, x) => s + late[x], 0);
  const decided = counts.approved + counts.rejected;

  const context = (s: RequestStatus): { text: string; tone: "late" | "muted" | "alert" } => {
    if (s === "more_info_required") return { text: tk("waitingAttendee"), tone: "muted" };
    if (s === "screening_hold") return { text: tk("needsDecision"), tone: counts[s] ? "alert" : "muted" };
    if (s === "approved" || s === "rejected") {
      if (!decided) return { text: tk("noneYet"), tone: "muted" };
      return { text: tk("ofDecided", { p: fmt.number(Math.round((counts[s] / decided) * 100)) }), tone: "muted" };
    }
    return late[s] ? { text: tk("late", { n: fmt.number(late[s]) }), tone: "late" } : { text: tk("onTrack"), tone: "muted" };
  };

  const statusKpi = (status: RequestStatus) => {
    const tone = STATUS_TONE[status];
    const ctx = context(status);
    return (
      <KpiButton key={status} selected={active === status} onClick={() => onSelect(status)} tone={tone} className="min-w-[8.75rem] flex-1">
        <KpiHeader icon={ICONS[status]} tone={tone} label={status === "more_info_required" ? tk("moreInfoShort") : t(status)} title={t(status)} />
        <span className="tabular mt-2.5 block text-2xl leading-none font-bold tracking-tight text-ink">{fmt.number(counts[status])}</span>
        <span
          className={cn(
            "mt-2.5 flex items-center gap-1 text-xs font-medium whitespace-nowrap",
            ctx.tone === "late" && "text-amber-700",
            ctx.tone === "alert" && "text-red-600",
            ctx.tone === "muted" && "text-ink-3",
          )}
        >
          {ctx.tone === "late" && <Clock className="size-3" strokeWidth={2.5} />}
          {ctx.text}
        </span>
      </KpiButton>
    );
  };

  return (
    <div role="tablist" aria-label={tq("tilesLabel")} className="flex overflow-x-auto rounded-xl bg-surface shadow-card ring-1 ring-line">
      <KpiButton selected={active === "open"} onClick={() => onSelect("open")} tone="indigo" className="min-w-52 flex-[1.3] bg-indigo-50/40">
        <KpiHeader icon={Layers} tone="indigo" label={tq("openTile")} />
        <div className="mt-2.5 flex items-center gap-2.5">
          <span className="tabular text-[30px] leading-none font-bold tracking-tight text-ink">{fmt.number(openTotal)}</span>
          {openLate > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-600/20 ring-inset">
              <Clock className="size-3" strokeWidth={2.5} />
              {tk("late", { n: fmt.number(openLate) })}
            </span>
          )}
        </div>
        <div role="img" aria-label={tk("breakdown")} className="mt-3.5 flex h-1.5 w-full overflow-hidden rounded-full bg-hover">
          {openTotal > 0 &&
            OPEN_STATUSES.filter((s) => counts[s] > 0).map((s) => (
              <span
                key={s}
                title={`${t(s)} · ${fmt.number(counts[s])}`}
                className={cn("h-full border-e-2 border-surface last:border-e-0", TONE[STATUS_TONE[s]].dot)}
                style={{ width: `${(counts[s] / openTotal) * 100}%` }}
              />
            ))}
        </div>
      </KpiButton>

      {IN_PROGRESS.filter((s) => s !== "screening_hold" || showHold).map(statusKpi)}

      <span aria-hidden className="w-1.5 shrink-0 border-e border-line bg-canvas" />

      {DECIDED.map(statusKpi)}
    </div>
  );
}

function KpiHeader({ icon: Icon, tone, label, title }: { icon: LucideIcon; tone: Tone; label: string; title?: string }) {
  return (
    <span title={title} className="flex items-center gap-1.5">
      <span className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded-md", TONE[tone].chip)}>
        <Icon className="size-3.5" strokeWidth={2.25} />
      </span>
      <span className="truncate text-xs font-semibold text-ink-2">{label}</span>
    </span>
  );
}

function KpiButton({
  selected,
  onClick,
  tone,
  className,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  tone: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      role="tab"
      type="button"
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        "group relative shrink-0 border-e border-line px-3.5 pt-4 pb-3.5 text-start transition-colors outline-none last:border-e-0",
        "first:rounded-s-xl last:rounded-e-xl hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset",
        className,
        selected && "bg-subtle",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-x-4 top-0 h-[3px] rounded-b-full transition-opacity",
          TONE[tone].dot,
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-50",
        )}
      />
      {children}
    </button>
  );
}
