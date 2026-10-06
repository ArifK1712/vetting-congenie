"use client";

import * as RD from "@radix-ui/react-dialog";
import { Braces, CircleAlert, CircleCheck, Eye, Loader2, Mail, Pencil, RotateCcw, Send, UserRound, UsersRound, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { usePortalContainer } from "@/components/ui/portal";
import { Segmented } from "@/components/ui/Segmented";
import { toast } from "@/components/ui/Toast";
import { ATTENDEE_TEMPLATES, fillTemplate, TEMPLATE_KEYS, TEMPLATE_PARAMS, validateTemplate } from "@/domain/settings";
import type { LocalizedText } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { cn } from "@/lib/cn";
import { useNow } from "@/lib/useNow";
import { settingsService } from "@/services/settings";
import { useDb } from "@/store/app";
import { useViewer } from "@/store/useViewer";
import { builtInTemplate } from "./templates";

type Lang = "en" | "ar";
type TemplateKey = "submitted" | "more_info" | "more_info_reminder" | "approved" | "rejected" | "watchlist_match" | "blacklist_entry_waiting" | "blacklist_match" | "badge_suspended" | "configuration_error" | "new_question" | "report_scheduled";
const asKey = (k: string) => k as TemplateKey;
const FIELD = "block w-full rounded-lg border bg-surface px-3 text-sm text-ink shadow-xs outline-none placeholder:text-ink-3 focus:ring-4";
const fieldTone = (bad: boolean) => (bad ? "border-rose-300 focus:border-rose-400 focus:ring-rose-500/10" : "border-line-strong focus:border-accent focus:ring-accent/10");

/** Sample values for the preview, in the current language. */
function useSamples() {
  const t = useTranslations("settings.emails.samples");
  const tr = useTranslations("reports");
  const fmt = useFormat();
  const db = useDb();
  const now = useNow();
  return useMemo(() => {
    const reg = Object.values(db.registrations)[0];
    return {
      name: t("name"),
      date: fmt.full(new Date(now + db.config.moreInfo.linkDays * 86_400_000).toISOString()),
      id: "VR-1042",
      entry: "BL-0107",
      level: t("level"),
      registration: fmt.text(reg?.name),
      question: t("question"),
      report: tr("names.vettingStatus"),
      frequency: t("frequency"),
      rows: fmt.number(128),
      format: t("format"),
    } as Record<string, string>;
  }, [db.registrations, db.config.moreInfo.linkDays, now, fmt, t, tr]);
}

export function TemplatesTab() {
  const t = useTranslations("settings.emails");
  const to = useTranslations("outbox.templates");
  const fmt = useFormat();
  const db = useDb();
  const now = useNow();
  const [editing, setEditing] = useState<string | null>(null);

  const groups = [
    { id: "attendees", title: t("toAttendees"), hint: t("toAttendeesHint"), icon: UserRound, tone: "bg-sky-100 text-sky-600", keys: TEMPLATE_KEYS.filter((k) => ATTENDEE_TEMPLATES.includes(k)) },
    { id: "staff", title: t("toStaff"), hint: t("toStaffHint"), icon: UsersRound, tone: "bg-violet-100 text-violet-600", keys: TEMPLATE_KEYS.filter((k) => !ATTENDEE_TEMPLATES.includes(k)) },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-3 rounded-xl bg-gradient-to-r from-sky-50 to-violet-50 px-4 py-3.5 ring-1 ring-sky-600/15 ring-inset sm:px-5">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface text-sky-600 shadow-xs ring-1 ring-line">
          <Send className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-ink">{t("title")}</h2>
          <p className="mt-0.5 text-sm text-ink-2">{t("subtitle")}</p>
          <p className="mt-1.5 text-xs font-medium text-sky-800" data-sender-note>
            {t("sender", { address: db.config.senderAddress })}
          </p>
        </div>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        {groups.map((g) => (
          <section key={g.id} aria-labelledby={`tpl-${g.id}`} className="overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-line" data-template-group={g.id}>
            <header className="flex items-start gap-3 border-b border-line px-5 py-4 sm:px-6">
              <span className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-xl", g.tone)}>
                <g.icon className="size-[18px]" />
              </span>
              <div className="min-w-0">
                <h3 id={`tpl-${g.id}`} className="text-base font-bold text-ink">
                  {g.title}
                </h3>
                <p className="mt-0.5 text-sm text-ink-2">{g.hint}</p>
              </div>
            </header>
            <ul className="divide-y divide-line">
              {g.keys.map((k) => {
                const ov = db.emailTemplates?.[k];
                const name = to(`${asKey(k)}.name`);
                const subject = ov ? ov.subject[fmt.locale as Lang] || ov.subject.en : builtInTemplate(k).subject[fmt.locale as Lang];
                const by = ov ? db.users[ov.updatedBy]?.name : null;
                return (
                  <li key={k} data-template={k} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                    <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-lg", ov ? "bg-indigo-50 text-indigo-600" : "bg-subtle text-ink-3")}>
                      <Mail className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-ink">{name}</span>
                        {ov && (
                          <span data-edited className="inline-flex h-5 items-center rounded-md bg-indigo-50 px-1.5 text-2xs font-semibold text-indigo-700 ring-1 ring-indigo-600/15 ring-inset">
                            {t("edited")}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-ink-3">
                        <span dir="auto">{subject}</span>
                      </p>
                      {ov && by && <p className="mt-0.5 text-2xs text-ink-3">{t("editedOn", { time: fmt.ago(ov.updatedAt, now), name: by })}</p>}
                    </div>
                    <Button size="sm" onClick={() => setEditing(k)} aria-label={t("editLabel", { name })}>
                      <Pencil className="size-3.5" />
                      <span className="hidden sm:inline">{t("edit")}</span>
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {editing && <TemplateEditor key={editing} templateKey={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function TemplateEditor({ templateKey, onClose }: { templateKey: string; onClose: () => void }) {
  const t = useTranslations("settings.emails");
  const to = useTranslations("outbox.templates");
  const tc = useTranslations("common");
  const ta = useTranslations("actions.dialogs");
  const ts = useTranslations("settings.save");
  const fmt = useFormat();
  const db = useDb();
  const viewer = useViewer();
  const container = usePortalContainer();
  const samples = useSamples();
  const override = db.emailTemplates?.[templateKey];
  const builtIn = useMemo(() => builtInTemplate(templateKey), [templateKey]);
  const name = to(`${asKey(templateKey)}.name`);
  const allowed = TEMPLATE_PARAMS[templateKey] ?? [];

  const [lang, setLang] = useState<Lang>(fmt.locale === "ar" ? "ar" : "en");
  const [subject, setSubject] = useState<LocalizedText>(() => ({ ...(override?.subject ?? builtIn.subject) }));
  const [body, setBody] = useState<LocalizedText>(() => ({ ...(override?.body ?? builtIn.body) }));
  const [busy, setBusy] = useState<"save" | "reset" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastField = useRef<"subject" | "body">("body");

  const issues = useMemo(() => validateTemplate(templateKey, subject, body), [templateKey, subject, body]);
  const isBuiltIn = JSON.stringify({ subject, body }) === JSON.stringify({ subject: builtIn.subject, body: builtIn.body });
  const unchanged = override ? JSON.stringify({ subject, body }) === JSON.stringify({ subject: override.subject, body: override.body }) : isBuiltIn;
  const badLangs = new Set(issues.map((i) => i.locale));

  const issueText = (i: (typeof issues)[number]) =>
    t(`issues.${i.code}`, { field: t(`fields.${i.field}`), locale: t(`locales.${i.locale}`), placeholder: `{${i.placeholder ?? ""}}` });

  const insert = (p: string) => {
    const token = `{${p}}`;
    const field = lastField.current;
    const el = field === "subject" ? subjectRef.current : bodyRef.current;
    const current = (field === "subject" ? subject : body)[lang];
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const next = current.slice(0, start) + token + current.slice(end);
    const set = field === "subject" ? setSubject : setBody;
    set((v) => ({ ...v, [lang]: next }));
    setError(null);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const save = async () => {
    if (issues.length) return;
    setBusy("save");
    setError(null);
    const r = await settingsService.saveTemplate({ key: templateKey, subject, body, actorId: viewer.id });
    setBusy(null);
    if (!r.ok) {
      setError(ts(`errors.${r.error}`));
      return;
    }
    toast(t("saved", { name }));
    onClose();
  };

  const reset = async () => {
    if (!override) {
      setSubject({ ...builtIn.subject });
      setBody({ ...builtIn.body });
      return;
    }
    setBusy("reset");
    const r = await settingsService.resetTemplate({ key: templateKey, actorId: viewer.id });
    setBusy(null);
    if (!r.ok) return;
    toast(t("resetDone", { name }));
    onClose();
  };

  const filledSubject = fillTemplate(subject[lang], samples);
  const filledBody = fillTemplate(body[lang], samples);
  const dir = lang === "ar" ? "rtl" : "ltr";

  return (
    <RD.Root open onOpenChange={(o) => !o && !busy && onClose()}>
      <RD.Portal container={container}>
        <RD.Overlay className="anim-fade fixed inset-0 z-50 bg-slate-900/20 backdrop-blur-[2px]" />
        <RD.Content
          data-template-editor={templateKey}
          className="anim-pop fixed top-[3vh] left-1/2 z-50 flex max-h-[94vh] w-[calc(100vw-2rem)] max-w-5xl -translate-x-1/2 flex-col rounded-2xl bg-surface shadow-pop ring-1 ring-line outline-none"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            bodyRef.current?.focus();
          }}
        >
          <div className="flex items-start gap-3.5 px-5 pt-5 sm:px-6 sm:pt-6">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <Mail className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <RD.Title className="text-lg font-bold text-ink">{t("editorTitle", { name })}</RD.Title>
              <RD.Description className="mt-1 text-sm text-ink-2">{t("editorDescription")}</RD.Description>
            </div>
            <RD.Close aria-label={tc("close")} disabled={!!busy} className="-me-2 -mt-1 inline-flex size-8 items-center justify-center rounded-lg text-ink-3 hover:bg-hover hover:text-ink">
              <X className="size-4" />
            </RD.Close>
          </div>

          <div className="mt-5 grid min-h-0 flex-1 gap-5 overflow-y-auto px-5 pb-1 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            {/* Editor */}
            <div className="min-w-0 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Segmented<Lang>
                  label={t("language")}
                  value={lang}
                  onChange={setLang}
                  options={(["en", "ar"] as const).map((l) => ({
                    value: l,
                    label: badLangs.has(l) ? `${t(`locales.${l}`)} •` : t(`locales.${l}`),
                    selectedClass: badLangs.has(l) ? "bg-surface text-rose-700 ring-rose-300" : undefined,
                  }))}
                />
              </div>
              <div>
                <label htmlFor="tpl-subject" className="mb-1.5 block text-sm font-semibold text-ink">
                  {t("subject")}
                </label>
                <input
                  id="tpl-subject"
                  ref={subjectRef}
                  dir={dir}
                  lang={lang}
                  value={subject[lang]}
                  onFocus={() => (lastField.current = "subject")}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSubject((s) => ({ ...s, [lang]: v }));
                    setError(null);
                  }}
                  aria-invalid={issues.some((i) => i.field === "subject" && i.locale === lang) || undefined}
                  className={cn(FIELD, "h-9", fieldTone(issues.some((i) => i.field === "subject" && i.locale === lang)))}
                />
              </div>
              <div>
                <label htmlFor="tpl-body" className="mb-1.5 block text-sm font-semibold text-ink">
                  {t("body")}
                </label>
                <textarea
                  id="tpl-body"
                  ref={bodyRef}
                  dir={dir}
                  lang={lang}
                  rows={7}
                  value={body[lang]}
                  onFocus={() => (lastField.current = "body")}
                  onChange={(e) => {
                    const v = e.target.value;
                    setBody((s) => ({ ...s, [lang]: v }));
                    setError(null);
                  }}
                  aria-invalid={issues.some((i) => i.field === "body" && i.locale === lang) || undefined}
                  className={cn(FIELD, "resize-y py-2 leading-relaxed", fieldTone(issues.some((i) => i.field === "body" && i.locale === lang)))}
                />
              </div>
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink-3">
                  <Braces className="size-3.5" />
                  {t("placeholders")}
                </p>
                <ul className="flex flex-wrap gap-1.5">
                  {allowed.map((p) => (
                    <li key={p}>
                      <button
                        type="button"
                        data-chip={p}
                        // Keep the caret where it is in the field.
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => insert(p)}
                        aria-label={t("insert", { placeholder: t(`params.${p as "name"}`) })}
                        className="inline-flex h-7 items-center gap-1.5 rounded-full bg-violet-50 px-2.5 text-xs font-medium text-violet-700 ring-1 ring-violet-600/15 ring-inset outline-none hover:bg-violet-100 focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        <span className="ltr-data font-mono text-2xs" dir="ltr">{`{${p}}`}</span>
                        <span>{t(`params.${p as "name"}`)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <div aria-live="polite" data-template-issues>
                {issues.length ? (
                  <ul className="space-y-1.5">
                    {issues.map((i, n) => (
                      <li key={`${i.code}-${i.field}-${i.locale}-${n}`} className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 ring-1 ring-rose-600/15 ring-inset">
                        <CircleAlert className="mt-px size-3.5 shrink-0" />
                        {issueText(i)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                    <CircleCheck className="size-3.5" />
                    {t("noIssues")}
                  </p>
                )}
              </div>
            </div>

            {/* Preview */}
            <figure className="min-w-0 self-start overflow-hidden rounded-xl ring-1 ring-line lg:sticky lg:top-0" data-template-preview>
              <figcaption className="flex items-center gap-2 border-b border-line bg-subtle px-4 py-2 text-xs font-semibold text-ink-2">
                <Eye className="size-3.5 text-ink-3" />
                {t("preview")}
                <span className="ms-auto rounded-md bg-amber-50 px-1.5 py-0.5 text-2xs font-semibold text-amber-800 ring-1 ring-amber-600/20 ring-inset">{t("sampleNote")}</span>
              </figcaption>
              <dl className="grid grid-cols-[4rem_minmax(0,1fr)] gap-x-3 border-b border-line bg-surface px-4 py-2.5 text-xs">
                <dt className="text-ink-3">{t("from")}</dt>
                <dd className="ltr-data truncate text-ink" data-preview-from>
                  {db.config.senderAddress}
                </dd>
              </dl>
              <div dir={dir} lang={lang} className="bg-surface px-5 py-5">
                <h4 className="text-base font-bold break-words text-ink" data-preview-subject>
                  {filledSubject}
                </h4>
                <p className="mt-3 text-sm leading-relaxed break-words whitespace-pre-line text-ink-2" data-preview-body>
                  {filledBody}
                </p>
                {builtIn.button[lang] && <span className="mt-5 inline-flex h-9 items-center rounded-lg bg-accent px-3.5 text-sm font-semibold text-ink-inverse">{builtIn.button[lang]}</span>}
              </div>
            </figure>
          </div>

          {error && (
            <p role="alert" className="mx-5 mt-4 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 ring-1 ring-rose-600/15 ring-inset sm:mx-6">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2 rounded-b-2xl border-t border-line bg-subtle px-5 py-4 sm:px-6">
            <Button onClick={() => void reset()} disabled={!!busy || (!override && isBuiltIn)} data-reset>
              {busy === "reset" ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
              {t("reset")}
            </Button>
            <div className="ms-auto flex items-center gap-2">
              <Button onClick={onClose} disabled={!!busy}>
                {ta("cancel")}
              </Button>
              <Button variant="primary" onClick={() => void save()} disabled={!!busy || issues.length > 0 || unchanged}>
                {busy === "save" && <Loader2 className="size-4 animate-spin" />}
                {busy === "save" ? t("saving") : t("save")}
              </Button>
            </div>
          </div>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
