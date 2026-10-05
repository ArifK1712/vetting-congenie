"use client";

import { BadgeCheck, ChevronRight, Clock, Eye, Gauge, Hourglass, Layers, Lock, ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { DirIcon } from "@/components/ui/DirIcon";
import { EmptyState } from "@/components/ui/EmptyState";
import { MultiFilter, SingleFilter } from "@/components/ui/FilterMenu";
import { BadgeTypeChip } from "@/components/ui/Status";
import { SERIES } from "@/design/chart";
import { STATUS_TONE, TONE } from "@/design/tones";
import { buildDashboard, DEFAULT_DASHBOARD_FILTERS, type DashboardFilters, type DateRange } from "@/domain/dashboard";
import { teamsOfUser } from "@/domain/permissions";
import { OPEN_STATUSES, STATUS_ORDER } from "@/domain/status";
import { useFormat } from "@/i18n/format";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { useNow } from "@/lib/useNow";
import { useDb, useSession } from "@/store/app";
import { useViewer } from "@/store/useViewer";
import { OverTimeChart } from "./OverTimeChart";
import { Lollipop, Ring, ShareStrip, Sparkline } from "./visuals";
import { Empty, Legend, Panel, StatTile } from "./widgets";

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

      {/* Stat tiles — each with its own mini visual */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={Layers}
          tone="indigo"
          label={t("tiles.open")}
          value={fmt.number(totals.open)}
          hint={totals.late ? t("tiles.openLate", { n: fmt.number(totals.late) }) : t("tiles.openOnTrack")}
          hintTone={totals.late ? "attention" : "positive"}
          footer={
            <ShareStrip
              className="h-2"
              segments={OPEN_STATUSES.map((s) => ({ key: s, value: data.statusCounts[s], color: STATUS_HEX[STATUS_TONE[s]], label: ts(s) }))}
            />
          }
        />
        <StatTile
          icon={BadgeCheck}
          tone="emerald"
          label={t("tiles.decided")}
          value={fmt.number(totals.decided)}
          hint={t("tiles.decidedHint", { d: filters.range })}
          visual={<Sparkline values={data.daily.slice(-14).map((d) => d.approved + d.rejected)} color={SERIES.approved} />}
        />
        <StatTile
          icon={Gauge}
          tone="violet"
          label={t("tiles.approvalRate")}
          value={totals.approvalRate === null ? t("tiles.noData") : `${fmt.number(Math.round(totals.approvalRate * 100))}%`}
          hint={t("tiles.approvalHint", { a: fmt.number(totals.approved), n: fmt.number(totals.decided) })}
          visual={
            <Ring
              size={48}
              thickness={6}
              segments={[
                { value: totals.approved, color: SERIES.approved, label: t("badge.approved") },
                { value: totals.decided - totals.approved, color: SERIES.rejected, label: t("badge.rejected") },
              ]}
            />
          }
        />
        <StatTile
          icon={Clock}
          tone="amber"
          label={t("tiles.median")}
          value={medianText}
          hint={t("tiles.medianHint")}
          footer={
            data.timePerStage[0] && (
              <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800 ring-1 ring-amber-600/15 ring-inset">
                <Hourglass className="size-3.5 shrink-0" />
                <span className="truncate" title={fmt.text(data.timePerStage[0].name)}>
                  {t("tiles.slowest", { stage: fmt.text(data.timePerStage[0].name) })} · {fmt.duration(data.timePerStage[0].medianHours * 3_600_000)}
                </span>
              </p>
            )
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <OverTimeChart data={data.daily} />
        </div>

        {/* Status: one proportion strip, then a grid of status cells */}
        <Panel title={t("status.title")} subtitle={t("status.subtitle")}>
          <ShareStrip
            segments={shownStatuses.map((s) => ({ key: s, value: data.statusCounts[s], color: STATUS_HEX[STATUS_TONE[s]], label: ts(s) }))}
          />
          <p className="mt-2 text-xs text-ink-3">{t("status.total", { n: fmt.number(totals.requests) })}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {shownStatuses.map((s) => {
              const n = data.statusCounts[s];
              const pct = totals.requests ? Math.round((n / totals.requests) * 100) : 0;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => router.push({ pathname: "/queue", query: { status: s } })}
                  className="group rounded-lg bg-subtle p-3 text-start ring-1 ring-line transition-colors hover:bg-surface hover:ring-line-strong focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                >
                  <span className="flex items-center gap-1.5 text-xs text-ink-2">
                    <span className={cn("size-2 shrink-0 rounded-full", TONE[STATUS_TONE[s]].dot)} />
                    <span className="truncate">{ts(s)}</span>
                  </span>
                  <span className="mt-1.5 flex items-baseline justify-between">
                    <span className="tabular text-lg font-bold text-ink">{fmt.number(n)}</span>
                    <span className="tabular text-2xs font-medium text-ink-3">{t("status.share", { p: fmt.number(pct) })}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Panel>
      </div>

      {/* Pipeline: each workflow as its stage sequence */}
      <Panel
        title={t("perStage.title")}
        subtitle={t("perStage.subtitle")}
        action={<Legend items={[{ label: t("perStage.claimed"), color: SERIES.open }, { label: t("perStage.unclaimed"), color: SERIES.unclaimed }]} />}
      >
        {data.pipeline.length ? (
          <div className="space-y-3">
            {data.pipeline.map((w) => (
              <div key={w.workflowId} className="grid grid-cols-1 items-center gap-3 rounded-xl bg-subtle p-3 ring-1 ring-line md:grid-cols-[13rem_1fr]">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{fmt.text(w.label)}</p>
                  <p className="mt-0.5 flex items-center gap-2 text-xs text-ink-3">
                    <BadgeTypeChip id={w.badgeTypeId} label={fmt.text(db.badgeTypes[w.badgeTypeId].name)} />
                    <span className="tabular">{fmt.number(w.total)} {t("perStage.waiting")}</span>
                  </p>
                </div>
                <ol className="flex flex-wrap items-center gap-1.5">
                  {w.stages.map((st, i) => {
                    const n = st.claimed + st.unclaimed;
                    return (
                      <li key={st.nodeId} className="flex items-center gap-1.5">
                        {i > 0 && <DirIcon icon={ChevronRight} className={cn("size-3.5 text-ink-3", st.offPath && "opacity-0")} />}
                        <div
                          className={cn(
                            "min-w-[7.5rem] rounded-lg bg-surface px-2.5 py-2 ring-1",
                            n ? "ring-indigo-200" : "ring-line",
                            st.offPath && "border-s-2 border-orange-300",
                          )}
                        >
                          <p className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs font-medium text-ink-2">{fmt.text(st.name)}</span>
                            <span className={cn("tabular text-sm font-bold", n ? "text-ink" : "text-ink-3")}>{fmt.number(n)}</span>
                          </p>
                          <div className="mt-1.5 flex h-1.5 gap-[2px] overflow-hidden rounded-full bg-hover">
                            {st.claimed > 0 && <span style={{ width: `${(st.claimed / n) * 100}%`, background: SERIES.open }} />}
                            {st.unclaimed > 0 && <span style={{ width: `${(st.unclaimed / n) * 100}%`, background: SERIES.unclaimed }} />}
                          </div>
                          {(st.late > 0 || st.offPath) && (
                            <p className="mt-1 text-2xs font-medium">
                              {st.offPath && <span className="text-orange-600">{t("perStage.escalation")}</span>}
                              {st.offPath && st.late > 0 && " · "}
                              {st.late > 0 && <span className="text-amber-700">{t("perStage.late", { n: fmt.number(st.late) })}</span>}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>
        ) : (
          <Empty>{t("perStage.empty")}</Empty>
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Time in stage: ranked lollipops */}
        <Panel title={t("timePerStage.title")} subtitle={t("timePerStage.subtitle")}>
          {data.timePerStage.length ? (
            <ol className="space-y-3.5">
              {data.timePerStage.slice(0, 8).map((s, i, arr) => (
                <Lollipop
                  key={s.key}
                  rank={i + 1}
                  label={fmt.text(s.name)}
                  hint={t("timePerStage.visits", { n: fmt.number(s.count) })}
                  share={arr[0].medianHours ? s.medianHours / arr[0].medianHours : 0}
                  color="#8b5cf6"
                  value={fmt.duration(s.medianHours * 3_600_000)}
                />
              ))}
            </ol>
          ) : (
            <Empty>{t("timePerStage.empty")}</Empty>
          )}
        </Panel>

        {/* Badge types: small cards with a ring each */}
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {data.byBadgeType.map((b) => {
              const total = b.approved + b.rejected + b.open;
              const decided = b.approved + b.rejected;
              return (
                <div key={b.badgeTypeId} className="flex flex-col items-center rounded-xl bg-subtle p-3 text-center ring-1 ring-line">
                  <BadgeTypeChip id={b.badgeTypeId} label={fmt.text(b.name)} />
                  <div className="my-2.5">
                    <Ring
                      size={76}
                      segments={[
                        { value: b.approved, color: SERIES.approved, label: t("badge.approved") },
                        { value: b.rejected, color: SERIES.rejected, label: t("badge.rejected") },
                        { value: b.open, color: SERIES.open, label: t("badge.open") },
                      ]}
                    >
                      <span className="tabular text-base leading-none font-bold text-ink">{fmt.number(total)}</span>
                    </Ring>
                  </div>
                  <p className="text-xs font-medium text-ink-2">
                    {decided ? t("badge.approvedShare", { p: fmt.number(Math.round((b.approved / decided) * 100)) }) : "—"}
                  </p>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Places used: severity meters */}
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
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="tabular text-sm font-semibold text-ink">
                        {t("places.of", { used: fmt.number(p.used), limit: fmt.number(p.limit) })}
                      </span>
                      <span
                        className={cn(
                          "tabular rounded-full px-1.5 py-0.5 text-2xs font-semibold ring-1 ring-inset",
                          severity === "full" ? "bg-rose-50 text-rose-700 ring-rose-600/15" : severity === "high" ? "bg-amber-50 text-amber-800 ring-amber-600/20" : "bg-indigo-50 text-indigo-700 ring-indigo-600/15",
                        )}
                      >
                        {fmt.number(Math.round(p.share * 100))}%
                      </span>
                    </span>
                  </div>
                  {/* Meter: fill carries severity; track is a lighter step of the same ramp. */}
                  <div className={cn("h-2 w-full overflow-hidden rounded-full", severity === "full" ? "bg-rose-100" : severity === "high" ? "bg-amber-100" : "bg-indigo-100")}>
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

        {/* Late by team: ranked leaderboard */}
        <Panel title={t("late.title")} subtitle={t("late.subtitle")}>
          {data.lateByTeam.length ? (
            <ol className="divide-y divide-line">
              {data.lateByTeam.map((x, i) => (
                <li key={x.teamId} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span
                    className={cn(
                      "tabular inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                      i === 0 ? "bg-amber-100 text-amber-800" : "bg-hover text-ink-2",
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{fmt.text(x.name)}</span>
                    <span className="block text-2xs text-ink-3">{t("late.ofOpen", { n: fmt.number(x.open) })}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800 ring-1 ring-amber-600/20 ring-inset">
                    <Clock className="size-3" strokeWidth={2.5} />
                    <span className="tabular">{fmt.number(x.count)}</span>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <Empty>{t("late.empty")}</Empty>
          )}
        </Panel>
      </div>

      <div className={cn("grid grid-cols-1 gap-5", data.listMatches && "lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]")}>
        {/* Workload: table with inline activity bars */}
        <Panel
          title={t("workload.title")}
          subtitle={t("workload.subtitle")}
          action={<Legend items={[{ label: t("workload.open"), color: SERIES.open }, { label: t("workload.decisions"), color: SERIES.unclaimed }]} />}
        >
          {data.workload.length ? (
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-line">
                    <th className="eyebrow pb-2 text-start">{t("workload.reviewer")}</th>
                    <th className="eyebrow pb-2 text-end">{t("workload.open")}</th>
                    <th className="eyebrow pb-2 text-end">{t("workload.decisions")}</th>
                    <th className="eyebrow w-[38%] pb-2 ps-6 text-start">{t("workload.activity")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const max = Math.max(1, ...data.workload.map((w) => w.decisions + w.open));
                    return data.workload.map((w) => (
                      <tr key={w.userId} className="border-b border-line last:border-b-0">
                        <td className="py-2">
                          <span className="flex items-center gap-2">
                            <Avatar name={w.name} size="sm" />
                            <span className="truncate text-ink">{w.name}</span>
                          </span>
                        </td>
                        <td className="tabular py-2 text-end font-semibold text-ink">{fmt.number(w.open)}</td>
                        <td className="tabular py-2 text-end text-ink-2">{fmt.number(w.decisions)}</td>
                        <td className="py-2 ps-6">
                          <div className="flex h-2 gap-[2px] overflow-hidden rounded-e-[4px]">
                            {w.open > 0 && <span style={{ width: `${(w.open / max) * 100}%`, background: SERIES.open }} />}
                            {w.decisions > 0 && <span className="rounded-e-[4px]" style={{ width: `${(w.decisions / max) * 100}%`, background: SERIES.unclaimed }} />}
                          </div>
                        </td>
                      </tr>
                    ));
                  })()}
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
