"use client";

import { BadgeCheck, Clock, Gauge, Layers, Lock, ShieldAlert, Eye } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { MultiFilter, SingleFilter } from "@/components/ui/FilterMenu";
import { BadgeTypeChip } from "@/components/ui/Status";
import { SERIES } from "@/design/chart";
import { STATUS_TONE, TONE } from "@/design/tones";
import { buildDashboard, DEFAULT_DASHBOARD_FILTERS, type DashboardFilters, type DateRange } from "@/domain/dashboard";
import { teamsOfUser } from "@/domain/permissions";
import { STATUS_ORDER } from "@/domain/status";
import { useFormat } from "@/i18n/format";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { useNow } from "@/lib/useNow";
import { useDb, useSession } from "@/store/app";
import { useViewer } from "@/store/useViewer";
import { OverTimeChart } from "./OverTimeChart";
import { BarList, Empty, Legend, Panel, StatTile } from "./widgets";

// Tailwind dot classes resolved to hex for inline bar widths (same hues as the pills).
const STATUS_HEX: Record<string, string> = {
  sky: "#0ea5e9", indigo: "#6366f1", amber: "#f59e0b", orange: "#f97316", red: "#ef4444",
  emerald: "#10b981", rose: "#e11d48", gray: "#9ca3af",
};

export function DashboardPage() {
  const t = useTranslations("dashboard");
  const ts = useTranslations("status");
  const fmt = useFormat();
  const db = useDb();
  const viewer = useViewer();
  const eventScope = useSession((s) => s.eventScope);
  const router = useRouter();
  const now = useNow(15_000);
  const [filters, setFilters] = useState<DashboardFilters>(DEFAULT_DASHBOARD_FILTERS);
  const patch = (p: Partial<DashboardFilters>) => setFilters((f) => ({ ...f, ...p }));

  const data = useMemo(() => buildDashboard(db, viewer.id, eventScope, filters, now), [db, viewer.id, eventScope, filters, now]);

  const options = useMemo(() => {
    const regs = Object.values(db.registrations).filter((r) => eventScope === "all" || r.eventId === eventScope);
    const teams = viewer.can("queue.reviewAll") ? Object.values(db.teams) : teamsOfUser(db, viewer.id);
    return {
      registrations: regs.map((r) => ({ value: r.id, label: fmt.text(r.name), hint: fmt.text(db.events[r.eventId].name) })),
      badgeTypes: Object.values(db.badgeTypes).map((b) => ({ value: b.id, label: fmt.text(b.name) })),
      workflows: Object.values(db.workflows).map((w) => ({ value: w.id, label: fmt.text(w.label), hint: fmt.text(w.name) })),
      teams: teams.map((x) => ({ value: x.id, label: fmt.text(x.name) })),
    };
  }, [db, eventScope, viewer, fmt]);

  if (!viewer.can("reports.view")) {
    return <EmptyState icon={Lock} title={t("noAccessTitle")} body={t("noAccessBody")} />;
  }

  const { totals } = data;
  const medianText =
    totals.medianDecisionHours === null
      ? t("tiles.noData")
      : fmt.duration(totals.medianDecisionHours * 3_600_000);
  const shownStatuses = STATUS_ORDER.filter((s) => s !== "configuration_error" && (s !== "screening_hold" || viewer.can("blacklist.view")));

  return (
    <div className="mx-auto max-w-[96rem] space-y-5 px-7 pt-7 pb-16">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink">{t("title")}</h1>
          <p className="mt-1.5 text-sm text-ink-2">{t("subtitle")}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-600/15 ring-inset">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
          {t("updated", { time: fmt.dateTime(new Date(now).toISOString()) })}
        </span>
      </div>

      {/* Filters — one row above the charts */}
      <div className="flex flex-wrap items-center gap-2">
        <SingleFilter
          label={t("filters.range")}
          options={([7, 30, 90] as const).map((d) => ({ value: String(d), label: t(`filters.range${d}`) }))}
          value={String(filters.range)}
          defaultValue="30"
          alwaysShowValue
          onChange={(v) => patch({ range: Number(v) as DateRange })}
        />
        <MultiFilter label={t("filters.registration")} options={options.registrations} value={filters.registrationIds} onChange={(v) => patch({ registrationIds: v })} searchable wide />
        <MultiFilter label={t("filters.badgeType")} options={options.badgeTypes} value={filters.badgeTypeIds} onChange={(v) => patch({ badgeTypeIds: v })} />
        <MultiFilter label={t("filters.workflow")} options={options.workflows} value={filters.workflowIds} onChange={(v) => patch({ workflowIds: v })} wide />
        <MultiFilter label={t("filters.team")} options={options.teams} value={filters.teamIds} onChange={(v) => patch({ teamIds: v })} searchable />
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={Layers}
          tone="indigo"
          label={t("tiles.open")}
          value={fmt.number(totals.open)}
          hint={totals.late ? t("tiles.openLate", { n: fmt.number(totals.late) }) : t("tiles.openOnTrack")}
          hintTone={totals.late ? "attention" : "positive"}
        />
        <StatTile
          icon={BadgeCheck}
          tone="emerald"
          label={t("tiles.decided")}
          value={fmt.number(totals.decided)}
          hint={t("tiles.decidedHint", { d: filters.range })}
        />
        <StatTile
          icon={Gauge}
          tone="violet"
          label={t("tiles.approvalRate")}
          value={totals.approvalRate === null ? t("tiles.noData") : `${fmt.number(Math.round(totals.approvalRate * 100))}%`}
          hint={t("tiles.approvalHint", { a: fmt.number(totals.approved), n: fmt.number(totals.decided) })}
        />
        <StatTile icon={Clock} tone="amber" label={t("tiles.median")} value={medianText} hint={t("tiles.medianHint")} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <OverTimeChart data={data.daily} />
        </div>
        <Panel title={t("status.title")} subtitle={t("status.subtitle")}>
          <BarList
            format={fmt.number}
            onSelect={(status) => router.push({ pathname: "/queue", query: { status } })}
            rows={shownStatuses.map((s) => ({
              key: s,
              label: (
                <span className="inline-flex items-center gap-2">
                  <span className={cn("size-2 rounded-full", TONE[STATUS_TONE[s]].dot)} />
                  {ts(s)}
                </span>
              ),
              segments: [{ key: s, value: data.statusCounts[s], color: STATUS_HEX[STATUS_TONE[s]] ?? "#94a3b8", label: ts(s) }],
            }))}
          />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel
          title={t("perStage.title")}
          subtitle={t("perStage.subtitle")}
          action={<Legend items={[{ label: t("perStage.claimed"), color: SERIES.open }, { label: t("perStage.unclaimed"), color: SERIES.unclaimed }]} />}
        >
          {data.perStage.length ? (
            <BarList
              format={fmt.number}
              rows={data.perStage.map((s) => ({
                key: s.key,
                label: fmt.text(s.name),
                hint: fmt.text(s.workflow),
                segments: [
                  { key: "claimed", value: s.claimed, color: SERIES.open, label: t("perStage.claimed") },
                  { key: "unclaimed", value: s.unclaimed, color: SERIES.unclaimed, label: t("perStage.unclaimed") },
                ],
              }))}
            />
          ) : (
            <Empty>{t("perStage.empty")}</Empty>
          )}
        </Panel>

        <Panel title={t("timePerStage.title")} subtitle={t("timePerStage.subtitle")}>
          {data.timePerStage.length ? (
            <BarList
              format={(h) => fmt.duration(h * 3_600_000)}
              rows={data.timePerStage.slice(0, 8).map((s) => ({
                key: s.key,
                label: fmt.text(s.name),
                hint: t("timePerStage.visits", { n: fmt.number(s.count) }),
                segments: [{ key: "h", value: s.medianHours, color: "#8b5cf6", label: fmt.text(s.name) }],
              }))}
            />
          ) : (
            <Empty>{t("timePerStage.empty")}</Empty>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel
          title={t("badge.title")}
          subtitle={t("badge.subtitle")}
          action={
            <Legend
              items={[
                { label: t("badge.approved"), color: SERIES.approved },
                { label: t("badge.rejected"), color: SERIES.rejected },
                { label: t("badge.open"), color: SERIES.open },
              ]}
            />
          }
        >
          <BarList
            format={fmt.number}
            rows={data.byBadgeType.map((b) => ({
              key: b.badgeTypeId,
              label: <BadgeTypeChip id={b.badgeTypeId} label={fmt.text(b.name)} />,
              segments: [
                { key: "approved", value: b.approved, color: SERIES.approved, label: t("badge.approved") },
                { key: "rejected", value: b.rejected, color: SERIES.rejected, label: t("badge.rejected") },
                { key: "open", value: b.open, color: SERIES.open, label: t("badge.open") },
              ],
            }))}
          />
        </Panel>

        <Panel title={t("places.title")} subtitle={t("places.subtitle")}>
          <ul className="space-y-3.5">
            {data.placesUsed.map((p) => {
              const pct = Math.min(1, p.share);
              const severity = pct >= 1 ? "full" : pct >= 0.85 ? "high" : "ok";
              return (
                <li key={p.registrationId}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-sm text-ink">
                      {fmt.text(p.name)}
                      <span className="ms-1.5 text-xs text-ink-3">{fmt.text(db.events[p.eventId].name)}</span>
                    </span>
                    <span className="tabular shrink-0 text-sm font-semibold text-ink">
                      {t("places.of", { used: fmt.number(p.used), limit: fmt.number(p.limit) })}
                    </span>
                  </div>
                  {/* Meter: fill carries severity; track is a lighter step of the same ramp. */}
                  <div
                    className={cn(
                      "h-2.5 w-full overflow-hidden rounded-full",
                      severity === "full" ? "bg-rose-100" : severity === "high" ? "bg-amber-100" : "bg-indigo-100",
                    )}
                  >
                    <div
                      className={cn("h-full rounded-e-full", severity === "full" ? "bg-rose-600" : severity === "high" ? "bg-amber-500" : "bg-indigo-500")}
                      style={{ width: `${Math.max(pct * 100, 1.5)}%` }}
                    />
                  </div>
                  {(severity === "full" || p.waiting > 0) && (
                    <p className="mt-1 text-xs font-medium text-rose-700">
                      {severity === "full" && t("places.full")}
                      {p.waiting > 0 && `${severity === "full" ? " · " : ""}${t("places.waiting", { n: fmt.number(p.waiting) })}`}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <div className={cn("grid grid-cols-1 gap-5", data.listMatches ? "xl:grid-cols-3" : "lg:grid-cols-2")}>
        <Panel title={t("late.title")} subtitle={t("late.subtitle")}>
          {data.lateByTeam.length ? (
            <BarList
              format={fmt.number}
              rows={data.lateByTeam.map((x) => ({
                key: x.teamId,
                label: fmt.text(x.name),
                segments: [{ key: "late", value: x.count, color: "#f59e0b", label: t("late.title") }],
              }))}
            />
          ) : (
            <Empty>{t("late.empty")}</Empty>
          )}
        </Panel>

        <Panel title={t("workload.title")} subtitle={t("workload.subtitle")}>
          {data.workload.length ? (
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="eyebrow pb-2 text-start">{t("workload.reviewer")}</th>
                    <th className="eyebrow pb-2 text-end">{t("workload.open")}</th>
                    <th className="eyebrow pb-2 text-end">{t("workload.decisions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.workload.map((w) => (
                    <tr key={w.userId} className="border-b border-line last:border-b-0">
                      <td className="py-2">
                        <span className="flex items-center gap-2">
                          <Avatar name={w.name} size="sm" />
                          <span className="truncate text-ink">{w.name}</span>
                        </span>
                      </td>
                      <td className="tabular py-2 text-end font-semibold text-ink">{fmt.number(w.open)}</td>
                      <td className="tabular py-2 text-end text-ink-2">{fmt.number(w.decisions)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>{t("workload.empty")}</Empty>
          )}
        </Panel>

        {data.listMatches && (
          <Panel title={t("lists.title")} subtitle={t("lists.subtitle")}>
            <div className="space-y-4">
              {data.listMatches.map((l) => {
                const Icon = l.listType === "blacklist" ? ShieldAlert : Eye;
                const tone = l.listType === "blacklist" ? "red" : "amber";
                return (
                  <div key={l.listType} className="rounded-lg bg-subtle p-3.5 ring-1 ring-line">
                    <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                      <span className={cn("inline-flex size-6 items-center justify-center rounded-md", TONE[tone].chip)}>
                        <Icon className="size-3.5" strokeWidth={2.25} />
                      </span>
                      {t(`lists.${l.listType}`)}
                    </p>
                    <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                      {(["open", "confirmed", "cleared"] as const).map((k) => (
                        <div key={k}>
                          <dd className="tabular text-xl font-bold text-ink">{fmt.number(l[k])}</dd>
                          <dt className="text-2xs text-ink-3">{t(`lists.${k}`)}</dt>
                        </div>
                      ))}
                    </dl>
                  </div>
                );
              })}
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
