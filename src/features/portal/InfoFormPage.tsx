"use client";

import { CircleAlert, CircleCheck, Clock3, Link2Off, Loader2, Paperclip } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, type ReactNode } from "react";
import { TextArea, TextInput } from "@/components/ui/Field";
import { findByToken, linkState, type AnswerValue, type SubmitError } from "@/domain/moreInfo";
import type { ID, InfoQuestion } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { useNow } from "@/lib/useNow";
import { portalService } from "@/services/requests";
import { useDb } from "@/store/app";

function Notice({ icon, tone, title, body, action }: { icon: ReactNode; tone: "positive" | "attention" | "muted"; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl bg-surface p-10 text-center shadow-card ring-1 ring-line">
      <span className={cn("mx-auto inline-flex size-12 items-center justify-center rounded-full", tone === "positive" ? "bg-emerald-50 text-emerald-600" : tone === "attention" ? "bg-amber-50 text-amber-600" : "bg-hover text-ink-3")}>
        {icon}
      </span>
      <h1 className="mt-4 text-xl font-bold text-ink">{title}</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-2">{body}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

function FileField({ q, value, onChange, invalid }: { q: InfoQuestion; value: AnswerValue | undefined; onChange: (v: AnswerValue | undefined) => void; invalid: boolean }) {
  const t = useTranslations("portal.form");
  const ref = useRef<HTMLInputElement>(null);
  const file = value && typeof value === "object" && !Array.isArray(value) ? value : null;
  return (
    <div className={cn("flex flex-wrap items-center gap-3 rounded-lg border border-dashed bg-subtle px-3 py-3", invalid ? "border-rose-300" : "border-line-strong")}>
      <button type="button" onClick={() => ref.current?.click()} className="inline-flex h-9 items-center gap-2 rounded-lg bg-surface px-3 text-sm font-semibold text-ink ring-1 ring-line-strong ring-inset hover:bg-hover">
        <Paperclip className="size-4" />
        {t("chooseFile")}
      </button>
      <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{file ? <span className="ltr-data">{file.fileName}</span> : t("noFile")}</span>
      <span className="text-xs text-ink-3">{t("fileHint")}</span>
      <input
        ref={ref}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        className="hidden"
        aria-label={q.label}
        onChange={(e) => {
          const f = e.target.files?.[0];
          onChange(f ? { fileName: f.name, sizeKb: Math.max(1, Math.round(f.size / 1024)) } : undefined);
        }}
      />
    </div>
  );
}

/** 8.5: the attendee's one-time form, plus the expired / used / invalid pages. */
export function InfoFormPage({ token }: { token: string }) {
  const t = useTranslations("portal.form");
  const fmt = useFormat();
  const db = useDb();
  const now = useNow();
  const ir = findByToken(db, token);
  const [answers, setAnswers] = useState<Record<ID, AnswerValue | undefined>>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ error: SubmitError; questionId?: ID } | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (done) {
    return (
      <Notice
        icon={<CircleCheck className="size-6" />}
        tone="positive"
        title={t("doneTitle")}
        body={t("done")}
        action={
          <Link href={`/portal/status/${done}`} className="inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent hover:bg-accent-hover">
            {t("viewStatus")}
          </Link>
        }
      />
    );
  }
  if (!ir) return <Notice icon={<Link2Off className="size-6" />} tone="muted" title={t("invalidTitle")} body={t("invalid")} />;
  const state = linkState(ir, now);
  if (state === "answered") return <Notice icon={<CircleCheck className="size-6" />} tone="positive" title={t("usedTitle")} body={t("used")} />;
  if (state === "expired") return <Notice icon={<Clock3 className="size-6" />} tone="attention" title={t("expiredTitle")} body={t("expired")} />;

  const r = db.requests[ir.requestId];
  const attendee = db.attendees[r.attendeeId];
  const set = (id: ID, v: AnswerValue | undefined) => {
    setAnswers((a) => ({ ...a, [id]: v }));
    setProblem(null);
  };

  const submit = async () => {
    setBusy(true);
    const clean = Object.fromEntries(Object.entries(answers).filter(([, v]) => v !== undefined)) as Record<ID, AnswerValue>;
    const res = await portalService.submit(token, clean);
    setBusy(false);
    if (res.ok) setDone(res.requestId);
    else {
      setProblem({ error: res.error, questionId: res.ok ? undefined : res.questionId });
      if (!res.ok && res.questionId) document.getElementById(`q-${res.questionId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <section className="rounded-2xl bg-surface p-7 shadow-card ring-1 ring-line">
        <p className="text-sm font-medium text-accent-text">{fmt.text(db.events[r.eventId].name)}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">{t("title")}</h1>
        <p className="mt-2 text-sm text-ink-2">{t("intro", { name: attendee.profile.fullName, event: fmt.text(db.events[r.eventId].name) })}</p>
        <p dir="auto" className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm whitespace-pre-line text-amber-950 ring-1 ring-amber-600/15">
          {ir.instructions}
        </p>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-3">
          <Clock3 className="size-3.5" />
          {t("deadline", { date: fmt.full(ir.tokenExpiresAt) })}
        </p>
      </section>

      <section className="space-y-6 rounded-2xl bg-surface p-7 shadow-card ring-1 ring-line">
        {ir.questions.map((q) => {
          const v = answers[q.id];
          const invalid = problem?.questionId === q.id;
          const id = `q-${q.id}`;
          return (
            <div key={q.id} id={id} className="scroll-mt-24">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <label htmlFor={`${id}-input`} className="text-sm font-semibold text-ink" dir="auto">
                  {q.label}
                </label>
                <span className="shrink-0 text-xs text-ink-3">{q.required ? t("required") : t("optional")}</span>
              </div>
              {q.type === "upload" ? (
                <FileField q={q} value={v} onChange={(x) => set(q.id, x)} invalid={invalid} />
              ) : q.type === "longText" ? (
                <TextArea id={`${id}-input`} rows={4} value={(v as string) ?? ""} onChange={(e) => set(q.id, e.target.value)} />
              ) : q.type === "singleChoice" ? (
                <div role="radiogroup" className="space-y-2">
                  {(q.options ?? []).map((o) => (
                    <label key={o} className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ring-1 ring-inset", v === o ? "bg-accent-soft ring-indigo-300" : "ring-line hover:bg-subtle")}>
                      <input type="radio" name={id} className="size-4 accent-indigo-600" checked={v === o} onChange={() => set(q.id, o)} />
                      <span dir="auto">{o}</span>
                    </label>
                  ))}
                </div>
              ) : q.type === "multiChoice" ? (
                <div className="space-y-2">
                  {(q.options ?? []).map((o) => {
                    const list = (v as string[]) ?? [];
                    const on = list.includes(o);
                    return (
                      <label key={o} className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ring-1 ring-inset", on ? "bg-accent-soft ring-indigo-300" : "ring-line hover:bg-subtle")}>
                        <input type="checkbox" className="size-4 accent-indigo-600" checked={on} onChange={() => set(q.id, on ? list.filter((x) => x !== o) : [...list, o])} />
                        <span dir="auto">{o}</span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <TextInput
                  id={`${id}-input`}
                  type={q.type === "number" ? "number" : q.type === "date" ? "date" : q.mapsTo === "email" ? "email" : "text"}
                  dir={q.type === "date" || q.type === "number" || q.mapsTo === "email" ? "ltr" : "auto"}
                  invalid={invalid}
                  value={(v as string) ?? ""}
                  onChange={(e) => set(q.id, e.target.value)}
                />
              )}
              {invalid && problem && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-rose-600">
                  <CircleAlert className="size-3.5" />
                  {t(`errors.${problem.error === "missing" || problem.error === "badFile" || problem.error === "badValue" ? problem.error : "generic"}`)}
                </p>
              )}
            </div>
          );
        })}
        {problem && !problem.questionId && <p className="text-sm text-rose-600">{t("errors.generic")}</p>}
        <button type="submit" disabled={busy} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-semibold text-on-accent shadow-accent hover:bg-accent-hover disabled:opacity-60">
          {busy && <Loader2 className="size-4 animate-spin" />}
          {busy ? t("sending") : t("submit")}
        </button>
      </section>
    </form>
  );
}
