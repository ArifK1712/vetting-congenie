"use client";

import { ArrowUpRight, Ellipsis, Eye, Info, MessageSquare, ShieldBan, UserRoundCog } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { DirIcon } from "@/components/ui/DirIcon";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/Menu";
import { BadgeStatusLabel } from "@/components/ui/Status";
import { toast } from "@/components/ui/Toast";
import { isTeamLead } from "@/domain/permissions";
import { FINAL_STATUSES } from "@/domain/status";
import { useFormat } from "@/i18n/format";
import { cn } from "@/lib/cn";
import type { RequestView } from "./useRequestView";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-xs text-ink-3">{label}</dt>
      <dd className="min-w-0 text-end text-sm text-ink">{children}</dd>
    </div>
  );
}

export function DecisionPanel({ view }: { view: RequestView }) {
  const t = useTranslations("requestDetail.actions");
  const { request, viewer, stage, db } = view;
  const soon = () => toast(t("comingNext"));

  const mine = request.claimedBy === viewer.id && request.status === "under_review" && !request.awaitingCapacity;
  const byOther = !!request.claimedBy && request.claimedBy !== viewer.id && !FINAL_STATUSES.includes(request.status);
  const lead = request.currentTeamId ? isTeamLead(db, viewer.id, request.currentTeamId) : false;
  const allowed = stage?.allowedActions ?? [];

  let message: string | null = null;
  if (FINAL_STATUSES.includes(request.status)) message = t("finished");
  else if (view.status === "screening_hold") message = t("onHold");
  else if (request.status === "more_info_required") message = t("waitingAttendee");
  else if (byOther) message = t("claimedByOther", { name: view.claimer?.name ?? "" });
  else if (view.canClaim) message = t("claimFirst");
  else if (!mine) message = t("readOnly");

  const secondary = [
    { key: "reassign", icon: UserRoundCog, show: viewer.can("queue.assign") || lead },
    { key: "comment", icon: MessageSquare, show: viewer.can("queue.access") },
    { key: "addWatchlist", icon: Eye, show: viewer.can("watchlist.manage") },
    { key: "addBlacklist", icon: ShieldBan, show: viewer.can("blacklist.propose") },
  ] as const;
  const visibleSecondary = secondary.filter((s) => s.show);

  return (
    <section className="overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-line">
      <div aria-hidden className="h-1 bg-accent" />
      <div className="p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-ink">{t("title")}</h2>
        {visibleSecondary.length > 0 && (
          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" size="sm" iconOnly aria-label={t("more")}>
                <Ellipsis className="size-4" />
              </Button>
            </MenuTrigger>
            <MenuContent align="end">
              {visibleSecondary.map((s) => (
                <MenuItem key={s.key} onSelect={soon}>
                  <s.icon className="size-4 text-ink-3" />
                  {t(s.key)}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
        )}
      </div>

      {message && (
        <p className="mt-3 flex gap-2.5 rounded-lg bg-subtle p-3 text-sm text-ink-2 ring-1 ring-line">
          <Info className="mt-0.5 size-4 shrink-0 text-indigo-500" />
          {message}
        </p>
      )}

      <div className="mt-4 space-y-2">
        {view.canClaim && (
          <Button variant="primary" className="w-full" onClick={soon}>
            {t("claim")}
          </Button>
        )}
        {(mine || byOther) && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="success" disabled={byOther} onClick={soon}>
                {t("approve")}
              </Button>
              <Button variant="danger" disabled={byOther} onClick={soon}>
                {t("reject")}
              </Button>
            </div>
            {allowed.includes("moreInfo") && (
              <Button className="w-full" disabled={byOther} onClick={soon}>
                {t("moreInfo")}
              </Button>
            )}
            {allowed.includes("escalate") && (stage?.escalateTo.length ?? 0) > 0 && (
              <Button className="w-full" disabled={byOther} onClick={soon}>
                <DirIcon icon={ArrowUpRight} className="size-3.5" />
                {t("escalate")}
              </Button>
            )}
          </>
        )}
      </div>
      </div>
    </section>
  );
}

export function FactsPanel({ view, now }: { view: RequestView; now: number }) {
  const tm = useTranslations("requestDetail.meta");
  const tp = useTranslations("payment");
  const tc = useTranslations("common");
  const tq = useTranslations("queue");
  const td = useTranslations("duration");
  const fmt = useFormat();
  const { request, applicant } = view;
  const decided = request.decidedAt;

  return (
    <section className="rounded-xl bg-surface px-5 py-2 shadow-card ring-1 ring-line">
      <dl className="divide-y divide-line">
        <Fact label={tm("event")}>{fmt.text(view.event.name)}</Fact>
        <Fact label={tm("submitted")}>
          <span className="tabular">{fmt.full(request.submittedAt)}</span>
        </Fact>
        {decided ? (
          <Fact label={tm("decided")}>
            <span className="tabular">{fmt.full(decided)}</span>
          </Fact>
        ) : (
          <>
            <Fact label={tm("waiting")}>
              <span className="tabular">{fmt.duration(now - Date.parse(request.submittedAt))}</span>
            </Fact>
            <Fact label={tm("inStage")}>
              <span className={cn("tabular", view.late && "font-medium text-attention")}>
                {fmt.duration(now - Date.parse(request.stageEnteredAt))}
                {view.late && ` · ${tq("late")}`}
              </span>
            </Fact>
            <Fact label={tm("timeLimit")}>
              {view.timeLimitHours ? td("limit", { h: fmt.number(view.timeLimitHours) }) : tm("noLimit")}
            </Fact>
          </>
        )}
        {applicant.payment && (
          <Fact label={tm("payment")}>
            {tp(applicant.payment.status)}
            {applicant.payment.amount > 0 && (
              <span className="tabular text-ink-3"> · {tc("amount", { amount: fmt.number(applicant.payment.amount) })}</span>
            )}
          </Fact>
        )}
        <Fact label={tm("badge")}>
          <BadgeStatusLabel status={request.badgeStatus} />
        </Fact>
      </dl>
    </section>
  );
}

export function CommentsPanel({ view }: { view: RequestView }) {
  const t = useTranslations("requestDetail.comments");
  const fmt = useFormat();
  return (
    <section className="rounded-xl bg-surface p-5 shadow-card ring-1 ring-line">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-bold text-ink">{t("title")}</h2>
        <span className="text-2xs text-ink-3">{t("internal")}</span>
      </div>
      {view.comments.length === 0 ? (
        <p className="mt-2 text-sm text-ink-3">{t("empty")}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {view.comments.map((c) => {
            const author = view.db.users[c.authorId];
            return (
              <li key={c.id} className="flex gap-2.5">
                <Avatar name={author.name} size="sm" />
                <div className="min-w-0">
                  <p className="text-xs text-ink-3">
                    <span className="font-medium text-ink">{author.name}</span> · {fmt.dateTime(c.at)}
                  </p>
                  <p dir="auto" className="mt-0.5 text-sm text-ink">
                    {c.body}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
