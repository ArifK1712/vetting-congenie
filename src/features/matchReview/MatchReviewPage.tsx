"use client";

import { BadgeX, Check, CheckCircle2, Clock, FileText, Hourglass, Inbox, Loader2, Lock, ScanSearch, ShieldAlert, ShieldBan, ShieldCheck, XCircle, type LucideIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, TextArea } from "@/components/ui/Field";
import { BadgeTypeChip, Pill, StatusLabel } from "@/components/ui/Status";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { toast } from "@/components/ui/Toast";
import { TONE, type Tone } from "@/design/tones";
import { decidedRecently, reviewQueue, type ReviewCase } from "@/domain/matchReview";
import { nameScore, normalizeId, normalizeName } from "@/domain/screening";
import type { ApplicantProfile, Database, ListIdentity, ScreeningMatch } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { useNow } from "@/lib/useNow";
import { matchReviewService, REVIEW_ERRORS } from "@/services/matchReview";
import { useDb } from "@/store/app";
import { useViewer } from "@/store/useViewer";
import { displayName, REASON_LABEL } from "@/features/blacklist/parts";

const MATCH_LABEL: Record<ScreeningMatch["matchType"], string> = { id: "ID match", company: "Company match", nameDob: "Name + date of birth", name: "Name only" };
const FOUND_LABEL: Record<ScreeningMatch["stagePoint"], string> = { submission: "At registration", resubmission: "On resubmission", final: "At final approval", retro: "After a new entry" };
const KIND: Record<ReviewCase["kind"], { label: string; tone: Tone }> = {
  hold: { label: "On hold", tone: "red" },
  badge: { label: "Badge suspended", tone: "orange" },
  inProgress: { label: "In review", tone: "amber" },
};

function Metric({ icon: Icon, tone, label, value, hint }: { icon: LucideIcon; tone: Tone; label: string; value: number; hint: string }) {
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

function compareRows(p: ApplicantProfile, id: ListIdentity, fmt: ReturnType<typeof useFormat>) {
  const ids = (a?: string, b?: string): Same => (!a || !b ? "none" : normalizeId(a) === normalizeId(b) ? "same" : "differs");
  const names = [id.fullName, ...id.aliases];
  const score = Math.max(...names.flatMap((n) => [p.fullName, p.fullNameAr].filter(Boolean).map((a) => nameScore(n, a!))));
  const nameSame: Same = score >= 100 ? "same" : score >= 85 ? "close" : "differs";
  const rows: { label: string; applicant: ReactNode; entry: ReactNode; same: Same; note?: string }[] = [
    {
      label: "Name",
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
      note: `${score}% similar`,
    },
  ];
  if (id.subjectType === "company" || id.company) rows.push({ label: "Company", applicant: p.company, entry: id.company, same: id.company ? (normalizeName(id.company) === normalizeName(p.company) ? "same" : "differs") : "none" });
  rows.push(
    { label: "National ID / Iqama", applicant: p.nationalId ? <span className="font-mono">{p.nationalId}</span> : null, entry: id.nationalId ? <span className="font-mono">{id.nationalId}</span> : null, same: ids(p.nationalId, id.nationalId) },
    { label: "Passport", applicant: p.passportNo ? <span className="font-mono">{p.passportNo}</span> : null, entry: id.passportNo ? <span className="font-mono">{id.passportNo}</span> : null, same: ids(p.passportNo, id.passportNo) },
    { label: "Nationality", applicant: fmt.country(p.nationality), entry: id.nationality ? fmt.country(id.nationality) : null, same: id.nationality ? (id.nationality === p.nationality ? "same" : "differs") : "none" },
    { label: "Date of birth", applicant: fmt.day(p.dob), entry: id.dob ? fmt.day(id.dob) : null, same: id.dob ? (id.dob === p.dob ? "same" : "differs") : "none" },
    { label: "Email", applicant: <span className="ltr-data">{p.email}</span>, entry: id.email ? <span className="ltr-data">{id.email}</span> : null, same: id.email ? (id.email.toLowerCase() === p.email.toLowerCase() ? "same" : "differs") : "none" },
    { label: "Mobile", applicant: <span className="ltr-data font-mono">{p.mobile}</span>, entry: id.mobile ? <span className="ltr-data font-mono">{id.mobile}</span> : null, same: ids(p.mobile, id.mobile) },
  );
  if (id.subjectType !== "company" && !id.company) rows.push({ label: "Company", applicant: p.company, entry: null, same: "none" });
  return rows;
}

const SAME_STYLE: Record<Same, { cell: string; badge: ReactNode }> = {
  same: { cell: "bg-rose-50/70", badge: <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-1.5 py-0.5 text-2xs font-bold text-rose-700"><Check className="size-3" strokeWidth={3} />Same</span> },
  close: { cell: "bg-amber-50/70", badge: <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-2xs font-bold text-amber-800">Similar</span> },
  differs: { cell: "bg-emerald-50/50", badge: <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-2xs font-bold text-emerald-700">Differs</span> },
  none: { cell: "", badge: <span className="text-2xs text-ink-3">Not on entry</span> },
};

function Comparison({ db, c }: { db: Database; c: ReviewCase }) {
  const fmt = useFormat();
  const p = db.attendees[c.request.attendeeId].profile;
  const entry = db.blacklist[c.match.entryId];
  const rows = compareRows(p, entry.identity, fmt);
  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-line">
      <table className="w-full table-fixed text-sm">
        <thead className="bg-subtle">
          <tr>
            <th className="eyebrow w-32 px-4 py-2.5 text-start">Field</th>
            <th className="px-4 py-2.5 text-start">
              <span className="eyebrow">Applicant</span>{" "}
              <Link href={`/requests/${c.request.id}`} className="font-mono text-xs text-accent-text hover:underline">
                {c.request.id}
              </Link>
            </th>
            <th className="px-4 py-2.5 text-start">
              <span className="eyebrow">Blacklist entry</span>{" "}
              <Link href={`/screening/blacklist/${entry.id}`} className="font-mono text-xs text-accent-text hover:underline">
                {entry.id}
              </Link>
            </th>
            <th className="w-28 px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const matched = (c.match.matchedField === "fullName" && row.label === "Name") || (c.match.matchedField === "nationalId" && row.label === "National ID / Iqama") || (c.match.matchedField === "passportNo" && row.label === "Passport") || (c.match.matchedField === row.label.toLowerCase());
            return (
              <tr key={row.label} className={cn("border-t border-line align-top", SAME_STYLE[row.same].cell)}>
                <td className="px-4 py-2.5 text-ink-2">
                  {row.label}
                  {matched && <span className="mt-0.5 block text-2xs font-semibold text-rose-600">Triggered the match</span>}
                </td>
                <td className="px-4 py-2.5 text-ink">{row.applicant ?? <span className="text-ink-3">—</span>}</td>
                <td className="px-4 py-2.5 text-ink">{row.entry ?? <span className="text-ink-3">—</span>}</td>
                <td className="px-4 py-2.5 text-end">
                  {SAME_STYLE[row.same].badge}
                  {row.note && row.same !== "none" && <span className="mt-0.5 block text-2xs text-ink-3">{row.note}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Case panel ─────────────────────────────────────────────────────────

const OUTCOME_TEXT = {
  rejected: (id: string) => `${id} rejected as Blacklisted. The attendee gets the normal rejection email.`,
  badgeRevoked: (id: string) => `Badge for ${id} revoked.`,
  backToStage: (id: string) => `${id} is back with its review team.`,
  stillHeld: (id: string) => `Match cleared. ${id} still has another match to decide.`,
  badgeRestored: (id: string) => `Badge for ${id} restored.`,
  recorded: (id: string) => `Decision recorded for ${id}.`,
};

function CasePanel({ db, c, canDecide, onDone }: { db: Database; c: ReviewCase; canDecide: boolean; onDone: () => void }) {
  const viewer = useViewer();
  const fmt = useFormat();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"confirm" | "clear" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const r = c.request;
  const entry = db.blacklist[c.match.entryId];
  const reg = db.registrations[r.registrationId];
  const stageName = r.currentStageNodeId ? Object.values(db.stageExecutions).find((e) => e.requestId === r.id && e.stageNodeId === r.currentStageNodeId)?.stageName.en : null;

  const decide = async (kind: "confirm" | "clear") => {
    setBusy(kind);
    setError(null);
    const ref = { matchId: c.match.id, expectedRevision: r.revision, actorId: viewer.id, note };
    const res = kind === "confirm" ? await matchReviewService.confirm(ref) : await matchReviewService.clear(ref);
    setBusy(null);
    if (!res.ok) return setError(REVIEW_ERRORS[res.error]);
    toast(OUTCOME_TEXT[res.outcome](r.id));
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
            <Pill tone={KIND[c.kind].tone}>{KIND[c.kind].label}</Pill>
            <Pill tone={c.match.strength === "strong" ? "rose" : "amber"} dot={false}>
              {MATCH_LABEL[c.match.matchType]} · {c.match.score}%
            </Pill>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2">
            <span>{reg.name.en}</span>
            <BadgeTypeChip id={r.badgeTypeId} label={db.badgeTypes[r.badgeTypeId]?.name.en ?? ""} />
            <span className="font-mono text-xs text-ink-3">{db.events[r.eventId]?.code}</span>
            <StatusLabel status={r.status} />
            {stageName && <span className="text-xs text-ink-3">· {stageName}</span>}
          </p>
          <p className="mt-1 text-xs text-ink-3">
            Found {FOUND_LABEL[c.match.stagePoint].toLowerCase()} · {fmt.ago(c.match.foundAt, Date.parse(c.match.foundAt) + c.waitingMs)}
            {c.others > 0 && <span className="font-semibold text-rose-600"> · {c.others} more blacklist match{c.others === 1 ? "" : "es"} on this request</span>}
          </p>
        </div>
      </div>

      <Comparison db={db} c={c} />

      <section className="rounded-xl bg-rose-50/60 px-4 py-3.5 ring-1 ring-rose-600/15">
        <p className="flex items-center gap-2 text-xs font-bold text-rose-900">
          <ShieldBan className="size-4" />
          Why this entry exists · {REASON_LABEL[entry.reasonType]}
        </p>
        <p dir="auto" className="mt-1 text-sm text-ink">{entry.reasonDetail}</p>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
          <span>
            Events: {entry.eventScope === "all" ? "all" : entry.eventScope.map((e) => db.events[e]?.code).join(", ")}
          </span>
          <span>Approved by {db.users[entry.approvedBy ?? ""]?.name ?? "—"}</span>
          {entry.evidence.map((f) => (
            <button key={f.id} type="button" onClick={() => toast("Downloads are simulated in the prototype")} className="inline-flex items-center gap-1 text-accent-text hover:underline">
              <FileText className="size-3.5" />
              {f.fileName}
            </button>
          ))}
        </p>
      </section>

      {canDecide ? (
        <section className="space-y-3 rounded-xl bg-surface p-4 ring-1 ring-line">
          <Field label="Note" htmlFor="mr-note" hint="Required for Not the same person">
            <TextArea id="mr-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What you checked, e.g. date of birth and nationality differ" />
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
                Not the same person
              </Button>
              <p className="mt-2 text-xs text-ink-2">
                {c.kind === "badge" ? "The badge is restored" : c.kind === "hold" ? "The request goes back to its stage" : "The flag is removed"}
                {c.others ? " once its other matches are decided" : ""}. This pair never matches again.
              </p>
            </div>
            <div className="rounded-lg bg-rose-50/60 p-3 ring-1 ring-rose-600/15">
              <Button variant="danger" className="w-full" disabled={busy !== null} onClick={() => void decide("confirm")}>
                {busy === "confirm" ? <Loader2 className="size-4 animate-spin" /> : <BadgeX className="size-4" />}
                Confirm: same person
              </Button>
              <p className="mt-2 text-xs text-ink-2">
                {c.kind === "badge" ? "The badge is revoked and its place released." : "The request is rejected with reason Blacklisted. The attendee only gets the normal rejection email."}
              </p>
            </div>
          </div>
        </section>
      ) : (
        <p className="flex items-center gap-2 rounded-xl bg-subtle px-4 py-3 text-sm text-ink-2 ring-1 ring-line">
          <Lock className="size-4 text-ink-3" />
          You can see this match, but deciding needs Blacklist Approve.
        </p>
      )}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────

export function MatchReviewPage() {
  const db = useDb();
  const viewer = useViewer();
  const fmt = useFormat();
  const now = useNow();
  const params = useSearchParams();
  const queue = useMemo(() => reviewQueue(db, now), [db, now]);
  const decided = useMemo(() => decidedRecently(db, now), [db, now]);
  const [selected, setSelected] = useState<string | null>(params.get("match"));
  const [tab, setTab] = useState("waiting");

  if (!viewer.can("blacklist.view")) {
    return <EmptyState icon={Lock} title="You can't see Match Review" body="Match Review needs the Blacklist View permission." />;
  }

  const current = queue.find((c) => c.match.id === selected) ?? queue[0];
  const next = () => {
    const i = queue.findIndex((c) => c.match.id === current?.match.id);
    setSelected(queue[i + 1]?.match.id ?? queue[i - 1]?.match.id ?? null);
  };

  return (
    <div className="mx-auto max-w-[96rem] px-7 pt-7 pb-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-ink">Match Review</h1>
        <p className="mt-1.5 text-sm text-ink-2">Blacklist matches waiting for a person. Nobody is rejected on a similar name alone: compare, then confirm or clear.</p>
      </div>

      <div className="mt-6 grid gap-px overflow-hidden rounded-xl bg-line shadow-card ring-1 ring-line sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Hourglass} tone="red" label="Waiting for a decision" value={queue.length} hint={`${queue.filter((c) => c.match.strength === "strong").length} strong, ${queue.filter((c) => c.match.strength === "possible").length} possible`} />
        <Metric icon={ShieldAlert} tone="orange" label="Requests on hold" value={new Set(queue.filter((c) => c.kind === "hold").map((c) => c.request.id)).size} hint="Out of the team queues until decided" />
        <Metric icon={BadgeX} tone="amber" label="Badges suspended" value={queue.filter((c) => c.kind === "badge").length} hint="Approved before the entry existed" />
        <Metric icon={CheckCircle2} tone="emerald" label="Decided this week" value={decided.length} hint={`${decided.filter((m) => m.status === "confirmed").length} confirmed, ${decided.filter((m) => m.status === "cleared").length} cleared`} />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mt-5">
        <TabsList className="mb-5">
          <TabsTrigger value="waiting" count={queue.length}>
            Waiting
          </TabsTrigger>
          <TabsTrigger value="decided" count={decided.length}>
            Decided (7 days)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="waiting" className="outline-none">
          {queue.length === 0 || !current ? (
            <div className="rounded-xl bg-surface shadow-card ring-1 ring-line">
              <EmptyState icon={Inbox} title="Nothing to review" body="New blacklist matches appear here: at registration, at final approval, and when a new entry is approved." />
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
                          <span className="font-mono text-2xs text-ink-3">{c.request.id}</span>
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Pill tone={KIND[c.kind].tone}>{KIND[c.kind].label}</Pill>
                          <span className={cn("rounded-md px-1.5 py-0.5 text-2xs font-semibold", c.match.strength === "strong" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800")}>
                            {MATCH_LABEL[c.match.matchType]} · {c.match.score}%
                          </span>
                        </span>
                        <span className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-3">
                          <ShieldBan className="size-3" />
                          <span className="truncate">
                            {c.match.entryId} · <bdi>{displayName(db.blacklist[c.match.entryId])}</bdi>
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
                    {["Request", "Applicant", "Entry", "Match", "Decision", "By", "Note"].map((h) => (
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
                          <Link href={`/requests/${m.requestId}`} className="font-mono text-xs text-accent-text hover:underline">
                            {m.requestId}
                          </Link>
                        </td>
                        <td className="px-3 py-3">
                          <bdi>{r ? db.attendees[r.attendeeId].profile.fullName : ""}</bdi>
                        </td>
                        <td className="px-3 py-3">
                          <Link href={`/screening/blacklist/${m.entryId}`} className="font-mono text-xs text-accent-text hover:underline">
                            {m.entryId}
                          </Link>
                        </td>
                        <td className="px-3 py-3 text-xs text-ink-2">
                          {MATCH_LABEL[m.matchType]} · {m.score}%
                        </td>
                        <td className="px-3 py-3">
                          <Pill tone={m.status === "confirmed" ? "rose" : "emerald"}>{m.status === "confirmed" ? "Confirmed" : "Not the same person"}</Pill>
                        </td>
                        <td className="px-3 py-3 text-xs text-ink-2">
                          {db.users[m.decidedBy ?? ""]?.name}
                          <span className="block text-ink-3">{m.decidedAt ? fmt.dateTime(m.decidedAt) : ""}</span>
                        </td>
                        <td dir="auto" className="max-w-80 px-3 py-3 pe-5 text-xs text-ink-2">
                          {m.decisionNote}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <EmptyState icon={ScanSearch} title="No decisions this week" />
            )}
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
