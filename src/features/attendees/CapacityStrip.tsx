"use client";

import { Hourglass, SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { HScroll } from "@/components/ui/HScroll";
import { useMemo } from "react";
import { capacityOf } from "@/domain/attendees";
import type { Database, ID, Registration } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { cn } from "@/lib/cn";

/**
 * 11.3: places used against the registration limit, one card per
 * registration in the event scope. Scrolls sideways when there are many.
 */
export function CapacityStrip({
  db,
  scope,
  canManage,
  onChangeLimit,
}: {
  db: Database;
  scope: ID | "all";
  canManage: boolean;
  onChangeLimit: (reg: Registration) => void;
}) {
  const t = useTranslations("attendees.capacity");
  const fmt = useFormat();
  const cards = useMemo(
    () =>
      Object.values(db.registrations)
        .filter((r) => scope === "all" || r.eventId === scope)
        .sort((a, b) => (db.events[a.eventId]?.startsOn ?? "").localeCompare(db.events[b.eventId]?.startsOn ?? "") || a.name.en.localeCompare(b.name.en))
        .map((reg) => ({ reg, cap: capacityOf(db, reg.id) })),
    [db, scope],
  );
  if (!cards.length) return null;

  return (
    <section aria-label={t("title")} className="mt-6">
      <h2 className="eyebrow mb-2.5">{t("title")}</h2>
      <HScroll label={t("title")} className="gap-3 py-1">
        {cards.map(({ reg, cap }) => {
          const pct = cap.limit ? Math.min(100, Math.round((cap.used / cap.limit) * 100)) : 100;
          const full = cap.used >= cap.limit;
          const bar = full ? "bg-rose-500" : pct >= 85 ? "bg-amber-500" : "bg-emerald-500";
          const ev = db.events[reg.eventId];
          return (
            <li key={reg.id} data-capacity={reg.id} className="flex w-64 shrink-0 flex-col rounded-xl bg-surface p-4 shadow-card ring-1 ring-line">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{fmt.text(reg.name)}</p>
                  {scope === "all" && <p className="ltr-data truncate font-mono text-2xs text-ink-3">{ev?.code}</p>}
                </div>
                {full && <span className="shrink-0 rounded-md bg-rose-50 px-1.5 py-0.5 text-2xs font-semibold text-rose-700 ring-1 ring-rose-600/15 ring-inset">{t("full")}</span>}
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="tabular shrink-0 text-xs text-ink-2">
                  <span className="text-xl font-bold tracking-tight text-ink" data-used>
                    {fmt.number(cap.used)}
                  </span>
                  <span className="text-ink-3"> / {fmt.number(cap.limit)}</span>
                </p>
                {cap.waiting > 0 && (
                  <span data-waiting className="inline-flex h-[22px] min-w-0 items-center gap-1 rounded-full bg-amber-50 px-2 text-xs font-semibold text-amber-800 ring-1 ring-amber-600/20 ring-inset">
                    <Hourglass className="size-3 shrink-0" />
                    <span className="truncate">{t("waiting", { count: cap.waiting, n: fmt.number(cap.waiting) })}</span>
                  </span>
                )}
              </div>
              <div
                role="meter"
                aria-valuemin={0}
                aria-valuemax={cap.limit}
                aria-valuenow={cap.used}
                aria-label={t("used", { used: fmt.number(cap.used), limit: fmt.number(cap.limit) })}
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-hover"
              >
                <div className={cn("h-full rounded-full transition-[width] duration-500", bar)} style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-2.5 flex min-h-7 items-center justify-between gap-2">
                <span className="tabular truncate text-xs text-ink-3">{t("free", { count: cap.free, n: fmt.number(cap.free) })}</span>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => onChangeLimit(reg)}
                    aria-label={t("changeLimitFor", { registration: fmt.text(reg.name) })}
                    className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-semibold text-accent-text hover:bg-accent-soft"
                  >
                    <SlidersHorizontal className="size-3" />
                    {t("changeLimit")}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </HScroll>
    </section>
  );
}
