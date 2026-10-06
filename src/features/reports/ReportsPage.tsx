"use client";

import { CalendarClock, ChevronLeft, ChevronRight, Clock, EyeOff, Inbox, Lock, SearchX, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DirIcon } from "@/components/ui/DirIcon";
import { EmptyState } from "@/components/ui/EmptyState";
import type { FilterOption } from "@/components/ui/FilterMenu";
import { toast } from "@/components/ui/Toast";
import { PAGE } from "@/design/layout";
import { TONE } from "@/design/tones";
import { teamsOfUser } from "@/domain/permissions";
import { buildReport, canExport as canExportFn, canOpenReport, dayOf, defaultFilters, REPORT_KEYS } from "@/domain/reports";
import type { ReportFilters, ReportFormat, ReportKey } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { cn } from "@/lib/cn";
import { useNow } from "@/lib/useNow";
import { reportService } from "@/services/reports";
import { useDb, useSession } from "@/store/app";
import { useViewer } from "@/store/useViewer";
import { DownloadMenu, DownloadsLog, FilterBar, PrintView, rangeFor, ReportPicker, ScheduleDialog, SchedulesPanel, useFilterSummary, type RangePreset } from "./parts";
import { fileName, presetOf, REPORT_META, saveBlob, sortRows, toCsvBlob, toFileTable, toXlsxBlob, UNDATED, useCellText, useColumnLabel, type Sort } from "./model";
import { ReportTable } from "./ReportTable";

const PAGE_SIZE = 50;
const isReportKey = (v: string | null): v is ReportKey => !!v && (REPORT_KEYS as string[]).includes(v);

/** 14.2 Reports: ready-made reports with shared filters, downloads (logged, AC25) and scheduled emails. */
export function ReportsPage() {
  const t = useTranslations("reports");
  const fmt = useFormat();
  const db = useDb();
  const viewer = useViewer();
  const scope = useSession((s) => s.eventScope);
  const params = useSearchParams();
  const now = useNow(60_000);
  const text = useCellText(db);
  const label = useColumnLabel();
  const summary = useFilterSummary(db);

  const [filters, setFilters] = useState<ReportFilters>(() => defaultFilters(Date.now()));
  const [sort, setSort] = useState<Sort | null>(null);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState<ReportFormat | null>(null);
  const [printing, setPrinting] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  const canOpen = useCallback((k: ReportKey) => canOpenReport(db, viewer.id, k), [db, viewer.id]);
  const canExport = canExportFn(db, viewer.id);
  const requested = params.get("report");
  const selected: ReportKey | null = isReportKey(requested) && canOpen(requested) ? requested : (REPORT_KEYS.find(canOpen) ?? null);

  // A new report, persona or event starts on page one in the report's own order.
  const viewKey = `${selected}|${viewer.id}|${scope}`;
  const [prevView, setPrevView] = useState(viewKey);
  if (viewKey !== prevView) {
    setPrevView(viewKey);
    setSort(null);
    setPage(0);
  }

  const select = (k: ReportKey) => {
    const url = new URL(window.location.href);
    url.searchParams.set("report", k);
    window.history.replaceState(null, "", url);
  };

  const result = useMemo(() => (selected ? buildReport(db, viewer.id, scope, selected, filters, now) : null), [db, viewer.id, scope, selected, filters, now]);
  const rows = useMemo(() => (result ? sortRows(result, sort, text, fmt.locale) : []), [result, sort, text, fmt.locale]);

  const options = useMemo(() => {
    const regs = Object.values(db.registrations).filter((r) => scope === "all" || r.eventId === scope);
    const teams = viewer.can("queue.reviewAll") || viewer.can("registration.vettingSettings") ? Object.values(db.teams) : teamsOfUser(db, viewer.id);
    return {
      registrations: regs.map((r): FilterOption => ({ value: r.id, label: fmt.text(r.name), hint: fmt.text(db.events[r.eventId]?.name) })),
      badgeTypes: Object.values(db.badgeTypes).map((b): FilterOption => ({ value: b.id, label: fmt.text(b.name) })),
      workflows: Object.values(db.workflows).map((w): FilterOption => ({ value: w.id, label: fmt.text(w.label), hint: fmt.text(w.name) })),
      teams: teams.map((x): FilterOption => ({ value: x.id, label: fmt.text(x.name) })),
    };
  }, [db, scope, viewer, fmt]);

  const today = dayOf(now);
  const preset: RangePreset = presetOf(filters, today, dayOf, now);
  const dirty =
    preset !== "30" || filters.registrationIds.length + filters.badgeTypeIds.length + filters.workflowIds.length + filters.teamIds.length > 0 || !!filters.requestId?.trim();
  const patch = (p: Partial<ReportFilters>) => {
    setFilters((f) => ({ ...f, ...p }));
    setPage(0);
  };

  const onSort = (column: string) => {
    setSort((s) => (s?.column !== column ? { column, dir: "asc" } : s.dir === "asc" ? { column, dir: "desc" } : null));
    setPage(0);
  };

  const download = async (format: ReportFormat) => {
    if (!result) return;
    setBusy(format);
    try {
      // AC25: the download is logged before the file is handed over.
      const r = await reportService.logDownload({ report: result.key, format, filters, eventScope: scope, actorId: viewer.id });
      if (!r.ok) return toast(t(`errors.${r.error}`));
      const name = t(`names.${result.key}`);
      if (format === "pdf") {
        setPrinting(true);
        toast(t("download.printReady", { report: name }));
        return;
      }
      const table = toFileTable(result, rows, text, label);
      const blob = format === "csv" ? toCsvBlob(table) : await toXlsxBlob(table, name, fmt.dir === "rtl");
      saveBlob(blob, fileName(result.key, dayOf(Date.now()), format));
      toast(t("download.done", { count: rows.length, n: fmt.number(rows.length), report: name }));
    } finally {
      setBusy(null);
    }
  };
  const donePrinting = useCallback(() => setPrinting(false), []);

  if (!selected) {
    return (
      <div className={cn(PAGE, "pb-12")}>
        <EmptyState icon={Lock} title={t("noAccessTitle")} body={t("noAccessBody")} />
      </div>
    );
  }

  const openable = REPORT_KEYS.filter(canOpen).length;
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const from = rows.length ? safePage * PAGE_SIZE + 1 : 0;
  const to = Math.min(rows.length, (safePage + 1) * PAGE_SIZE);
  const { icon: Icon, tone } = REPORT_META[selected];
  const oneRequest = selected === "activityLog" ? filters.requestId?.trim().toUpperCase() : "";
  const undated = UNDATED[selected];
  const filtersActive = filters.registrationIds.length + filters.badgeTypeIds.length + filters.workflowIds.length + filters.teamIds.length > 0;
  const canOpenRequests = viewer.can("queue.access") || viewer.can("queue.reviewAll");
  const phase2 = !!result?.phase2;

  return (
    <div className={cn(PAGE, "space-y-5 pb-12")}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-ink">{t("title")}</h1>
          <p className="mt-1.5 max-w-3xl text-sm text-ink-2">{t("subtitle")}</p>
        </div>
        <span className="tabular text-xs font-medium text-ink-3">{t("picker.available", { count: openable, n: fmt.number(openable), total: fmt.number(REPORT_KEYS.length) })}</span>
      </div>

      <ReportPicker selected={selected} canOpen={canOpen} onSelect={select} />

      <section data-report={selected} className="flex flex-col overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-line">
        {/* Report header */}
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-4 pt-4 pb-3.5 sm:px-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className={cn("inline-flex size-10 shrink-0 items-center justify-center rounded-xl", TONE[tone].chip)}>
              <Icon className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 className="flex flex-wrap items-center gap-2 text-lg font-bold text-ink" data-report-title>
                {t(`names.${selected}`)}
                {phase2 && (
                  <span className="inline-flex h-5 items-center rounded-full bg-teal-50 px-2 text-2xs font-semibold text-teal-700 ring-1 ring-teal-600/20 ring-inset">{t("phase2.badge")}</span>
                )}
              </h2>
              <p className="text-sm text-ink-2">{t(`descriptions.${selected}`)}</p>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
                <span className="tabular font-semibold text-ink-2" data-row-count>
                  {t("view.rows", { count: rows.length, n: fmt.number(rows.length) })}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3" />
                  {t("view.generated", { time: fmt.dateTime(new Date(now).toISOString()) })}
                </span>
                {result?.masked && (
                  <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                    <EyeOff className="size-3" />
                    {t("view.maskedShort")}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canExport && !phase2 && (
              <Button onClick={() => setScheduling(true)}>
                <CalendarClock className="size-4 text-violet-600" />
                {t("schedule.button")}
              </Button>
            )}
            <DownloadMenu canExport={canExport} disabledReason={phase2 ? t("download.phase2") : undefined} busy={busy} onDownload={(f) => void download(f)} />
          </div>
        </div>

        {/* Shared filters */}
        <div className="border-t border-line bg-subtle/60 px-4 py-3 sm:px-5">
          <FilterBar
            report={selected}
            filters={filters}
            preset={preset}
            options={options}
            onChange={patch}
            onPreset={(p) => patch(rangeFor(p, Date.now()))}
            onReset={() => {
              setFilters(defaultFilters(Date.now()));
              setPage(0);
            }}
            dirty={dirty}
          />
          {(oneRequest || undated) && (
            <p className="mt-2 text-xs text-ink-3" data-filter-note>
              {oneRequest ? t("filters.requestIdHint", { id: oneRequest }) : t(`filters.${undated!}`)}
            </p>
          )}
        </div>

        {result?.masked && (
          <p role="note" data-masked-notice className="flex items-start gap-2.5 border-t border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 sm:px-5">
            <EyeOff className="mt-0.5 size-4 shrink-0" />
            {t("view.masked")}
          </p>
        )}

        <div className="border-t border-line">
          {phase2 ? (
            <div className="flex flex-col items-center px-6 py-14 text-center" data-phase2>
              <span className="mb-4 inline-flex size-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-600 ring-1 ring-teal-600/15 ring-inset">
                <Sparkles className="size-5" />
              </span>
              <p className="text-base font-semibold text-ink">{t("phase2.title")}</p>
              <p className="mt-1.5 max-w-lg text-sm text-ink-2">{t("phase2.body")}</p>
            </div>
          ) : result && pageRows.length ? (
            <ReportTable result={result} rows={pageRows} text={text} label={label} sort={sort} onSort={onSort} canOpenRequests={canOpenRequests} />
          ) : (
            <EmptyState
              icon={oneRequest ? SearchX : filtersActive ? SearchX : Inbox}
              title={t("empty.title")}
              body={oneRequest ? t("empty.activityLogOne", { id: oneRequest }) : `${t(`empty.${selected}`)}${filtersActive || (!undated && preset !== "90") ? ` ${t("empty.filtered")}` : ""}`}
            />
          )}
        </div>

        {!phase2 && rows.length > PAGE_SIZE && (
          <div className="flex h-12 shrink-0 items-center justify-between border-t border-line bg-subtle px-4 text-xs text-ink-2 sm:px-5">
            <span className="tabular font-medium" data-range>
              {t("view.range", { from: fmt.number(from), to: fmt.number(to), total: fmt.number(rows.length) })}
            </span>
            <div className="flex items-center gap-1.5">
              <Button size="sm" iconOnly disabled={safePage === 0} onClick={() => setPage(safePage - 1)} aria-label={t("view.previousPage")}>
                <DirIcon icon={ChevronLeft} className="size-4" />
              </Button>
              <span className="tabular px-1.5 font-medium text-ink">
                {fmt.number(safePage + 1)} / {fmt.number(pageCount)}
              </span>
              <Button size="sm" iconOnly disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)} aria-label={t("view.nextPage")}>
                <DirIcon icon={ChevronRight} className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </section>

      {(canExport || viewer.can("queue.reviewAll")) && (
        <div className={cn("grid items-start gap-5", canExport && viewer.can("queue.reviewAll") && "xl:grid-cols-2")}>
          {canExport && <SchedulesPanel db={db} viewerId={viewer.id} />}
          {viewer.can("queue.reviewAll") && <DownloadsLog db={db} scope={scope} />}
        </div>
      )}

      {scheduling && (
        <ScheduleDialog report={selected} filters={filters} scope={scope} viewerId={viewer.id} email={viewer.user?.email ?? ""} onClose={() => setScheduling(false)} />
      )}
      {printing && result && (
        <PrintView
          result={result}
          rows={rows}
          text={text}
          label={label}
          title={`${t(`names.${result.key}`)} · ${t("title")}`}
          filters={summary(filters, scope, result.key)}
          generatedBy={t("print.generatedBy", { time: fmt.full(new Date().toISOString()), name: viewer.user?.name ?? "" })}
          onDone={donePrinting}
        />
      )}
    </div>
  );
}
