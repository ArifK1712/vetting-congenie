"use client";

import { BadgeX, Check, CheckCircle2, Clock, FileText, Hourglass, Inbox, Loader2, Lock, ScanSearch, ShieldAlert, ShieldBan, ShieldCheck, XCircle, type LucideIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState, type ReactNode } from "react";
import { PAGE } from "@/design/layout";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, TextArea } from "@/components/ui/Field";
import { BadgeTypeChip, Pill, StatusLabel } from "@/components/ui/Status";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { toast } from "@/components/ui/Toast";
import { TONE, type Tone } from "@/design/tones";
import { decidedRecently, reviewQueue, type ReviewCase, type ReviewError } from "@/domain/matchReview";
import { nameScore, normalizeId, normalizeName } from "@/domain/screening";
import type { ApplicantProfile, Database, ListIdentity, ScreeningField, ScreeningMatch } from "@/domain/types";
import { useFormat, type Formatter } from "@/i18n/format";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { useNow } from "@/lib/useNow";
import { matchReviewService } from "@/services/matchReview";
import { useDb } from "@/store/app";
import { useViewer } from "@/store/useViewer";
import { displayName, useReasonLabel } from "@/features/blacklist/parts";

const KIND_TONE: Record<ReviewCase["kind"], Tone> = { hold: "red", badge: "orange", inProgress: "amber" };

/** Review service error code to a message. */
export function useReviewError() {
  const t = useTranslations("matchReview.errors");
  return (error: ReviewError) => t(error);
}

/** Match type and score, e.g. "ID match · 100%". */
function useMatchSummary() {
  const t = useTranslations("matchReview");
  const fmt = useFormat();
  return (m: Pick<ScreeningMatch, "matchType" | "score">) => t("matchSummary", { type: t(`matchType.${m.matchType}`), score: fmt.number(m.score) });
}

/** Wraps a rich-text chunk (a name) so it keeps its own direction inside the sentence. */
const isolate = (chunks: ReactNode) => <bdi>{chunks}</bdi>;

function Metric({ icon: Icon, tone, label, value, hint }: { icon: LucideIcon; tone: Tone; label: string; value: string; hint: string }) {
  return (
    <div className="flex items-start gap-3.5 bg-surface px-5 py-4">
      <span className={cn("mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl", TONE[tone].chip)}>
        <Icon className="size-[18px]" strokeWidth={2.1} />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-ink-2">{label}</span>
        <span className="tabular mt-0.5 block text-2xl leading-tight font-bold tracking-tight text-ink">{value}</span>
        <span className="block truncate text-xs text-ink-3">{hint}</span>
      </span>
    </div>
  );
}

// ─── Comparison ─────────────────────────────────────────────────────────

type Same = "same" | "close" | "differs" | "none";
type RowKey = "name" | "company" | "nationalId" | "passport" | "nationality" | "dob" | "email" | "mobile";

/** The comparison row that holds the field which triggered the match. */
const ROW_OF_FIELD: Record<ScreeningField, RowKey> = {
  fullName: "name",
  nationalId: "nationalId",
  passportNo: "passport",
  nationality: "nationality",
  dob: "dob",
  email: "email",
  mobile: "mobile",
  company: "company",
};

/** Identifiers, emails and phone numbers stay left to right in Arabic. */
const latin = (value: string, mono = true) => <span className={cn("ltr-data", mono && "font-mono")}>{value}</span>;

function compareRows(p: ApplicantProfile, id: ListIdentity, fmt: Formatter) {
  const ids = (a?: string, b?: string): Same => (!a || !b ? "none" : normalizeId(a) === normalizeId(b) ? "same" : "differs");
  const names = [id.fullName, ...id.aliases];
  const score = Math.max(...names.flatMap((n) => [p.fullName, p.fullNameAr].filter(Boolean).map((a) => nameScore(n, a!))));
  const nameSame: Same = score >= 100 ? "same" : score >= 85 ? "close" : "differs";
  const company = (value?: string | null) => (value ? <bdi dir="auto">{value}</bdi> : null);
  const rows: { key: RowKey; applicant: ReactNode; entry: ReactNode; same: Same; score?: number }[] = [
    {
      key: "name",
      applicant: (
        <>
          <bdi className="font-semibold">{p.fullName}</bdi>
          {p.fullNameAr && <bdi dir="rtl" className="block text-xs text-ink-3">{p.fullNameAr}</bdi>}
        </>
      ),
      entry: (
        <>
          <bdi className="font-semibold">{id.fullName}</bdi>
          {id.aliases.length > 0 && <bdi dir="auto" className="block text-xs text-ink-3">{id.aliases.join(" · ")}</bdi>}
        </>
      ),
      same: nameSame,
      score,
    },
  ];
  if (id.subjectType === "company" || id.company) rows.push({ key: "company", applicant: company(p.company), entry: company(id.company), same: id.company ? (normalizeName(id.company) === normalizeName(p.company) ? "same" : "differs") : "none" });
  rows.push(
    { key: "nationalId", applicant: p.nationalId ? latin(p.nationalId) : null, entry: id.nationalId ? latin(id.nationalId) : null, same: ids(p.nationalId, id.nationalId) },
    { key: "passport", applicant: p.passportNo ? latin(p.passportNo) : null, entry: id.passportNo ? latin(id.passportNo) : null, same: ids(p.passportNo, id.passportNo) },
    { key: "nationality", applicant: fmt.country(p.nationality), entry: id.nationality ? fmt.country(id.nationality) : null, same: id.nationality ? (id.nationality === p.nationality ? "same" : "differs") : "none" },
    { key: "dob", applicant: fmt.day(p.dob), entry: id.dob ? fmt.day(id.dob) : null, same: id.dob ? (id.dob === p.dob ? "same" : "differs") : "none" },
    { key: "email", applicant: latin(p.email, false), entry: id.email ? latin(id.email, false) : null, same: id.email ? (id.email.toLowerCase() === p.email.toLowerCase() ? "same" : "differs") : "none" },
    { key: "mobile", applicant: latin(p.mobile), entry: id.mobile ? latin(id.mobile) : null, same: ids(p.mobile, id.mobile) },
  );
  if (id.subjectType !== "company" && !id.company) rows.push({ key: "company", applicant: company(p.company), entry: null, same: "none" });
  return rows;
}

const SAME_CELL: Record<Same, string> = { same: "bg-rose-50/70", close: "bg-amber-50/70", differs: "bg-emerald-50/50", none: "" };

function SameBadge({ same }: { same: Same }) {
  const t = useTranslations("matchReview.compare");
  switch (same) {
    case "same":
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-1.5 py-0.5 text-2xs font-bold text-rose-700">
          <Check className="size-3" strokeWidth={3} />
          {t("same")}
        </span>
      );
    case "close":
      return <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-2xs font-bold text-amber-800">{t("close")}</span>;
    case "differs":
      return <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-2xs font-bold text-emerald-700">{t("differs")}</span>;
    default:
      return <span className="text-2xs text-ink-3">{t("none")}</span>;
  }
}

function Comparison({ db, c }: { db: Database; c: ReviewCase }) {
  const t = useTranslations("matchReview.compare");
  const fmt = useFormat();
  const p = db.attendees[c.request.attendeeId].profile;
  const entry = db.blacklist[c.match.entryId];
  const rows = compareRows(p, entry.identity, fmt);
  const triggered = ROW_OF_FIELD[c.match.matchedField];
  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-line">
      <table className="w-full table-fixed text-sm">
        <thead className="bg-subtle">
          <tr>
            <th className="eyebrow w-32 px-4 py-2.5 text-start">{t("field")}</th>
            <th className="px-4 py-2.5 text-start">
              <span className="eyebrow">{t("applicant")}</span>{" "}
              <Link href={`/requests/${c.request.id}`} className="ltr-data font-mono text-xs text-accent-text hover:underline">
                {c.request.id}
              </Link>
            </th>
            <th className="px-4 py-2.5 text-start">
              <span className="eyebrow">{t("entry")}</span>{" "}
              <Link href={`/screening/blacklist/${entry.id}`} className="ltr-data font-mono text-xs text-accent-text hover:underline">
                {entry.id}
              </Link>
            </th>
            <th className="w-28 px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className={cn("border-t border-line align-top", SAME_CELL[row.same])}>
              <td className="px-4 py-2.5 text-start text-ink-2">
                {t(`row.${row.key}`)}
                {row.key === triggered && <span className="mt-0.5 block text-2xs font-semibold text-rose-600">{t("triggered")}</span>}
              </td>
              <td className="px-4 py-2.5 text-start text-ink">{row.applicant ?? <span className="text-ink-3">—</span>}</td>
              <td className="px-4 py-2.5 text-start text-ink">{row.entry ?? <span className="text-ink-3">—</span>}</td>
              <td className="px-4 py-2.5 text-end">
                <SameBadge same={row.same} />
                {row.score !== undefined && row.same !== "none" && <span className="mt-0.5 block text-2xs text-ink-3">{t("similarity", { score: fmt.number(row.score) })}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Case panel ─────────────────────────────────────────────────────────

function CasePanel({ db, c, canDecide, onDone }: { db: Database; c: ReviewCase; canDecide: boolean; onDone: () => void }) {
  const t = useTranslations("matchReview");
  const reasonLabel = useReasonLabel();
  const errorText = useReviewError();
  const matchSummary = useMatchSummary();
  const viewer = useViewer();
  const fmt = useFormat();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"confirm" | "clear" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const r = c.request;
  const entry = db.blacklist[c.match.entryId];
  const reg = db.registrations[r.registrationId];
  const stage = r.currentStageNodeId ? Object.values(db.stageExecutions).find((e) => e.requestId === r.id && e.stageNodeId === r.currentStageNodeId)?.stageName : null;
  const stageName = fmt.text(stage);

  const decide = async (kind: "confirm" | "clear") => {
    setBusy(kind);
    setError(null);
    const ref = { matchId: c.match.id, expectedRevision: r.revision, actorId: viewer.id, note };
    const res = kind === "confirm" ? await matchReviewService.confirm(ref) : await matchReviewService.clear(ref);
    setBusy(null);
    if (!res.ok) return setError(errorText(res.error));
    toast(t(`outcome.${res.outcome}`, { id: r.id }));
    setNote("");
    onDone();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-4">
        <Avatar name={db.attendees[r.attendeeId].profile.fullName} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-ink">
              <bdi>{db.attendees[r.attendeeId].profile.fullName}</bdi>
            </h2>
            <Pill tone={KIND_TONE[c.kind]}>{t(`kind.${c.kind}`)}</Pill>
            <Pill tone={c.match.strength === "strong" ? "rose" : "amber"} dot={false}>
              {matchSummary(c.match)}
            </Pill>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2">
            <span>{fmt.text(reg.name)}</span>
            <BadgeTypeChip id={r.badgeTypeId} label={fmt.text(db.badgeTypes[r.badgeTypeId]?.name)} />
            <span className="ltr-data font-mono text-xs text-ink-3">{db.events[r.eventId]?.code}</span>
            <StatusLabel status={r.status} />
            {stageName && <span className="text-xs text-ink-3">· {stageName}</span>}
          </p>
          <p className="mt-1 text-xs text-ink-3">
            {t(`found.${c.match.stagePoint}`)} · {fmt.ago(c.match.foundAt, Date.parse(c.match.foundAt) + c.waitingMs)}
            {c.others > 0 && <span className="font-semibold text-rose-600"> · {t("moreMatches", { count: c.others, n: fmt.number(c.others) })}</span>}
          </p>
        </div>
      </div>

      <Comparison db={db} c={c} />

      <section className="rounded-xl bg-rose-50/60 px-4 py-3.5 ring-1 ring-rose-600/15">
        <p className="flex items-center gap-2 text-xs font-bold text-rose-900">
          <ShieldBan className="size-4" />
          {t("why.title", { reason: reasonLabel(entry.reasonType) })}
        </p>
        <p dir="auto" className="mt-1 text-sm text-ink">
          {entry.reasonDetail}
        </p>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
          <span>
            {entry.eventScope === "all"
              ? t("why.eventsAll")
              : t.rich("why.events", {
                  events: entry.eventScope.map((e) => db.events[e]?.code).join(", "),
                  codes: (chunks) => <span className="ltr-data">{chunks}</span>,
                })}
          </span>
          <span>{t.rich("why.approvedBy", { name: db.users[entry.approvedBy ?? ""]?.name ?? "—", who: isolate })}</span>
          {entry.evidence.map((f) => (
            <button key={f.id} type="button" onClick={() => toast(t("why.downloadsSimulated"))} className="inline-flex items-center gap-1 text-accent-text hover:underline">
              <FileText className="size-3.5" />
              <bdi dir="auto">{f.fileName}</bdi>
            </button>
          ))}
        </p>
      </section>

      {canDecide ? (
        <section className="space-y-3 rounded-xl bg-surface p-4 ring-1 ring-line">
          <Field label={t("decide.note")} htmlFor="mr-note" hint={t("decide.noteHint")}>
            <TextArea id="mr-note" dir="auto" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("decide.notePlaceholder")} />
          </Field>
          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-600/15">
              <XCircle className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-emerald-50/60 p-3 ring-1 ring-emerald-600/15">
              <Button variant="success" className="w-full" disabled={busy !== null || !note.trim()} onClick={() => void decide("clear")}>
                {busy === "clear" ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                {t("decide.clear")}
              </Button>
              <p className="mt-2 text-xs text-ink-2">{c.others ? t(`decide.clearHintOthers.${c.kind}`) : t(`decide.clearHint.${c.kind}`)}</p>
            </div>
            <div className="rounded-lg bg-rose-50/60 p-3 ring-1 ring-rose-600/15">
              <Button variant="danger" className="w-full" disabled={busy !== null} onClick={() => void decide("confirm")}>
                {busy === "confirm" ? <Loader2 className="size-4 animate-spin" /> : <BadgeX className="size-4" />}
                {t("decide.confirm")}
              </Button>
              <p className="mt-2 text-xs text-ink-2">{c.kind === "badge" ? t("decide.confirmHintBadge") : t("decide.confirmHintRequest")}</p>
            </div>
          </div>
        </section>
      ) : (
        <p className="flex items-center gap-2 rounded-xl bg-subtle px-4 py-3 text-sm text-ink-2 ring-1 ring-line">
          <Lock className="size-4 text-ink-3" />
          {t("decide.noPermission")}
        </p>
      )}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────

export function MatchReviewPage() {
  const t = useTranslations("matchReview");
  const db = useDb();
  const viewer = useViewer();
  const fmt = useFormat();
  const now = useNow();
  const params = useSearchParams();
  const matchSummary = useMatchSummary();
  const queue = useMemo(() => reviewQueue(db, now), [db, now]);
  const decided = useMemo(() => decidedRecently(db, now), [db, now]);
  const [selected, setSelected] = useState<string | null>(params.get("match"));
  const [tab, setTab] = useState("waiting");

  if (!viewer.can("blacklist.view")) {
    return <EmptyState icon={Lock} title={t("noAccessTitle")} body={t("noAccessBody")} />;
  }

  const current = queue.find((c) => c.match.id === selected) ?? queue[0];
  const next = () => {
    const i = queue.findIndex((c) => c.match.id === current?.match.id);
    setSelected(queue[i + 1]?.match.id ?? queue[i - 1]?.match.id ?? null);
  };
  const count = (n: number) => fmt.number(n);
  const columns = [t("decided.colRequest"), t("decided.colApplicant"), t("decided.colEntry"), t("decided.colMatch"), t("decided.colDecision"), t("decided.colBy"), t("decided.colNote")];

  return (
    <div className={cn(PAGE, "pb-12")}>
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-ink">{t("title")}</h1>
        <p className="mt-1.5 text-sm text-ink-2">{t("subtitle")}</p>
      </div>

      <div className="mt-6 grid gap-px overflow-hidden rounded-xl bg-line shadow-card ring-1 ring-line sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={Hourglass}
          tone="red"
          label={t("metric.waiting")}
          value={count(queue.length)}
          hint={t("metric.waitingHint", { strong: count(queue.filter((c) => c.match.strength === "strong").length), possible: count(queue.filter((c) => c.match.strength === "possible").length) })}
        />
        <Metric icon={ShieldAlert} tone="orange" label={t("metric.onHold")} value={count(new Set(queue.filter((c) => c.kind === "hold").map((c) => c.request.id)).size)} hint={t("metric.onHoldHint")} />
        <Metric icon={BadgeX} tone="amber" label={t("metric.suspended")} value={count(queue.filter((c) => c.kind === "badge").length)} hint={t("metric.suspendedHint")} />
        <Metric
          icon={CheckCircle2}
          tone="emerald"
          label={t("metric.decided")}
          value={count(decided.length)}
          hint={t("metric.decidedHint", { confirmed: count(decided.filter((m) => m.status === "confirmed").length), cleared: count(decided.filter((m) => m.status === "cleared").length) })}
        />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mt-5">
        <TabsList className="mb-5">
          <TabsTrigger value="waiting" count={queue.length}>
            {t("tabs.waiting")}
          </TabsTrigger>
          <TabsTrigger value="decided" count={decided.length}>
            {t("tabs.decided")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="waiting" className="outline-none">
          {queue.length === 0 || !current ? (
            <div className="rounded-xl bg-surface shadow-card ring-1 ring-line">
              <EmptyState icon={Inbox} title={t("emptyTitle")} body={t("emptyBody")} />
            </div>
          ) : (
            <div className="grid items-start gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
              <ul className="max-h-[calc(100vh-14rem)] space-y-2 overflow-y-auto pe-1 lg:sticky lg:top-4">
                {queue.map((c) => {
                  const on = c.match.id === current.match.id;
                  const p = db.attendees[c.request.attendeeId].profile;
                  return (
                    <li key={c.match.id}>
                      <button
                        type="button"
                        aria-current={on || undefined}
                        onClick={() => setSelected(c.match.id)}
                        className={cn("block w-full rounded-xl px-4 py-3 text-start ring-1 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent", on ? "bg-accent-soft ring-indigo-300" : "bg-surface ring-line hover:bg-subtle")}
                      >
                        <span className="flex items-center gap-2">
                          <bdi className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{p.fullName}</bdi>
                          <span className="ltr-data font-mono text-2xs text-ink-3">{c.request.id}</span>
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Pill tone={KIND_TONE[c.kind]}>{t(`kind.${c.kind}`)}</Pill>
                          <span className={cn("rounded-md px-1.5 py-0.5 text-2xs font-semibold", c.match.strength === "strong" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800")}>{matchSummary(c.match)}</span>
                        </span>
                        <span className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-3">
                          <ShieldBan className="size-3" />
                          <span className="truncate">
                            <span className="ltr-data">{c.match.entryId}</span> · <bdi>{displayName(db.blacklist[c.match.entryId])}</bdi>
                          </span>
                          <span className="ms-auto inline-flex shrink-0 items-center gap-1">
                            <Clock className="size-3" />
                            {fmt.duration(c.waitingMs)}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="rounded-xl bg-surface p-6 shadow-card ring-1 ring-line">
                <CasePanel key={current.match.id} db={db} c={current} canDecide={viewer.can("blacklist.approve")} onDone={next} />
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="decided" className="outline-none">
          <section className="overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-line">
            {decided.length ? (
              <table className="w-full text-sm">
                <thead className="bg-subtle">
                  <tr>
                    {columns.map((h) => (
                      <th key={h} className="eyebrow h-10 px-3 text-start first:ps-5 last:pe-5">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {decided.map((m) => {
                    const r = db.requests[m.requestId];
                    return (
                      <tr key={m.id} className="border-t border-line align-top">
                        <td className="px-3 py-3 ps-5">
                          <Link href={`/requests/${m.requestId}`} className="ltr-data font-mono text-xs text-accent-text hover:underline">
                            {m.requestId}
                          </Link>
                        </td>
                        <td className="px-3 py-3">
                          <bdi>{r ? db.attendees[r.attendeeId].profile.fullName : ""}</bdi>
                        </td>
                        <td className="px-3 py-3">
                          <Link href={`/screening/blacklist/${m.entryId}`} className="ltr-data font-mono text-xs text-accent-text hover:underline">
                            {m.entryId}
                          </Link>
                        </td>
                        <td className="px-3 py-3 text-xs text-ink-2">{matchSummary(m)}</td>
                        <td className="px-3 py-3">
                          <Pill tone={m.status === "confirmed" ? "rose" : "emerald"}>{m.status === "confirmed" ? t("decided.confirmed") : t("decided.cleared")}</Pill>
                        </td>
                        <td className="px-3 py-3 text-xs text-ink-2">
                          <bdi>{db.users[m.decidedBy ?? ""]?.name}</bdi>
                          <span className="block text-ink-3">{m.decidedAt ? fmt.dateTime(m.decidedAt) : ""}</span>
                        </td>
                        <td className="max-w-80 px-3 py-3 pe-5 text-xs text-ink-2">
                          <p dir="auto">{m.decisionNote}</p>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <EmptyState icon={ScanSearch} title={t("noDecisionsTitle")} />
            )}
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
