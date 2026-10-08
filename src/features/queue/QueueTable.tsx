"use client";

import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { ChevronRight, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { DirIcon } from "@/components/ui/DirIcon";
import { BadgeTypeChip, StatusLabel } from "@/components/ui/Status";
import { canClaim, type QueueRow } from "@/domain/queue";
import { OPEN_STATUSES } from "@/domain/status";
import type { ID } from "@/domain/types";
import type { Lookups } from "@/queries/lookups";
import { useFormat } from "@/i18n/format";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { RequestFlags, ScreeningIndicator } from "@/features/requests/parts";

const features = tableFeatures({});
const helper = createColumnHelper<typeof features, QueueRow>();

/**
 * Columns collapse progressively by container width (not viewport), so the
 * table stays readable when the preview pane takes space. Always-visible
 * columns take ~32.5rem; each breakpoint keeps at least 12rem for the applicant.
 * On phones only applicant + status remain; the ID moves under the name and
 * tapping a row opens the preview, which has the claim button.
 */
const COLUMN_CLASS: Record<string, string> = {
  request: "hidden w-24 @[40rem]:table-cell",
  applicant: "",
  registration: "hidden w-36 @[79rem]:table-cell",
  stage: "hidden w-36 @[70rem]:table-cell",
  team: "hidden w-36 @[61rem]:table-cell",
  screening: "hidden w-28 @[40rem]:table-cell",
  status: "w-36 @[40rem]:w-44",
  submitted: "hidden w-30 @[52rem]:table-cell",
  actions: "hidden w-24 text-end @[30rem]:table-cell",
};

export function QueueTable({
  lookups: db,
  rows,
  viewerId,
  now,
  selectedId,
  onSelect,
  onOpen,
  onClaim,
  claimingId,
}: {
  lookups: Lookups;
  rows: QueueRow[];
  viewerId: ID;
  now: number;
  selectedId: ID | null;
  onSelect: (id: ID) => void;
  onOpen: (id: ID) => void;
  onClaim: (id: ID) => void;
  claimingId: ID | null;
}) {
  const t = useTranslations("queue");
  const fmt = useFormat();

  const columns = useMemo(
    () =>
      helper.columns([
        helper.display({
          id: "request",
          header: () => t("columns.request"),
          cell: ({ row }) => <span className="ltr-data font-mono text-xs font-medium text-ink-2">{row.original.id}</span>,
        }),
        helper.display({
          id: "applicant",
          header: () => t("columns.applicant"),
          cell: ({ row: { original: r } }) => (
            <div className="flex min-w-0 items-center gap-2.5">
              <Avatar name={r.applicantName} size="sm" />
              <div className="min-w-0">
                <bdi className="block truncate font-semibold text-ink">{r.applicantName}</bdi>
                {r.applicantEmail && <span className="ltr-data block truncate text-xs text-ink-3">{r.applicantEmail}</span>}
                <span className="ltr-data block font-mono text-2xs text-ink-3 @[40rem]:hidden">{r.id}</span>
              </div>
            </div>
          ),
        }),
        helper.display({
          id: "registration",
          header: () => t("columns.registration"),
          cell: ({ row: { original: r } }) => (
            <div className="min-w-0">
              <span className="block truncate text-ink">{fmt.text(db.registrations[r.registrationId].name)}</span>
              <span className="mt-0.5 block"><BadgeTypeChip id={r.badgeTypeId} label={fmt.text(db.badgeTypes[r.badgeTypeId].name)} /></span>
            </div>
          ),
        }),
        helper.display({
          id: "stage",
          header: () => t("columns.stage"),
          cell: ({ row: { original: r } }) => (
            <div className="min-w-0">
              <span className="block truncate font-medium text-ink">{r.stageName ? fmt.text(r.stageName) : "—"}</span>
              <span className="block truncate text-xs text-ink-3">{fmt.text(r.workflowLabel)}</span>
            </div>
          ),
        }),
        helper.display({
          id: "team",
          header: () => t("columns.team"),
          cell: ({ row: { original: r } }) => {
            const claimer = r.claimedBy ? db.users[r.claimedBy] : null;
            return (
              <div className="min-w-0">
                <span className="block truncate text-ink">{r.teamId ? fmt.text(db.teams[r.teamId].name) : "—"}</span>
                <span className="flex items-center gap-1.5 truncate text-xs text-ink-3">
                  {claimer ? (
                    <>
                      <Avatar name={claimer.name} size="xs" />
                      <span className="truncate text-ink-2">{r.claimedBy === viewerId ? t("you") : claimer.name}</span>
                    </>
                  ) : OPEN_STATUSES.includes(r.status) ? (
                    t("unclaimed")
                  ) : null}
                </span>
              </div>
            );
          },
        }),
        helper.display({
          id: "screening",
          header: () => t("columns.screening"),
          cell: ({ row: { original: r } }) => <ScreeningIndicator screening={r.screening} level={r.watchlistLevel} compact />,
        }),
        helper.display({
          id: "status",
          header: () => t("columns.status"),
          cell: ({ row: { original: r } }) => (
            <div>
              <StatusLabel status={r.status} />
              <RequestFlags late={r.late} timeLimitHours={r.timeLimitHours} responseReceived={r.responseReceived} awaitingCapacity={r.awaitingCapacity} />
            </div>
          ),
        }),
        helper.display({
          id: "submitted",
          header: () => t("columns.submitted"),
          cell: ({ row: { original: r } }) => (
            <div className="tabular">
              <span className="block text-ink">{fmt.dateTime(r.submittedAt)}</span>
              <span className={cn("block text-xs", r.late ? "text-attention" : "text-ink-3")}>
                {r.decidedAt ? fmt.duration(r.waitingMs) : fmt.duration(now - Date.parse(r.submittedAt))}
              </span>
            </div>
          ),
        }),
        helper.display({
          id: "actions",
          header: () => <span className="sr-only">{t("columns.actions")}</span>,
          cell: ({ row: { original: r } }) =>
            canClaim(db, viewerId, { status: r.status, claimedBy: r.claimedBy, currentTeamId: r.teamId }) ? (
              <Button
                size="sm"
                disabled={claimingId !== null}
                onClick={(e) => {
                  e.stopPropagation();
                  onClaim(r.id);
                }}
              >
                {claimingId === r.id && <Loader2 className="size-3.5 animate-spin" />}
                {t("claim")}
              </Button>
            ) : (
              <Link
                href={`/requests/${r.id}`}
                onClick={(e) => e.stopPropagation()}
                aria-label={r.id}
                className="inline-flex size-7 items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink"
              >
                <DirIcon icon={ChevronRight} className="size-4" />
              </Link>
            ),
        }),
      ]),
    [t, fmt, db, viewerId, now, onClaim, claimingId],
  );

  const table = useTable({ features, columns, data: rows });

  return (
    <div className="@container">
      <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
        <thead className="sticky top-0 z-[2] bg-subtle">
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => (
                <th
                  key={header.id}
                  scope="col"
                  className={cn(
                    "eyebrow h-10 border-b border-line px-3 text-start whitespace-nowrap first:ps-5 last:pe-5",
                    COLUMN_CLASS[header.column.id],
                  )}
                >
                  <table.FlexRender header={header} />
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => {
            const r = row.original;
            const selected = r.id === selectedId;
            const claimedByOther = !!r.claimedBy && r.claimedBy !== viewerId && OPEN_STATUSES.includes(r.status);
            return (
              <tr
                key={row.id}
                aria-selected={selected}
                onClick={() => onSelect(r.id)}
                onDoubleClick={() => onOpen(r.id)}
                className={cn(
                  "group cursor-default transition-colors",
                  selected ? "bg-accent-soft" : "hover:bg-subtle",
                )}
              >
                {row.getAllCells().map((cell, i) => (
                  <td
                    key={cell.id}
                    className={cn(
                      "h-[60px] border-b border-line px-3 align-middle first:ps-5 last:pe-5",
                      cell.column.id !== "actions" && "truncate",
                      COLUMN_CLASS[cell.column.id],
                      i === 0 && "relative",
                      i === 0 && selected && "before:absolute before:inset-y-0 before:start-0 before:w-[3px] before:bg-accent",
                      claimedByOther && cell.column.id !== "actions" && "opacity-55",
                    )}
                  >
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
