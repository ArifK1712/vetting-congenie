"use client";

import {
  AlarmClock,
  Bot,
  ClipboardList,
  History,
  ScanSearch,
  ShieldAlert,
  Timer,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import type { Tone } from "@/design/tones";
import type { Cell, ColumnKind, ReportResult, ReportRow } from "@/domain/reports";
import type {
  BadgeStatus,
  BlacklistEntry,
  BlacklistReason,
  Database,
  HistoryAction,
  LocalizedText,
  MatchType,
  RequestStatus,
  ReportFilters,
  ReportKey,
  ScreeningField,
  ScreeningMatch,
  WatchlistLevel,
} from "@/domain/types";
import { useFormat } from "@/i18n/format";

/** Icon and colour per report (picker cards, headers). */
export const REPORT_META: Record<ReportKey, { icon: LucideIcon; tone: Tone }> = {
  vettingStatus: { icon: ClipboardList, tone: "indigo" },
  timePerStage: { icon: Timer, tone: "sky" },
  lateRequests: { icon: AlarmClock, tone: "orange" },
  reviewerActivity: { icon: UsersRound, tone: "violet" },
  automation: { icon: Bot, tone: "teal" },
  listMatches: { icon: ScanSearch, tone: "rose" },
  listEntries: { icon: ShieldAlert, tone: "amber" },
  activityLog: { icon: History, tone: "emerald" },
};

/** Reports whose date range doesn't apply (they show "now"). */
export const UNDATED: Partial<Record<ReportKey, "noDates" | "noDatesLate">> = { listEntries: "noDates", lateRequests: "noDatesLate" };

/**
 * Which columns stay on narrow containers: 1 always, 2 from 36rem, 3 from
 * 52rem, 4 from 80rem. Hidden columns are still in every download.
 */
const PRIORITY: Partial<Record<ReportKey, Record<string, 1 | 2 | 3 | 4>>> = {
  vettingStatus: { registration: 4, badgeType: 4, registrationStatus: 3, payment: 3, badgeStatus: 2, nationalId: 2, passportNo: 4, submitted: 3, decided: 4 },
  timePerStage: { team: 3, reviewer: 2, entered: 3, completed: 4, outcome: 2 },
  lateRequests: { attendee: 2, status: 3, stage: 3, team: 2, owner: 4, timeLimit: 4, waiting: 3 },
  reviewerActivity: { claims: 3, approved: 2, rejected: 2, moreInfo: 3, escalated: 3, avgHours: 2 },
  automation: { rule: 2, at: 2 },
  listMatches: { entry: 3, matchType: 2, field: 4, score: 3, strength: 2, found: 3, decidedBy: 4, decided: 4 },
  listEntries: { entry: 2, idNumber: 2, reason: 3, level: 3, starts: 4, ends: 2 },
  activityLog: { actor: 2, from: 3, to: 2, remarks: 3 },
};
const PRIORITY_CLASS = { 1: "", 2: "hidden @[36rem]:table-cell", 3: "hidden @[52rem]:table-cell", 4: "hidden @[80rem]:table-cell" } as const;
export const columnClass = (report: ReportKey, column: string) => PRIORITY_CLASS[PRIORITY[report]?.[column] ?? 1];

/** Kinds whose cells are numbers (sorted numerically, exported as numbers). */
export const NUMERIC: ColumnKind[] = ["number", "hours"];
const DATED: ColumnKind[] = ["date", "dateTime"];

export const OUTCOME_TONE: Record<string, Tone> = { approve: "emerald", reject: "rose", moreInfo: "amber", escalate: "orange", returned: "slate" };
export const LIST_TONE: Record<ScreeningMatch["listType"], Tone> = { blacklist: "red", watchlist: "amber" };
export const MATCH_STATUS_TONE: Record<ScreeningMatch["status"], Tone> = { open: "sky", confirmed: "red", cleared: "emerald" };
export const STRENGTH_TONE: Record<ScreeningMatch["strength"], Tone> = { strong: "red", possible: "amber" };
export const ENTRY_STATUS_TONE: Record<BlacklistEntry["status"], Tone> = { pending_approval: "amber", active: "rose", removed: "gray", expired: "slate", not_approved: "gray" };
export const LEVEL_TONE: Record<WatchlistLevel, Tone> = { low: "gold", medium: "amber", high: "orange" };

const isLocalized = (v: Cell): v is LocalizedText => !!v && typeof v === "object";

/**
 * Words a cell for the screen and for files, in the current language. The
 * same function feeds the table, the sort order, CSV, Excel and PDF, so a
 * download always matches what the user sees.
 */
export function useCellText(db: Database) {
  const t = useTranslations("reports");
  const ts = useTranslations("status");
  const tb = useTranslations("badgeStatus");
  const tp = useTranslations("payment");
  const tr = useTranslations("attendees.registrationStatus");
  const tm = useTranslations("matchReview.matchType");
  const treason = useTranslations("blacklist.reason");
  const tstatus = useTranslations("blacklist.status");
  const tlevel = useTranslations("watchlist.level");
  const fmt = useFormat();

  return useCallback(
    (kind: ColumnKind, v: Cell, mode: "screen" | "file" = "screen"): string => {
      if (v === null || v === undefined || v === "") return "";
      if (isLocalized(v)) return fmt.text(v);
      const s = String(v);
      switch (kind) {
        case "number":
          return mode === "file" ? s : fmt.number(Number(v));
        case "hours":
          return mode === "file" ? s : t("cell.hours", { n: fmt.number(Number(v)) });
        case "date":
          return s.length === 10 ? fmt.day(s) : fmt.date(s);
        case "dateTime":
          return mode === "file" ? fmt.full(s) : fmt.dateTime(s);
        case "user":
          return s === "system" ? t("cell.system") : s === "attendee" ? t("cell.attendee") : (db.users[s]?.name ?? s);
        case "requestStatus":
          return ts(s as RequestStatus);
        case "badgeStatus":
          return tb(s as BadgeStatus);
        case "payment":
          return tp(s as "paid" | "pending" | "free");
        case "registrationStatus":
          return tr(s as "submitted" | "confirmed" | "cancelled");
        case "stageOutcome":
          return t(`outcome.${s as "approve" | "reject" | "moreInfo" | "escalate" | "returned"}`);
        case "listType":
          return t(`list.${s as ScreeningMatch["listType"]}`);
        case "matchType":
          return tm(s as MatchType);
        case "matchStatus":
          return t(`matchStatus.${s as ScreeningMatch["status"]}`);
        case "screeningField":
          return t(`field.${s as ScreeningField}`);
        case "strength":
          return t(`strength.${s as ScreeningMatch["strength"]}`);
        case "entryStatus":
          return tstatus(s as BlacklistEntry["status"]);
        case "level":
          return tlevel(s as WatchlistLevel);
        case "reason":
          return treason(s as BlacklistReason);
        case "historyAction":
          return t(`action.${s as HistoryAction}`);
        default:
          return s;
      }
    },
    [t, ts, tb, tp, tr, tm, treason, tstatus, tlevel, fmt, db],
  );
}

export type CellText = ReturnType<typeof useCellText>;

/** Column header in the current language. */
export function useColumnLabel() {
  const t = useTranslations("reports.columns");
  return useCallback((report: ReportKey, column: string) => t(`${report}.${column}` as Parameters<typeof t>[0]), [t]);
}

export interface Sort {
  column: string;
  dir: "asc" | "desc";
}

/** Rows in the order the user chose (or the report's own order). */
export function sortRows(result: ReportResult, sort: Sort | null, text: CellText, locale: string): ReportRow[] {
  if (!sort) return result.rows;
  const col = result.columns.find((c) => c.key === sort.column);
  if (!col) return result.rows;
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: "base" });
  const key = (r: ReportRow) => {
    const v = r[col.key];
    if (v === null || v === undefined || v === "") return null;
    if (NUMERIC.includes(col.kind)) return Number(v);
    if (DATED.includes(col.kind)) return Date.parse(String(v));
    return text(col.kind, v);
  };
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...result.rows].sort((x, y) => {
    const a = key(x);
    const b = key(y);
    // Empty cells always last.
    if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
    if (typeof a === "number" && typeof b === "number") return (a - b) * sign;
    return collator.compare(String(a), String(b)) * sign;
  });
}

// ─── Files ──────────────────────────────────────────────────────────────

export interface FileTable {
  header: string[];
  /** Numbers stay numbers; everything else is the on-screen wording. */
  rows: (string | number | null)[][];
  numeric: boolean[];
}

export function toFileTable(result: ReportResult, rows: ReportRow[], text: CellText, label: (report: ReportKey, column: string) => string): FileTable {
  return {
    header: result.columns.map((c) => label(result.key, c.key)),
    numeric: result.columns.map((c) => NUMERIC.includes(c.kind)),
    rows: rows.map((r) =>
      result.columns.map((c) => {
        const v = r[c.key];
        if (v === null || v === undefined || v === "") return null;
        return NUMERIC.includes(c.kind) ? Number(v) : text(c.kind, v, "file");
      }),
    ),
  };
}

/** e.g. vetting-status_2026-10-06.csv */
export const fileName = (report: ReportKey, day: string, ext: string) => `${report.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}_${day}.${ext}`;

const csvCell = (v: string | number | null) => {
  if (v === null) return "";
  let s = String(v);
  // Stop spreadsheet apps from reading a cell as a formula.
  if (typeof v === "string" && /^[=+@]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** UTF-8 with a byte order mark so Excel opens Arabic correctly. */
export function toCsvBlob(table: FileTable) {
  const lines = [table.header, ...table.rows].map((r) => r.map(csvCell).join(","));
  return new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
}

export async function toXlsxBlob(table: FileTable, sheet: string, rtl: boolean) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const header = table.header.map((h) => ({ value: h, fontWeight: "bold" as const }));
  const body = table.rows.map((r) => r.map((v, i) => (v === null ? null : table.numeric[i] ? { value: Number(v), type: Number } : { value: String(v), type: String })));
  const widths = table.header.map((h, i) => ({ width: Math.min(48, Math.max(h.length, ...table.rows.slice(0, 200).map((r) => String(r[i] ?? "").length)) + 2) }));
  // Excel sheet names: at most 31 characters, no []:*?/\
  const name = sheet.replace(/[[\]:*?/\\]/g, " ").slice(0, 31);
  return writeXlsxFile([header, ...body], { sheet: name, columns: widths, rightToLeft: rtl, stickyRowsCount: 1 }).toBlob();
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const presetOf = (f: ReportFilters, today: string, dayOf: (ms: number) => string, now: number): "7" | "30" | "90" | "custom" => {
  if (f.to !== today) return "custom";
  for (const d of [7, 30, 90] as const) if (f.from === dayOf(now - d * 86_400_000)) return String(d) as "7" | "30" | "90";
  return "custom";
};
