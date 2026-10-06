"use client";

import { CircleAlert, Clock3, Fingerprint, Info, Link2, Lock, Mail, RotateCcw, ScanSearch, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/Field";
import { Tooltip } from "@/components/ui/Tooltip";
import { LIMITS, SPEC_DEFAULTS, thresholdImpact, type ConfigDraft, type ConfigIssue } from "@/domain/settings";
import { useFormat } from "@/i18n/format";
import { cn } from "@/lib/cn";
import { useDb } from "@/store/app";
import { useViewer } from "@/store/useViewer";
import { Card } from "@/features/registrations/parts";
import type { ConfigPatch } from "./SettingsPage";

type FieldKey = ConfigIssue["field"];

/** Text for a General settings issue. */
function useConfigIssueText() {
  const t = useTranslations("settings.issues");
  const fmt = useFormat();
  return (i: ConfigIssue, draft: ConfigDraft) => {
    const range = i.code === "linkDaysRange" ? LIMITS.linkDays : i.code === "reminderRange" ? LIMITS.reminderHours : LIMITS.threshold;
    return t(i.code, { min: fmt.number(range.min), max: fmt.number(range.max), hours: fmt.number((draft.moreInfo.linkDays || 0) * 24) });
  };
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setV(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return v;
}

export function GeneralTab({ draft, patch, issues }: { draft: ConfigDraft; patch: ConfigPatch; issues: ConfigIssue[] }) {
  const t = useTranslations("settings.general");
  const fmt = useFormat();
  const viewer = useViewer();
  const issueText = useConfigIssueText();
  const canMatch = viewer.can("blacklist.approve");

  const errorsFor = (f: FieldKey) => issues.filter((i) => i.field === f).map((i) => issueText(i, draft));
  const num = (v: string) => (v.trim() === "" ? Number.NaN : Number(v));
  const isDefaultMatching = draft.matching.nameWithDob === SPEC_DEFAULTS.matching.nameWithDob && draft.matching.nameOnly === SPEC_DEFAULTS.matching.nameOnly;

  const lockedHint = (
    <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-600/20 ring-inset" data-locked-thresholds>
      <Lock className="size-3" />
      {t("matching.lockedShort")}
    </span>
  );

  return (
    <div className="grid items-start gap-5 xl:grid-cols-2">
      {/* ── List matching (9.4) ── */}
      <div className="xl:col-span-2">
        <Card
          id="matching"
          icon={ScanSearch}
          tone="bg-violet-100 text-violet-600"
          title={t("matching.title")}
          subtitle={t("matching.subtitle")}
          invalid={errorsFor("nameWithDob").length + errorsFor("nameOnly").length > 0}
          action={
            canMatch ? (
              <Button size="sm" variant="ghost" onClick={() => patch({ matching: { ...SPEC_DEFAULTS.matching } })} disabled={isDefaultMatching}>
                <RotateCcw className="size-3.5" />
                {t("matching.reset")}
              </Button>
            ) : (
              <Tooltip content={t("matching.locked")}>
                <span tabIndex={0} className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent">
                  {lockedHint}
                </span>
              </Tooltip>
            )
          }
        >
          <div className="grid gap-5 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
            <div className="space-y-5">
              <ThresholdField
                field="nameWithDob"
                label={t("matching.nameWithDob")}
                hint={t("matching.nameWithDobHint")}
                strength={t("matching.strong")}
                strengthTone="bg-rose-50 text-rose-700 ring-rose-600/15"
                value={draft.matching.nameWithDob}
                defaultValue={SPEC_DEFAULTS.matching.nameWithDob}
                errors={errorsFor("nameWithDob")}
                disabled={!canMatch}
                lockedTip={t("matching.locked")}
                onChange={(v) => patch({ matching: { ...draft.matching, nameWithDob: v } })}
              />
              <ThresholdField
                field="nameOnly"
                label={t("matching.nameOnly")}
                hint={t("matching.nameOnlyHint")}
                strength={t("matching.possible")}
                strengthTone="bg-amber-50 text-amber-800 ring-amber-600/20"
                value={draft.matching.nameOnly}
                defaultValue={SPEC_DEFAULTS.matching.nameOnly}
                errors={errorsFor("nameOnly")}
                disabled={!canMatch}
                lockedTip={t("matching.locked")}
                onChange={(v) => patch({ matching: { ...draft.matching, nameOnly: v } })}
              />
              <p className="flex items-start gap-2 rounded-lg bg-sky-50 px-3 py-2.5 text-sm text-sky-800 ring-1 ring-sky-600/20 ring-inset">
                <Fingerprint className="mt-0.5 size-4 shrink-0" />
                {t("matching.exactNote")}
              </p>
            </div>
            <ImpactPreview matching={draft.matching} />
          </div>
        </Card>
      </div>

      {/* ── More Information link (8.5, 16) ── */}
      <Card
        id="more-info"
        icon={Link2}
        tone="bg-amber-100 text-amber-700"
        title={t("moreInfo.title")}
        subtitle={t("moreInfo.subtitle")}
        invalid={errorsFor("linkDays").length + errorsFor("reminderHours").length > 0}
      >
        <div className="space-y-5 px-5 py-5 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              field="linkDays"
              label={t("moreInfo.linkDays")}
              hint={t("moreInfo.linkDaysHint", { min: fmt.number(LIMITS.linkDays.min), max: fmt.number(LIMITS.linkDays.max), d: fmt.number(SPEC_DEFAULTS.moreInfo.linkDays) })}
              value={draft.moreInfo.linkDays}
              min={LIMITS.linkDays.min}
              max={LIMITS.linkDays.max}
              unit={t("moreInfo.days", { count: Number.isFinite(draft.moreInfo.linkDays) ? draft.moreInfo.linkDays : 0 })}
              errors={errorsFor("linkDays")}
              onChange={(v) => patch({ moreInfo: { ...draft.moreInfo, linkDays: num(v) } })}
            />
            <NumberField
              field="reminderHours"
              label={t("moreInfo.reminderHours")}
              hint={t("moreInfo.reminderHoursHint", { min: fmt.number(LIMITS.reminderHours.min), max: fmt.number(LIMITS.reminderHours.max), d: fmt.number(SPEC_DEFAULTS.moreInfo.reminderHours) })}
              value={draft.moreInfo.reminderHours}
              min={LIMITS.reminderHours.min}
              max={LIMITS.reminderHours.max}
              unit={t("moreInfo.hours", { count: Number.isFinite(draft.moreInfo.reminderHours) ? draft.moreInfo.reminderHours : 0 })}
              errors={errorsFor("reminderHours")}
              onChange={(v) => patch({ moreInfo: { ...draft.moreInfo, reminderHours: num(v) } })}
            />
          </div>
          <LinkTimeline linkDays={draft.moreInfo.linkDays} reminderHours={draft.moreInfo.reminderHours} />
          <Note>{t("moreInfo.note")}</Note>
        </div>
      </Card>

      {/* ── Sender address (16) ── */}
      <Card id="emails" icon={Mail} tone="bg-sky-100 text-sky-600" title={t("emails.title")} subtitle={t("emails.subtitle")} invalid={errorsFor("senderAddress").length > 0}>
        <div className="space-y-5 px-5 py-5 sm:px-6">
          <FieldShell label={t("emails.sender")} hint={t("emails.senderHint", { address: SPEC_DEFAULTS.senderAddress })} errors={errorsFor("senderAddress")}>
            {(id, describedBy) => (
              <TextInput
                id={id}
                type="email"
                dir="ltr"
                data-field="senderAddress"
                aria-describedby={describedBy}
                value={draft.senderAddress}
                invalid={errorsFor("senderAddress").length > 0}
                onChange={(e) => patch({ senderAddress: e.target.value })}
                className="ltr-data sm:max-w-96"
              />
            )}
          </FieldShell>
          <Note>{t("emails.note")}</Note>
        </div>
      </Card>
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-xs text-ink-3">
      <Info className="mt-px size-3.5 shrink-0" />
      {children}
    </p>
  );
}

function FieldErrors({ id, errors }: { id: string; errors: string[] }) {
  if (!errors.length) return null;
  return (
    <ul id={id} className="mt-1.5 space-y-1" data-field-errors>
      {errors.map((e) => (
        <li key={e} className="flex items-start gap-1.5 text-xs font-medium text-rose-700">
          <CircleAlert className="mt-px size-3.5 shrink-0" />
          {e}
        </li>
      ))}
    </ul>
  );
}

function FieldShell({ label, hint, errors, children }: { label: string; hint?: string; errors: string[]; children: (id: string, describedBy?: string) => ReactNode }) {
  const id = useId();
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <label htmlFor={id} className="text-sm font-semibold text-ink">
          {label}
        </label>
        {hint && <span className="ltr-data text-xs text-ink-3">{hint}</span>}
      </div>
      {children(id, errors.length ? `${id}-err` : undefined)}
      <FieldErrors id={`${id}-err`} errors={errors} />
    </div>
  );
}

function NumberField({
  field,
  label,
  hint,
  value,
  min,
  max,
  unit,
  errors,
  onChange,
}: {
  field: FieldKey;
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  errors: string[];
  onChange: (v: string) => void;
}) {
  return (
    <FieldShell label={label} hint={hint} errors={errors}>
      {(id, describedBy) => (
        <div className="flex items-center gap-2">
          <TextInput
            id={id}
            type="number"
            inputMode="numeric"
            dir="ltr"
            min={min}
            max={max}
            step={1}
            data-field={field}
            aria-describedby={describedBy}
            value={Number.isFinite(value) ? value : ""}
            invalid={errors.length > 0}
            onChange={(e) => onChange(e.target.value)}
            className="tabular w-24 text-center"
          />
          <span className="text-sm text-ink-2">{unit}</span>
        </div>
      )}
    </FieldShell>
  );
}

function ThresholdField({
  field,
  label,
  hint,
  strength,
  strengthTone,
  value,
  defaultValue,
  errors,
  disabled,
  lockedTip,
  onChange,
}: {
  field: "nameWithDob" | "nameOnly";
  label: string;
  hint: string;
  strength: string;
  strengthTone: string;
  value: number;
  defaultValue: number;
  errors: string[];
  disabled: boolean;
  lockedTip: string;
  onChange: (v: number) => void;
}) {
  const t = useTranslations("settings.general.matching");
  const fmt = useFormat();
  const id = useId();
  const { min, max } = LIMITS.threshold;
  const shown = Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

  const control = (
    <div className={cn("rounded-xl px-4 py-3.5 ring-1 ring-inset", errors.length ? "bg-rose-50/60 ring-rose-200" : "bg-subtle ring-line", disabled && "opacity-70")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <label htmlFor={id} className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
            {label}
            <span className={cn("inline-flex h-5 items-center rounded-md px-1.5 text-2xs font-semibold ring-1 ring-inset", strengthTone)}>{strength}</span>
          </label>
          <p className="mt-0.5 text-xs text-ink-3">
            {hint} · {t("specDefault", { n: fmt.number(defaultValue) })}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-ink-3" aria-hidden>
            ≥
          </span>
          <TextInput
            id={id}
            type="number"
            inputMode="numeric"
            dir="ltr"
            min={min}
            max={max}
            step={1}
            data-field={field}
            disabled={disabled}
            aria-describedby={errors.length ? `${id}-err` : undefined}
            value={Number.isFinite(value) ? value : ""}
            invalid={errors.length > 0}
            onChange={(e) => onChange(e.target.value.trim() === "" ? Number.NaN : Number(e.target.value))}
            className="tabular w-20 text-center disabled:cursor-not-allowed"
          />
          <span className="text-sm font-semibold text-ink-2">%</span>
        </div>
      </div>
      <div className="mt-3" dir="ltr">
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={shown}
          disabled={disabled}
          aria-label={label}
          tabIndex={-1}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-5 w-full cursor-pointer accent-indigo-600 disabled:cursor-not-allowed"
        />
        <div className="tabular mt-1 flex justify-between text-2xs text-ink-3" aria-hidden>
          <span>{fmt.number(min)} %</span>
          <span className="font-semibold text-accent-text">{fmt.number(shown)} %</span>
          <span>{fmt.number(max)} %</span>
        </div>
      </div>
      <FieldErrors id={`${id}-err`} errors={errors} />
    </div>
  );

  return disabled ? (
    <Tooltip content={lockedTip}>
      <div tabIndex={0} className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-accent">
        {control}
      </div>
    </Tooltip>
  ) : (
    control
  );
}

function ImpactPreview({ matching }: { matching: ConfigDraft["matching"] }) {
  const t = useTranslations("settings.general.impact");
  const fmt = useFormat();
  const db = useDb();
  const debounced = useDebounced(matching, 300);
  const valid = Number.isFinite(debounced.nameWithDob) && Number.isFinite(debounced.nameOnly);
  const impact = useMemo(() => (valid ? thresholdImpact(db, debounced) : null), [db, debounced, valid]);
  const pending = debounced !== matching;

  return (
    <aside
      aria-live="polite"
      data-impact
      data-pending={pending || undefined}
      className="relative overflow-hidden rounded-xl bg-gradient-to-br from-violet-50 via-surface to-sky-50 p-4 ring-1 ring-violet-600/15 ring-inset"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="size-4 text-violet-600" />
        <h3 className="text-sm font-bold text-ink">{t("title")}</h3>
        <span className="inline-flex h-5 items-center rounded-md bg-violet-100 px-1.5 text-2xs font-semibold text-violet-700">{t("badge")}</span>
        {pending && <span className="ms-auto text-2xs font-medium text-ink-3">{t("checking")}</span>}
      </div>
      {impact && (
        <div className={cn("transition-opacity", pending && "opacity-60")}>
          <p className="mt-3 text-xs text-ink-2">{t("summary", { count: impact.checked, n: fmt.number(impact.checked) })}</p>
          <p className="mt-1 text-sm font-semibold text-ink" data-impact-requests={impact.proposed.requests}>
            {t("requests", { count: impact.proposed.requests, n: fmt.number(impact.proposed.requests) })}{" "}
            <span className="font-normal text-ink-3">{t("now", { n: fmt.number(impact.current.requests) })}</span>
          </p>
          <p className="tabular mt-2 text-sm" data-impact-delta title={t("deltaHint", { added: fmt.number(impact.added), removed: fmt.number(impact.removed) })}>
            <span className="sr-only">{t("deltaHint", { added: fmt.number(impact.added), removed: fmt.number(impact.removed) })}</span>
            <span aria-hidden className="inline-flex items-center gap-1 rounded-md bg-surface px-2 py-0.5 font-semibold ring-1 ring-line ring-inset" dir="ltr">
              <span className={impact.added ? "text-rose-700" : "text-ink-3"}>+{fmt.number(impact.added)}</span>
              <span className="text-ink-3">/</span>
              <span className={impact.removed ? "text-emerald-700" : "text-ink-3"}>−{fmt.number(impact.removed)}</span>
            </span>
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-2">
            <Stat label={t("strongCount")} now={impact.current.strong} next={impact.proposed.strong} tone="text-rose-700" />
            <Stat label={t("possibleCount")} now={impact.current.possible} next={impact.proposed.possible} tone="text-amber-800" />
          </dl>
        </div>
      )}
      <p className="mt-3 flex items-start gap-1.5 text-2xs leading-relaxed text-ink-3">
        <Info className="mt-px size-3 shrink-0" />
        {t("note")}
      </p>
    </aside>
  );
}

function Stat({ label, now, next, tone }: { label: string; now: number; next: number; tone: string }) {
  const fmt = useFormat();
  return (
    <div className="rounded-lg bg-surface px-3 py-2 ring-1 ring-line ring-inset">
      <dt className="text-2xs font-semibold text-ink-3">{label}</dt>
      <dd className="tabular mt-0.5 flex items-baseline gap-1.5" dir="ltr">
        <span className={cn("text-lg font-bold", tone)}>{fmt.number(next)}</span>
        {now !== next && <span className="text-xs text-ink-3 line-through">{fmt.number(now)}</span>}
      </dd>
    </div>
  );
}

function LinkTimeline({ linkDays, reminderHours }: { linkDays: number; reminderHours: number }) {
  const t = useTranslations("settings.general.moreInfo");
  const fmt = useFormat();
  const total = Number.isFinite(linkDays) && linkDays > 0 ? linkDays * 24 : 0;
  const valid = total > 0 && Number.isFinite(reminderHours) && reminderHours > 0 && reminderHours < total;
  const at = valid ? total - reminderHours : 0;
  const pct = valid ? Math.max(4, Math.min(96, (at / total) * 100)) : 0;
  const HOUR = 3_600_000;
  return (
    <div className="rounded-xl bg-subtle px-4 pt-3 pb-4 ring-1 ring-line ring-inset" data-timeline>
      <div className="flex items-center justify-between text-2xs font-semibold text-ink-3">
        <span>{t("sent")}</span>
        <span>{t("ends")}</span>
      </div>
      <div className="relative mt-2 h-2 rounded-full bg-gradient-to-r from-sky-200 to-amber-200 rtl:bg-gradient-to-l">
        {valid && (
          <span className="absolute top-1/2 -translate-y-1/2 rtl:translate-x-1/2 ltr:-translate-x-1/2" style={{ insetInlineStart: `${pct}%` }}>
            <span className="block size-3.5 rounded-full bg-amber-500 ring-2 ring-surface" />
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <Clock3 className="size-3.5 text-amber-600" />
          {t("reminder")}: <span className="tabular font-semibold text-ink">{valid ? fmt.duration(at * HOUR) : "—"}</span>
        </span>
        <span className="tabular font-semibold text-ink">{total ? fmt.duration(total * HOUR) : "—"}</span>
      </div>
    </div>
  );
}
