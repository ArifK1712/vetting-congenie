"use client";

import { Building2, ChevronRight, CircleAlert, CircleCheck, FileText, Info, Loader2, Lock, Paperclip, Plus, SearchX, ShieldBan, TriangleAlert, UserRound, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useDeferredValue, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { PAGE } from "@/design/layout";
import { Button } from "@/components/ui/Button";
import { DirIcon } from "@/components/ui/DirIcon";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, TextArea, TextInput } from "@/components/ui/Field";
import { Segmented } from "@/components/ui/Segmented";
import { Select } from "@/components/ui/Select";
import { toast } from "@/components/ui/Toast";
import {
  DETAIL_MAX,
  draftFromEntry,
  draftFromRequest,
  effectiveStatus,
  emptyDraft,
  errorsOf,
  EVIDENCE_MAX,
  MAX_ALIASES,
  REASON_TYPES,
  retroMatches,
  validateEntry,
  type EntryDraft,
  type EntryIssue,
} from "@/domain/blacklist";
import type { BlacklistReason, ID, ListIdentity } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { useNow } from "@/lib/useNow";
import { blacklistService } from "@/services/blacklist";
import { watchlistService } from "@/services/watchlist";
import { blacklistDraftFromWatch } from "@/domain/watchlist";
import { useDb } from "@/store/app";
import { useViewer } from "@/store/useViewer";
import { Section } from "@/features/teams/EditorSections";
import { useBlacklistError, useIssueText, useReasonLabel } from "./parts";

const SECTIONS = ["who", "identifiers", "events", "reason", "validity"] as const;
type SectionKey = (typeof SECTIONS)[number];

const ISSUE_SECTION: Record<EntryIssue["code"], SectionKey> = {
  nameRequired: "who",
  tooManyAliases: "who",
  companyRequired: "who",
  idRequired: "identifiers",
  nationalityRequired: "identifiers",
  emailInvalid: "identifiers",
  dobInvalid: "identifiers",
  possibleDuplicate: "identifiers",
  eventsRequired: "events",
  reasonTypeRequired: "reason",
  reasonDetailRequired: "reason",
  reasonDetailTooLong: "reason",
  tooManyFiles: "reason",
  fileTooLarge: "reason",
  fileType: "reason",
  startRequired: "validity",
  endBeforeStart: "validity",
};

function Issues({ issues, show }: { issues: EntryIssue[]; show: boolean }) {
  const issueText = useIssueText();
  const shown = issues.filter((i) => i.severity === "warning" || show);
  if (!shown.length) return null;
  return (
    <ul className="space-y-1.5 border-t border-line px-6 py-4">
      {shown.map((i, n) => (
        <li key={n} className={cn("flex items-start gap-2 rounded-lg px-3 py-2 text-sm ring-1 ring-inset", i.severity === "error" ? "bg-rose-50 text-rose-700 ring-rose-600/15" : "bg-amber-50 text-amber-800 ring-amber-600/20")}>
          {i.severity === "error" ? <CircleAlert className="mt-0.5 size-4 shrink-0" /> : <TriangleAlert className="mt-0.5 size-4 shrink-0" />}
          <span>
            {issueText(i.code)}
            {i.code === "possibleDuplicate" && i.ref && (
              <>
                {" "}
                <Link href={`/screening/blacklist/${i.ref}`} className="font-mono font-semibold underline">
                  {i.ref}
                </Link>
              </>
            )}
            {(i.code === "fileTooLarge" || i.code === "fileType") && i.ref && (
              <span className="text-xs">
                {" "}
                (<bdi>{i.ref}</bdi>)
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Up to five other spellings; Enter or comma adds one. */
export function AliasInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const t = useTranslations("blacklist.form");
  const [text, setText] = useState("");
  const add = () => {
    const v = text.trim();
    if (v && !value.includes(v) && value.length < MAX_ALIASES) onChange([...value, v]);
    setText("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === "،") {
      e.preventDefault();
      add();
    } else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
  };
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-2 py-1.5 shadow-xs focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/10">
      {value.map((a) => (
        <span key={a} dir="auto" className="inline-flex h-6 items-center gap-1 rounded-md bg-accent-soft ps-2 pe-1 text-xs font-medium text-accent-text">
          {a}
          <button type="button" aria-label={t("removeAlias", { alias: a })} onClick={() => onChange(value.filter((x) => x !== a))} className="rounded p-0.5 hover:bg-indigo-100">
            <X className="size-3" />
          </button>
        </span>
      ))}
      {value.length < MAX_ALIASES && (
        <input
          dir="auto"
          aria-label={t("addAlias")}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          onBlur={add}
          placeholder={value.length ? t("addAnother") : t("aliasPlaceholder")}
          className="h-6 min-w-40 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-ink-3"
        />
      )}
    </div>
  );
}

export function EntryFormPage({ id }: { id: ID | null }) {
  const t = useTranslations("blacklist");
  const tf = useTranslations("blacklist.form");
  const reasonLabel = useReasonLabel();
  const errorText = useBlacklistError();
  const db = useDb();
  const viewer = useViewer();
  const router = useRouter();
  const params = useSearchParams();
  const fmt = useFormat();
  const now = useNow();
  const entry = id ? db.blacklist[id] : null;
  const fromRequest = !id ? params.get("fromRequest") : null;
  const sourceRequest = fromRequest ? db.requests[fromRequest] : null;
  const fromWatchlist = !id ? params.get("fromWatchlist") : null;
  const sourceWatch = fromWatchlist ? db.watchlist[fromWatchlist] : null;

  const [draft, setDraft] = useState<EntryDraft>(() =>
    entry
      ? draftFromEntry(entry)
      : (sourceWatch && blacklistDraftFromWatch(sourceWatch)) || (fromRequest && draftFromRequest(db, fromRequest, Date.now())) || emptyDraft(Date.now()),
  );
  const [revision] = useState(entry?.revision ?? 0);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const issues = useMemo(() => validateEntry(db, draft, id, now), [db, draft, id, now]);
  const errors = errorsOf(issues);
  const deferred = useDeferredValue(draft);
  const preview = useMemo(() => retroMatches(db, deferred.identity, deferred.eventScope, id), [db, deferred.identity, deferred.eventScope, id]);
  const nationalities = useMemo(() => {
    const codes = new Set(Object.values(db.attendees).map((a) => a.profile.nationality));
    for (const c of ["SA", "AE", "BH", "KW", "OM", "QA", "EG", "JO", "LB", "IQ", "SY", "YE", "SD", "PK", "IN", "BD", "PH", "ID", "TR", "IR", "GB", "US", "FR", "DE", "CN", "RU"]) codes.add(c);
    return [...codes].map((c) => ({ value: c, label: fmt.country(c), hint: c })).sort((a, b) => a.label.localeCompare(b.label));
  }, [db, fmt]);

  if (!viewer.can("blacklist.propose")) {
    return <EmptyState icon={Lock} title={tf("noAccessTitle")} body={tf("noAccessBody")} />;
  }
  if (id && !entry) {
    return <EmptyState icon={SearchX} title={t("entryNotFound")} action={<Link href="/screening/blacklist" className="text-sm text-accent-text hover:underline">{t("backToList")}</Link>} />;
  }
  const status = entry ? effectiveStatus(entry, now) : null;
  if (status === "removed" || status === "expired") {
    return <EmptyState icon={Lock} title={tf("notEditableTitle")} body={tf("notEditableBody")} />;
  }

  const setIdentity = (patch: Partial<ListIdentity>) => setDraft((d) => ({ ...d, identity: { ...d.identity, ...patch } }));
  const bySection = (s: SectionKey) => issues.filter((i) => ISSUE_SECTION[i.code] === s);
  const sectionProps = (s: SectionKey, index: number, subtitle: string) => ({ id: s, index, title: tf(`section.${s}`), subtitle, issues: bySection(s).map((i) => ({ ...i, code: "nameRequired" as const, section: "basics" as const })), showErrors });
  const invalid = (code: EntryIssue["code"]) => showErrors && issues.some((i) => i.code === code && i.severity === "error");
  const person = draft.identity.subjectType === "person";

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const added = Array.from(files).map((f, i) => ({ id: `ev_${Date.now().toString(36)}${i}`, fileName: f.name, sizeKb: Math.max(1, Math.round(f.size / 1024)) }));
    setDraft((d) => ({ ...d, evidence: [...d.evidence, ...added] }));
  };

  const submit = async () => {
    setShowErrors(true);
    if (errors.length) {
      document.getElementById(ISSUE_SECTION[errors[0].code])?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setBusy(true);
    setError(null);
    const r = entry
      ? await blacklistService.edit({ entryId: entry.id, expectedRevision: revision, draft, actorId: viewer.id })
      : await blacklistService.propose({ draft, source: sourceRequest ? "request" : "manual", sourceRequestId: sourceRequest?.id ?? null, actorId: viewer.id });
    setBusy(false);
    if (!r.ok) return setError(errorText(r.error));
    if (sourceWatch) await watchlistService.movedToBlacklist({ entryId: sourceWatch.id, blacklistId: r.entryId, actorId: viewer.id });
    toast(entry && status === "active" ? tf("toastChangeSent") : tf("toastSent", { id: r.entryId }));
    router.push(`/screening/blacklist/${r.entryId}`);
  };

  return (
    <div className={cn(PAGE, "pb-16")}>
      <nav className="flex items-center gap-1.5 text-xs font-medium text-ink-3">
        <Link href="/screening/blacklist" className="hover:text-accent-text">
          {t("breadcrumb")}
        </Link>
        <DirIcon icon={ChevronRight} className="size-3.5" />
        {entry && (
          <>
            <Link href={`/screening/blacklist/${entry.id}`} className="font-mono hover:text-accent-text">
              {entry.id}
            </Link>
            <DirIcon icon={ChevronRight} className="size-3.5" />
          </>
        )}
        <span className="text-ink-2">{entry ? tf("crumbEdit") : tf("crumbAdd")}</span>
      </nav>
      <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink">{entry ? (status === "active" ? tf("titleChange", { id: entry.id }) : tf("titleEdit", { id: entry.id })) : tf("titleAdd")}</h1>
      <p className="mt-1 text-sm text-ink-2">{tf("subtitle")}</p>

      {sourceRequest && (
        <p className="mt-5 flex items-start gap-2.5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-600/20">
          <ShieldBan className="mt-0.5 size-4 shrink-0" />
          <span>
            {tf.rich("fromRequest", {
              id: sourceRequest.id,
              link: (chunks) => (
                <Link href={`/requests/${sourceRequest.id}`} className="font-mono font-semibold underline">
                  {chunks}
                </Link>
              ),
            })}
          </span>
        </p>
      )}
      {sourceWatch && (
        <p className="mt-5 flex items-start gap-2.5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-600/20">
          <ShieldBan className="mt-0.5 size-4 shrink-0" />
          <span>
            {tf.rich("fromWatchlist", {
              id: sourceWatch.id,
              link: (chunks) => (
                <Link href={`/screening/watchlist/${sourceWatch.id}`} className="font-mono font-semibold underline">
                  {chunks}
                </Link>
              ),
            })}
          </span>
        </p>
      )}
      {entry && status === "active" && (
        <p className="mt-5 flex items-start gap-2.5 rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-900 ring-1 ring-sky-600/15">
          <Info className="mt-0.5 size-4 shrink-0" />
          {tf("activeNotice")}
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
          <Section {...sectionProps("who", 1, tf("whoHint"))}>
            <div className="space-y-4 px-6 py-5">
              <Segmented<ListIdentity["subjectType"]>
                label={tf("typeLabel")}
                value={draft.identity.subjectType}
                onChange={(subjectType) => setIdentity({ subjectType })}
                options={[
                  { value: "person", label: t("type.person"), icon: UserRound },
                  { value: "company", label: t("type.company"), icon: Building2 },
                ]}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={person ? tf("fullName") : tf("displayName")} htmlFor="bl-name">
                  <TextInput id="bl-name" dir="auto" value={draft.identity.fullName} invalid={invalid("nameRequired")} onChange={(e) => setIdentity({ fullName: e.target.value })} placeholder={person ? tf("namePlaceholderPerson") : tf("namePlaceholderCompany")} />
                </Field>
                {!person && (
                  <Field label={tf("companyToMatch")} htmlFor="bl-company" hint={tf("companyHint")}>
                    <TextInput id="bl-company" dir="auto" value={draft.identity.company ?? ""} invalid={invalid("companyRequired")} onChange={(e) => setIdentity({ company: e.target.value })} />
                  </Field>
                )}
              </div>
              <Field label={t("field.otherSpellings")} hint={tf("aliasesHint", { count: fmt.number(draft.identity.aliases.length), max: fmt.number(MAX_ALIASES) })}>
                <AliasInput value={draft.identity.aliases} onChange={(aliases) => setIdentity({ aliases })} />
              </Field>
            </div>
            <Issues issues={bySection("who")} show={showErrors} />
          </Section>

          <Section {...sectionProps("identifiers", 2, person ? tf("identifiersPerson") : tf("identifiersCompany"))}>
            <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
              {person && (
                <>
                  <Field label={t("field.nationalId")} htmlFor="bl-nid">
                    <TextInput id="bl-nid" dir="ltr" className="font-mono" value={draft.identity.nationalId ?? ""} invalid={invalid("idRequired")} onChange={(e) => setIdentity({ nationalId: e.target.value })} />
                  </Field>
                  <Field label={t("field.dob")} htmlFor="bl-dob" hint={tf("dobHint")}>
                    <TextInput id="bl-dob" type="date" dir="ltr" value={draft.identity.dob ?? ""} invalid={invalid("dobInvalid")} onChange={(e) => setIdentity({ dob: e.target.value || undefined })} />
                  </Field>
                  <Field label={tf("passportNumber")} htmlFor="bl-pass">
                    <TextInput id="bl-pass" dir="ltr" className="font-mono" value={draft.identity.passportNo ?? ""} invalid={invalid("idRequired")} onChange={(e) => setIdentity({ passportNo: e.target.value })} />
                  </Field>
                  <Field label={tf("passportNationality")}>
                    <Select label={tf("passportNationality")} placeholder={tf("chooseCountry")} searchable invalid={invalid("nationalityRequired")} value={draft.identity.nationality ?? null} onChange={(nationality) => setIdentity({ nationality })} options={nationalities} />
                  </Field>
                </>
              )}
              <Field label={t("field.email")} htmlFor="bl-email" hint={tf("emailHint")}>
                <TextInput id="bl-email" type="email" dir="ltr" value={draft.identity.email ?? ""} invalid={invalid("emailInvalid")} onChange={(e) => setIdentity({ email: e.target.value })} />
              </Field>
              <Field label={t("field.mobile")} htmlFor="bl-mobile" hint={tf("optional")}>
                <TextInput id="bl-mobile" dir="ltr" value={draft.identity.mobile ?? ""} onChange={(e) => setIdentity({ mobile: e.target.value })} placeholder="+966…" />
              </Field>
            </div>
            <Issues issues={bySection("identifiers")} show={showErrors} />
          </Section>

          <Section {...sectionProps("events", 3, tf("eventsHint"))}>
            <div className="space-y-3 px-6 py-5">
              <Segmented<"all" | "some">
                label={t("field.events")}
                value={draft.eventScope === "all" ? "all" : "some"}
                onChange={(v) => setDraft((d) => ({ ...d, eventScope: v === "all" ? "all" : [] }))}
                options={[
                  { value: "all", label: t("allEvents") },
                  { value: "some", label: tf("selectedEvents") },
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
                        onClick={() => setDraft((d) => ({ ...d, eventScope: on ? scope.filter((x) => x !== e.id) : [...scope, e.id] }))}
                        className={cn("inline-flex items-center gap-2 rounded-lg px-3 py-2 text-start text-sm ring-1 ring-inset", on ? "bg-accent-soft text-accent-text ring-indigo-300" : "bg-surface text-ink-2 ring-line hover:bg-subtle")}
                      >
                        <span className={cn("inline-flex size-4 items-center justify-center rounded-xs border", on ? "border-accent bg-accent text-on-accent" : "border-line-strong")}>{on && <CircleCheck className="size-3" />}</span>
                        <span>
                          <span className="block font-medium">{fmt.text(e.name)}</span>
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

          <Section {...sectionProps("reason", 4, tf("reasonHint"))}>
            <div className="space-y-4 px-6 py-5">
              <Field label={t("field.reasonType")}>
                <Select label={t("field.reasonType")} placeholder={tf("chooseReason")} invalid={invalid("reasonTypeRequired")} value={draft.reasonType} onChange={(v) => setDraft((d) => ({ ...d, reasonType: v as BlacklistReason }))} options={REASON_TYPES.map((r) => ({ value: r, label: reasonLabel(r) }))} />
              </Field>
              <Field label={t("field.reasonDetails")} htmlFor="bl-detail" hint={tf("detailCount", { count: fmt.number(draft.reasonDetail.length), max: fmt.number(DETAIL_MAX) })}>
                <TextArea id="bl-detail" dir="auto" rows={4} maxLength={DETAIL_MAX + 50} value={draft.reasonDetail} onChange={(e) => setDraft((d) => ({ ...d, reasonDetail: e.target.value }))} placeholder={tf("detailPlaceholder")} />
              </Field>
              <Field label={t("field.evidence")} hint={tf("evidenceHint", { max: fmt.number(EVIDENCE_MAX) })}>
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    addFiles(e.dataTransfer.files);
                  }}
                  className="rounded-lg border border-dashed border-line-strong bg-subtle px-4 py-4"
                >
                  {draft.evidence.length > 0 && (
                    <ul className="mb-3 space-y-1.5">
                      {draft.evidence.map((f) => (
                        <li key={f.id} className="flex items-center gap-2.5 rounded-lg bg-surface px-3 py-2 text-sm ring-1 ring-line">
                          <FileText className="size-4 text-ink-3" />
                          <bdi className="min-w-0 flex-1 truncate">{f.fileName}</bdi>
                          <span className="tabular text-xs text-ink-3">{t("detail.sizeMb", { size: (f.sizeKb / 1024).toFixed(1) })}</span>
                          <Button size="sm" variant="ghost" iconOnly aria-label={tf("removeFile", { file: f.fileName })} onClick={() => setDraft((d) => ({ ...d, evidence: d.evidence.filter((x) => x.id !== f.id) }))}>
                            <X className="size-3.5" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex flex-wrap items-center gap-3">
                    <Button size="sm" onClick={() => fileRef.current?.click()} disabled={draft.evidence.length >= EVIDENCE_MAX}>
                      <Paperclip className="size-3.5" />
                      {tf("attachFiles")}
                    </Button>
                    <span className="text-xs text-ink-3">{tf("dropFiles")}</span>
                    <input
                      ref={fileRef}
                      type="file"
                      multiple
                      accept=".pdf,.jpg,.jpeg,.png"
                      className="hidden"
                      onChange={(e) => {
                        addFiles(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </div>
                </div>
              </Field>
            </div>
            <Issues issues={bySection("reason")} show={showErrors} />
          </Section>

          <Section {...sectionProps("validity", 5, tf("validityHint"))}>
            <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
              <Field label={t("field.startDate")} htmlFor="bl-start">
                <TextInput id="bl-start" type="date" dir="ltr" value={draft.startsOn} invalid={invalid("startRequired")} onChange={(e) => setDraft((d) => ({ ...d, startsOn: e.target.value }))} />
              </Field>
              <Field label={t("field.endDate")} htmlFor="bl-end" hint={tf("optional")}>
                <TextInput id="bl-end" type="date" dir="ltr" value={draft.endsOn ?? ""} invalid={invalid("endBeforeStart")} onChange={(e) => setDraft((d) => ({ ...d, endsOn: e.target.value || null }))} />
              </Field>
            </div>
            <Issues issues={bySection("validity")} show={showErrors} />
          </Section>
        </form>

        <aside className="space-y-4 lg:sticky lg:top-6">
          <div className="overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-line">
            <div className="px-5 pt-4 pb-3">
              <h2 className="text-sm font-bold text-ink">{tf("wouldMatch")}</h2>
              <p className="mt-0.5 text-xs text-ink-3">{tf("wouldMatchHint")}</p>
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
                      <span className={cn("rounded px-1.5 py-0.5 text-2xs font-semibold", h.strength === "strong" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800")}>{h.strength === "strong" ? tf("strong") : tf("possible")}</span>
                    </li>
                  ))}
                  {preview.length > 6 && <li className="text-xs text-ink-3">{tf("andMore", { n: fmt.number(preview.length - 6) })}</li>}
                </ul>
              ) : (
                <p className="text-xs text-ink-3">{tf("noMatches")}</p>
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
                      <span className="w-4 text-center text-xs font-semibold text-ink-3">{fmt.number(i + 1)}</span>
                      <span className="flex-1 text-ink">{tf(`section.${s}`)}</span>
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
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                  {busy ? tf("sending") : tf("send")}
                </Button>
                <Link href={entry ? `/screening/blacklist/${entry.id}` : "/screening/blacklist"}>
                  <Button disabled={busy}>{tf("cancel")}</Button>
                </Link>
              </div>
              <p className="text-center text-xs text-ink-3">{tf("secondPerson")}</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
