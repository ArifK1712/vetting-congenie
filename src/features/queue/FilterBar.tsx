"use client";

import { RotateCcw, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { MultiFilter, SingleFilter, type FilterOption } from "@/components/ui/FilterMenu";
import { teamsOfUser } from "@/domain/permissions";
import { EMPTY_FILTERS, type QueueFilters, type QueueRow } from "@/domain/queue";
import type { Database, ID } from "@/domain/types";
import { useFormat } from "@/i18n/format";

export function hasActiveFilters(f: QueueFilters) {
  return (
    f.search.trim() !== "" ||
    f.teamIds.length > 0 ||
    f.stageNodeIds.length > 0 ||
    f.registrationIds.length > 0 ||
    f.badgeTypeIds.length > 0 ||
    f.workflowIds.length > 0 ||
    f.screening.length > 0 ||
    f.assigned !== "anyone" ||
    f.submitted !== "any"
  );
}

export function FilterBar({
  db,
  rows,
  viewerId,
  reviewAll,
  filters,
  onChange,
}: {
  db: Database;
  rows: QueueRow[];
  viewerId: ID;
  reviewAll: boolean;
  filters: QueueFilters;
  onChange: (patch: Partial<QueueFilters>) => void;
}) {
  const t = useTranslations("queue.filters");
  const fmt = useFormat();

  const options = useMemo(() => {
    const teamIds = reviewAll ? Object.keys(db.teams) : teamsOfUser(db, viewerId).map((x) => x.id);
    const stageMap = new Map<ID, FilterOption>();
    for (const r of rows) {
      if (r.stageNodeId && r.stageName && !stageMap.has(r.stageNodeId)) {
        stageMap.set(r.stageNodeId, { value: r.stageNodeId, label: fmt.text(r.stageName), hint: fmt.text(r.workflowLabel) });
      }
    }
    const inRows = <K extends keyof QueueRow>(key: K) => new Set(rows.map((r) => r[key]));
    const regs = inRows("registrationId");
    const badges = inRows("badgeTypeId");
    const wfs = inRows("workflowId");
    return {
      teams: teamIds.map((id) => ({ value: id, label: fmt.text(db.teams[id].name) })),
      stages: [...stageMap.values()].sort((a, b) => a.label.localeCompare(b.label)),
      registrations: Object.values(db.registrations)
        .filter((r) => regs.has(r.id))
        .map((r) => ({ value: r.id, label: fmt.text(r.name), hint: fmt.text(db.events[r.eventId].name) })),
      badgeTypes: Object.values(db.badgeTypes)
        .filter((b) => badges.has(b.id))
        .map((b) => ({ value: b.id, label: fmt.text(b.name) })),
      workflows: Object.values(db.workflows)
        .filter((w) => wfs.has(w.id))
        .map((w) => ({ value: w.id, label: fmt.text(w.label), hint: fmt.text(w.name) })),
    };
  }, [db, rows, viewerId, reviewAll, fmt]);

  return (
    <div className="flex items-center gap-2 overflow-x-auto px-5 py-3.5 [&>*]:shrink-0">
      <div className="relative w-52">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
        <input
          value={filters.search}
          onChange={(e) => onChange({ search: e.target.value })}
          placeholder={t("search")}
          aria-label={t("search")}
          className="h-8 w-full rounded-lg border border-line-strong bg-surface ps-8 pe-7 text-xs text-ink shadow-xs outline-none placeholder:text-ink-3 focus:border-accent focus:ring-4 focus:ring-accent/10"
        />
        {filters.search && (
          <button
            type="button"
            onClick={() => onChange({ search: "" })}
            className="absolute end-1.5 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-xs text-ink-3 hover:text-ink"
          >
            <X className="size-3" />
          </button>
        )}
      </div>
      <span className="mx-1 h-4 w-px bg-line" />
      <MultiFilter label={t("team")} options={options.teams} value={filters.teamIds} onChange={(v) => onChange({ teamIds: v })} searchable />
      <MultiFilter label={t("stage")} options={options.stages} value={filters.stageNodeIds} onChange={(v) => onChange({ stageNodeIds: v })} searchable />
      <MultiFilter label={t("registration")} options={options.registrations} value={filters.registrationIds} onChange={(v) => onChange({ registrationIds: v })} searchable wide />
      <MultiFilter label={t("badgeType")} options={options.badgeTypes} value={filters.badgeTypeIds} onChange={(v) => onChange({ badgeTypeIds: v })} />
      <MultiFilter label={t("workflow")} options={options.workflows} value={filters.workflowIds} onChange={(v) => onChange({ workflowIds: v })} wide />
      <MultiFilter
        label={t("screening")}
        options={(["blacklist", "watchlist", "clear"] as const).map((v) => ({ value: v, label: t(`screeningOptions.${v}`) }))}
        value={filters.screening}
        onChange={(v) => onChange({ screening: v as QueueFilters["screening"] })}
      />
      <SingleFilter
        label={t("assigned")}
        options={(["anyone", "me", "nobody"] as const).map((v) => ({ value: v, label: t(`assignedOptions.${v}`) }))}
        value={filters.assigned}
        defaultValue="anyone"
        onChange={(v) => onChange({ assigned: v as QueueFilters["assigned"] })}
      />
      <SingleFilter
        label={t("submitted")}
        options={(["any", "today", "7d", "30d"] as const).map((v) => ({ value: v, label: t(`submittedOptions.${v}`) }))}
        value={filters.submitted}
        defaultValue="any"
        onChange={(v) => onChange({ submitted: v as QueueFilters["submitted"] })}
      />
      {hasActiveFilters(filters) && (
        <button
          type="button"
          onClick={() => onChange({ ...EMPTY_FILTERS, statuses: filters.statuses })}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-accent-text hover:bg-accent-soft"
        >
          <RotateCcw className="size-3" />
          {t("reset")}
        </button>
      )}
    </div>
  );
}
