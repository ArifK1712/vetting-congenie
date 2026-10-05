"use client";

import { ArrowUpRight, Ellipsis, Eye, Info, Loader2, RotateCcw, ShieldBan, Undo2, UserRoundCog } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { DirIcon } from "@/components/ui/DirIcon";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/Menu";
import { BadgeStatusLabel } from "@/components/ui/Status";
import { toast } from "@/components/ui/Toast";
import { canReassign } from "@/domain/actions";
import { FINAL_STATUSES } from "@/domain/status";
import { useFormat } from "@/i18n/format";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { TextArea } from "@/components/ui/Field";
import { requestService } from "@/services/requests";
import { useQuickAction, useRequestAction } from "@/features/requests/useRequestAction";
import { ApproveDialog, EscalateDialog, ReassignDialog, RejectDialog, ReopenDialog, type DialogKind } from "./ActionDialogs";
import type { RequestView } from "./useRequestView";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-xs text-ink-3">{label}</dt>
      <dd className="min-w-0 text-end text-sm text-ink">{children}</dd>
    </div>
  );
}

export function DecisionPanel({
  view,
  revision,
  stale,
  onActed,
}: {
  view: RequestView;
  revision: number;
  stale: boolean;
  onActed: () => void;
}) {
  const t = useTranslations("requestDetail.actions");
  const t2 = useTranslations("requestDetail.reopen");
  const tt = useTranslations("actions.toasts");
  const { request, viewer, stage, db } = view;
  const [dialog, setDialog] = useState<DialogKind>(null);
  const quick = useQuickAction();
  const soon = () => toast(t("comingNext"));
  const router = useRouter();
  const ref = { requestId: request.id, actorId: viewer.id, expectedRevision: revision };

  const mine = request.claimedBy === viewer.id && request.status === "under_review" && !request.awaitingCapacity;
  const byOther = !!request.claimedBy && request.claimedBy !== viewer.id && !FINAL_STATUSES.includes(request.status);
  const allowed = stage?.allowedActions ?? [];
  const canRetryFinal = request.awaitingCapacity && (request.claimedBy === viewer.id || viewer.can("queue.reviewAll"));
  const reassignable = canReassign(db, viewer.id, request);
  const disabled = stale || quick.busyId !== null;

  let message: string | null = null;
  if (FINAL_STATUSES.includes(request.status)) message = t("finished");
  else if (view.status === "screening_hold") message = t("onHold");
  else if (request.status === "more_info_required") message = t("waitingAttendee");
  else if (request.awaitingCapacity) message = null;
  else if (byOther) message = t("claimedByOther", { name: view.claimer?.name ?? "" });
  else if (view.canClaim) message = t("claimFirst");
  else if (mine) message = t("decideHint");
  else message = t("readOnly");

  const secondary = [
    { key: "release", icon: Undo2, show: mine, onSelect: () => quick.run("release", () => requestService.release(ref), tt("released", { id: request.id })).then((ok) => ok && onActed()) },
    { key: "reassign", icon: UserRoundCog, show: reassignable, onSelect: () => setDialog("reassign") },
    { key: "addWatchlist", icon: Eye, show: viewer.can("watchlist.manage"), onSelect: () => router.push(`/screening/watchlist/new?fromRequest=${request.id}`) },
    { key: "addBlacklist", icon: ShieldBan, show: viewer.can("blacklist.propose"), onSelect: () => router.push(`/screening/blacklist/new?fromRequest=${request.id}`) },
  ] as const;
  const visibleSecondary = secondary.filter((s) => s.show);

  const dialogProps = {
    view,
    revision,
    onClose: () => setDialog(null),
    onDone: () => {
      setDialog(null);
      onActed();
    },
  };

  return (
    <section className="overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-line">
      <div aria-hidden className="h-1 bg-accent" />
      <div className="p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-ink">{t("title")}</h2>
          {visibleSecondary.length > 0 && (
            <Menu>
              <MenuTrigger asChild>
                <Button variant="ghost" size="sm" iconOnly aria-label={t("more")} disabled={disabled}>
                  <Ellipsis className="size-4" />
                </Button>
              </MenuTrigger>
              <MenuContent align="end">
                {visibleSecondary.map((s) => (
                  <MenuItem key={s.key} onSelect={s.onSelect}>
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
          {request.status === "rejected" && viewer.can("queue.reviewAll") && (
            <>
              <Button className="w-full" disabled={disabled} onClick={() => setDialog("reopen")}>
                <RotateCcw className="size-4" />
                {t2("button")}
              </Button>
              <p className="text-xs text-ink-3">{t2("hint")}</p>
            </>
          )}
          {view.canClaim && (
            <Button
              variant="primary"
              className="w-full"
              disabled={disabled}
              onClick={() => quick.run("claim", () => requestService.claim(ref), tt("claimed", { id: request.id })).then((ok) => ok && onActed())}
            >
              {quick.busyId === "claim" ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("claim")}
            </Button>
          )}
          {canRetryFinal && (
            <Button
              variant="primary"
              className="w-full"
              disabled={disabled}
              onClick={() =>
                quick
                  .run("retry", () => requestService.retryFinal(ref), tt("approvedFinal", { id: request.id }))
                  .then((ok) => ok && onActed())
              }
            >
              {quick.busyId === "retry" ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("retryFinal")}
            </Button>
          )}
          {(mine || byOther) && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="success" disabled={byOther || disabled} onClick={() => setDialog("approve")}>
                  {t("approve")}
                </Button>
                <Button variant="danger" disabled={byOther || disabled} onClick={() => setDialog("reject")}>
                  {t("reject")}
                </Button>
              </div>
              {allowed.includes("moreInfo") && (
                <Button className="w-full" disabled={byOther || disabled} onClick={soon}>
                  {t("moreInfo")}
                </Button>
              )}
              {allowed.includes("escalate") && (stage?.escalateTo.length ?? 0) > 0 && (
                <Button className="w-full" disabled={byOther || disabled} onClick={() => setDialog("escalate")}>
                  <DirIcon icon={ArrowUpRight} className="size-3.5" />
                  {t("escalate")}
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {dialog === "approve" && <ApproveDialog {...dialogProps} />}
      {dialog === "reject" && <RejectDialog {...dialogProps} />}
      {dialog === "escalate" && <EscalateDialog {...dialogProps} />}
      {dialog === "reassign" && <ReassignDialog {...dialogProps} />}
      {dialog === "reopen" && <ReopenDialog {...dialogProps} />}
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
      {view.viewer.can("queue.access") && <CommentComposer view={view} />}
      {view.comments.length === 0 ? (
        <p className="mt-3 text-sm text-ink-3">{t("empty")}</p>
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

function CommentComposer({ view }: { view: RequestView }) {
  const t = useTranslations("requestDetail.actions");
  const tt = useTranslations("actions.toasts");
  const [body, setBody] = useState("");
  const { busy, error, run } = useRequestAction();
  const submit = () =>
    run(
      () => requestService.comment({ requestId: view.request.id, actorId: view.viewer.id, body }),
      () => tt("commented"),
      () => setBody(""),
    );
  return (
    <div className="mt-3">
      <TextArea
        rows={2}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t("commentPlaceholder")}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
      />
      {error && <p className="mt-1.5 text-xs text-rose-600">{error}</p>}
      <div className="mt-2 flex justify-end">
        <Button size="sm" variant="secondary" disabled={busy || !body.trim()} onClick={submit}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {t("addComment")}
        </Button>
      </div>
    </div>
  );
}
