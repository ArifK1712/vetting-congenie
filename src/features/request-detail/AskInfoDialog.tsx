"use client";

import { MessageCircleQuestion, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ActionDialog, DialogIcon } from "@/components/ui/Dialog";
import { Field, TextArea, TextInput } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { MAPPABLE_FIELDS, MAX_QUESTIONS, QUESTION_TYPES } from "@/domain/moreInfo";
import type { InfoQuestion, QuestionType } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { requestService } from "@/services/requests";
import { useRequestAction } from "@/features/requests/useRequestAction";
import type { RequestView } from "@/queries/requestView";

let seq = 0;
const blank = (): InfoQuestion & { optionsText: string } => ({ id: `q${Date.now().toString(36)}${++seq}`, label: "", type: "text", required: true, mapsTo: null, optionsText: "" });

/** 8.5: instructions, up to 10 questions of 7 types, and the stage the request returns to. */
export function AskInfoDialog({ view, revision, onClose, onDone }: { view: RequestView; revision: number; onClose: () => void; onDone: () => void }) {
  const t = useTranslations("requestDetail.ask");
  const tf = useTranslations("requestDetail.fields");
  const tt = useTranslations("actions.toasts");
  const fmt = useFormat();
  const { busy, error, run } = useRequestAction();
  const [instructions, setInstructions] = useState("");
  const [questions, setQuestions] = useState([blank()]);
  const [tried, setTried] = useState(false);

  const graph = view.version?.graph;
  const stageId = view.request.currentStageNodeId!;
  const defaultReturn = view.stage?.afterMoreInfoReturnTo && view.stage.afterMoreInfoReturnTo !== "same" ? view.stage.afterMoreInfoReturnTo : stageId;
  const [returnTo, setReturnTo] = useState(defaultReturn);
  const stages = (graph?.nodes ?? []).filter((n) => n.type === "stage");
  const round = view.infoRoundCount + 1;

  const payload = useMemo(
    () => questions.map(({ optionsText, ...q }) => ({ ...q, options: q.type === "singleChoice" || q.type === "multiChoice" ? optionsText.split("\n").map((o) => o.trim()).filter(Boolean) : undefined })),
    [questions],
  );
  const issues = view.validateAsk({ instructions, questions: payload, returnToNodeId: returnTo });
  const update = (id: string, patch: Partial<(typeof questions)[number]>) => setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...patch } : q)));

  return (
    <ActionDialog
      open
      wide
      onOpenChange={(o) => !o && onClose()}
      title={t("title")}
      description={
        <>
          {t("description")} <span className="font-semibold text-ink">{t("roundOf", { n: Math.min(round, 3) })}</span>
        </>
      }
      icon={
        <DialogIcon className="bg-amber-50 text-amber-600">
          <MessageCircleQuestion className="size-5" />
        </DialogIcon>
      }
      confirmLabel={t("confirm")}
      busy={busy}
      error={error ?? (tried && issues.length ? t(`issues.${issues[0]}`) : null)}
      confirmDisabled={issues.includes("maxRounds")}
      onConfirm={() => {
        setTried(true);
        if (issues.length) return;
        void run(
          () => requestService.askInfo({ requestId: view.request.id, actorId: view.viewer.id, expectedRevision: revision, instructions, questions: payload, returnToNodeId: returnTo }),
          () => tt("infoRequested", { id: view.request.id }),
          onDone,
        );
      }}
    >
      {issues.includes("maxRounds") ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800 ring-1 ring-amber-600/20 ring-inset">{t("maxRounds")}</p>
      ) : (
        <>
          <Field label={t("instructions")} htmlFor="ask-instructions">
            <TextArea id="ask-instructions" rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder={t("instructionsPlaceholder")} />
          </Field>

          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <p className="text-sm font-semibold text-ink">{t("questions")}</p>
              <span className="tabular text-xs text-ink-3">{t("questionsHint", { n: fmt.number(questions.length) })}</span>
            </div>
            <ol className="space-y-3">
              {questions.map((q, i) => {
                const choice = q.type === "singleChoice" || q.type === "multiChoice";
                const mappable = !choice && q.type !== "upload";
                return (
                  <li key={q.id} className="space-y-3 rounded-xl bg-subtle p-3.5 ring-1 ring-line">
                    <div className="flex items-start gap-2">
                      <span className="tabular mt-2 inline-flex size-5 shrink-0 items-center justify-center rounded bg-amber-100 text-2xs font-bold text-amber-800">{fmt.number(i + 1)}</span>
                      <TextInput aria-label={t("label")} value={q.label} onChange={(e) => update(q.id, { label: e.target.value })} placeholder={t("labelPlaceholder")} invalid={tried && !q.label.trim()} />
                      {questions.length > 1 && (
                        <Button variant="ghost" iconOnly aria-label={t("remove")} onClick={() => setQuestions((qs) => qs.filter((x) => x.id !== q.id))}>
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                    <div className="grid gap-3 ps-7 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <Select
                        label={t("type")}
                        value={q.type}
                        onChange={(v) => update(q.id, { type: v as QuestionType, mapsTo: null })}
                        options={QUESTION_TYPES.map((type) => ({ value: type, label: t(`types.${type}`) }))}
                      />
                      <label className="flex h-9 items-center gap-2 text-sm text-ink">
                        <input type="checkbox" className="size-4 accent-indigo-600" checked={q.required} onChange={(e) => update(q.id, { required: e.target.checked })} />
                        {t("required")}
                      </label>
                    </div>
                    {choice && (
                      <div className="ps-7">
                        <Field label={t("options")} hint={t("optionsHint")}>
                          <TextArea rows={3} value={q.optionsText} onChange={(e) => update(q.id, { optionsText: e.target.value })} />
                        </Field>
                      </div>
                    )}
                    {mappable && (
                      <div className="ps-7">
                        <Field label={t("mapsTo")}>
                          <Select
                            label={t("mapsTo")}
                            value={q.mapsTo ?? "none"}
                            onChange={(v) => update(q.id, { mapsTo: v === "none" ? null : v })}
                            options={[{ value: "none", label: t("mapsToNone") }, ...MAPPABLE_FIELDS.map((f) => ({ value: f, label: tf(f) }))]}
                          />
                        </Field>
                        {q.mapsTo && <p className="mt-1.5 text-xs text-ink-3">{t("mapsToHint")}</p>}
                      </div>
                    )}
                    {q.type === "upload" && <p className="ps-7 text-xs text-ink-3">{t("uploadNote")}</p>}
                  </li>
                );
              })}
            </ol>
            {questions.length < MAX_QUESTIONS && (
              <Button size="sm" className="mt-3" onClick={() => setQuestions((qs) => [...qs, blank()])}>
                <Plus className="size-3.5" />
                {t("add")}
              </Button>
            )}
          </div>

          <Field label={t("returnTo")}>
            <Select
              label={t("returnTo")}
              value={returnTo}
              onChange={setReturnTo}
              options={stages.map((n) => ({ value: n.id, label: n.id === stageId ? t("returnSame", { stage: fmt.text(n.type === "stage" ? n.stage.name : null) }) : fmt.text(n.type === "stage" ? n.stage.name : null) }))}
            />
          </Field>
        </>
      )}
    </ActionDialog>
  );
}
