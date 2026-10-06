"use client";

import { CalendarClock, ChevronDown, Download, FileSpreadsheet, FileText, Lock, Mail, Printer, RotateCcw, Search, ShieldCheck, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ActionDialog, DialogIcon } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { MultiFilter, SingleFilter, type FilterOption } from "@/components/ui/FilterMenu";
import { HScroll } from "@/components/ui/HScroll";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/Menu";
import { Segmented } from "@/components/ui/Segmented";
import { Select } from "@/components/ui/Select";
import { Pill } from "@/components/ui/Status";
import { toast } from "@/components/ui/Toast";
import { Tooltip } from "@/components/ui/Tooltip";
import { TONE } from "@/design/tones";
import { dayOf, REPORT_KEYS, type ReportResult, type ReportRow } from "@/domain/reports";
import type { Database, ID, ReportFilters, ReportFormat, ReportKey, ReportSchedule } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { cn } from "@/lib/cn";
import { reportService } from "@/services/reports";
import { REPORT_META, toFileTable, type CellText } from "./model";

const DAY = 86_400_000;

// ─── Picker ─────────────────────────────────────────────────────────────

/** The eight reports as cards; ones the viewer can't open are shown locked. */
export function ReportPicker({ selected, canOpen, onSelect }: { selected: ReportKey | null; canOpen: (k: ReportKey) => boolean; onSelect: (k: ReportKey) => void }) {
  const t = useTranslations("reports");
  return (
    <HScroll label={t("picker.label")} className="-mx-1 gap-3 px-1 py-1 md:grid md:grid-cols-2 md:overflow-visible lg:grid-cols-4">
      {REPORT_KEYS.map((k) => {
        const { icon: Icon, tone } = REPORT_META[k];
        const locked = !canOpen(k);
        const active = selected === k;
        const card = (
          <button
            type="button"
            data-report-card={k}
            data-locked={locked || undefined}
            aria-pressed={active}
            aria-disabled={locked || undefined}
            onClick={() => !locked && onSelect(k)}
            className={cn(
              "group relative flex h-full w-full flex-col rounded-xl p-3.5 text-start ring-1 transition-all outline-none focus-visible:ring-2 focus-visible:ring-accent",
              locked
                ? "cursor-not-allowed bg-subtle ring-line"
                : active
                  ? "bg-accent-soft shadow-raised ring-2 ring-accent"
                  : "bg-surface shadow-card ring-line hover:-translate-y-px hover:shadow-raised",
            )}
          >
            <span className="flex items-start gap-3">
              <span className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-lg", locked ? "bg-hover text-ink-3" : TONE[tone].chip)}>
                <Icon className="size-[18px]" strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className={cn("truncate text-sm font-semibold", locked ? "text-ink-2" : "text-ink")}>{t(`names.${k}`)}</span>
                  {k === "automation" && (
                    <span className="inline-flex h-[18px] shrink-0 items-center rounded-full bg-teal-50 px-1.5 text-2xs font-semibold text-teal-700 ring-1 ring-teal-600/20 ring-inset">
                      {t("picker.phase2")}
                    </span>
                  )}
                </span>
                <span className={cn("mt-0.5 line-clamp-2 text-xs leading-snug", locked ? "text-ink-3" : "text-ink-2")}>{t(`descriptions.${k}`)}</span>
              </span>
            </span>
            <span className={cn("mt-2.5 inline-flex items-center gap-1.5 text-2xs font-medium", locked ? "text-ink-3" : "text-ink-3")}>
              {locked ? <Lock className="size-3 shrink-0 text-amber-600" /> : <ShieldCheck className={cn("size-3 shrink-0", TONE[tone].text)} />}
              <span className="truncate">{locked ? `${t("picker.locked")} · ${t(`access.${k}`)}` : t(`access.${k}`)}</span>
            </span>
          </button>
        );
        return (
          <li key={k} className="w-64 shrink-0 md:w-auto">
            {locked ? <Tooltip content={t("picker.lockedHint", { access: t(`access.${k}`) })}>{card}</Tooltip> : card}
          </li>
        );
      })}
    </HScroll>
  );
}

// ─── Filters ────────────────────────────────────────────────────────────

export type RangePreset = "7" | "30" | "90" | "custom";

export function rangeFor(preset: Exclude<RangePreset, "custom">, now: number) {
  return { from: dayOf(now - Number(preset) * DAY), to: dayOf(now) };
}

export function FilterBar({
  report,
  filters,
  preset,
  options,
  onChange,
  onPreset,
  onReset,
  dirty,
}: {
  report: ReportKey;
  filters: ReportFilters;
  preset: RangePreset;
  options: { registrations: FilterOption[]; badgeTypes: FilterOption[]; workflows: FilterOption[]; teams: FilterOption[] };
  onChange: (p: Partial<ReportFilters>) => void;
  onPreset: (p: Exclude<RangePreset, "custom">) => void;
  onReset: () => void;
  dirty: boolean;
}) {
  const t = useTranslations("reports.filters");
  const presets: FilterOption[] = [
    { value: "7", label: t("last7") },
    { value: "30", label: t("last30") },
    { value: "90", label: t("last90") },
    ...(preset === "custom" ? [{ value: "custom", label: t("custom") }] : []),
  ];
  const dateClass =
    "ltr-data h-8 rounded-lg border border-line-strong bg-surface px-2 text-xs text-ink shadow-xs outline-none focus:border-accent focus:ring-4 focus:ring-accent/10";
  return (
    <div role="group" aria-label={t("label")} className="flex flex-wrap items-center gap-2">
      <SingleFilter label={t("range")} options={presets} value={preset} defaultValue="30" alwaysShowValue onChange={(v) => v !== "custom" && onPreset(v as Exclude<RangePreset, "custom">)} />
      <span className="inline-flex items-center gap-1.5">
        <input
          type="date"
          aria-label={t("from")}
          data-filter="from"
          value={filters.from}
          max={filters.to}
          onChange={(e) => e.target.value && onChange({ from: e.target.value })}
          className={dateClass}
        />
        <span className="text-xs text-ink-3">–</span>
        <input
          type="date"
          aria-label={t("to")}
          data-filter="to"
          value={filters.to}
          min={filters.from}
          onChange={(e) => e.target.value && onChange({ to: e.target.value })}
          className={dateClass}
        />
      </span>
      <span className="mx-0.5 hidden h-4 w-px bg-line sm:block" />
      <MultiFilter label={t("registration")} options={options.registrations} value={filters.registrationIds} onChange={(v) => onChange({ registrationIds: v })} searchable wide />
      <MultiFilter label={t("badgeType")} options={options.badgeTypes} value={filters.badgeTypeIds} onChange={(v) => onChange({ badgeTypeIds: v })} />
      <MultiFilter label={t("workflow")} options={options.workflows} value={filters.workflowIds} onChange={(v) => onChange({ workflowIds: v })} wide />
      <MultiFilter label={t("team")} options={options.teams} value={filters.teamIds} onChange={(v) => onChange({ teamIds: v })} searchable />
      {report === "activityLog" && (
        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
          <input
            dir="ltr"
            value={filters.requestId ?? ""}
            onChange={(e) => onChange({ requestId: e.target.value })}
            placeholder={t("requestIdPlaceholder")}
            aria-label={t("requestId")}
            className="ltr-data h-8 w-full rounded-lg border border-line-strong bg-surface ps-8 pe-7 font-mono text-xs text-ink shadow-xs outline-none placeholder:font-sans placeholder:text-ink-3 focus:border-accent focus:ring-4 focus:ring-accent/10"
          />
          {filters.requestId && (
            <button
              type="button"
              onClick={() => onChange({ requestId: "" })}
              aria-label={t("reset")}
              className="absolute end-1.5 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-xs text-ink-3 hover:text-ink"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      )}
      {dirty && (
        <button type="button" onClick={onReset} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-accent-text hover:bg-accent-soft">
          <RotateCcw className="size-3" />
          {t("reset")}
        </button>
      )}
    </div>
  );
}

/** Filters as label/value pairs (print header). */
export function useFilterSummary(db: Database) {
  const t = useTranslations("reports.filters");
  const fmt = useFormat();
  return (f: ReportFilters, scope: ID | "all", report: ReportKey): [string, string][] => {
    const join = (ids: ID[], get: (id: ID) => string) => ids.map(get).join(fmt.dir === "rtl" ? "، " : ", ");
    const out: [string, string][] = [[t("event"), scope === "all" ? t("allEvents") : fmt.text(db.events[scope]?.name)]];
    if (report === "activityLog" && f.requestId?.trim()) out.push([t("requestId"), f.requestId.trim().toUpperCase()]);
    else out.push([t("range"), t("dates", { from: fmt.day(f.from), to: fmt.day(f.to) })]);
    if (f.registrationIds.length) out.push([t("registration"), join(f.registrationIds, (id) => fmt.text(db.registrations[id]?.name))]);
    if (f.badgeTypeIds.length) out.push([t("badgeType"), join(f.badgeTypeIds, (id) => fmt.text(db.badgeTypes[id]?.name))]);
    if (f.workflowIds.length) out.push([t("workflow"), join(f.workflowIds, (id) => fmt.text(db.workflows[id]?.label))]);
    if (f.teamIds.length) out.push([t("team"), join(f.teamIds, (id) => fmt.text(db.teams[id]?.name))]);
    return out;
  };
}

// ─── Download ───────────────────────────────────────────────────────────

const FORMAT_ICON = { xlsx: FileSpreadsheet, csv: FileText, pdf: Printer } as const;
const FORMAT_TONE = { xlsx: "text-emerald-600", csv: "text-sky-600", pdf: "text-rose-600" } as const;

export function DownloadMenu({ canExport, disabledReason, busy, onDownload }: { canExport: boolean; disabledReason?: string; busy: ReportFormat | null; onDownload: (f: ReportFormat) => void }) {
  const t = useTranslations("reports.download");
  const reason = !canExport ? t("needsExport") : disabledReason;
  if (reason) {
    return (
      <Tooltip content={reason}>
        <span tabIndex={0} data-download-disabled className="inline-flex rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <Button variant="primary" disabled aria-label={`${t("button")} (${reason})`}>
            <Download className="size-4" />
            {t("button")}
          </Button>
        </span>
      </Tooltip>
    );
  }
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="primary" disabled={!!busy}>
          <Download className="size-4" />
          {busy ? t("working") : t("button")}
          <ChevronDown className="size-3.5 opacity-80" />
        </Button>
      </MenuTrigger>
      <MenuContent align="end" className="w-72">
        <MenuLabel>{t("menu")}</MenuLabel>
        {(["xlsx", "csv", "pdf"] as const).map((f) => {
          const Icon = FORMAT_ICON[f];
          return (
            <MenuItem key={f} onSelect={() => onDownload(f)}>
              <span className="flex min-w-0 items-center gap-2.5 py-1">
                <Icon className={cn("size-4 shrink-0", FORMAT_TONE[f])} />
                <span className="min-w-0">
                  <span className="block font-medium">{t(f)}</span>
                  <span className="block truncate text-xs text-ink-3">{t(`${f}Hint`)}</span>
                </span>
              </span>
            </MenuItem>
          );
        })}
        <MenuSeparator />
        <p className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-ink-3">
          <ShieldCheck className="size-3.5 text-emerald-600" />
          {t("logged")}
        </p>
      </MenuContent>
    </Menu>
  );
}

// ─── Schedules ──────────────────────────────────────────────────────────

const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;

function useWeekdays() {
  const fmt = useFormat();
  return useMemo(() => {
    const f = new Intl.DateTimeFormat(fmt.locale, { weekday: "long", timeZone: "UTC" });
    // 4 Oct 2026 is a Sunday (weekday 0).
    return Array.from({ length: 7 }, (_, i) => f.format(new Date(Date.UTC(2026, 9, 4 + i))));
  }, [fmt.locale]);
}

/** "daily at 08:00" / "every Monday at 08:00" */
export function useScheduleWhen() {
  const t = useTranslations("reports.schedule");
  const days = useWeekdays();
  return (s: Pick<ReportSchedule, "frequency" | "hour" | "weekday">) =>
    s.frequency === "daily" ? t("dailyAt", { time: hourLabel(s.hour) }) : t("weeklyAt", { day: days[s.weekday], time: hourLabel(s.hour) });
}

export function ScheduleDialog({
  report,
  filters,
  scope,
  viewerId,
  email,
  onClose,
}: {
  report: ReportKey;
  filters: ReportFilters;
  scope: ID | "all";
  viewerId: ID;
  email: string;
  onClose: () => void;
}) {
  const t = useTranslations("reports");
  const days = useWeekdays();
  const when = useScheduleWhen();
  const [frequency, setFrequency] = useState<"daily" | "weekly">("weekly");
  const [weekday, setWeekday] = useState(0);
  const [hour, setHour] = useState(8);
  const [format, setFormat] = useState<"xlsx" | "csv">("xlsx");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    const r = await reportService.saveSchedule({ report, format, filters, eventScope: scope, frequency, hour, weekday, actorId: viewerId });
    setBusy(false);
    if (!r.ok) return setError(t(`errors.${r.error}`));
    toast(t("schedule.saved", { report: t(`names.${report}`), when: when({ frequency, hour, weekday }) }));
    onClose();
  };

  return (
    <ActionDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("schedule.title")}
      description={t("schedule.description", { report: t(`names.${report}`), email })}
      icon={
        <DialogIcon className="bg-violet-50 text-violet-600 ring-1 ring-violet-600/15 ring-inset">
          <CalendarClock className="size-5" />
        </DialogIcon>
      }
      confirmLabel={t("schedule.save")}
      busy={busy}
      error={error}
      onConfirm={() => void save()}
    >
      <Field label={t("schedule.frequency")}>
        <Segmented
          label={t("schedule.frequency")}
          value={frequency}
          onChange={setFrequency}
          options={[
            { value: "daily", label: t("schedule.daily") },
            { value: "weekly", label: t("schedule.weekly") },
          ]}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        {frequency === "weekly" && (
          <Field label={t("schedule.weekday")}>
            <Select label={t("schedule.weekday")} value={String(weekday)} onChange={(v) => setWeekday(Number(v))} options={days.map((d, i) => ({ value: String(i), label: d }))} />
          </Field>
        )}
        <Field label={t("schedule.hour")}>
          <Select label={t("schedule.hour")} value={String(hour)} onChange={(v) => setHour(Number(v))} options={Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: hourLabel(h) }))} />
        </Field>
      </div>
      <Field label={t("schedule.format")}>
        <Segmented
          label={t("schedule.format")}
          value={format}
          onChange={setFormat}
          options={[
            { value: "xlsx", label: t("formatShort.xlsx"), icon: FileSpreadsheet },
            { value: "csv", label: t("formatShort.csv"), icon: FileText },
          ]}
        />
      </Field>
      <ul className="space-y-1.5 rounded-lg bg-subtle px-3.5 py-3 text-xs text-ink-2 ring-1 ring-line ring-inset">
        <li className="flex gap-2">
          <ShieldCheck className="mt-px size-3.5 shrink-0 text-violet-600" />
          {t("schedule.ownerNote")}
        </li>
        <li className="flex gap-2">
          <CalendarClock className="mt-px size-3.5 shrink-0 text-violet-600" />
          {t("schedule.rangeNote")}
        </li>
      </ul>
    </ActionDialog>
  );
}

export function SchedulesPanel({ db, viewerId }: { db: Database; viewerId: ID }) {
  const t = useTranslations("reports");
  const fmt = useFormat();
  const when = useScheduleWhen();
  const [deleting, setDeleting] = useState<ID | null>(null);
  const mine = Object.values(db.reportSchedules)
    .filter((s) => s.ownerId === viewerId)
    .sort((a, b) => a.nextRunAt.localeCompare(b.nextRunAt));

  const remove = async (s: ReportSchedule) => {
    setDeleting(s.id);
    const r = await reportService.deleteSchedule({ id: s.id, actorId: viewerId });
    setDeleting(null);
    toast(r.ok ? t("schedules.deleted") : t(`errors.${r.error}`));
  };

  return (
    <section data-panel="schedules" className="overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-line">
      <header className="flex items-start gap-3 border-b border-line px-5 py-4">
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
          <Mail className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">{t("schedules.title")}</h2>
          <p className="text-xs text-ink-3">{t("schedules.subtitle")}</p>
        </div>
      </header>
      {mine.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm font-medium text-ink">{t("schedules.emptyTitle")}</p>
          <p className="mt-1 text-xs text-ink-3">{t("schedules.emptyBody")}</p>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {mine.map((s) => {
            const { icon: Icon, tone } = REPORT_META[s.report];
            return (
              <li key={s.id} data-schedule={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-lg", TONE[tone].chip)}>
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                    {t(`names.${s.report}`)}
                    <span className="inline-flex h-5 items-center rounded-md bg-hover px-1.5 text-2xs font-semibold text-ink-2">{t(`formatShort.${s.format}`)}</span>
                    {s.active ? (
                      <Pill tone="emerald">{t("schedules.active")}</Pill>
                    ) : (
                      <Tooltip content={t("schedules.pausedHint")}>
                        <span>
                          <Pill tone="amber">{t("schedules.paused")}</Pill>
                        </span>
                      </Tooltip>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-2 first-letter:uppercase">{when(s)}</p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink-3">
                    <span>
                      {t("schedules.next")}: <span className="tabular text-ink-2">{fmt.full(s.nextRunAt)}</span>
                    </span>
                    <span>
                      {t("schedules.last")}: <span className="tabular text-ink-2">{s.lastRunAt ? fmt.full(s.lastRunAt) : t("schedules.never")}</span>
                    </span>
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  disabled={deleting === s.id}
                  onClick={() => void remove(s)}
                  aria-label={t("schedules.delete", { report: t(`names.${s.report}`) })}
                  className="hover:text-rose-600"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ─── Downloads log ──────────────────────────────────────────────────────

export function DownloadsLog({ db, scope }: { db: Database; scope: ID | "all" }) {
  const t = useTranslations("reports");
  const fmt = useFormat();
  const items = Object.values(db.reportDownloads)
    .filter((d) => scope === "all" || d.eventScope === scope || d.eventScope === "all")
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 12);
  return (
    <section data-panel="downloads" className="overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-line">
      <header className="flex items-start gap-3 border-b border-line px-5 py-4">
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
          <ShieldCheck className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-ink">{t("downloads.title")}</h2>
          <p className="text-xs text-ink-3">{t("downloads.subtitle")}</p>
        </div>
        {items.length > 0 && <span className="tabular shrink-0 pt-0.5 text-xs text-ink-3">{t("downloads.count", { count: items.length, n: fmt.number(items.length) })}</span>}
      </header>
      {items.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-ink-3">{t("downloads.empty")}</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((d) => {
            const name = db.users[d.actorId]?.name ?? d.actorId;
            const Icon = FORMAT_ICON[d.format];
            return (
              <li key={d.id} data-download={d.id} className="flex items-center gap-3 px-5 py-3">
                <Avatar name={name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 text-sm">
                    <bdi className="font-semibold text-ink">{name}</bdi>
                    <span className="text-ink-2">{t(`names.${d.report}`)}</span>
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
                    <span className="inline-flex items-center gap-1">
                      <Icon className={cn("size-3", FORMAT_TONE[d.format])} />
                      {t(`formatShort.${d.format}`)}
                    </span>
                    <span className="tabular">{t("view.rows", { count: d.rows, n: fmt.number(d.rows) })}</span>
                    {d.masked ? (
                      <span className="inline-flex items-center gap-1 text-amber-700">
                        <Lock className="size-3" />
                        {t("downloads.masked")}
                      </span>
                    ) : (
                      <span>
                        {t("downloads.ids")}: {t("downloads.full")}
                      </span>
                    )}
                  </p>
                </div>
                <span className="tabular shrink-0 text-xs text-ink-3">{fmt.dateTime(d.at)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ─── Print (PDF) ────────────────────────────────────────────────────────

/**
 * A print-only copy of the report (title, filters, generated time and every
 * row), shown while the browser's print dialog is open: "Save as PDF" keeps
 * Arabic text correct. The app chrome is hidden by the print stylesheet.
 */
export function PrintView({
  result,
  rows,
  text,
  label,
  title,
  filters,
  generatedBy,
  onDone,
}: {
  result: ReportResult;
  rows: ReportRow[];
  text: CellText;
  label: (report: ReportKey, column: string) => string;
  title: string;
  filters: [string, string][];
  generatedBy: string;
  onDone: () => void;
}) {
  const t = useTranslations("reports");
  const fmt = useFormat();
  const table = useMemo(() => toFileTable(result, rows, text, label), [result, rows, text, label]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      window.print();
      onDone();
    }, 80);
    return () => window.clearTimeout(id);
  }, [onDone]);

  return createPortal(
    <div id="report-print" dir={fmt.dir} lang={fmt.locale}>
      <style>{`
        @media screen { #report-print { display: none; } }
        @media print {
          @page { size: landscape; margin: 12mm; }
          html, body { height: auto !important; overflow: visible !important; background: none !important; }
          body > *:not(#report-print) { display: none !important; }
          #report-print { display: block; font-size: 9pt; color: black; }
          #report-print * { color: black !important; background: none !important; box-shadow: none !important; }
          #report-print table { width: 100%; border-collapse: collapse; }
          #report-print th, #report-print td { border-bottom: 0.5pt solid gray; padding: 3pt 4pt; text-align: start; vertical-align: top; }
          #report-print thead { display: table-header-group; }
          #report-print tr { break-inside: avoid; }
        }
      `}</style>
      <h1 style={{ fontSize: "16pt", fontWeight: 700, margin: 0 }}>{title}</h1>
      <p style={{ margin: "4pt 0 0" }}>{generatedBy}</p>
      <p style={{ margin: "6pt 0 0" }}>
        <strong>{t("print.filters")}: </strong>
        {filters.map(([k, v]) => `${k}: ${v}`).join(" · ")}
      </p>
      {result.masked && <p style={{ margin: "6pt 0 0", fontStyle: "italic" }}>{t("view.masked")}</p>}
      <p style={{ margin: "6pt 0 8pt" }}>{t("view.rows", { count: rows.length, n: fmt.number(rows.length) })}</p>
      <table>
        <thead>
          <tr>
            {table.header.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r, i) => (
            <tr key={rows[i]._id}>
              {r.map((v, j) => (
                <td key={j} dir={result.columns[j].kind === "code" ? "ltr" : "auto"}>
                  {v === null ? "—" : table.numeric[j] ? fmt.number(Number(v)) : v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>,
    document.body,
  );
}
