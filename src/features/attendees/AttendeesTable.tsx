"use client";

import * as Popover from "@radix-ui/react-popover";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { ArrowUpRight, DoorOpen, Download, Ellipsis, Printer, Sparkles, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/Menu";
import { BadgeStatusLabel, BadgeTypeChip, Pill, StatusLabel } from "@/components/ui/Status";
import { usePortalContainer } from "@/components/ui/portal";
import type { BadgeChannel } from "@/domain/attendees";
import { OPEN_STATUSES } from "@/domain/status";
import type { Database, ID } from "@/domain/types";
import { stageOf } from "@/domain/workflow";
import { useFormat } from "@/i18n/format";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { PAYMENT_TONE, REGISTRATION_TONE, type AttendeeRow } from "./model";

const features = tableFeatures({});
const helper = createColumnHelper<typeof features, AttendeeRow>();

/**
 * Columns collapse by container width. On phones only the attendee, the
 * vetting status (with the badge status under it) and the actions remain.
 */
const COLUMN_CLASS: Record<string, string> = {
  select: "hidden w-12 @[40rem]:table-cell",
  attendee: "",
  registration: "hidden w-52 @[70rem]:table-cell",
  registrationStatus: "hidden w-32 @[60rem]:table-cell",
  payment: "hidden w-36 @[52rem]:table-cell",
  vetting: "w-40 @[40rem]:w-44",
  badge: "hidden w-32 @[40rem]:table-cell",
  actions: "w-12 text-end",
};

export interface Capabilities {
  /** Review Queue Access: the vetting status opens the request. */
  openRequests: boolean;
  /** Admin generate and print runs (queue.reviewAll or registration settings). */
  print: boolean;
  /** Free place, withdraw, change limit, generate (registration.vettingSettings). */
  manage: boolean;
}

export function AttendeesTable({
  db,
  rows,
  caps,
  selected,
  onToggle,
  onTogglePage,
  onBadge,
  onFreePlace,
  onWithdraw,
}: {
  db: Database;
  rows: AttendeeRow[];
  caps: Capabilities;
  selected: Set<ID>;
  onToggle: (id: ID) => void;
  onTogglePage: (select: boolean) => void;
  onBadge: (row: AttendeeRow, channel: BadgeChannel) => void;
  onFreePlace: (row: AttendeeRow) => void;
  onWithdraw: (row: AttendeeRow) => void;
}) {
  const t = useTranslations("attendees");
  const tr = useTranslations("attendees.registrationStatus");
  const tp = useTranslations("payment");
  const fmt = useFormat();
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someOnPage = rows.some((r) => selected.has(r.id));

  const columns = useMemo(
    () =>
      helper.columns([
        helper.display({
          id: "select",
          header: () => (
            <input
              type="checkbox"
              aria-label={t("columns.selectPage")}
              className="size-4 cursor-pointer accent-indigo-600"
              checked={allOnPage}
              ref={(el) => {
                if (el) el.indeterminate = someOnPage && !allOnPage;
              }}
              onChange={(e) => onTogglePage(e.target.checked)}
            />
          ),
          cell: ({ row: { original: r } }) => (
            <input
              type="checkbox"
              aria-label={t("columns.selectRow", { name: r.name })}
              className="size-4 cursor-pointer accent-indigo-600"
              checked={selected.has(r.id)}
              onChange={() => onToggle(r.id)}
            />
          ),
        }),
        helper.display({
          id: "attendee",
          header: () => t("columns.attendee"),
          cell: ({ row: { original: r } }) => (
            <div className="flex min-w-0 items-center gap-2.5">
              <Avatar name={r.name} size="sm" />
              <div className="min-w-0">
                <bdi className="block truncate font-semibold text-ink">{r.name}</bdi>
                <span className="ltr-data block truncate text-xs text-ink-3">{r.email}</span>
                {r.request && <span className="ltr-data block font-mono text-2xs text-ink-3 @[70rem]:hidden">{r.request.id}</span>}
              </div>
            </div>
          ),
        }),
        helper.display({
          id: "registration",
          header: () => t("columns.registration"),
          cell: ({ row: { original: r } }) => (
            <div className="min-w-0">
              <span className="block truncate text-ink">{fmt.text(db.registrations[r.registrationId]?.name)}</span>
              <span className="mt-0.5 flex items-center gap-1.5">
                <BadgeTypeChip id={r.badgeTypeId} label={fmt.text(db.badgeTypes[r.badgeTypeId]?.name)} />
                {r.request && <span className="ltr-data truncate font-mono text-2xs text-ink-3">{r.request.id}</span>}
              </span>
            </div>
          ),
        }),
        helper.display({
          id: "registrationStatus",
          header: () => t("columns.registrationStatus"),
          cell: ({ row: { original: r } }) => <Pill tone={REGISTRATION_TONE[r.registrationStatus]}>{tr(r.registrationStatus)}</Pill>,
        }),
        helper.display({
          id: "payment",
          header: () => t("columns.payment"),
          cell: ({ row: { original: r } }) => (
            <Pill tone={PAYMENT_TONE[r.payment]} dot={false}>
              {tp(r.payment)}
            </Pill>
          ),
        }),
        helper.display({
          id: "vetting",
          header: () => t("columns.vetting"),
          cell: ({ row: { original: r } }) => (
            <div className="flex flex-col items-start gap-1">
              <VettingCell db={db} row={r} canOpen={caps.openRequests} />
              <span className="@[40rem]:hidden">
                <BadgeStatusLabel status={r.badge} />
              </span>
            </div>
          ),
        }),
        helper.display({
          id: "badge",
          header: () => t("columns.badge"),
          cell: ({ row: { original: r } }) => <BadgeStatusLabel status={r.badge} />,
        }),
        helper.display({
          id: "actions",
          header: () => <span className="sr-only">{t("columns.actions")}</span>,
          cell: ({ row: { original: r } }) => <RowMenu row={r} caps={caps} onBadge={onBadge} onFreePlace={onFreePlace} onWithdraw={onWithdraw} />,
        }),
      ]).filter((c) => caps.print || c.id !== "select"),
    [t, tr, tp, fmt, db, caps, selected, allOnPage, someOnPage, onToggle, onTogglePage, onBadge, onFreePlace, onWithdraw],
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
                  className={cn("eyebrow h-10 border-b border-line px-3 py-2 text-start leading-tight first:ps-5 last:pe-4", COLUMN_CLASS[header.column.id])}
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
            const isSelected = selected.has(r.id);
            return (
              <tr key={row.id} data-attendee={r.id} aria-selected={isSelected} className={cn("transition-colors", isSelected ? "bg-accent-soft" : "hover:bg-subtle")}>
                {row.getAllCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={cn(
                      "h-[64px] border-b border-line px-3 align-middle first:ps-5 last:pe-4",
                      cell.column.id !== "actions" && cell.column.id !== "select" && "truncate",
                      COLUMN_CLASS[cell.column.id],
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

/** 13.2: the vetting status opens the request (Review Queue Access) or a short read-only summary. */
function VettingCell({ db, row, canOpen }: { db: Database; row: AttendeeRow; canOpen: boolean }) {
  const t = useTranslations("attendees.vetting");
  const fmt = useFormat();
  const container = usePortalContainer();
  const r = row.request;
  if (row.vetting === "not_required" || !r) {
    return (
      <Pill tone="gray" dot={false}>
        {t("notRequired")}
      </Pill>
    );
  }
  const status = row.vetting;
  const trigger = "rounded-full outline-none transition-shadow hover:ring-2 hover:ring-accent/25 focus-visible:ring-2 focus-visible:ring-accent";

  if (canOpen) {
    return (
      <Link href={`/requests/${r.id}`} aria-label={t("openRequest", { id: r.id })} className={cn("inline-flex", trigger)}>
        <StatusLabel status={status} />
      </Link>
    );
  }

  const version = r.workflowVersionId ? db.workflowVersions[r.workflowVersionId] : undefined;
  const stage = OPEN_STATUSES.includes(r.status) && version ? stageOf(version.graph, r.currentStageNodeId) : undefined;
  const items: [string, string][] = [
    [t("submitted"), fmt.date(r.submittedAt)],
    [t("stage"), stage ? fmt.text(stage.name) : t("none")],
    [t("decided"), r.decidedAt && !OPEN_STATUSES.includes(r.status) ? fmt.date(r.decidedAt) : t("none")],
  ];
  return (
    <Popover.Root>
      <Popover.Trigger aria-label={t("showSummary", { name: row.name })} className={cn("inline-flex cursor-pointer", trigger)}>
        <StatusLabel status={status} />
      </Popover.Trigger>
      <Popover.Portal container={container}>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={8}
          data-vetting-summary
          className="anim-pop z-50 w-72 overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
        >
          <div className="flex items-center justify-between gap-2 border-b border-line bg-subtle px-4 py-2.5">
            <span className="text-xs font-semibold text-ink">{t("summaryTitle")}</span>
            <span className="ltr-data font-mono text-xs text-ink-2">{r.id}</span>
          </div>
          <dl className="space-y-2.5 px-4 py-3.5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-ink-3">{t("status")}</dt>
              <dd>
                <StatusLabel status={status} />
              </dd>
            </div>
            {items.map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 text-ink-3">{label}</dt>
                <dd className="tabular truncate text-end font-medium text-ink">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="border-t border-line px-4 py-2.5 text-xs text-ink-3">{t("summaryNote")}</p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function RowMenu({
  row,
  caps,
  onBadge,
  onFreePlace,
  onWithdraw,
}: {
  row: AttendeeRow;
  caps: Capabilities;
  onBadge: (row: AttendeeRow, channel: BadgeChannel) => void;
  onFreePlace: (row: AttendeeRow) => void;
  onWithdraw: (row: AttendeeRow) => void;
}) {
  const t = useTranslations("attendees.actions");
  const router = useRouter();
  const placeActions = caps.manage && (row.holdsPlace || row.withdrawable);
  return (
    <Menu>
      <MenuTrigger
        aria-label={t("menu", { name: row.name })}
        className="inline-flex size-8 items-center justify-center rounded-lg text-ink-3 outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-accent data-[state=open]:bg-hover data-[state=open]:text-ink"
      >
        <Ellipsis className="size-4" />
      </MenuTrigger>
      <MenuContent align="end" className="w-56">
        <MenuLabel>{t("badges")}</MenuLabel>
        <MenuItem onSelect={() => onBadge(row, "download")}>
          <Download className="size-4 text-ink-3" />
          {t("download")}
        </MenuItem>
        {caps.manage && (
          <MenuItem onSelect={() => onBadge(row, "adminGenerate")}>
            <Sparkles className="size-4 text-ink-3" />
            {t("generate")}
          </MenuItem>
        )}
        {caps.print && (
          <MenuItem onSelect={() => onBadge(row, "bulkPrint")}>
            <Printer className="size-4 text-ink-3" />
            {t("print")}
          </MenuItem>
        )}
        {placeActions && (
          <>
            <MenuSeparator />
            <MenuLabel>{t("registration")}</MenuLabel>
            {row.holdsPlace && (
              <MenuItem onSelect={() => onFreePlace(row)}>
                <DoorOpen className="size-4 text-amber-600 rtl:-scale-x-100" />
                {t("freePlace")}
              </MenuItem>
            )}
            {row.withdrawable && (
              <MenuItem onSelect={() => onWithdraw(row)}>
                <Undo2 className="size-4 text-ink-3 rtl:-scale-x-100" />
                {t("withdraw")}
              </MenuItem>
            )}
          </>
        )}
        {caps.openRequests && row.request && (
          <>
            <MenuSeparator />
            <MenuItem onSelect={() => router.push(`/requests/${row.request!.id}`)}>
              <ArrowUpRight className="size-4 text-ink-3 rtl:-scale-x-100" />
              {t("openRequest")}
            </MenuItem>
          </>
        )}
      </MenuContent>
    </Menu>
  );
}
