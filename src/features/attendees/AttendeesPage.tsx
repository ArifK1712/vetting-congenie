"use client";

import { Braces, ChevronLeft, ChevronRight, Inbox, Lock, Printer, RotateCcw, ScanLine, Search, SearchX, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DirIcon } from "@/components/ui/DirIcon";
import { EmptyState } from "@/components/ui/EmptyState";
import { MultiFilter, type FilterOption } from "@/components/ui/FilterMenu";
import { toast } from "@/components/ui/Toast";
import { PAGE } from "@/design/layout";
import { BADGE_STATUS_TONE, STATUS_TONE, TONE, type Tone } from "@/design/tones";
import { badgeGate, type BadgeChannel } from "@/domain/attendees";
import type { ID, Registration } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { cn } from "@/lib/cn";
import { attendeeService } from "@/services/attendees";
import { useDb, useSession } from "@/store/app";
import { useViewer } from "@/store/useViewer";
import { AttendeesTable, type Capabilities } from "./AttendeesTable";
import { CapacityStrip } from "./CapacityStrip";
import { ApiDialog, BulkResultDialog, ChangeLimitDialog, FreePlaceDialog, KioskDialog, RefusalDialog, WithdrawDialog, type BulkResult, type Refusal } from "./dialogs";
import {
  applyFilters,
  BADGE_STATUSES,
  buildRows,
  EMPTY_FILTERS,
  hasFilters,
  PAYMENT_STATUSES,
  PAYMENT_TONE,
  REGISTRATION_STATUSES,
  REGISTRATION_TONE,
  vettingOptions,
  type AttendeeFilters,
  type AttendeeRow,
} from "./model";

const PAGE_SIZE = 25;

const dot = (tone: Tone) => <span aria-hidden className={cn("size-2 shrink-0 rounded-full", TONE[tone].dot)} />;

/** 13.2 Attendees: every registration with its four status columns, badge channels (11.2) and places (11.3). */
export function AttendeesPage() {
  const t = useTranslations("attendees");
  const ts = useTranslations("status");
  const tb = useTranslations("badgeStatus");
  const tp = useTranslations("payment");
  const te = useTranslations("attendees.errors");
  const fmt = useFormat();
  const db = useDb();
  const viewer = useViewer();
  const scope = useSession((s) => s.eventScope);

  const [filters, setFilters] = useState<AttendeeFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<ID>>(() => new Set());
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [bulk, setBulk] = useState<BulkResult | null>(null);
  const [printing, setPrinting] = useState(false);
  const [dialog, setDialog] = useState<{ kind: "free" | "withdraw"; row: AttendeeRow } | { kind: "limit"; reg: Registration } | { kind: "kiosk" | "api" } | null>(null);

  // Persona or event changes reset paging and selection (adjusted during render).
  const scopeKey = `${viewer.id}|${scope}`;
  const [prevScope, setPrevScope] = useState(scopeKey);
  if (scopeKey !== prevScope) {
    setPrevScope(scopeKey);
    setPage(0);
    setSelected(new Set());
    setFilters(EMPTY_FILTERS);
  }

  const seesHold = viewer.can("blacklist.view");
  const caps: Capabilities = useMemo(
    () => ({
      openRequests: viewer.can("queue.access") || viewer.can("queue.reviewAll"),
      print: viewer.can("queue.reviewAll") || viewer.can("registration.vettingSettings"),
      manage: viewer.can("registration.vettingSettings"),
    }),
    [viewer],
  );

  const all = useMemo(() => buildRows(db, viewer.id, scope), [db, viewer.id, scope]);
  const rows = useMemo(() => applyFilters(all, filters), [all, filters]);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const options = useMemo(() => {
    const regs = new Set(all.map((r) => r.registrationId));
    const badges = new Set(all.map((r) => r.badgeTypeId));
    return {
      registrationStatus: REGISTRATION_STATUSES.map((v): FilterOption => ({ value: v, label: t(`registrationStatus.${v}`), marker: dot(REGISTRATION_TONE[v]) })),
      payment: PAYMENT_STATUSES.map((v): FilterOption => ({ value: v, label: tp(v), marker: dot(PAYMENT_TONE[v]) })),
      vetting: vettingOptions(seesHold).map((v): FilterOption => (v === "not_required" ? { value: v, label: t("vetting.notRequired"), marker: dot("gray") } : { value: v, label: ts(v), marker: dot(STATUS_TONE[v]) })),
      badge: BADGE_STATUSES.map((v): FilterOption => ({ value: v, label: tb(v), marker: dot(BADGE_STATUS_TONE[v]) })),
      registrations: Object.values(db.registrations)
        .filter((r) => regs.has(r.id))
        .map((r): FilterOption => ({ value: r.id, label: fmt.text(r.name), hint: fmt.text(db.events[r.eventId]?.name) })),
      badgeTypes: Object.values(db.badgeTypes)
        .filter((b) => badges.has(b.id))
        .map((b): FilterOption => ({ value: b.id, label: fmt.text(b.name) })),
    };
  }, [all, db, seesHold, t, ts, tb, tp, fmt]);

  // Quick picks for the kiosk and API dialogs: one of each outcome in scope.
  const samples = useMemo(() => {
    const pick = (test: (r: AttendeeRow) => boolean) => all.find(test);
    const gate = (r: AttendeeRow) => badgeGate(db, r.attendee);
    return [
      pick((r) => gate(r).allowed),
      pick((r) => { const g = gate(r); return !g.allowed && g.reason === "notApproved"; }),
      pick((r) => { const g = gate(r); return !g.allowed && g.reason === "suspended"; }),
      pick((r) => { const g = gate(r); return !g.allowed && g.reason === "paymentPending"; }),
    ].filter((r): r is AttendeeRow => !!r);
  }, [all, db]);

  const update = (patch: Partial<AttendeeFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(0);
  };

  const toggle = useCallback((id: ID) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const pageIds = pageRows.map((r) => r.id).join(",");
  const togglePage = useCallback(
    (on: boolean) => {
      setSelected((s) => {
        const next = new Set(s);
        for (const id of pageIds.split(",").filter(Boolean)) {
          if (on) next.add(id);
          else next.delete(id);
        }
        return next;
      });
    },
    [pageIds],
  );

  const badge = useCallback(
    async (row: AttendeeRow, channel: BadgeChannel) => {
      const r = await attendeeService.produceBadges({ attendeeIds: [row.id], channel, actorId: viewer.id });
      if (!r.ok) return toast(te(r.error));
      if (r.printed.length) toast(t(`badgeDone.${channel as "download" | "adminGenerate" | "bulkPrint"}`, { name: row.name }));
      else if (r.blocked[0]) setRefusal({ name: row.name, requestId: row.request?.id, reason: r.blocked[0].reason });
    },
    [viewer.id, t, te],
  );

  const printSelected = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    setPrinting(true);
    try {
      const r = await attendeeService.produceBadges({ attendeeIds: ids, channel: "bulkPrint", actorId: viewer.id });
      if (!r.ok) return toast(te(r.error));
      const byId = new Map(all.map((x) => [x.id, x]));
      setBulk({
        printed: r.printed.length,
        refused: r.blocked.flatMap((b) => {
          const row = byId.get(b.attendeeId);
          return row ? [{ row, reason: b.reason }] : [];
        }),
      });
      setSelected(new Set());
    } finally {
      setPrinting(false);
    }
  };

  const onFreePlace = useCallback((row: AttendeeRow) => setDialog({ kind: "free", row }), []);
  const onWithdraw = useCallback((row: AttendeeRow) => setDialog({ kind: "withdraw", row }), []);

  if (!viewer.can("queue.reviewAll") && !viewer.can("reports.view")) {
    return <EmptyState icon={Lock} title={t("noAccessTitle")} body={t("noAccessBody")} />;
  }

  const filtered = hasFilters(filters);
  const from = rows.length ? safePage * PAGE_SIZE + 1 : 0;
  const to = Math.min(rows.length, (safePage + 1) * PAGE_SIZE);
  const closeDialog = () => setDialog(null);

  return (
    <div className={cn(PAGE, "pb-12")}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-ink">{t("title")}</h1>
          <p className="mt-1.5 max-w-3xl text-sm text-ink-2">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "api" })}>
            <Braces className="size-3.5" />
            {t("apiButton")}
          </Button>
          <Button onClick={() => setDialog({ kind: "kiosk" })}>
            <ScanLine className="size-4 text-teal-600" />
            {t("kioskButton")}
          </Button>
        </div>
      </div>

      <CapacityStrip db={db} scope={scope} canManage={caps.manage} onChangeLimit={(reg) => setDialog({ kind: "limit", reg })} />

      <section className="mt-4 flex flex-col overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-line">
        <div className="no-scrollbar flex items-center gap-2 overflow-x-auto px-4 py-3.5 sm:px-5 [&>*]:shrink-0">
          <div className="relative w-60">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
            <input
              dir="auto"
              value={filters.search}
              onChange={(e) => update({ search: e.target.value })}
              placeholder={t("search")}
              aria-label={t("search")}
              className="h-8 w-full rounded-lg border border-line-strong bg-surface ps-8 pe-7 text-xs text-ink shadow-xs outline-none placeholder:text-ink-3 focus:border-accent focus:ring-4 focus:ring-accent/10"
            />
            {filters.search && (
              <button
                type="button"
                onClick={() => update({ search: "" })}
                aria-label={t("filters.reset")}
                className="absolute end-1.5 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-xs text-ink-3 hover:text-ink"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
          <span className="mx-1 h-4 w-px bg-line" />
          <MultiFilter label={t("filters.registrationStatus")} options={options.registrationStatus} value={filters.registrationStatus} onChange={(v) => update({ registrationStatus: v })} />
          <MultiFilter label={t("filters.payment")} options={options.payment} value={filters.payment} onChange={(v) => update({ payment: v })} />
          <MultiFilter label={t("filters.vetting")} options={options.vetting} value={filters.vetting} onChange={(v) => update({ vetting: v })} />
          <MultiFilter label={t("filters.badge")} options={options.badge} value={filters.badge} onChange={(v) => update({ badge: v })} />
          <span className="mx-1 h-4 w-px bg-line" />
          <MultiFilter label={t("filters.registration")} options={options.registrations} value={filters.registrationIds} onChange={(v) => update({ registrationIds: v })} searchable wide />
          <MultiFilter label={t("filters.badgeType")} options={options.badgeTypes} value={filters.badgeTypeIds} onChange={(v) => update({ badgeTypeIds: v })} />
          {filtered && (
            <button
              type="button"
              onClick={() => update(EMPTY_FILTERS)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-accent-text hover:bg-accent-soft"
            >
              <RotateCcw className="size-3" />
              {t("filters.reset")}
            </button>
          )}
        </div>

        {caps.print && selected.size > 0 && (
          <div className="anim-fade flex flex-wrap items-center gap-2 border-t border-indigo-100 bg-accent-soft px-4 py-2.5 sm:px-5">
            <span className="tabular text-xs font-semibold text-accent-text">{t("bulk.selected", { count: selected.size, n: fmt.number(selected.size) })}</span>
            <span className="ms-auto flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                {t("bulk.clear")}
              </Button>
              <Button size="sm" variant="primary" disabled={printing} onClick={() => void printSelected()}>
                <Printer className="size-3.5" />
                {t("bulk.print", { n: fmt.number(selected.size) })}
              </Button>
            </span>
          </div>
        )}

        <div className="border-t border-line">
          {pageRows.length ? (
            <AttendeesTable
              db={db}
              rows={pageRows}
              caps={caps}
              selected={selected}
              onToggle={toggle}
              onTogglePage={togglePage}
              onBadge={(row, channel) => void badge(row, channel)}
              onFreePlace={onFreePlace}
              onWithdraw={onWithdraw}
            />
          ) : filtered ? (
            <EmptyState icon={SearchX} title={t("empty.title")} body={t("empty.body")} action={<Button onClick={() => update(EMPTY_FILTERS)}>{t("filters.reset")}</Button>} />
          ) : (
            <EmptyState icon={Inbox} title={t("empty.scopeTitle")} body={t("empty.scopeBody")} />
          )}
        </div>

        <div className="flex h-12 shrink-0 items-center justify-between border-t border-line bg-subtle px-4 text-xs text-ink-2 sm:px-5">
          <span className="tabular font-medium" data-range>
            {t("range", { from: fmt.number(from), to: fmt.number(to), total: fmt.number(rows.length) })}
          </span>
          <div className="flex items-center gap-1.5">
            <Button size="sm" iconOnly disabled={safePage === 0} onClick={() => setPage(safePage - 1)} aria-label={t("previousPage")}>
              <DirIcon icon={ChevronLeft} className="size-4" />
            </Button>
            <span className="tabular px-1.5 font-medium text-ink">
              {fmt.number(safePage + 1)} / {fmt.number(pageCount)}
            </span>
            <Button size="sm" iconOnly disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)} aria-label={t("nextPage")}>
              <DirIcon icon={ChevronRight} className="size-4" />
            </Button>
          </div>
        </div>
      </section>

      <RefusalDialog refusal={refusal} onClose={() => setRefusal(null)} />
      <BulkResultDialog result={bulk} onClose={() => setBulk(null)} />
      {dialog?.kind === "free" && <FreePlaceDialog row={dialog.row} db={db} viewerId={viewer.id} onClose={closeDialog} />}
      {dialog?.kind === "withdraw" && <WithdrawDialog row={dialog.row} viewerId={viewer.id} onClose={closeDialog} />}
      {dialog?.kind === "limit" && <ChangeLimitDialog registration={dialog.reg} db={db} viewerId={viewer.id} onClose={closeDialog} />}
      {dialog?.kind === "kiosk" && <KioskDialog db={db} viewerId={viewer.id} samples={samples} onClose={closeDialog} />}
      {dialog?.kind === "api" && <ApiDialog db={db} samples={samples} onClose={closeDialog} />}
    </div>
  );
}
