"use client";

import { ArrowUpRight, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, type ReactNode } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { DirIcon } from "@/components/ui/DirIcon";
import { BadgeTypeChip, StatusPill } from "@/components/ui/Status";
import { buildProgress } from "@/domain/progress";
import { canClaim, type QueueRow } from "@/domain/queue";
import type { Database, ID } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { Link } from "@/i18n/navigation";
import { RequestFlags, ScreeningIndicator, StageProgress } from "@/features/requests/parts";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-3 py-1.5">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="min-w-0 text-sm text-ink">{children}</dd>
    </div>
  );
}

export function PreviewPane({
  db,
  row,
  viewerId,
  now,
  onClose,
  onClaim,
  claiming,
}: {
  db: Database;
  row: QueueRow;
  viewerId: ID;
  now: number;
  onClose: () => void;
  onClaim: () => void;
  claiming: boolean;
}) {
  const t = useTranslations("queue.preview");
  const tq = useTranslations("queue");
  const tm = useTranslations("requestDetail.meta");
  const tc = useTranslations("common");
  const td = useTranslations("duration");
  const fmt = useFormat();
  const request = db.requests[row.id];
  const steps = useMemo(() => buildProgress(db, request), [db, request]);
  const claimer = row.claimedBy ? db.users[row.claimedBy] : null;
  const version = request.workflowVersionId ? db.workflowVersions[request.workflowVersionId] : null;

  return (
    <aside
      key={row.id}
      aria-label={row.id}
      className="anim-pane fixed inset-y-0 end-0 z-40 flex h-full w-full shrink-0 flex-col border-s border-line bg-surface shadow-panel sm:w-[26rem] xl:static xl:z-auto xl:shadow-[0_0_40px_-12px_rgb(16_24_40/0.18)]"
    >
      <div className="flex h-12 items-center justify-between border-b border-line ps-5 pe-2">
        <span className="ltr-data rounded-md bg-subtle px-2 py-0.5 font-mono text-xs font-medium text-ink-2 ring-1 ring-line">{row.id}</span>
        <Button variant="ghost" size="sm" iconOnly onClick={onClose} aria-label={t("close")}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="bg-subtle px-5 pt-5 pb-5">
          <div className="flex items-start gap-3.5">
            <Avatar name={row.applicantName} size="xl" />
            <div className="min-w-0 flex-1">
              <bdi className="block truncate text-lg font-bold text-ink">{row.applicantName}</bdi>
              {row.applicantNameAr && (
                <span className="block truncate text-sm text-ink-2">
                  <span lang="ar" dir="rtl">{row.applicantNameAr}</span>
                </span>
              )}
              {row.applicantEmail && <span className="ltr-data block truncate text-xs text-ink-3">{row.applicantEmail}</span>}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
            <StatusPill status={row.status} />
            <BadgeTypeChip id={row.badgeTypeId} label={fmt.text(db.badgeTypes[row.badgeTypeId].name)} />
            {row.screening !== "clear" && <ScreeningIndicator screening={row.screening} level={row.watchlistLevel} />}
          </div>
          <RequestFlags late={row.late} timeLimitHours={row.timeLimitHours} responseReceived={row.responseReceived} awaitingCapacity={row.awaitingCapacity} />
        </div>

        <section className="border-t border-line px-5 py-4">
          <h3 className="eyebrow mb-2">{t("details")}</h3>
          <dl>
            <Fact label={tm("registration")}>{fmt.text(db.registrations[row.registrationId].name)}</Fact>
            <Fact label={tm("badgeType")}>{fmt.text(db.badgeTypes[row.badgeTypeId].name)}</Fact>
            <Fact label={tm("workflow")}>
              {fmt.text(row.workflowLabel)}
              {version && <span className="text-ink-3"> · {tc("version", { n: version.versionNo })}</span>}
            </Fact>
            <Fact label={tm("team")}>{row.teamId ? fmt.text(db.teams[row.teamId].name) : "—"}</Fact>
            <Fact label={tm("reviewer")}>
              {claimer ? (
                <span className="inline-flex items-center gap-1.5">
                  <Avatar name={claimer.name} size="xs" />
                  {row.claimedBy === viewerId ? tq("you") : claimer.name}
                </span>
              ) : (
                <span className="text-ink-3">{tq("unclaimed")}</span>
              )}
            </Fact>
            <Fact label={tm("submitted")}>
              <span className="tabular">{fmt.full(row.submittedAt)}</span>
            </Fact>
            {!row.decidedAt && (
              <Fact label={tm("inStage")}>
                <span className={row.late ? "tabular text-attention" : "tabular"}>
                  {fmt.duration(now - Date.parse(row.stageEnteredAt))}
                </span>
                {row.timeLimitHours && <span className="text-ink-3"> · {td("limit", { h: row.timeLimitHours })}</span>}
              </Fact>
            )}
          </dl>
        </section>

        <section className="border-t border-line px-5 py-4">
          <h3 className="eyebrow mb-3">{t("progress")}</h3>
          <StageProgress steps={steps} db={db} now={now} compact />
        </section>
      </div>

      <div className="flex items-center gap-2 border-t border-line bg-subtle px-5 py-3">
        <Link href={`/requests/${row.id}`} className="flex-1">
          <Button variant="primary" className="w-full">
            {t("open")}
            <DirIcon icon={ArrowUpRight} className="size-3.5" />
          </Button>
        </Link>
        {canClaim(db, viewerId, request) && (
          <Button disabled={claiming} onClick={onClaim}>
            {tq("claim")}
          </Button>
        )}
      </div>
      <p className="bg-subtle px-5 pb-3 text-2xs text-ink-3">{t("hint")}</p>
    </aside>
  );
}
