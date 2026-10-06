"use client";

import { Copy, Eraser, Eye, FileWarning, FlaskConical, Loader2, Send, ShieldBan, UserRoundCheck, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { Select, type SelectOption } from "@/components/ui/Select";
import { toast } from "@/components/ui/Toast";
import { PAGE } from "@/design/layout";
import type { IntakeResult } from "@/domain/intake";
import { formOf } from "@/domain/registrations";
import type { Attendee, ID } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { cn } from "@/lib/cn";
import { registrationService } from "@/services/registrations";
import { useAppStore, useDb } from "@/store/app";
import { fieldDomId, QuestionField } from "./FormFields";
import { CARD, PreviewCard, ResultCard, type SimRun } from "./OutcomePanel";
import { nationalityCodes, newSubmissionKey, presetAnswers, type Answers, type PresetKind, type PresetNote } from "./presets";
import { RecentList } from "./RecentList";

type PaymentStatus = Attendee["payment"]["status"];

const PRESETS: { kind: PresetKind; icon: LucideIcon; className: string }[] = [
  { kind: "clean", icon: UserRoundCheck, className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 hover:bg-emerald-100" },
  { kind: "blacklisted", icon: ShieldBan, className: "bg-rose-50 text-rose-700 ring-rose-600/20 hover:bg-rose-100" },
  { kind: "watchlist", icon: Eye, className: "bg-amber-50 text-amber-800 ring-amber-600/20 hover:bg-amber-100" },
  { kind: "missing", icon: FileWarning, className: "bg-sky-50 text-sky-700 ring-sky-600/20 hover:bg-sky-100" },
  { kind: "clear", icon: Eraser, className: "bg-surface text-ink-2 ring-line-strong hover:bg-subtle" },
];

const DEFAULT_REGISTRATION = "reg_gis_visitor";
const requestCount = () => Object.keys(useAppStore.getState().db?.requests ?? {}).length;

export function SimulatePage() {
  const t = useTranslations("simulate");
  const tf = useTranslations("simulate.form");
  const tp = useTranslations("payment");
  const fmt = useFormat();
  const db = useDb();

  const [registrationId, setRegistrationId] = useState<ID | null>(() => (db.registrations[DEFAULT_REGISTRATION] ? DEFAULT_REGISTRATION : (Object.keys(db.registrations)[0] ?? null)));
  const reg = registrationId ? db.registrations[registrationId] : undefined;
  const [badgeTypeId, setBadgeTypeId] = useState<ID | null>(() => reg?.badgeTypeIds[0] ?? null);
  const [answers, setAnswers] = useState<Answers>({});
  const [payment, setPayment] = useState<PaymentStatus>("free");
  // Empty until the form is filled or first submitted; kept after a submit (AC05 demo).
  const [submissionKey, setSubmissionKey] = useState("");
  const [usedKey, setUsedKey] = useState<string | null>(null);
  const [note, setNote] = useState<PresetNote | null>(null);
  const [missing, setMissing] = useState<Set<ID>>(new Set());
  const [busy, setBusy] = useState<"single" | "double" | null>(null);
  const [run, setRun] = useState<SimRun | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const form = useMemo(() => (reg ? formOf(reg) : []), [reg]);
  const standard = form.filter((q) => q.profileField);
  const custom = form.filter((q) => !q.profileField);

  const registrationOptions: SelectOption[] = useMemo(
    () =>
      Object.values(db.registrations)
        .map((r) => {
          const event = db.events[r.eventId];
          const on = !!db.vettingSettings[r.id]?.enabled;
          return {
            value: r.id,
            label: fmt.text(r.name),
            hint: on ? event?.code : tf("regHintOff", { code: event?.code ?? "" }),
            group: fmt.text(event?.name),
            start: event?.startsOn ?? "",
          };
        })
        .sort((a, b) => a.start.localeCompare(b.start) || a.label.localeCompare(b.label, fmt.locale)),
    [db, fmt, tf],
  );
  const badgeOptions: SelectOption[] = (reg?.badgeTypeIds ?? []).map((id) => ({ value: id, label: fmt.text(db.badgeTypes[id]?.name) }));
  const nationality = typeof answers.std_nationality === "string" ? answers.std_nationality : "";
  const countries: SelectOption[] = useMemo(
    () =>
      nationalityCodes(db, [nationality])
        .map((c) => ({ value: c, label: fmt.country(c), hint: c }))
        .sort((a, b) => a.label.localeCompare(b.label, fmt.locale)),
    [db, fmt, nationality],
  );

  /** Any change to what would be submitted starts a new submission. */
  const touched = () => {
    setSubmissionKey(newSubmissionKey());
    setUsedKey(null);
  };

  const setAnswer = (id: ID, v: string | string[]) => {
    setAnswers((a) => ({ ...a, [id]: v }));
    if (missing.has(id)) {
      const next = new Set(missing);
      next.delete(id);
      setMissing(next);
    }
    touched();
  };

  const chooseRegistration = (id: ID) => {
    const next = db.registrations[id];
    setRegistrationId(id);
    if (!badgeTypeId || !next.badgeTypeIds.includes(badgeTypeId)) setBadgeTypeId(next.badgeTypeIds[0] ?? null);
    // Keep the attendee details; drop answers to questions this form doesn't have.
    const ids = new Set(formOf(next).map((q) => q.id));
    setAnswers((a) => Object.fromEntries(Object.entries(a).filter(([k]) => ids.has(k))));
    setMissing(new Set());
    setRun(null);
    touched();
  };

  const applyPreset = (kind: PresetKind) => {
    if (!reg) return;
    const r = presetAnswers(db, reg, kind, answers);
    if (!r) {
      toast(kind === "blacklisted" ? tf("noBlacklistEntry") : tf("noWatchlistEntry"));
      return;
    }
    setAnswers(r.answers);
    setNote(r.note);
    setMissing(new Set());
    setRun(null);
    if (kind === "clear") setPayment("free");
    touched();
  };

  const showResult = (results: IntakeResult[], double: boolean, before: number) => {
    setRun({ at: Date.now(), double, results, before, after: requestCount() });
    const failed = results.find((r) => !r.ok && r.error === "missing");
    const ids = failed && !failed.ok ? (failed.missing ?? []) : [];
    setMissing(new Set(ids));
    if (ids.length) document.getElementById(fieldDomId(ids[0]))?.focus({ preventScroll: true });
    // Stacked layout: bring the result into view.
    if (window.innerWidth < 1024) requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const submission = (key: string) => ({
    registrationId: registrationId!,
    badgeTypeId: badgeTypeId!,
    answers,
    submissionKey: key,
    payment: { status: payment, amount: payment === "free" ? 0 : 750 },
  });

  const submit = async () => {
    if (!registrationId || !badgeTypeId || busy) return;
    const key = submissionKey || newSubmissionKey();
    setSubmissionKey(key);
    setBusy("single");
    const before = requestCount();
    const r = await registrationService.submit(submission(key));
    if (r.ok) setUsedKey(key);
    setBusy(null);
    showResult([r], false, before);
  };

  /** AC05: two submits fired together with one key. */
  const submitTwice = async () => {
    if (!registrationId || !badgeTypeId || busy) return;
    // A key already sent would only show two duplicates; use a fresh one.
    const key = submissionKey && submissionKey !== usedKey ? submissionKey : newSubmissionKey();
    setSubmissionKey(key);
    setBusy("double");
    const before = requestCount();
    const s = submission(key);
    const results = await Promise.all([registrationService.submit(s), registrationService.submit(s)]);
    if (results.some((r) => r.ok)) setUsedKey(key);
    setBusy(null);
    showResult(results, true, before);
  };

  const noteText = (() => {
    if (!note) return null;
    if (note.kind === "blacklisted" || note.kind === "watchlist") return tf(`notes.${note.kind}`, { id: note.entryId ?? "", name: note.entryName ?? "" });
    if (note.kind === "missing") {
      const q = form.find((x) => x.id === note.questionId);
      return tf("notes.missing", { field: q ? fmt.text(q.label) : "" });
    }
    return tf(`notes.${note.kind}`);
  })();

  const ready = !!registrationId && !!badgeTypeId;

  return (
    <div className={cn(PAGE, "pb-12")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-ink">{t("title")}</h1>
        <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-violet-50 px-2.5 text-xs font-semibold text-violet-700 ring-1 ring-violet-600/15 ring-inset">
          <FlaskConical className="size-3.5" />
          {t("prototype")}
        </span>
      </div>
      <p className="mt-1.5 max-w-3xl text-sm text-ink-2">{t("subtitle")}</p>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,27rem)]">
        {/* ─── Left: the registration form ─── */}
        <section className={cn(CARD, "min-w-0 overflow-hidden")} aria-labelledby="sim-form-title">
          <div className="border-b border-line bg-subtle px-5 pt-5 pb-4">
            <h2 id="sim-form-title" className="text-base font-semibold text-ink">
              {tf("title")}
            </h2>
            <p className="text-xs text-ink-3">{tf("subtitle")}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="min-w-0">
                <p className="mb-1.5 text-sm font-semibold text-ink">{tf("registration")}</p>
                <Select label={tf("registration")} placeholder={tf("chooseRegistration")} value={registrationId} onChange={chooseRegistration} options={registrationOptions} />
              </div>
              <div className="min-w-0">
                <p className="mb-1.5 text-sm font-semibold text-ink">{tf("badgeType")}</p>
                <Select
                  label={tf("badgeType")}
                  placeholder={tf("chooseBadgeType")}
                  value={badgeTypeId}
                  onChange={(v) => {
                    setBadgeTypeId(v);
                    setRun(null);
                    touched();
                  }}
                  options={badgeOptions}
                />
              </div>
            </div>
            <div className="mt-4">
              <p className="eyebrow mb-2">{tf("fillWith")}</p>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map(({ kind, icon: Icon, className }) => (
                  <button
                    key={kind}
                    type="button"
                    disabled={!reg}
                    onClick={() => applyPreset(kind)}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold ring-1 transition-colors ring-inset disabled:opacity-50",
                      className,
                    )}
                  >
                    <Icon className="size-3.5" />
                    {tf(`presets.${kind}`)}
                  </button>
                ))}
              </div>
              {noteText && (
                <p dir="auto" className="mt-2 text-xs text-ink-2" role="status">
                  {noteText}
                </p>
              )}
            </div>
          </div>

          {reg && (
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
              className="px-5 py-5"
            >
              {missing.size > 0 && (
                <p role="alert" className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 ring-1 ring-rose-600/15 ring-inset">
                  {tf("missingSummary", { count: missing.size, n: fmt.number(missing.size) })}
                </p>
              )}
              <fieldset>
                <legend className="eyebrow mb-3">{tf("applicant")}</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  {standard.map((q) => (
                    <QuestionField key={q.id} q={q} value={answers[q.id]} error={missing.has(q.id)} countries={countries} onChange={(v) => setAnswer(q.id, v)} />
                  ))}
                </div>
              </fieldset>

              <div className="mt-6 border-t border-line pt-5">
                <fieldset>
                  <legend className="eyebrow mb-3">{tf("questions")}</legend>
                  {custom.length === 0 ? (
                    <p className="text-sm text-ink-3">{tf("noQuestions")}</p>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {custom.map((q) => (
                        <QuestionField key={q.id} q={q} value={answers[q.id]} error={missing.has(q.id)} countries={countries} onChange={(v) => setAnswer(q.id, v)} />
                      ))}
                    </div>
                  )}
                </fieldset>
              </div>

              <div className="mt-6 border-t border-line pt-5">
                <p className="mb-2 text-sm font-semibold text-ink">{tf("payment")}</p>
                <Segmented<PaymentStatus>
                  label={tf("payment")}
                  value={payment}
                  onChange={(v) => {
                    setPayment(v);
                    touched();
                  }}
                  options={(["free", "paid", "pending"] as const).map((v) => ({ value: v, label: tp(v) }))}
                />
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-5">
                <Button type="submit" variant="primary" disabled={!ready || !!busy}>
                  {busy === "single" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  {busy === "single" ? tf("submitting") : tf("submit")}
                </Button>
                <Button type="button" disabled={!ready || !!busy} onClick={() => void submitTwice()} title={tf("submitTwiceHint")}>
                  {busy === "double" ? <Loader2 className="size-4 animate-spin" /> : <Copy className="size-4" />}
                  {tf("submitTwice")}
                </Button>
              </div>
              <div className="mt-3 rounded-lg bg-subtle px-3 py-2.5 ring-1 ring-line ring-inset">
                <p className="flex flex-wrap items-baseline gap-x-2 text-xs">
                  <span className="font-semibold text-ink-2">{tf("submissionKey")}</span>
                  {submissionKey ? (
                    <span data-testid="sim-key" className="ltr-data font-mono break-all text-ink">
                      {submissionKey}
                    </span>
                  ) : (
                    <span className="text-ink-3">{tf("keyNew")}</span>
                  )}
                </p>
                <p className="mt-1 text-xs text-ink-3">{tf("keyHint")}</p>
              </div>
            </form>
          )}
        </section>

        {/* ─── Right: what will happen, then the result ─── */}
        <div ref={resultRef} className="min-w-0 scroll-mt-4 space-y-4">
          {run && <ResultCard key={run.at} db={db} run={run} />}
          <PreviewCard db={db} registrationId={registrationId} badgeTypeId={badgeTypeId} />
        </div>
      </div>

      <RecentList db={db} />
    </div>
  );
}
