"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/Avatar";
import { Pill } from "@/components/ui/Status";
import { BADGE_STATUS_TONE, STATUS_TONE, TONE, type Tone } from "@/design/tones";
import type { ColumnKind, ReportColumn, ReportResult, ReportRow } from "@/domain/reports";
import type { BadgeStatus, RequestStatus } from "@/domain/types";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { PAYMENT_TONE, REGISTRATION_TONE } from "@/features/attendees/model";
import { columnClass, ENTRY_STATUS_TONE, LEVEL_TONE, LIST_TONE, MATCH_STATUS_TONE, NUMERIC, OUTCOME_TONE, STRENGTH_TONE, type CellText, type Sort } from "./model";

/** Pill colour for status-like kinds; null for plain cells. */
function toneOf(kind: ColumnKind, v: string): Tone | null {
  switch (kind) {
    case "requestStatus":
      return STATUS_TONE[v as RequestStatus] ?? "gray";
    case "badgeStatus":
      return BADGE_STATUS_TONE[v as BadgeStatus] ?? "gray";
    case "payment":
      return PAYMENT_TONE[v as keyof typeof PAYMENT_TONE] ?? "gray";
    case "registrationStatus":
      return REGISTRATION_TONE[v as keyof typeof REGISTRATION_TONE] ?? "gray";
    case "stageOutcome":
      return OUTCOME_TONE[v] ?? "gray";
    case "listType":
      return LIST_TONE[v as keyof typeof LIST_TONE] ?? "gray";
    case "matchStatus":
      return MATCH_STATUS_TONE[v as keyof typeof MATCH_STATUS_TONE] ?? "gray";
    case "strength":
      return STRENGTH_TONE[v as keyof typeof STRENGTH_TONE] ?? "gray";
    case "entryStatus":
      return ENTRY_STATUS_TONE[v as keyof typeof ENTRY_STATUS_TONE] ?? "gray";
    case "level":
      return LEVEL_TONE[v as keyof typeof LEVEL_TONE] ?? "gray";
    default:
      return null;
  }
}

function CellView({ column, row, text, canOpenRequests }: { column: ReportColumn; row: ReportRow; text: CellText; canOpenRequests: boolean }) {
  const t = useTranslations("reports.view");
  const v = row[column.key];
  if (v === null || v === undefined || v === "") return <span className="text-ink-3">—</span>;
  const label = text(column.kind, v);
  const tone = typeof v === "string" ? toneOf(column.kind, v) : null;
  if (tone) return <Pill tone={tone}>{label}</Pill>;

  switch (column.kind) {
    case "code": {
      const isRequest = column.key === "request" && row._requestId === v;
      if (isRequest && canOpenRequests) {
        return (
          <Link href={`/requests/${row._requestId}`} aria-label={t("openRequest", { id: label })} className="ltr-data font-mono text-xs font-semibold text-accent-text hover:underline">
            {label}
          </Link>
        );
      }
      return <span className={cn("ltr-data font-mono text-xs", isRequest ? "font-semibold text-ink" : "text-ink-2")}>{label}</span>;
    }
    case "user":
      return v === "system" || v === "attendee" ? (
        <span className="text-ink-2 italic">{label}</span>
      ) : (
        <span className="inline-flex min-w-0 items-center gap-2">
          <Avatar name={label} size="sm" />
          <bdi className="max-w-32 truncate text-ink @[36rem]:max-w-56">{label}</bdi>
        </span>
      );
    case "number":
    case "hours":
      return <span className="tabular font-medium text-ink">{label}</span>;
    case "date":
    case "dateTime":
      return <span className="tabular text-ink-2">{label}</span>;
    case "matchType":
    case "screeningField":
    case "reason":
      return <span className={cn("inline-flex h-5 items-center rounded-md px-1.5 text-2xs font-semibold", TONE.slate.chip)}>{label}</span>;
    case "historyAction":
      return <span className="font-medium text-ink">{label}</span>;
    case "text":
      return (
        <bdi dir="auto" className={cn("block truncate", column.key === "remarks" ? "max-w-48 text-ink-2 @[52rem]:max-w-80" : "max-w-28 font-medium text-ink @[36rem]:max-w-64")} title={label}>
          {label}
        </bdi>
      );
    default:
      return <span className="text-ink">{label}</span>;
  }
}

/** A report's rows as a sortable table; columns collapse by container width. */
export function ReportTable({
  result,
  rows,
  text,
  label,
  sort,
  onSort,
  canOpenRequests,
}: {
  result: ReportResult;
  rows: ReportRow[];
  text: CellText;
  label: (report: ReportResult["key"], column: string) => string;
  sort: Sort | null;
  onSort: (column: string) => void;
  canOpenRequests: boolean;
}) {
  const t = useTranslations("reports.view");
  return (
    <div className="@container">
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-sm" data-report-table={result.key}>
          <thead className="bg-subtle">
            <tr>
              {result.columns.map((c) => {
                const name = label(result.key, c.key);
                const active = sort?.column === c.key;
                const Icon = !active ? ChevronsUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    data-column={c.key}
                    aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                    className={cn("h-10 border-b border-line px-2 py-1.5 text-start whitespace-nowrap first:ps-4 last:pe-4 @[36rem]:px-3 @[36rem]:first:ps-5 @[36rem]:last:pe-5", NUMERIC.includes(c.kind) && "text-end", columnClass(result.key, c.key))}
                  >
                    <button
                      type="button"
                      onClick={() => onSort(c.key)}
                      aria-label={t("sort", { column: name })}
                      className={cn(
                        "eyebrow -mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-accent",
                        active && "text-accent-text",
                      )}
                    >
                      {name}
                      <Icon className={cn("size-3 shrink-0", active ? "text-accent-text" : "text-ink-3/70")} />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._id} data-row={r._id} className="transition-colors hover:bg-subtle">
                {result.columns.map((c) => (
                  <td
                    key={c.key}
                    data-column={c.key}
                    className={cn(
                      "h-12 max-w-80 border-b border-line px-2 align-middle whitespace-nowrap first:ps-4 last:pe-4 @[36rem]:px-3 @[36rem]:first:ps-5 @[36rem]:last:pe-5",
                      NUMERIC.includes(c.kind) && "text-end",
                      columnClass(result.key, c.key),
                    )}
                  >
                    <CellView column={c} row={r} text={text} canOpenRequests={canOpenRequests} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
