"use client";

import { Check, Paperclip } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { TextArea, TextInput } from "@/components/ui/Field";
import { Select, type SelectOption } from "@/components/ui/Select";
import type { FormQuestion } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { cn } from "@/lib/cn";
import { SAMPLE_FILES } from "./presets";

/** Identifiers, contact details and dates read left to right in both languages. */
const LTR_FIELDS = new Set(["std_email", "std_mobile", "std_nationalId", "std_passportNo"]);
const MONO_FIELDS = new Set(["std_nationalId", "std_passportNo"]);

export const fieldDomId = (id: string) => `sim-${id}`;

function FieldShell({
  q,
  label,
  error,
  hint,
  wide,
  children,
}: {
  q: FormQuestion;
  label: string;
  error: boolean;
  hint?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("simulate.form");
  return (
    <div className={cn("min-w-0", wide && "sm:col-span-2")} data-question={q.id}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={fieldDomId(q.id)} className="text-sm font-semibold text-ink">
          {label}
          {q.required && (
            <span className="ms-0.5 text-rose-600" aria-hidden>
              *
            </span>
          )}
          {q.required && <span className="sr-only"> ({t("requiredMark")})</span>}
        </label>
        {hint && <span className="text-xs text-ink-3">{hint}</span>}
      </div>
      {children}
      {error && (
        <p id={`${fieldDomId(q.id)}-error`} data-field-error className="mt-1.5 text-xs font-medium text-rose-700">
          {t("fieldRequired")}
        </p>
      )}
    </div>
  );
}

/** One form question with the control for its type. */
export function QuestionField({
  q,
  value,
  error,
  countries,
  onChange,
}: {
  q: FormQuestion;
  value: string | string[] | undefined;
  error: boolean;
  countries: SelectOption[];
  onChange: (v: string | string[]) => void;
}) {
  const t = useTranslations("simulate.form");
  const fmt = useFormat();
  const label = fmt.text(q.label);
  const id = fieldDomId(q.id);
  const text = typeof value === "string" ? value : "";
  const list = Array.isArray(value) ? value : [];
  const described = error ? `${id}-error` : undefined;

  if (q.id === "std_nationality") {
    return (
      <FieldShell q={q} label={label} error={error}>
        <Select label={label} placeholder={t("chooseCountry")} searchable invalid={error} value={text || null} onChange={onChange} options={countries} />
      </FieldShell>
    );
  }

  switch (q.type) {
    case "singleChoice":
      return (
        <FieldShell q={q} label={label} error={error}>
          <Select
            label={label}
            placeholder={t("choose")}
            invalid={error}
            value={text || null}
            onChange={onChange}
            options={(q.options ?? []).map((o) => ({ value: o.value, label: fmt.text(o.label) }))}
          />
        </FieldShell>
      );
    case "multiChoice":
      return (
        <FieldShell q={q} label={label} error={error} wide>
          <div role="group" aria-label={label} aria-describedby={described} className="flex flex-wrap gap-1.5">
            {(q.options ?? []).map((o) => {
              const on = list.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChange(on ? list.filter((x) => x !== o.value) : [...list, o.value])}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium ring-1 transition-colors ring-inset",
                    on ? "bg-accent-soft text-accent-text ring-indigo-300" : "bg-surface text-ink-2 ring-line-strong hover:bg-subtle",
                    error && !on && "ring-rose-300",
                  )}
                >
                  {on && <Check className="size-3.5" strokeWidth={3} />}
                  {fmt.text(o.label)}
                </button>
              );
            })}
          </div>
        </FieldShell>
      );
    case "longText":
      return (
        <FieldShell q={q} label={label} error={error} wide>
          <TextArea
            id={id}
            rows={3}
            aria-describedby={described}
            aria-invalid={error || undefined}
            className={error ? "border-rose-300" : undefined}
            value={text}
            onChange={(e) => onChange(e.target.value)}
          />
        </FieldShell>
      );
    case "upload":
      return (
        <FieldShell q={q} label={label} error={error} hint={t("uploadHint")} wide>
          <div className="relative" dir="ltr">
            <Paperclip className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
            <TextInput
              id={id}
              dir="ltr"
              invalid={error}
              aria-describedby={described}
              placeholder={t("uploadPlaceholder")}
              className="ps-8 text-start"
              value={text}
              onChange={(e) => onChange(e.target.value)}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-ink-3">{t("sampleFiles")}</span>
            {SAMPLE_FILES.map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={text === f}
                onClick={() => onChange(f)}
                className={cn(
                  "ltr-data inline-flex h-6 items-center rounded-md px-2 font-mono text-2xs ring-1 transition-colors ring-inset",
                  text === f ? "bg-violet-50 text-violet-700 ring-violet-600/20" : "bg-subtle text-ink-2 ring-line hover:bg-hover",
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </FieldShell>
      );
    default: {
      const type = q.type === "date" ? "date" : q.type === "number" ? "number" : q.id === "std_email" ? "email" : q.id === "std_mobile" ? "tel" : "text";
      const ltr = LTR_FIELDS.has(q.id) || q.type === "date" || q.type === "number";
      return (
        <FieldShell q={q} label={label} error={error}>
          <TextInput
            id={id}
            type={type}
            dir={ltr ? "ltr" : "auto"}
            invalid={error}
            aria-describedby={described}
            className={cn(ltr && "text-start", MONO_FIELDS.has(q.id) && "font-mono")}
            value={text}
            onChange={(e) => onChange(e.target.value)}
          />
        </FieldShell>
      );
    }
  }
}

