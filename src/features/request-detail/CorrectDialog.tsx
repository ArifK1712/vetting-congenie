"use client";

import { PenLine, ScanSearch } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { ActionDialog, DialogIcon } from "@/components/ui/Dialog";
import { Field, TextArea, TextInput } from "@/components/ui/Field";
import { MultiSelect, Select } from "@/components/ui/Select";
import { useFormat } from "@/i18n/format";
import { requestService } from "@/services/requests";
import { useRequestAction } from "@/features/requests/useRequestAction";
import type { RequestView } from "@/queries/requestView";

/** Profile fields used for list screening: correcting one re-runs the check (15.2). */
const SCREENED = new Set(["email", "mobile", "nationalId", "passportNo", "nationality", "dob", "company"]);
const LTR = new Set(["email", "mobile", "nationalId", "passportNo"]);

/** Human label for a field key ("profile.email", "answer.q_purpose"). */
export function useFieldLabel(view: RequestView) {
  const t = useTranslations("requestDetail.fields");
  const fmt = useFormat();
  return (key: string) => {
    const [source, k] = key.split(".");
    if (source === "profile") return t(k as "email");
    const q = view.registration.questions.find((x) => x.id === k);
    return q ? fmt.text(q.label) : k;
  };
}

export function CorrectDialog({ view, revision, field, onClose, onDone }: { view: RequestView; revision: number; field: string; onClose: () => void; onDone: () => void }) {
  const t = useTranslations("requestDetail.correct");
  const tt = useTranslations("actions.toasts");
  const fmt = useFormat();
  const label = useFieldLabel(view)(field);
  const { busy, error, run } = useRequestAction();
  const [source, key] = field.split(".");
  const question = source === "answer" ? view.registration.questions.find((q) => q.id === key) : undefined;
  const current = source === "profile" ? (view.attendee.profile as unknown as Record<string, string | undefined>)[key] : view.attendee.answers[key];
  const [value, setValue] = useState<string | string[]>(() => (Array.isArray(current) ? [...current] : (current ?? "")));
  const [reason, setReason] = useState("");

  const countries = useMemo(
    () =>
      view.nationalities
        .map((c) => ({ value: c, label: fmt.country(c) }))
        .sort((a, b) => a.label.localeCompare(b.label, fmt.locale)),
    [view.nationalities, fmt],
  );
  const options = question?.options?.map((o) => ({ value: o.value, label: fmt.text(o.label) }));

  const shown = (v: unknown) => {
    if (Array.isArray(v)) return v.map((x) => options?.find((o) => o.value === x)?.label ?? x).join(", ");
    if (!v) return "—";
    if (key === "nationality") return fmt.country(String(v));
    if (key === "dob" || question?.type === "date") return fmt.day(String(v));
    return options?.find((o) => o.value === v)?.label ?? String(v);
  };

  let input;
  if (key === "nationality") input = <Select label={t("value")} placeholder={t("choose")} searchable value={value as string} onChange={setValue} options={countries} />;
  else if (options && question?.type === "multiChoice") input = <MultiSelect label={t("value")} placeholder={t("choose")} options={options} value={value as string[]} summary={(l) => l.join(", ")} onChange={setValue} />;
  else if (options) input = <Select label={t("value")} placeholder={t("choose")} value={value as string} onChange={setValue} options={options} />;
  else if (question?.type === "longText") input = <TextArea id="correct-value" rows={3} value={value as string} onChange={(e) => setValue(e.target.value)} />;
  else
    input = (
      <TextInput
        id="correct-value"
        type={key === "dob" || question?.type === "date" ? "date" : question?.type === "number" ? "number" : key === "email" ? "email" : "text"}
        dir={LTR.has(key) || key === "dob" ? "ltr" : "auto"}
        className={key === "nationalId" || key === "passportNo" ? "font-mono" : undefined}
        value={value as string}
        onChange={(e) => setValue(e.target.value)}
      />
    );

  return (
    <ActionDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("title", { field: label })}
      description={t("description")}
      icon={
        <DialogIcon className="bg-violet-50 text-violet-600">
          <PenLine className="size-5" />
        </DialogIcon>
      }
      confirmLabel={t("confirm")}
      busy={busy}
      error={error}
      confirmDisabled={Array.isArray(value) ? !value.length : !String(value).trim()}
      onConfirm={() =>
        run(
          () => requestService.correct({ requestId: view.request.id, actorId: view.viewer.id, expectedRevision: revision, field, value, reason }),
          (r) => (r.outcome === "screeningHold" ? tt("correctedHold", { field: label, id: view.request.id }) : tt("corrected", { field: label })),
          onDone,
        )
      }
    >
      <Field label={t("current")}>
        <p dir="auto" className="rounded-lg bg-subtle px-3 py-2 text-sm text-ink-2 ring-1 ring-line">
          {shown(current)}
        </p>
      </Field>
      <Field label={t("value")} htmlFor="correct-value">
        {input}
      </Field>
      <Field label={t("reason")} hint={t("optional")} htmlFor="correct-reason">
        <TextArea id="correct-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("reasonPlaceholder")} />
      </Field>
      {source === "profile" && SCREENED.has(key) && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800 ring-1 ring-amber-600/20 ring-inset">
          <ScanSearch className="mt-0.5 size-4 shrink-0" />
          {t("rescreen")}
        </p>
      )}
    </ActionDialog>
  );
}
