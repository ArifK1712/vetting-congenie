"use client";

import { ArrowUpRight, BadgeCheck, CircleX, Layers, RotateCcw, UserRoundCog } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { ActionDialog, DialogIcon } from "@/components/ui/Dialog";
import { ChoiceList, Field, TextArea } from "@/components/ui/Field";
import { approvedEarlierStage, openClaims, previewApprove } from "@/domain/actions";
import { nodeById, type StageNode } from "@/domain/workflow";
import { useFormat } from "@/i18n/format";
import { requestService } from "@/services/requests";
import { useRequestAction } from "@/features/requests/useRequestAction";
import type { RequestView } from "./useRequestView";

export type DialogKind = "approve" | "reject" | "escalate" | "reassign" | "reopen" | "ask" | null;

interface Props {
  view: RequestView;
  /** The revision the viewer is looking at; sent with every action. */
  revision: number;
  onClose: () => void;
  onDone: () => void;
}

const ref = (view: RequestView, revision: number) => ({
  requestId: view.request.id,
  actorId: view.viewer.id,
  expectedRevision: revision,
});

export function ApproveDialog({ view, revision, onClose, onDone }: Props) {
  const t = useTranslations("actions.dialogs.approve");
  const tt = useTranslations("actions.toasts");
  const fmt = useFormat();
  const [comment, setComment] = useState("");
  const { busy, error, run } = useRequestAction();
  const preview = useMemo(() => previewApprove(view.db, view.request), [view.db, view.request]);
  const stageName = fmt.text(view.stage?.name);

  const confirm = () =>
    run(
      () => requestService.approve({ ...ref(view, revision), comment }),
      (r) => {
        const id = view.request.id;
        if (r.outcome === "nextStage" && preview?.kind === "stage") return tt("approvedNext", { id, stage: fmt.text(preview.node.stage.name) });
        if (r.outcome === "limitReached") return tt("limitReached", { id });
        if (r.outcome === "screeningHold") return tt("screeningHold", { id });
        return r.db.requests[id].badgeStatus === "issued" ? tt("approvedFinal", { id }) : tt("approvedNoBadge", { id });
      },
      onDone,
    );

  return (
    <ActionDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("title", { stage: stageName })}
      icon={<DialogIcon className="bg-emerald-50 text-emerald-600"><BadgeCheck className="size-5" /></DialogIcon>}
      confirmLabel={t("confirm")}
      confirmVariant="success"
      busy={busy}
      error={error}
      onConfirm={confirm}
    >
      {preview?.kind === "stage" && (
        <div className="flex items-center gap-3 rounded-xl bg-indigo-50/60 p-3.5 ring-1 ring-indigo-100 ring-inset">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
            <Layers className="size-4" />
          </span>
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-ink">{t("nextStage", { stage: fmt.text(preview.node.stage.name) })}</p>
            {preview.teamId && <p className="text-ink-2">{t("nextTeam", { team: fmt.text(view.db.teams[preview.teamId]?.name) })}</p>}
          </div>
        </div>
      )}
      {preview?.kind === "final" && (
        <div
          className={
            preview.used >= preview.limit
              ? "rounded-xl bg-amber-50 p-3.5 text-sm text-amber-800 ring-1 ring-amber-600/20 ring-inset"
              : "rounded-xl bg-emerald-50/70 p-3.5 text-sm text-emerald-800 ring-1 ring-emerald-600/15 ring-inset"
          }
        >
          <p className="font-semibold">{t("finalTitle")}</p>
          <p className="mt-0.5">
            {preview.used >= preview.limit
              ? t("finalFull", { used: fmt.number(preview.used), limit: fmt.number(preview.limit) })
              : t("final", { used: fmt.number(preview.used), limit: fmt.number(preview.limit) })}
          </p>
        </div>
      )}
      <Field label={t("comment")} hint={t("optional")} htmlFor="approve-comment">
        <TextArea id="approve-comment" value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t("commentPlaceholder")} />
      </Field>
    </ActionDialog>
  );
}

/** Status rules (17): Review All users reopen a rejected request, with a logged reason. */
export function ReopenDialog({ view, revision, onClose, onDone }: Props) {
  const t = useTranslations("requestDetail.reopen");
  const tt = useTranslations("actions.toasts");
  const fmt = useFormat();
  const [reason, setReason] = useState("");
  const { busy, error, run } = useRequestAction();
  return (
    <ActionDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("title", { id: view.request.id })}
      description={t("description", { stage: view.stage ? fmt.text(view.stage.name) : "—" })}
      icon={<DialogIcon className="bg-indigo-50 text-indigo-600"><RotateCcw className="size-5" /></DialogIcon>}
      confirmLabel={t("confirm")}
      busy={busy}
      error={error}
      confirmDisabled={!reason.trim()}
      onConfirm={() => run(() => requestService.reopen({ ...ref(view, revision), reason }), () => tt("reopened", { id: view.request.id }), onDone)}
    >
      <Field label={t("reason")} htmlFor="reopen-reason">
        <TextArea id="reopen-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("reasonPlaceholder")} />
      </Field>
    </ActionDialog>
  );
}

export function RejectDialog({ view, revision, onClose, onDone }: Props) {
  const t = useTranslations("actions.dialogs.reject");
  const ta = useTranslations("actions.dialogs.approve");
  const tt = useTranslations("actions.toasts");
  const fmt = useFormat();
  const [reasonId, setReasonId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const { busy, error, run } = useRequestAction();
  // "Blacklisted" is set only by a confirmed screening match, never by hand.
  const reasons = Object.values(view.db.rejectReasons).filter((r) => r.id !== "rr_blacklisted");
  const required = view.stage?.rejectReasonRequired ?? true;

  return (
    <ActionDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("title")}
      description={t("note")}
      icon={<DialogIcon className="bg-rose-50 text-rose-600"><CircleX className="size-5" /></DialogIcon>}
      confirmLabel={t("confirm")}
      confirmVariant="danger"
      busy={busy}
      error={error}
      confirmDisabled={required && !reasonId}
      onConfirm={() =>
        run(() => requestService.reject({ ...ref(view, revision), reasonId, comment }), () => tt("rejected", { id: view.request.id }), onDone)
      }
    >
      <Field label={t("reason")} hint={required ? undefined : ta("optional")}>
        <ChoiceList label={t("reason")} value={reasonId} onChange={setReasonId} choices={reasons.map((r) => ({ value: r.id, label: fmt.text(r.label) }))} />
      </Field>
      <Field label={t("comment")} hint={ta("optional")} htmlFor="reject-comment">
        <TextArea id="reject-comment" value={comment} onChange={(e) => setComment(e.target.value)} placeholder={ta("commentPlaceholder")} />
      </Field>
    </ActionDialog>
  );
}

export function EscalateDialog({ view, revision, onClose, onDone }: Props) {
  const t = useTranslations("actions.dialogs.escalate");
  const tt = useTranslations("actions.toasts");
  const fmt = useFormat();
  const graph = view.version?.graph;
  const targets = (view.stage?.escalateTo ?? [])
    .map((id) => (graph ? nodeById(graph, id) : undefined))
    .filter((n): n is StageNode => n?.type === "stage");
  const [targetId, setTargetId] = useState<string | null>(targets[0]?.id ?? null);
  const [remarks, setRemarks] = useState("");
  const { busy, error, run } = useRequestAction();
  const chosen = targets.find((x) => x.id === targetId);

  return (
    <ActionDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("title")}
      icon={<DialogIcon className="bg-orange-50 text-orange-600"><ArrowUpRight className="size-5 rtl:-scale-x-100" /></DialogIcon>}
      confirmLabel={t("confirm")}
      busy={busy}
      error={error}
      confirmDisabled={!targetId || !remarks.trim()}
      onConfirm={() =>
        run(
          () => requestService.escalate({ ...ref(view, revision), targetNodeId: targetId!, remarks }),
          () => tt("escalated", { id: view.request.id, stage: fmt.text(chosen?.stage.name) }),
          onDone,
        )
      }
    >
      <Field label={t("target")}>
        <ChoiceList
          label={t("target")}
          value={targetId}
          onChange={setTargetId}
          choices={targets.map((n) => ({
            value: n.id,
            label: fmt.text(n.stage.name),
            hint: n.stage.teams.map((id) => fmt.text(view.db.teams[id]?.name)).join(" · "),
            aside: n.stage.mandatory ? <span className="shrink-0 text-2xs font-semibold text-ink-3">{t("mandatory")}</span> : undefined,
          }))}
        />
      </Field>
      <Field label={t("remarks")} htmlFor="escalate-remarks">
        <TextArea id="escalate-remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder={t("remarksPlaceholder")} />
      </Field>
    </ActionDialog>
  );
}

export function ReassignDialog({ view, revision, onClose, onDone }: Props) {
  const t = useTranslations("actions.dialogs.reassign");
  const tt = useTranslations("actions.toasts");
  const { db, request } = view;
  const team = request.currentTeamId ? db.teams[request.currentTeamId] : null;
  const [userId, setUserId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const { busy, error, run } = useRequestAction();

  const choices = (team?.members ?? [])
    .filter((m) => db.users[m.userId]?.active)
    .map((m) => {
      const user = db.users[m.userId];
      const current = request.claimedBy === m.userId;
      const blocked = approvedEarlierStage(db, m.userId, request);
      return {
        value: m.userId,
        disabled: current || blocked,
        label: (
          <span className="flex items-center gap-2">
            <Avatar name={user.name} size="xs" />
            {user.name}
            {m.role === "lead" && <span className="rounded-md bg-violet-50 px-1.5 text-2xs font-semibold text-violet-700">{t("lead")}</span>}
          </span>
        ),
        hint: current ? t("current") : blocked ? t("blocked") : undefined,
        aside: <span className="tabular shrink-0 text-xs text-ink-3">{t("openCount", { n: openClaims(db, m.userId, team!.id) })}</span>,
      };
    });

  return (
    <ActionDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("title")}
      icon={<DialogIcon className="bg-violet-50 text-violet-600"><UserRoundCog className="size-5" /></DialogIcon>}
      confirmLabel={t("confirm")}
      busy={busy}
      error={error}
      confirmDisabled={!userId || !reason.trim()}
      onConfirm={() =>
        run(
          () => requestService.reassign({ ...ref(view, revision), toUserId: userId!, reason }),
          () => tt("reassigned", { id: request.id, name: db.users[userId!].name }),
          onDone,
        )
      }
    >
      <Field label={t("assignee")}>
        <ChoiceList label={t("assignee")} value={userId} onChange={setUserId} choices={choices} />
      </Field>
      <Field label={t("reason")} htmlFor="reassign-reason">
        <TextArea id="reassign-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("reasonPlaceholder")} />
      </Field>
    </ActionDialog>
  );
}
