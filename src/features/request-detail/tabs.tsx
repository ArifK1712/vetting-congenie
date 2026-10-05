"use client";

import { Download, Eye, FileText, ImageIcon, Lock, PenLine, ShieldAlert, UserRound, Workflow } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { toast } from "@/components/ui/Toast";
import { PROFILE_FIELDS } from "@/domain/fieldAccess";
import { maskId } from "@/domain/screening";
import type { HistoryEvent } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { StageProgress } from "@/features/requests/parts";
import { requestService } from "@/services/requests";
import { useFieldLabel } from "./CorrectDialog";
import type { RequestView } from "./useRequestView";

const LTR_FIELDS = new Set(["email", "mobile", "nationalId", "passportNo"]);

function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-line py-3 last:border-b-0 sm:grid-cols-[13rem_1fr] sm:gap-6">
      <dt className="text-sm text-ink-2">{label}</dt>
      <dd className="flex min-w-0 items-baseline justify-between gap-3 text-sm text-ink">
        <span className="min-w-0 break-words">{children}</span>
        {hint}
      </dd>
    </div>
  );
}

function HiddenNote({ count }: { count: number }) {
  const t = useTranslations("requestDetail");
  if (count <= 0) return null;
  return (
    <p className="mt-4 flex items-center gap-2 text-xs text-ink-3">
      <Lock className="size-3.5" />
      {t("hiddenFields", { count, n: count })}
    </p>
  );
}

/** "Correct" button for a field the viewer's team can edit (5.6). */
function CorrectButton({ onClick }: { onClick?: () => void }) {
  const t = useTranslations("requestDetail");
  if (!onClick)
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-xs text-ink-3">
        <PenLine className="size-3" />
        {t("editable")}
      </span>
    );
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-accent-text ring-1 ring-indigo-200 ring-inset hover:bg-accent-soft"
    >
      <PenLine className="size-3.5" />
      {t("correct.button")}
    </button>
  );
}

/** Registration photo. The prototype has no real photos, so a neutral portrait stands in. */
function Photo({ name }: { name: string }) {
  const t = useTranslations("requestDetail.photo");
  return (
    <div className="flex items-end gap-3">
      <svg viewBox="0 0 72 88" className="h-[88px] w-[72px] rounded-lg ring-1 ring-line" role="img" aria-label={`${t("label")}: ${name}`}>
        <rect width="72" height="88" fill="#eef0f7" />
        <circle cx="36" cy="34" r="15" fill="#c9cfe0" />
        <path d="M8 88c2-17 13-27 28-27s26 10 28 27z" fill="#c9cfe0" />
      </svg>
      <span className="text-xs text-ink-3">{t("sample")}</span>
    </div>
  );
}

export function ApplicantTab({ view, onCorrect }: { view: RequestView; onCorrect?: (field: string) => void }) {
  const t = useTranslations("requestDetail");
  const fmt = useFormat();
  const { applicant } = view;

  const display = (field: (typeof PROFILE_FIELDS)[number], value: string) => {
    if (field === "nationality") return fmt.country(value);
    if (field === "dob") return fmt.day(value);
    return value;
  };

  return (
    <div>
      <dl>
        <Row label={t("photo.label")}>
          <Photo name={applicant.fullName} />
        </Row>
        <Row label={t("fields.fullName")}>
          <bdi>{applicant.fullName}</bdi>
        </Row>
        {applicant.fullNameAr && (
          <Row label={t("fields.fullNameAr")}>
            <span lang="ar" dir="rtl">{applicant.fullNameAr}</span>
          </Row>
        )}
        {PROFILE_FIELDS.filter((f) => applicant.profile[f]).map((f) => (
          <Row
            key={f}
            label={t(`fields.${f}`)}
            hint={applicant.editable.has(f) ? <CorrectButton onClick={onCorrect && (() => onCorrect(`profile.${f}`))} /> : undefined}
          >
            <span className={cn(LTR_FIELDS.has(f) && "ltr-data", (f === "nationalId" || f === "passportNo") && "font-mono text-[0.95em]")}>
              {display(f, applicant.profile[f]!)}
            </span>
          </Row>
        ))}
        <Row label={t("fields.badgeType")}>{fmt.text(view.badgeType.name)}</Row>
        <Row label={t("fields.requestId")}>
          <span className="ltr-data font-mono text-[0.95em]">{view.request.id}</span>
        </Row>
      </dl>
      <HiddenNote count={view.hiddenCount} />
    </div>
  );
}

export function AnswersTab({ view, onCorrect }: { view: RequestView; onCorrect?: (field: string) => void }) {
  const t = useTranslations("requestDetail");
  const fmt = useFormat();
  const questions = view.registration.questions.filter((q) => q.type !== "upload");
  const visible = questions.filter((q) => view.applicant.answers.some((a) => a.questionId === q.id));
  if (!visible.length) return <p className="py-6 text-sm text-ink-3">{t("answersEmpty")}</p>;

  return (
    <dl>
      {visible.map((q) => {
        const answer = view.applicant.answers.find((a) => a.questionId === q.id)!;
        const values = Array.isArray(answer.value) ? answer.value : [answer.value];
        const labels = values.map((v) => fmt.text(q.options?.find((o) => o.value === v)?.label) || v);
        return (
          <Row
            key={q.id}
            label={fmt.text(q.label)}
            hint={answer.editable ? <CorrectButton onClick={onCorrect && (() => onCorrect(`answer.${q.id}`))} /> : undefined}
          >
            <span dir="auto" className={cn(q.type === "longText" && "whitespace-pre-line")}>
              {labels.join(", ")}
            </span>
          </Row>
        );
      })}
    </dl>
  );
}

export function DocumentsTab({ view }: { view: RequestView }) {
  const t = useTranslations("requestDetail.documents");
  const tt = useTranslations("actions.toasts");
  const te = useTranslations("actions.errors");
  const tc = useTranslations("common");
  const fmt = useFormat();
  const docs = view.applicant.documents;
  if (!docs.length) return <p className="py-6 text-sm text-ink-3">{t("empty")}</p>;

  return (
    <ul className="divide-y divide-line">
      {docs.map((d) => {
        const question = view.registration.questions.find((q) => q.id === d.questionId);
        const Icon = d.mime === "application/pdf" ? FileText : ImageIcon;
        return (
          <li key={d.id} className="flex items-center gap-3 py-3">
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-line text-ink-3">
              <Icon className="size-4" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-ink">
                <span className="ltr-data">{d.fileName}</span>
              </p>
              <p className="truncate text-xs text-ink-3">
                {fmt.text(question?.label)} ·{" "}
                <span className="tabular">
                  {d.sizeKb >= 1024 ? tc("sizeMb", { n: fmt.number(Math.round(d.sizeKb / 102.4) / 10) }) : tc("sizeKb", { n: fmt.number(d.sizeKb) })}
                </span>{" "}
                · {t("uploaded", { date: fmt.dateTime(d.uploadedAt) })}
              </p>
            </div>
            {d.infoRound && <span className="hidden shrink-0 text-xs text-accent-text sm:inline">{t("round", { n: d.infoRound })}</span>}
            {d.downloadable ? (
              <button
                type="button"
                onClick={async () => {
                  const r = await requestService.download({ requestId: view.request.id, actorId: view.viewer.id, documentId: d.id });
                  toast(r.ok ? tt("downloaded", { file: d.fileName }) : te(r.error));
                }}
                className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-line-strong px-2.5 text-xs text-ink hover:bg-hover"
              >
                <Download className="size-3.5" />
                {t("download")}
              </button>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-ink-3">
                <Eye className="size-3.5" />
                {t("viewOnly")}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function ScreeningTab({ view }: { view: RequestView }) {
  const t = useTranslations("requestDetail.screening");
  const tl = useTranslations("screening");
  const tf = useTranslations("requestDetail.fields");
  const fmt = useFormat();
  const { db } = view;

  if (!view.matches.length && !view.hasHiddenBlacklistHit) {
    return <p className="py-6 text-sm text-ink-3">{t("noMatches")}</p>;
  }

  return (
    <div className="space-y-6 pt-2">
      {view.hasHiddenBlacklistHit && (
        <p className="flex items-center gap-2 text-sm text-ink-2">
          <ShieldAlert className="size-4 text-ink-3" />
          {t("restricted")}
        </p>
      )}
      {view.matches.map((m) => {
        const isBlacklist = m.listType === "blacklist";
        const entry = isBlacklist ? db.blacklist[m.entryId] : db.watchlist[m.entryId];
        const wl = !isBlacklist ? db.watchlist[m.entryId] : null;
        const bl = isBlacklist ? db.blacklist[m.entryId] : null;
        const detailAllowed = isBlacklist ? view.seesBlacklist : view.seesWatchlist;
        const decider = m.decidedBy ? db.users[m.decidedBy] : null;
        return (
          <section key={m.id} className="border-b border-line pb-6 last:border-b-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium", isBlacklist ? "text-danger" : "text-attention")}>
                {isBlacklist ? <ShieldAlert className="size-4" /> : <Eye className="size-4" />}
                {isBlacklist ? tl("blacklist") : `${tl("watchlist")} · ${tl(`level.${wl!.level}`)}`}
              </span>
              <span className="text-sm text-ink-2">{t(`matchType.${m.matchType}`)}</span>
              <span className="text-xs text-ink-3">
                {t(`strength.${m.strength}`)}
                {m.matchType === "name" || m.matchType === "nameDob" ? ` · ${t("score", { score: m.score })}` : ""}
              </span>
              <span className="ms-auto text-xs text-ink-3">
                {t(`matchStatus.${m.status}`)}
                {decider && m.decidedAt && ` · ${decider.name} · ${fmt.dateTime(m.decidedAt)}`}
              </span>
            </div>

            <dl className="mt-3">
              <Row label={t("matchedOn")}>{tf(m.matchedField === "fullName" ? "fullName" : m.matchedField)}</Row>
              <Row label={t("entry")}>
                <span className="ltr-data font-mono text-[0.95em]">{m.entryId}</span>
                {detailAllowed && (
                  <>
                    {" · "}
                    <bdi>{entry.identity.fullName}</bdi>
                    {entry.identity.nationalId && <span className="ltr-data text-ink-3"> · {maskId(entry.identity.nationalId)}</span>}
                    {entry.identity.passportNo && <span className="ltr-data text-ink-3"> · {maskId(entry.identity.passportNo)}</span>}
                  </>
                )}
              </Row>
              <Row label={t("reason")}>
                {bl && <>{t(`blacklistReason.${bl.reasonType}`)} — <span dir="auto">{bl.reasonDetail}</span></>}
                {wl && (detailAllowed ? <span dir="auto">{wl.reason}</span> : <span className="text-ink-3">—</span>)}
              </Row>
              {wl && (
                <Row label={t("note")}>
                  <span dir="auto">{wl.reviewerNote}</span>
                </Row>
              )}
              <Row label={t("found")}>
                {t(`stagePoint.${m.stagePoint}`)} · <span className="tabular">{fmt.full(m.foundAt)}</span>
              </Row>
            </dl>
            {isBlacklist && m.status === "open" && view.seesBlacklist && (
              <Link href={`/screening/matches?match=${m.id}`} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-text hover:underline">
                <ShieldAlert className="size-4" />
                {t("decideInReview")}
              </Link>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function ProgressTab({ view, now }: { view: RequestView; now: number }) {
  const t = useTranslations("requestDetail.progress");
  const fmt = useFormat();
  return (
    <div className="pt-4">
      {view.workflow && view.version && (
        <p className="mb-5 flex items-center gap-2 text-xs text-ink-3">
          <Workflow className="size-3.5" />
          {t("versionNote", { name: fmt.text(view.workflow.name), n: view.version.versionNo })}
        </p>
      )}
      <StageProgress steps={view.steps} db={view.db} now={now} />
    </div>
  );
}

export function MoreInfoTab({ view, now }: { view: RequestView; now: number }) {
  const t = useTranslations("requestDetail.moreInfo");
  const fmt = useFormat();
  if (!view.infoRequests.length) return <p className="py-6 text-sm text-ink-3">{t("empty")}</p>;

  return (
    <div className="space-y-8 pt-4">
      {view.infoRequests.map((ir) => {
        const by = view.db.users[ir.requestedBy];
        const expired = ir.status === "expired" || (ir.status === "sent" && Date.parse(ir.tokenExpiresAt) < now);
        return (
          <section key={ir.id}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="text-sm font-medium text-ink">{t("round", { n: ir.round })}</h3>
              <span className="text-xs text-ink-3">
                {t("requestedBy", { name: by?.name ?? "" })} · {fmt.dateTime(ir.sentAt)}
              </span>
              <span className={cn("ms-auto text-xs", ir.status === "answered" ? "text-positive" : expired ? "text-danger" : "text-attention")}>
                {ir.status === "answered" && ir.answeredAt
                  ? t("answered", { date: fmt.dateTime(ir.answeredAt) })
                  : expired
                    ? t("expired")
                    : `${t("awaiting")} · ${t("expires", { date: fmt.dateTime(ir.tokenExpiresAt) })}`}
              </span>
            </div>
            <p className="eyebrow mt-4">{t("instructions")}</p>
            <p dir="auto" className="mt-1 text-sm text-ink">
              {ir.instructions}
            </p>
            <dl className="mt-3">
              {ir.questions.map((q) => {
                const a = ir.answers?.[q.id];
                return (
                  <Row
                    key={q.id}
                    label={q.label}
                    hint={q.required ? <span className="shrink-0 text-xs text-ink-3">{t("required")}</span> : undefined}
                  >
                    {a ? <span dir="auto">{Array.isArray(a) ? a.join(", ") : a}</span> : <span className="text-ink-3">{t("noAnswer")}</span>}
                  </Row>
                );
              })}
            </dl>
          </section>
        );
      })}
    </div>
  );
}

export function HistoryTab({ view }: { view: RequestView }) {
  const t = useTranslations("requestDetail.history");
  const tw = useTranslations("screening.level");
  const fieldLabel = useFieldLabel(view);
  /** Old and new values only when the viewer may see the field. */
  const canSee = (key: string) => {
    const [source, k] = key.split(".");
    return source === "profile" ? k in view.applicant.profile : view.applicant.answers.some((a) => a.questionId === k);
  };
  const fmt = useFormat();
  const { db } = view;

  const describe = (h: HistoryEvent) => {
    const stageName = (nodeId?: string) => {
      const exec = Object.values(db.stageExecutions).find((e) => e.requestId === h.requestId && e.stageNodeId === nodeId);
      return exec ? fmt.text(exec.stageName) : "";
    };
    switch (h.action) {
      case "routed":
        return t("actions.routed", { team: h.teamId ? fmt.text(db.teams[h.teamId]?.name) : "" });
      case "approved_stage":
        return t("actions.approved_stage", { stage: stageName(h.stageNodeId) });
      case "field_corrected":
        return t("actions.field_corrected", { field: fieldLabel(String(h.meta?.field ?? "")) });
      case "watchlist_marked":
        return t("actions.watchlist_marked", { level: tw(String(h.meta?.level ?? "low") as "low") });
      case "final_approved":
        return t("actions.final_approved", { used: String(h.meta?.placesUsed ?? ""), limit: String(h.meta?.limit ?? "") });
      default:
        return t(`actions.${h.action}`);
    }
  };

  return (
    <ol className="pt-2">
      {view.history.map((h) => {
        const actor = h.actorId === "system" || h.actorId === "attendee" ? null : db.users[h.actorId];
        const detail =
          h.action === "screened" && h.meta
            ? t("screenedDetail", {
                blacklist: Number(h.meta.blacklist ?? 0),
                watchlist: Number(h.meta.watchlist ?? 0),
                b: Number(h.meta.blacklist ?? 0),
                w: Number(h.meta.watchlist ?? 0),
              })
            : h.action === "rejected" && h.meta?.reasonId
              ? fmt.text(db.rejectReasons[String(h.meta.reasonId)]?.label)
              : h.action === "reassigned" && h.meta?.to
                ? t("reassignedTo", { name: db.users[String(h.meta.to)]?.name ?? "" })
                : h.action === "field_corrected" && h.meta?.field && canSee(String(h.meta.field))
                  ? t("changedFrom", { from: String(h.meta.from ?? "—") || "—", to: String(h.meta.to ?? "") })
                  : h.action === "document_downloaded" && h.meta?.file
                    ? t("file", { file: String(h.meta.file) })
                    : null;
        return (
          <li key={h.id} className="flex gap-3 border-b border-line py-3 last:border-b-0">
            {actor ? (
              <Avatar name={actor.name} size="sm" />
            ) : (
              <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-subtle text-ink-3">
                {h.actorId === "attendee" ? <UserRound className="size-3.5" /> : <Workflow className="size-3.5" />}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink">
                <span className="font-medium">{actor ? actor.name : h.actorId === "attendee" ? t("attendee") : t("system")}</span>
                <span className="text-ink-2"> · {describe(h)}</span>
              </p>
              {detail && <p className="text-xs text-ink-3">{detail}</p>}
              {h.remarks && (
                <p dir="auto" className="mt-1.5 border-s-2 border-line ps-3 text-sm text-ink-2">
                  {h.remarks}
                </p>
              )}
            </div>
            <time dateTime={h.at} className="tabular shrink-0 text-xs text-ink-3">
              {fmt.dateTime(h.at)}
            </time>
          </li>
        );
      })}
    </ol>
  );
}
