"use client";

import { ChevronLeft, ChevronRight, Inbox, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PAGE } from "@/design/layout";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { DirIcon } from "@/components/ui/DirIcon";
import { EmptyState } from "@/components/ui/EmptyState";
import { EMPTY_FILTERS, type QueueFilters } from "@/domain/queue";
import { STATUS_ORDER } from "@/domain/status";
import type { ID, RequestStatus } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { useRouter } from "@/i18n/navigation";
import { useNow } from "@/lib/useNow";
import { requestService } from "@/services/requests";
import { useQuickAction } from "@/features/requests/useRequestAction";
import { useLookups } from "@/queries/lookups";
import { useQueue, useRequestRevisions } from "@/queries/queue";
import { useSession } from "@/store/app";
import { useViewer } from "@/store/useViewer";
import { FilterBar, hasActiveFilters } from "./FilterBar";
import { PreviewPane } from "./PreviewPane";
import { QueueTable } from "./QueueTable";
import { activeTile, StatusTiles, tileStatuses } from "./StatusTiles";

const PAGE_SIZE = 25;

export function QueuePage() {
  const t = useTranslations("queue");
  const fmt = useFormat();
  const lookups = useLookups();
  const revisionOf = useRequestRevisions();
  const viewer = useViewer();
  const eventScope = useSession((s) => s.eventScope);
  const router = useRouter();
  const params = useSearchParams();
  const now = useNow();

  const [filters, setFilters] = useState<QueueFilters>(() => {
    // Deep links: ?q= from header search, ?status= from the dashboard, ?team= from Teams.
    const status = params.get("status") as RequestStatus | null;
    const team = params.get("team");
    return {
      ...EMPTY_FILTERS,
      search: params.get("q") ?? "",
      teamIds: team ? [team] : EMPTY_FILTERS.teamIds,
      statuses: status && STATUS_ORDER.includes(status) ? [status] : EMPTY_FILTERS.statuses,
    };
  });
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<ID | null>(null);

  // Header search navigates here with ?q=; persona or event changes reset paging
  // and selection. Adjusted during render rather than in an effect.
  const q = params.get("q");
  const [prevQ, setPrevQ] = useState(q);
  if (q !== prevQ) {
    setPrevQ(q);
    if (q !== null) {
      setFilters((f) => ({ ...f, search: q }));
      setPage(0);
    }
  }
  const scopeKey = `${viewer.id}|${eventScope}`;
  const [prevScope, setPrevScope] = useState(scopeKey);
  if (scopeKey !== prevScope) {
    setPrevScope(scopeKey);
    setPage(0);
    setSelectedId(null);
  }

  const quick = useQuickAction();
  const tt = useTranslations("actions.toasts");
  const claimRequest = (id: ID) => {
    void quick.run(id, () => requestService.claim({ requestId: id, actorId: viewer.id, expectedRevision: revisionOf(id) }), tt("claimed", { id }));
  };

  const { allRows, rows, counts, late } = useQueue(filters, now);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const selected = selectedId ? rows.find((r) => r.id === selectedId) : undefined;

  const update = (patch: Partial<QueueFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(0);
  };

  // ↑/↓ move through the current page, Enter opens, Esc closes the preview.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.closest("[role=dialog],[role=menu],[role=listbox]")) return;
      if (e.key === "Escape" && selectedId) setSelectedId(null);
      if (e.key === "Enter" && selectedId) router.push(`/requests/${selectedId}`);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (!pageRows.length) return;
        e.preventDefault();
        const i = pageRows.findIndex((r) => r.id === selectedId);
        const next = e.key === "ArrowDown" ? Math.min(pageRows.length - 1, i + 1) : Math.max(0, i - 1);
        setSelectedId(pageRows[i === -1 ? 0 : next].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pageRows, selectedId, router]);

  if (!viewer.can("queue.access") && !viewer.can("queue.reviewAll")) {
    return <EmptyState icon={Lock} title={t("empty.noAccessTitle")} body={t("empty.noAccessBody")} />;
  }

  const from = rows.length ? safePage * PAGE_SIZE + 1 : 0;
  const to = Math.min(rows.length, (safePage + 1) * PAGE_SIZE);

  return (
    <div className="flex min-h-full lg:h-full lg:min-h-0">
      <div className={cn(PAGE, "flex min-w-0 flex-1 flex-col gap-4 pb-6 sm:gap-5")}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-ink">{t("title")}</h1>
            <p className="mt-1.5 text-sm text-ink-2">{viewer.can("queue.reviewAll") ? t("subtitleAll") : t("subtitle")}</p>
          </div>
        </div>

        <StatusTiles
          counts={counts}
          late={late}
          active={activeTile(filters.statuses)}
          showHold={viewer.can("blacklist.view")}
          onSelect={(tile) => update({ statuses: tileStatuses(tile) })}
        />

        <section className="flex min-h-[28rem] flex-1 flex-col overflow-hidden rounded-xl lg:min-h-0 bg-surface shadow-card ring-1 ring-line">
          <FilterBar lookups={lookups} rows={allRows} viewerId={viewer.id} reviewAll={viewer.can("queue.reviewAll")} filters={filters} onChange={update} />

          <div className="min-h-0 flex-1 overflow-auto border-t border-line">
            {pageRows.length ? (
              <QueueTable
                lookups={lookups}
                rows={pageRows}
                viewerId={viewer.id}
                now={now}
                selectedId={selectedId}
                onSelect={(id) => setSelectedId((cur) => (cur === id ? null : id))}
                onOpen={(id) => router.push(`/requests/${id}`)}
                onClaim={claimRequest}
                claimingId={quick.busyId}
              />
            ) : (
              <EmptyState
                icon={Inbox}
                title={t("empty.title")}
                body={t("empty.body")}
                action={
                  hasActiveFilters(filters) ? (
                    <Button onClick={() => update({ ...EMPTY_FILTERS, statuses: filters.statuses })}>{t("filters.reset")}</Button>
                  ) : undefined
                }
              />
            )}
          </div>

          <div className="flex h-12 shrink-0 items-center justify-between border-t border-line bg-subtle px-5 text-xs text-ink-2">
            <span className="tabular font-medium">
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
      </div>

      {selected && (
        <div aria-hidden onClick={() => setSelectedId(null)} className="anim-fade fixed inset-0 z-30 bg-overlay xl:hidden" />
      )}
      {selected && (
        <PreviewPane
          lookups={lookups}
          row={selected}
          viewerId={viewer.id}
          now={now}
          onClose={() => setSelectedId(null)}
          onClaim={() => claimRequest(selected.id)}
          claiming={quick.busyId !== null}
        />
      )}
    </div>
  );
}
