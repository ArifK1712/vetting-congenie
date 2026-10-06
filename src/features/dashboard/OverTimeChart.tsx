"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_AXIS_TEXT, CHART_CURSOR, CHART_GRID, CHART_SURFACE, SERIES } from "@/design/chart";
import type { Dashboard } from "@/domain/dashboard";
import { useFormat } from "@/i18n/format";
import { cn } from "@/lib/cn";
import { Legend, Panel } from "./widgets";

const KEYS = ["submitted", "approved", "rejected"] as const;
const COLOR: Record<(typeof KEYS)[number], string> = {
  submitted: SERIES.open,
  approved: SERIES.approved,
  rejected: SERIES.rejected,
};

/**
 * Daily submitted / approved / rejected. Time runs left-to-right in both
 * languages (the convention in Arabic business dashboards); the panel chrome,
 * legend and tooltip text follow the page direction.
 */
export function OverTimeChart({ data }: { data: Dashboard["daily"] }) {
  const t = useTranslations("dashboard.overTime");
  const fmt = useFormat();
  const [view, setView] = useState<"chart" | "table">("chart");

  return (
    <Panel
      title={t("title")}
      subtitle={t("subtitle")}
      action={
        <div role="tablist" className="flex rounded-lg bg-hover p-0.5 text-xs font-semibold">
          {(["chart", "table"] as const).map((v) => (
            <button
              key={v}
              role="tab"
              type="button"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn("rounded-md px-2.5 py-1 transition-colors", view === v ? "bg-surface text-ink shadow-xs" : "text-ink-3 hover:text-ink")}
            >
              {t(v)}
            </button>
          ))}
        </div>
      }
    >
      <Legend items={KEYS.map((k) => ({ label: t(k), color: COLOR[k] }))} />
      {view === "chart" ? (
        <div dir="ltr" className="mt-3 h-[21rem]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid vertical={false} stroke={CHART_GRID} />
              <XAxis
                dataKey="day"
                tickFormatter={(d: string) => fmt.dayMonth(d)}
                tick={{ fill: CHART_AXIS_TEXT, fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: CHART_GRID }}
                minTickGap={28}
              />
              <YAxis allowDecimals={false} tick={{ fill: CHART_AXIS_TEXT, fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
              <Tooltip
                cursor={{ stroke: CHART_CURSOR, strokeWidth: 1 }}
                content={({ active, payload, label: day }) =>
                  active && payload?.length ? (
                    <div className="rounded-lg bg-surface px-3 py-2 text-xs shadow-pop ring-1 ring-line" dir={fmt.dir}>
                      <p className="mb-1 font-semibold text-ink">{fmt.day(String(day))}</p>
                      {KEYS.map((k) => {
                        const p = payload.find((x) => x.dataKey === k);
                        return (
                          <p key={k} className="flex items-center justify-between gap-6 text-ink-2">
                            <span className="flex items-center gap-1.5">
                              <span className="size-2 rounded-full" style={{ background: COLOR[k] }} />
                              {t(k)}
                            </span>
                            <span className="tabular font-semibold text-ink">{fmt.number(Number(p?.value ?? 0))}</span>
                          </p>
                        );
                      })}
                    </div>
                  ) : null
                }
              />
              {KEYS.map((k) => (
                <Area
                  key={k}
                  type="monotone"
                  dataKey={k}
                  stroke={COLOR[k]}
                  strokeWidth={2}
                  fill={COLOR[k]}
                  fillOpacity={k === "submitted" ? 0.08 : 0.05}
                  dot={false}
                  activeDot={{ r: 4, stroke: CHART_SURFACE, strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="mt-3 max-h-[21rem] overflow-y-auto rounded-lg ring-1 ring-line">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-subtle">
              <tr>
                <th className="eyebrow px-3 py-2 text-start">{t("day")}</th>
                {KEYS.map((k) => (
                  <th key={k} className="eyebrow px-3 py-2 text-end">{t(k)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((row) => (
                <tr key={row.day} className="border-t border-line">
                  <td className="px-3 py-1.5 text-ink-2">{fmt.day(row.day)}</td>
                  {KEYS.map((k) => (
                    <td key={k} className="tabular px-3 py-1.5 text-end text-ink">{fmt.number(row[k])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
