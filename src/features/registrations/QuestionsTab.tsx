"use client";

import {
  AlignLeft,
  ArrowUpRight,
  Calendar,
  CircleCheck,
  CircleDot,
  CircleDashed,
  Eye,
  EyeOff,
  Fingerprint,
  Hash,
  Info,
  ListChecks,
  ListPlus,
  Plus,
  Trash2,
  Type,
  Upload,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ActionDialog, DialogIcon } from "@/components/ui/Dialog";
import { Field, TextInput } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { toast } from "@/components/ui/Toast";
import { canHoldId, canUseInVetting, SCREENING_FIELDS, STANDARD_QUESTIONS, type SettingsDraft, type SettingsIssue } from "@/domain/registrations";
import type { FormQuestion, QuestionType, Registration, ScreeningField } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { registrationService } from "@/services/registrations";
import { useDb } from "@/store/app";
import { useViewer } from "@/store/useViewer";
import { Card, MiniSwitch, teamsSeeingQuestion } from "./parts";
import type { DraftPatch } from "./RegistrationDetailPage";

const TYPE_ICON: Record<QuestionType, LucideIcon> = {
  text: Type,
  longText: AlignLeft,
  number: Hash,
  date: Calendar,
  singleChoice: CircleDot,
  multiChoice: ListChecks,
  upload: Upload,
};
const QUESTION_TYPES = Object.keys(TYPE_ICON) as QuestionType[];
/** English label of the standard question that holds each identifier by default. */
const STANDARD_LABEL = Object.fromEntries(STANDARD_QUESTIONS.filter((q) => q.profileField).map((q) => [q.profileField, q.label.en])) as Record<string, string>;
const NONE = "none";

export function QuestionsTab({
  reg,
  draft,
  patch,
  issues,
  openVetting,
}: {
  reg: Registration;
  draft: SettingsDraft;
  patch: DraftPatch;
  issues: SettingsIssue[];
  openVetting: () => void;
}) {
  const t = useTranslations("registrations.questions");
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-5">
      {draft.enabled ? (
        <IdMapping reg={reg} draft={draft} issues={issues} />
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-800 ring-1 ring-sky-600/20 ring-inset">
          <Info className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">{t("mapping.off")}</span>
          <Button size="sm" onClick={openVetting}>
            {t("mapping.openVetting")}
          </Button>
        </div>
      )}

      <Card
        id="form-questions"
        icon={ListChecks}
        tone="bg-indigo-100 text-indigo-600"
        title={t("title")}
        subtitle={t("subtitle")}
        action={
          <Button variant="primary" size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-3.5" strokeWidth={2.5} />
            {t("add")}
          </Button>
        }
      >
        <QuestionGroup icon={UserRound} title={t("standard")} hint={t("standardHint")} questions={STANDARD_QUESTIONS} reg={reg} draft={draft} patch={patch} />
        <QuestionGroup icon={ListPlus} title={t("custom")} hint={t("customHint")} questions={reg.questions} reg={reg} draft={draft} patch={patch} empty={t("noCustom")} />
      </Card>

      {adding && <AddQuestionDialog reg={reg} open onOpenChange={setAdding} />}
    </div>
  );
}

// ─── ID mapping summary (AC23) ──────────────────────────────────────────

function IdMapping({ reg, draft, issues }: { reg: Registration; draft: SettingsDraft; issues: SettingsIssue[] }) {
  const t = useTranslations("registrations.questions");
  const fmt = useFormat();
  const all = [...STANDARD_QUESTIONS, ...reg.questions];
  const noStrongId = issues.some((i) => i.code === "noStrongId");
  const strong: ScreeningField[] = ["nationalId", "passportNo", "nationality"];

  return (
    <section aria-labelledby="id-mapping-title" className="overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-line">
      <div className="flex flex-wrap items-start gap-3.5 px-5 pt-4 pb-3.5 sm:px-6">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-600">
          <Fingerprint className="size-[18px]" strokeWidth={2.1} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="id-mapping-title" className="text-base font-bold text-ink">
            {t("mapping.title")}
          </h2>
          <p className="mt-0.5 max-w-3xl text-sm text-ink-2">{t("mapping.rule")}</p>
        </div>
      </div>
      <ul className="grid grid-cols-2 gap-px border-t border-line bg-line lg:grid-cols-4">
        {SCREENING_FIELDS.map((f) => {
          const q = all.find((x) => x.id === draft.idFields[f]);
          const bad = !q && (f === "fullName" || (noStrongId && strong.includes(f)));
          const warn = !q && f === "dob";
          return (
            <li key={f} data-field={f} data-linked={!!q} className="flex items-start gap-2.5 bg-surface px-4 py-3">
              {q ? (
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" />
              ) : (
                <CircleDashed className={cn("mt-0.5 size-4 shrink-0", bad ? "text-rose-500" : warn ? "text-amber-500" : "text-ink-3")} />
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{t(`fields.${f}`)}</p>
                <p className={cn("truncate text-xs", q ? "text-ink-3" : bad ? "font-medium text-rose-600" : warn ? "font-medium text-amber-700" : "text-ink-3")}>
                  {!q ? t("mapping.missing") : q.label.en === STANDARD_LABEL[f] ? t("mapping.linked") : <span dir="auto">{fmt.text(q.label)}</span>}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ─── Question list ──────────────────────────────────────────────────────

function QuestionGroup({
  icon: Icon,
  title,
  hint,
  questions,
  reg,
  draft,
  patch,
  empty,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  questions: FormQuestion[];
  reg: Registration;
  draft: SettingsDraft;
  patch: DraftPatch;
  empty?: string;
}) {
  const t = useTranslations("registrations.questions");
  return (
    <div className="@container border-b border-line last:border-b-0">
      <div className="flex items-start gap-2.5 bg-subtle px-5 py-3 sm:px-6">
        <Icon className="mt-0.5 size-4 shrink-0 text-ink-3" />
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-ink">{title}</h3>
          <p className="text-xs text-ink-3">{hint}</p>
        </div>
      </div>
      {questions.length > 0 && draft.enabled && (
        <div className="hidden items-center gap-5 border-t border-line px-6 @[46rem]:flex">
          <span className="flex-1" />
          <span className="eyebrow flex h-8 w-32 items-center">{t("useInVetting")}</span>
          <span className="eyebrow flex h-8 w-52 items-center">{t("idField")}</span>
        </div>
      )}
      {questions.length ? (
        <ul className="divide-y divide-line border-t border-line">
          {questions.map((q) => (
            <QuestionRow key={q.id} q={q} reg={reg} draft={draft} patch={patch} />
          ))}
        </ul>
      ) : (
        <p className="border-t border-line px-6 py-6 text-center text-sm text-ink-3">{empty}</p>
      )}
    </div>
  );
}

function QuestionRow({ q, reg, draft, patch }: { q: FormQuestion; reg: Registration; draft: SettingsDraft; patch: DraftPatch }) {
  const t = useTranslations("registrations.questions");
  const fmt = useFormat();
  const db = useDb();
  const all = [...STANDARD_QUESTIONS, ...reg.questions];
  const TypeIcon = TYPE_ICON[q.type];
  const seeing = teamsSeeingQuestion(db, reg.id, q).length;
  const newHidden = !!q.addedAt && seeing === 0;
  const label = fmt.text(q.label);
  const mapped = (Object.keys(draft.idFields) as ScreeningField[]).find((f) => draft.idFields[f] === q.id) ?? NONE;

  const setIdField = (v: string) => {
    const next = { ...draft.idFields };
    for (const f of SCREENING_FIELDS) if (next[f] === q.id) delete next[f];
    if (v !== NONE) next[v as ScreeningField] = q.id;
    patch({ idFields: next });
  };
  const setUse = (on: boolean) =>
    patch({ vettingQuestions: on ? [...draft.vettingQuestions.filter((x) => x !== q.id), q.id] : draft.vettingQuestions.filter((x) => x !== q.id) });

  return (
    <li data-question={q.id} className={cn("flex flex-col gap-3 px-5 py-3.5 sm:px-6 @[46rem]:flex-row @[46rem]:items-center @[46rem]:gap-5", newHidden && "bg-violet-50/50")}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-hover text-ink-2">
          <TypeIcon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span dir="auto" className="text-sm font-semibold text-ink">
              {label}
            </span>
            {q.required && <span className="rounded-md bg-rose-50 px-1.5 text-2xs font-semibold text-rose-700 ring-1 ring-rose-600/15 ring-inset">{t("required")}</span>}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
            <span>{t(`types.${q.type}`)}</span>
            <span aria-hidden>·</span>
            {newHidden ? (
              <>
                <span className="inline-flex h-5 items-center gap-1 rounded-md bg-violet-50 px-1.5 text-2xs font-semibold text-violet-700 ring-1 ring-violet-600/15 ring-inset">
                  <EyeOff className="size-3" />
                  {t("newHidden")}
                </span>
                <Link href="/teams" className="inline-flex items-center gap-0.5 font-semibold text-violet-700 hover:underline">
                  {t("grantAccess")}
                  <ArrowUpRight className="size-3 rtl:-scale-x-100" />
                </Link>
              </>
            ) : (
              <span className="inline-flex items-center gap-1">
                {seeing ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
                {t("visibleTo", { count: seeing, n: fmt.number(seeing) })}
              </span>
            )}
            {q.addedAt && (
              <>
                <span aria-hidden>·</span>
                <span>{t("added", { date: fmt.date(q.addedAt) })}</span>
              </>
            )}
          </p>
        </div>
      </div>

      {draft.enabled && (
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3 ps-11 @[46rem]:flex-nowrap @[46rem]:ps-0">
          <div className="w-32">
            <p className="eyebrow mb-1.5 @[46rem]:hidden">{t("useInVetting")}</p>
            {canUseInVetting(q) ? (
              <div className="flex h-9 items-center">
                <MiniSwitch label={t("useInVettingFor", { question: label })} checked={draft.vettingQuestions.includes(q.id)} onChange={setUse} />
              </div>
            ) : (
              <p className="flex h-9 items-center text-xs text-ink-3">{q.profileField ? t("profileDetail") : t("notForVetting")}</p>
            )}
          </div>
          <div className="w-52">
            <p className="eyebrow mb-1.5 @[46rem]:hidden">{t("idField")}</p>
            {canHoldId(q) ? (
              <Select
                label={t("idFieldFor", { question: label })}
                value={mapped}
                onChange={setIdField}
                options={[
                  { value: NONE, label: t("idNone") },
                  ...SCREENING_FIELDS.map((f) => {
                    const holder = all.find((x) => x.id === draft.idFields[f] && x.id !== q.id);
                    return { value: f, label: t(`fields.${f}`), hint: holder ? fmt.text(holder.label) : undefined, marker: <Fingerprint className="size-3.5 shrink-0 text-teal-600" /> };
                  }),
                ]}
              />
            ) : (
              <p className="flex h-9 items-center text-xs text-ink-3">{t("idUnavailable")}</p>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

// ─── Add question (AC29) ────────────────────────────────────────────────

function AddQuestionDialog({ reg, open, onOpenChange }: { reg: Registration; open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations("registrations.questions");
  const td = useTranslations("registrations.questions.dialog");
  const te = useTranslations("registrations.save.errors");
  const fmt = useFormat();
  const viewer = useViewer();
  const [en, setEn] = useState("");
  const [ar, setAr] = useState("");
  const [type, setType] = useState<QuestionType>("text");
  const [options, setOptions] = useState([
    { en: "", ar: "" },
    { en: "", ar: "" },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const choice = type === "singleChoice" || type === "multiChoice";

  const submit = async () => {
    setBusy(true);
    setError(null);
    const r = await registrationService.addQuestion({ registrationId: reg.id, actorId: viewer.id, question: { label: { en, ar }, type, options: choice ? options : [] } });
    setBusy(false);
    if (r.ok) {
      toast(td("added"));
      onOpenChange(false);
    } else {
      setError(te(r.error));
    }
  };

  const setOption = (i: number, p: Partial<{ en: string; ar: string }>) => setOptions((o) => o.map((x, n) => (n === i ? { ...x, ...p } : x)));

  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      wide
      title={td("title")}
      description={td("description")}
      icon={
        <DialogIcon className="bg-indigo-100 text-indigo-600">
          <ListPlus className="size-5" />
        </DialogIcon>
      }
      confirmLabel={td("confirm")}
      busy={busy}
      error={error}
      confirmDisabled={!en.trim()}
      onConfirm={() => void submit()}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={td("labelEn")} htmlFor="q-label-en">
          <TextInput id="q-label-en" dir="ltr" lang="en" value={en} maxLength={120} placeholder={td("labelPlaceholder")} onChange={(e) => setEn(e.target.value)} />
        </Field>
        <Field label={td("labelAr")} htmlFor="q-label-ar" hint={td("optional")}>
          <TextInput id="q-label-ar" dir="rtl" lang="ar" value={ar} maxLength={120} onChange={(e) => setAr(e.target.value)} />
        </Field>
      </div>
      <Field label={td("type")}>
        <Select
          label={td("type")}
          value={type}
          onChange={(v) => setType(v as QuestionType)}
          options={QUESTION_TYPES.map((x) => {
            const Icon = TYPE_ICON[x];
            return { value: x, label: t(`types.${x}`), marker: <Icon className="size-4 shrink-0 text-ink-3" /> };
          })}
          className="sm:max-w-72"
        />
      </Field>
      {choice && (
        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <p className="text-sm font-semibold text-ink">{td("options")}</p>
            <span className="text-xs text-ink-3">{td("optionsHint")}</span>
          </div>
          <ul className="space-y-2">
            {options.map((o, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="tabular w-5 shrink-0 text-center text-xs font-semibold text-ink-3">{fmt.number(i + 1)}</span>
                <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                  <TextInput aria-label={td("optionEn", { n: fmt.number(i + 1) })} dir="ltr" lang="en" value={o.en} onChange={(e) => setOption(i, { en: e.target.value })} />
                  <TextInput aria-label={td("optionAr", { n: fmt.number(i + 1) })} dir="rtl" lang="ar" value={o.ar} onChange={(e) => setOption(i, { ar: e.target.value })} />
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  aria-label={td("removeOption", { n: fmt.number(i + 1) })}
                  disabled={options.length <= 2}
                  onClick={() => setOptions((x) => x.filter((_, n) => n !== i))}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => setOptions((x) => [...x, { en: "", ar: "" }])}>
            <Plus className="size-3.5" />
            {td("addOption")}
          </Button>
        </div>
      )}
      <p className="flex items-start gap-2 rounded-lg bg-violet-50 px-3 py-2.5 text-sm text-violet-800 ring-1 ring-violet-600/15 ring-inset">
        <EyeOff className="mt-0.5 size-4 shrink-0" />
        {td("hiddenNote")}
      </p>
    </ActionDialog>
  );
}
