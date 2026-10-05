"use client";

import { Building2, ChevronRight, CircleAlert, CircleCheck, FileText, Info, Loader2, Lock, Paperclip, Save, SearchX, TriangleAlert, UserRound, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useDeferredValue, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ChoiceList, Field, TextArea, TextInput } from "@/components/ui/Field";
import { Segmented } from "@/components/ui/Segmented";
import { MultiSelect, Select } from "@/components/ui/Select";
import { toast } from "@/components/ui/Toast";
import { DETAIL_MAX, EVIDENCE_MAX, MAX_ALIASES, REASON_TYPES, retroMatches } from "@/domain/blacklist";
import { effectiveStatus, emptyWatchDraft, errorsOf, extraStageOptions, LEVELS, NOTE_MAX, validateWatch, watchDraftFromRequest, watchDraftOf, type WatchDraft, type WatchIssue, type WatchIssueCode } from "@/domain/watchlist";
import type { BlacklistReason, ID, ListIdentity, WatchlistEntry, WatchlistLevel } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { useNow } from "@/lib/useNow";
import { WATCHLIST_ERRORS, watchlistService } from "@/services/watchlist";
import { useDb } from "@/store/app";
import { useViewer } from "@/store/useViewer";
import { AliasInput } from "@/features/blacklist/EntryFormPage";
import { REASON_LABEL } from "@/features/blacklist/parts";
import { Section } from "@/features/teams/EditorSections";
import { LEVEL_LABEL, LevelMeter, ON_MATCH_HINT, ON_MATCH_LABEL, WATCH_ISSUE_TEXT } from "./parts";

const SECTIONS = ["who", "identifiers", "events", "level", "reason", "validity"] as const;
type SectionKey = (typeof SECTIONS)[number];
const TITLE: Record<SectionKey, string> = { who: "Who", identifiers: "Identifiers", events: "Events", level: "Level and what happens on a match", reason: "Reason and evidence", validity: "Validity" };
const ISSUE_SECTION: Record<WatchIssueCode, SectionKey> = {
  nameRequired: "who",
  tooManyAliases: "who",
  companyRequired: "who",
  idRequired: "identifiers",
  nationalityRequired: "identifiers",
  emailInvalid: "identifiers",
  dobInvalid: "identifiers",
  possibleDuplicate: "identifiers",
  eventsRequired: "events",
  levelRequired: "level",
  notifyRequired: "level",
  stageRequired: "level",
  noteTooLong: "level",
  reasonTypeRequired: "reason",
  reasonDetailRequired: "reason",
  reasonDetailTooLong: "reason",
  tooManyFiles: "reason",
  fileTooLarge: "reason",
  fileType: "reason",
  startRequired: "validity",
  endBeforeStart: "validity",
};

const LEVEL_STYLE: Record<WatchlistLevel, string> = {
  low: "bg-yellow-50 text-yellow-800 ring-yellow-300",
  medium: "bg-amber-50 text-amber-800 ring-amber-300",
  high: "bg-orange-50 text-orange-700 ring-orange-300",
};

function Issues({ issues, show }: { issues: WatchIssue[]; show: boolean }) {
  const shown = issues.filter((i) => i.severity === "warning" || show);
  if (!shown.length) return null;
  return (
    <ul className="space-y-1.5 border-t border-line px-6 py-4">
      {shown.map((i, n) => (
        <li key={n} className={cn("flex items-start gap-2 rounded-lg px-3 py-2 text-sm ring-1 ring-inset", i.severity === "error" ? "bg-rose-50 text-rose-700 ring-rose-600/15" : "bg-amber-50 text-amber-800 ring-amber-600/20")}>
          {i.severity === "error" ? <CircleAlert className="mt-0.5 size-4 shrink-0" /> : <TriangleAlert className="mt-0.5 size-4 shrink-0" />}
          <span>
            {WATCH_ISSUE_TEXT[i.code]}
            {i.code === "possibleDuplicate" && i.ref && (
              <>
                {" "}
                <Link href={`/screening/watchlist/${i.ref}`} className="font-mono font-semibold whitespace-nowrap underline">
                  {i.ref}
                </Link>
              </>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function WatchEntryFormPage({ id }: { id: ID | null }) {
  const db = useDb();
  const viewer = useViewer();
  const router = useRouter();
  const params = useSearchParams();
  const fmt = useFormat();
  const now = useNow();
  const entry = id ? db.watchlist[id] : null;
  const fromRequest = !id ? params.get("fromRequest") : null;
  const sourceRequest = fromRequest ? db.requests[fromRequest] : null;

  const [draft, setDraft] = useState<WatchDraft>(() => (entry ? watchDraftOf(entry) : (fromRequest && watchDraftFromRequest(db, fromRequest, Date.now())) || emptyWatchDraft(Date.now())));
  const [revision] = useState(entry?.revision ?? 0);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const issues = useMemo(() => validateWatch(db, draft, id, now), [db, draft, id, now]);
  const errors = errorsOf(issues);
  const deferred = useDeferredValue(draft);
  const preview = useMemo(() => retroMatches(db, deferred.identity, deferred.eventScope, id), [db, deferred.identity, deferred.eventScope, id]);
  const stages = useMemo(() => extraStageOptions(db), [db]);
  const nationalities = useMemo(() => {
    const codes = new Set(Object.values(db.attendees).map((a) => a.profile.nationality));
    for (const c of ["SA", "AE", "BH", "KW", "OM", "QA", "EG", "JO", "LB", "PK", "IN", "TR", "GB", "US", "FR", "DE", "CN"]) codes.add(c);
    return [...codes].map((c) => ({ value: c, label: fmt.country(c), hint: c })).sort((a, b) => a.label.localeCompare(b.label));
  }, [db, fmt]);
  const notifyOptions = useMemo(
    () => [
      ...Object.values(db.users).filter((u) => u.active).map((u) => ({ value: u.id, label: u.name, hint: db.roles[u.roleId]?.name.en, group: "People" })),
      ...Object.values(db.teams).filter((t) => t.status === "active").map((t) => ({ value: t.id, label: t.name.en, hint: `${t.members.length} members`, group: "Teams" })),
    ],
    [db],
  );

  if (!viewer.can("watchlist.manage")) {
    return <EmptyState icon={Lock} title="You can't add or edit watchlist entries" body="This needs the Watchlist Manage permission." />;
  }
  if (id && !entry) {
    return <EmptyState icon={SearchX} title="Entry not found" action={<Link href="/screening/watchlist" className="text-sm text-accent-text hover:underline">Back to the watchlist</Link>} />;
  }
  if (entry && effectiveStatus(entry, now) !== "active") {
    return <EmptyState icon={Lock} title="This entry can't be edited" body="Removed and expired entries are kept for the record. Add a new entry instead." />;
  }

  const setIdentity = (patch: Partial<ListIdentity>) => setDraft((d) => ({ ...d, identity: { ...d.identity, ...patch } }));
  const patch = (p: Partial<WatchDraft>) => setDraft((d) => ({ ...d, ...p }));
  const bySection = (s: SectionKey) => issues.filter((i) => ISSUE_SECTION[i.code] === s);
  const sectionProps = (s: SectionKey, index: number, subtitle: string) => ({
    id: s,
    index,
    title: TITLE[s],
    subtitle,
    issues: bySection(s).map((i) => ({ code: "nameRequired" as const, section: "basics" as const, severity: i.severity })),
    showErrors,
  });
  const invalid = (code: WatchIssueCode) => showErrors && issues.some((i) => i.code === code && i.severity === "error");
  const person = draft.identity.subjectType === "person";

  const submit = async () => {
    setShowErrors(true);
    if (errors.length) {
      document.getElementById(ISSUE_SECTION[errors[0].code])?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setBusy(true);
    setError(null);
    const r = entry
      ? await watchlistService.edit({ entryId: entry.id, expectedRevision: revision, draft, actorId: viewer.id })
      : await watchlistService.create({ draft, source: sourceRequest ? "request" : "manual", sourceRequestId: sourceRequest?.id ?? null, actorId: viewer.id });
    setBusy(false);
    if (!r.ok) return setError(WATCHLIST_ERRORS[r.error]);
    const marked = r.marked ? ` ${r.marked} request${r.marked === 1 ? "" : "s"} marked.` : "";
    toast(`${entry ? "Changes saved" : `${r.entryId} added`}.${marked}`);
    router.push(`/screening/watchlist/${r.entryId}`);
  };

  return (
    <div className="mx-auto max-w-[88rem] px-7 pt-6 pb-16">
      <nav className="flex items-center gap-1.5 text-xs font-medium text-ink-3">
        <Link href="/screening/watchlist" className="hover:text-accent-text">
          Watchlist
        </Link>
        <ChevronRight className="size-3.5" />
        {entry && (
          <>
            <Link href={`/screening/watchlist/${entry.id}`} className="font-mono hover:text-accent-text">
              {entry.id}
            </Link>
            <ChevronRight className="size-3.5" />
          </>
        )}
        <span className="text-ink-2">{entry ? "Edit" : "Add entry"}</span>
      </nav>
      <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink">{entry ? `Edit ${entry.id}` : "Add watchlist entry"}</h1>
      <p className="mt-1 text-sm text-ink-2">Saved straight away; the watchlist doesn’t need a second approval. Matching requests are marked as soon as you save.</p>

      {sourceRequest && (
        <p className="mt-5 flex items-start gap-2.5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-600/20">
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>
            Filled in from request{" "}
            <Link href={`/requests/${sourceRequest.id}`} className="font-mono font-semibold underline">
              {sourceRequest.id}
            </Link>
            . It will be marked when you save.
          </span>
        </p>
      )}

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <form
          className="min-w-0 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Section {...sectionProps("who", 1, "A person, or a company whose staff must all be checked carefully.")}>
            <div className="space-y-4 px-6 py-5">
              <Segmented<ListIdentity["subjectType"]>
                label="Type"
                value={draft.identity.subjectType}
                onChange={(subjectType) => setIdentity({ subjectType })}
                options={[
                  { value: "person", label: "Person", icon: UserRound },
                  { value: "company", label: "Company", icon: Building2 },
                ]}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={person ? "Full name" : "Display name"} htmlFor="wl-name">
                  <TextInput id="wl-name" value={draft.identity.fullName} invalid={invalid("nameRequired")} onChange={(e) => setIdentity({ fullName: e.target.value })} />
                </Field>
                {!person && (
                  <Field label="Company name to match" htmlFor="wl-company">
                    <TextInput id="wl-company" value={draft.identity.company ?? ""} invalid={invalid("companyRequired")} onChange={(e) => setIdentity({ company: e.target.value })} />
                  </Field>
                )}
              </div>
              <Field label="Other spellings" hint={`${draft.identity.aliases.length} / ${MAX_ALIASES}, including Arabic`}>
                <AliasInput value={draft.identity.aliases} onChange={(aliases) => setIdentity({ aliases })} />
              </Field>
            </div>
            <Issues issues={bySection("who")} show={showErrors} />
          </Section>

          <Section {...sectionProps("identifiers", 2, person ? "An ID number or passport is required. These must match exactly." : "Optional contact details that also match exactly.")}>
            <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
              {person && (
                <>
                  <Field label="National ID / Iqama" htmlFor="wl-nid">
                    <TextInput id="wl-nid" dir="ltr" className="font-mono" value={draft.identity.nationalId ?? ""} invalid={invalid("idRequired")} onChange={(e) => setIdentity({ nationalId: e.target.value })} />
                  </Field>
                  <Field label="Date of birth" htmlFor="wl-dob" hint="Used with the name">
                    <TextInput id="wl-dob" type="date" dir="ltr" value={draft.identity.dob ?? ""} invalid={invalid("dobInvalid")} onChange={(e) => setIdentity({ dob: e.target.value || undefined })} />
                  </Field>
                  <Field label="Passport number" htmlFor="wl-pass">
                    <TextInput id="wl-pass" dir="ltr" className="font-mono" value={draft.identity.passportNo ?? ""} invalid={invalid("idRequired")} onChange={(e) => setIdentity({ passportNo: e.target.value })} />
                  </Field>
                  <Field label="Passport nationality">
                    <Select label="Passport nationality" placeholder="Choose a country" searchable invalid={invalid("nationalityRequired")} value={draft.identity.nationality ?? null} onChange={(nationality) => setIdentity({ nationality })} options={nationalities} />
                  </Field>
                </>
              )}
              <Field label="Email" htmlFor="wl-email" hint="Optional">
                <TextInput id="wl-email" type="email" dir="ltr" value={draft.identity.email ?? ""} invalid={invalid("emailInvalid")} onChange={(e) => setIdentity({ email: e.target.value })} />
              </Field>
              <Field label="Mobile" htmlFor="wl-mobile" hint="Optional">
                <TextInput id="wl-mobile" dir="ltr" value={draft.identity.mobile ?? ""} onChange={(e) => setIdentity({ mobile: e.target.value })} />
              </Field>
            </div>
            <Issues issues={bySection("identifiers")} show={showErrors} />
          </Section>

          <Section {...sectionProps("events", 3, "Where this entry applies.")}>
            <div className="space-y-3 px-6 py-5">
              <Segmented<"all" | "some">
                label="Events"
                value={draft.eventScope === "all" ? "all" : "some"}
                onChange={(v) => patch({ eventScope: v === "all" ? "all" : [] })}
                options={[
                  { value: "all", label: "All events" },
                  { value: "some", label: "Selected events" },
                ]}
              />
              {draft.eventScope !== "all" && (
                <div className="flex flex-wrap gap-2">
                  {Object.values(db.events).map((e) => {
                    const scope = draft.eventScope as ID[];
                    const on = scope.includes(e.id);
                    return (
                      <button
                        key={e.id}
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        onClick={() => patch({ eventScope: on ? scope.filter((x) => x !== e.id) : [...scope, e.id] })}
                        className={cn("inline-flex items-center gap-2 rounded-lg px-3 py-2 text-start text-sm ring-1 ring-inset", on ? "bg-accent-soft text-accent-text ring-indigo-300" : "bg-surface text-ink-2 ring-line hover:bg-subtle")}
                      >
                        <span className={cn("inline-flex size-4 items-center justify-center rounded-xs border", on ? "border-accent bg-accent text-white" : "border-line-strong")}>{on && <CircleCheck className="size-3" />}</span>
                        <span>
                          <span className="block font-medium">{e.name.en}</span>
                          <span className="block font-mono text-xs opacity-75">{e.code}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <Issues issues={bySection("events")} show={showErrors} />
          </Section>

          <Section {...sectionProps("level", 4, "The request gets this level. Team and workflow conditions can use it, e.g. High goes to Senior Security.")}>
            <div className="space-y-5 px-6 py-5">
              <div>
                <p className="mb-2 text-sm font-semibold text-ink">Level</p>
                <div role="radiogroup" aria-label="Level" className="grid gap-2 sm:grid-cols-3">
                  {LEVELS.map((l) => {
                    const on = draft.level === l;
                    return (
                      <button
                        key={l}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => patch({ level: l })}
                        className={cn("flex items-center gap-3 rounded-lg px-3.5 py-3 text-start ring-1 ring-inset transition-colors", on ? LEVEL_STYLE[l] : "bg-surface text-ink-2 ring-line hover:bg-subtle", invalid("levelRequired") && !on && "ring-rose-300")}
                      >
                        <LevelMeter level={l} />
                        <span className="text-sm font-semibold">{LEVEL_LABEL[l]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold text-ink">On a match</p>
                <ChoiceList
                  label="On a match"
                  value={draft.onMatch}
                  onChange={(v) => patch({ onMatch: v as WatchlistEntry["onMatch"] })}
                  choices={(["mark", "markEmail", "markStage"] as const).map((m) => ({ value: m, label: ON_MATCH_LABEL[m], hint: ON_MATCH_HINT[m] }))}
                />
              </div>
              {draft.onMatch === "markEmail" && (
                <Field label="Send email to" hint="People, or every member of a team">
                  <MultiSelect
                    label="Send email to"
                    placeholder="Choose people or teams"
                    searchable
                    invalid={invalid("notifyRequired")}
                    options={notifyOptions}
                    value={draft.notify}
                    summary={(labels) => (labels.length > 2 ? `${labels[0]} and ${labels.length - 1} more` : labels.join(", "))}
                    onChange={(notify) => patch({ notify })}
                  />
                </Field>
              )}
              {draft.onMatch === "markStage" && (
                <Field label="Extra review stage" hint="Added once, before final approval">
                  <Select label="Extra review stage" placeholder="Choose a stage" searchable invalid={invalid("stageRequired")} value={draft.extraStage} onChange={(extraStage) => patch({ extraStage })} options={stages} />
                </Field>
              )}
              <Field label="Note for reviewers" htmlFor="wl-note" hint={`${draft.reviewerNote.length} / ${NOTE_MAX} · shown on the request`}>
                <TextInput id="wl-note" dir="auto" value={draft.reviewerNote} invalid={invalid("noteTooLong")} onChange={(e) => patch({ reviewerNote: e.target.value })} placeholder="e.g. Check the company letter with the issuer" />
              </Field>
            </div>
            <Issues issues={bySection("level")} show={showErrors} />
          </Section>

          <Section {...sectionProps("reason", 5, "Only people with Watchlist View see the reason. Reviewers see the note above.")}>
            <div className="space-y-4 px-6 py-5">
              <Field label="Reason type">
                <Select label="Reason type" placeholder="Choose a reason" invalid={invalid("reasonTypeRequired")} value={draft.reasonType} onChange={(v) => patch({ reasonType: v as BlacklistReason })} options={REASON_TYPES.map((r) => ({ value: r, label: REASON_LABEL[r] }))} />
              </Field>
              <Field label="Reason details" htmlFor="wl-reason" hint={`${draft.reason.length} / ${DETAIL_MAX}`}>
                <TextArea id="wl-reason" rows={3} value={draft.reason} onChange={(e) => patch({ reason: e.target.value })} />
              </Field>
              <Field label="Evidence" hint={`Up to ${EVIDENCE_MAX} files · PDF, JPG or PNG · 10 MB each`}>
                <div className="rounded-lg border border-dashed border-line-strong bg-subtle px-4 py-3">
                  {draft.evidence.length > 0 && (
                    <ul className="mb-3 space-y-1.5">
                      {draft.evidence.map((f) => (
                        <li key={f.id} className="flex items-center gap-2.5 rounded-lg bg-surface px-3 py-2 text-sm ring-1 ring-line">
                          <FileText className="size-4 text-ink-3" />
                          <span className="min-w-0 flex-1 truncate">{f.fileName}</span>
                          <Button size="sm" variant="ghost" iconOnly aria-label={`Remove ${f.fileName}`} onClick={() => patch({ evidence: draft.evidence.filter((x) => x.id !== f.id) })}>
                            <X className="size-3.5" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Button size="sm" onClick={() => fileRef.current?.click()} disabled={draft.evidence.length >= EVIDENCE_MAX}>
                    <Paperclip className="size-3.5" />
                    Attach files
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="hidden"
                    onChange={(e) => {
                      const added = Array.from(e.target.files ?? []).map((f, i) => ({ id: `ev_${Date.now().toString(36)}${i}`, fileName: f.name, sizeKb: Math.max(1, Math.round(f.size / 1024)) }));
                      patch({ evidence: [...draft.evidence, ...added] });
                      e.target.value = "";
                    }}
                  />
                </div>
              </Field>
            </div>
            <Issues issues={bySection("reason")} show={showErrors} />
          </Section>

          <Section {...sectionProps("validity", 6, "No end date means the entry stays until someone removes it.")}>
            <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
              <Field label="Start date" htmlFor="wl-start">
                <TextInput id="wl-start" type="date" dir="ltr" value={draft.startsOn} invalid={invalid("startRequired")} onChange={(e) => patch({ startsOn: e.target.value })} />
              </Field>
              <Field label="End date" htmlFor="wl-end" hint="Optional">
                <TextInput id="wl-end" type="date" dir="ltr" value={draft.endsOn ?? ""} invalid={invalid("endBeforeStart")} onChange={(e) => patch({ endsOn: e.target.value || null })} />
              </Field>
            </div>
            <Issues issues={bySection("validity")} show={showErrors} />
          </Section>
        </form>

        <aside className="space-y-4 lg:sticky lg:top-6">
          <div className="overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-line">
            <div className="px-5 pt-4 pb-3">
              <h2 className="text-sm font-bold text-ink">Will mark when saved</h2>
              <p className="mt-0.5 text-xs text-ink-3">Requests in progress or approved that match. Badges are not suspended.</p>
            </div>
            <div className="border-t border-line px-5 py-3">
              {preview.length ? (
                <ul className="space-y-1.5">
                  {preview.slice(0, 6).map((h) => (
                    <li key={h.requestId} className="flex items-center gap-2 text-xs">
                      <Link href={`/requests/${h.requestId}`} className="font-mono text-accent-text hover:underline">
                        {h.requestId}
                      </Link>
                      <span className="min-w-0 flex-1 truncate text-ink-2">
                        <bdi>{db.attendees[db.requests[h.requestId].attendeeId].profile.fullName}</bdi>
                      </span>
                      <span className={cn("rounded px-1.5 py-0.5 text-2xs font-semibold", h.strength === "strong" ? "bg-orange-50 text-orange-700" : "bg-amber-50 text-amber-800")}>{h.strength === "strong" ? "Strong" : "Possible"}</span>
                    </li>
                  ))}
                  {preview.length > 6 && <li className="text-xs text-ink-3">and {preview.length - 6} more</li>}
                </ul>
              ) : (
                <p className="text-xs text-ink-3">No current request matches.</p>
              )}
            </div>
          </div>
          <div className="overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-line">
            <ol className="py-1.5">
              {SECTIONS.map((s, i) => {
                const err = bySection(s).filter((x) => x.severity === "error").length;
                const warn = bySection(s).length - err;
                return (
                  <li key={s}>
                    <a href={`#${s}`} className="flex items-center gap-3 px-5 py-2 text-sm hover:bg-subtle">
                      <span className="w-4 text-center text-xs font-semibold text-ink-3">{i + 1}</span>
                      <span className="flex-1 truncate text-ink">{TITLE[s]}</span>
                      {err ? <CircleAlert className={cn("size-4", showErrors ? "text-rose-500" : "text-ink-3")} /> : warn ? <TriangleAlert className="size-4 text-amber-500" /> : <CircleCheck className="size-4 text-emerald-500" />}
                    </a>
                  </li>
                );
              })}
            </ol>
            <div className="space-y-3 border-t border-line bg-subtle px-5 py-4">
              {error && (
                <p role="alert" className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-600/15">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" />
                  {error}
                </p>
              )}
              <div className="flex items-center gap-2">
                <Button variant="primary" className="flex-1" disabled={busy} onClick={() => void submit()}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  {busy ? "Saving…" : entry ? "Save changes" : "Save entry"}
                </Button>
                <Link href={entry ? `/screening/watchlist/${entry.id}` : "/screening/watchlist"}>
                  <Button disabled={busy}>Cancel</Button>
                </Link>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
