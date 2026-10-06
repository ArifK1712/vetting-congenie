"use client";

import { ArrowDown, ArrowUp, BadgeCheck, CircleAlert, GitBranch, Info, Play, Plus, Trash2, TriangleAlert, Users, X, XCircle, type LucideIcon } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Field, TextArea, TextInput } from "@/components/ui/Field";
import { MultiSelect, Select } from "@/components/ui/Select";
import { BadgeTypeChip } from "@/components/ui/Status";
import { conditionFields, VALUELESS_OPERATORS } from "@/domain/teams";
import { edge as makeEdge, type WorkflowIssue, type WorkflowMeta } from "@/domain/workflowAdmin";
import type { ConditionOperator, Database, ID, StageAction, StageConfig, WorkflowEdge, WorkflowGraph, WorkflowNode } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { cn } from "@/lib/cn";
import { useFieldOptions } from "@/features/teams/EditorSections";
import { useWorkflowText } from "../text";
import { colorFor } from "./nodes";
import type { Builder } from "./useBuilder";

export type Selection = { kind: "node" | "edge"; id: ID } | null;

function Section({ title, children, hint }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="border-b border-line px-5 py-4 last:border-b-0">
      <h3 className="text-xs font-bold text-ink">{title}</h3>
      {hint && <p className="mt-0.5 text-xs text-ink-3">{hint}</p>}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function Toggle({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-3 rounded-lg text-start outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed"
    >
      <span className={cn("mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors", checked ? "bg-accent" : "bg-line-strong", disabled && "opacity-60")}>
        <span className={cn("size-4 rounded-full bg-white shadow-xs transition-transform", checked && "translate-x-4 rtl:-translate-x-4")} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {hint && <span className="block text-xs text-ink-3">{hint}</span>}
      </span>
    </button>
  );
}

function Header({ icon: Icon, tone, kind, title, onDelete }: { icon: LucideIcon; tone: string; kind: string; title: string; onDelete?: () => void }) {
  const { t } = useWorkflowText();
  return (
    <div className="flex items-start gap-3 border-b border-line px-5 py-4">
      <span className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-lg", tone)}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="eyebrow">{kind}</p>
        <p className="truncate text-sm font-bold text-ink">{title}</p>
      </div>
      {onDelete && (
        <Button size="sm" variant="ghost" iconOnly aria-label={t("inspector.deleteBlock")} onClick={onDelete}>
          <Trash2 className="size-4 text-rose-500" />
        </Button>
      )}
    </div>
  );
}

function Issues({ issues, text }: { issues: WorkflowIssue[]; text: (i: WorkflowIssue) => string }) {
  if (!issues.length) return null;
  return (
    <ul className="space-y-1.5 border-b border-line px-5 py-3">
      {issues.map((i, n) => (
        <li
          key={n}
          className={cn(
            "flex items-start gap-2 rounded-lg px-2.5 py-2 text-xs ring-1 ring-inset",
            i.severity === "error" ? "bg-rose-50 text-rose-700 ring-rose-600/15" : "bg-amber-50 text-amber-800 ring-amber-600/20",
          )}
        >
          {i.severity === "error" ? <CircleAlert className="mt-px size-3.5 shrink-0" /> : <TriangleAlert className="mt-px size-3.5 shrink-0" />}
          {text(i)}
        </li>
      ))}
    </ul>
  );
}

// ─── Stage ──────────────────────────────────────────────────────────────

function StageSettings({ db, graph, block, badgeTypeId, editable, b }: { db: Database; graph: WorkflowGraph; block: Extract<WorkflowNode, { type: "stage" }>; badgeTypeId: ID; editable: boolean; b: Builder }) {
  const { t, actionLabel, nodeName, textField } = useWorkflowText();
  const fmt = useFormat();
  const s = block.stage;
  const update = (patch: Partial<StageConfig>, history = true) =>
    b.edit((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === block.id && n.type === "stage" ? { ...n, stage: { ...n.stage, ...patch } } : n)) }), history);
  const activeTeams = Object.values(db.teams).filter((t) => t.status === "active");
  const covers = (id: ID) => {
    const t = db.teams[id];
    return !!t && (t.badgeScope === "all" || t.badgeScope.includes(badgeTypeId));
  };
  const otherStages = graph.nodes.filter((n) => n.type === "stage" && n.id !== block.id);
  const escalations = graph.edges.filter((e) => e.source === block.id && e.handle === "escalate");
  const move = (i: number, d: -1 | 1) => {
    const teams = [...s.teams];
    [teams[i], teams[i + d]] = [teams[i + d], teams[i]];
    update({ teams });
  };
  const toggleAction = (a: StageAction, on: boolean) =>
    update({ allowedActions: on ? [...new Set([...s.allowedActions, a])] : s.allowedActions.filter((x) => x !== a) });
  const badgeName = db.badgeTypes[badgeTypeId] ? fmt.text(db.badgeTypes[badgeTypeId].name) : t("inspector.stage.thisBadge");
  const coverage = (id: ID) => (covers(id) ? t("inspector.stage.covers", { badge: badgeName }) : t("inspector.stage.notCovers", { badge: badgeName }));

  return (
    <>
      <Section title={t("inspector.stage.section")}>
        <Field label={t("inspector.stage.name")} htmlFor="st-name">
          <TextInput id="st-name" disabled={!editable} onFocus={() => b.checkpoint()} {...textField(s.name, (name) => update({ name }, false))} />
        </Field>
        <Field label={t("inspector.stage.instructions")} htmlFor="st-instr" hint={t("inspector.stage.instructionsHint")}>
          <TextArea id="st-instr" rows={3} disabled={!editable} onFocus={() => b.checkpoint()} {...textField(s.instructions, (instructions) => update({ instructions }, false))} />
        </Field>
      </Section>

      <Section title={t("inspector.stage.teams")} hint={t("inspector.stage.teamsHint")}>
        {s.teams.length === 0 && <p className="rounded-lg border border-dashed border-line-strong px-3 py-3 text-center text-xs text-ink-3">{t("inspector.stage.noTeam")}</p>}
        <ol className="space-y-1.5">
          {s.teams.map((id, i) => (
            <li key={id} className="flex items-center gap-2 rounded-lg bg-subtle px-2.5 py-2 ring-1 ring-line">
              <span className="tabular inline-flex size-5 shrink-0 items-center justify-center rounded bg-surface text-2xs font-bold text-ink-2 ring-1 ring-line">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{db.teams[id] ? fmt.text(db.teams[id].name) : t("names.unknownTeam")}</span>
                <span className={cn("block text-2xs", covers(id) ? "text-emerald-700" : "text-ink-3")}>{coverage(id)}</span>
              </span>
              {editable && (
                <span className="flex items-center">
                  <Button size="sm" variant="ghost" iconOnly aria-label={t("inspector.stage.moveUp")} disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" iconOnly aria-label={t("inspector.stage.moveDown")} disabled={i === s.teams.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown className="size-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" iconOnly aria-label={t("inspector.stage.removeTeam")} onClick={() => update({ teams: s.teams.filter((x) => x !== id) })}>
                    <X className="size-3.5" />
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ol>
        {editable && (
          <Select
            label={t("inspector.stage.addTeam")}
            placeholder={t("inspector.stage.addTeamPlaceholder")}
            value={null}
            searchable
            onChange={(id) => update({ teams: [...s.teams, id] })}
            options={activeTeams
              .filter((team) => !s.teams.includes(team.id))
              .map((team) => ({ value: team.id, label: fmt.text(team.name), hint: coverage(team.id) }))}
          />
        )}
        <Field label={t("inspector.stage.fallback")} hint={t("inspector.stage.fallbackHint")}>
          <Select
            label={t("inspector.stage.fallback")}
            placeholder={t("inspector.stage.fallbackPlaceholder")}
            value={s.fallbackTeamId}
            onChange={(id) => update({ fallbackTeamId: id })}
            options={activeTeams.map((team) => ({ value: team.id, label: fmt.text(team.name) }))}
          />
        </Field>
      </Section>

      <Section title={t("inspector.stage.actions")} hint={t("inspector.stage.actionsHint")}>
        {(["approve", "reject", "moreInfo", "escalate"] as StageAction[]).map((a) => {
          const fixed = a === "approve" || a === "reject";
          return (
            <label key={a} className={cn("flex items-center gap-2.5 text-sm text-ink", (fixed || !editable) && "text-ink-2")}>
              <input
                type="checkbox"
                className="size-4 accent-indigo-600"
                checked={s.allowedActions.includes(a)}
                disabled={fixed || !editable}
                onChange={(e) => toggleAction(a, e.target.checked)}
              />
              <span className="size-2 rounded-full" style={{ background: colorFor(a === "moreInfo" ? "otherwise" : a) }} />
              {actionLabel(a)}
            </label>
          );
        })}
      </Section>

      {s.allowedActions.includes("escalate") && (
        <Section title={t("inspector.stage.escalateTo")} hint={t("inspector.stage.escalateHint")}>
          {escalations.length === 0 && <p className="text-xs text-rose-600">{t("inspector.stage.noEscalation")}</p>}
          <ul className="space-y-1.5">
            {escalations.map((e) => (
              <li key={e.id} className="flex items-center gap-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-sm text-amber-900 ring-1 ring-amber-600/15">
                <span className="min-w-0 flex-1 truncate">{nodeName(graph.nodes.find((n) => n.id === e.target))}</span>
                {editable && (
                  <Button size="sm" variant="ghost" iconOnly aria-label={t("inspector.stage.removeEscalation")} onClick={() => b.edit((g) => ({ ...g, edges: g.edges.filter((x) => x.id !== e.id) }))}>
                    <X className="size-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {editable && (
            <Select
              label={t("inspector.stage.addEscalation")}
              placeholder={t("inspector.stage.addStagePlaceholder")}
              value={null}
              onChange={(id) => b.edit((g) => ({ ...g, edges: [...g.edges, makeEdge(block.id, "escalate", id)] }))}
              options={otherStages.filter((n) => !escalations.some((e) => e.target === n.id)).map((n) => ({ value: n.id, label: nodeName(n) }))}
            />
          )}
        </Section>
      )}

      {s.allowedActions.includes("moreInfo") && (
        <Section title={t("inspector.stage.afterMoreInfo")}>
          <Select
            label={t("inspector.stage.returnTo")}
            value={s.afterMoreInfoReturnTo}
            onChange={(v) => update({ afterMoreInfoReturnTo: v })}
            options={[{ value: "same", label: t("inspector.stage.sameStage") }, ...otherStages.map((n) => ({ value: n.id, label: nodeName(n) }))]}
          />
        </Section>
      )}

      <Section title={t("inspector.stage.rules")}>
        <Toggle label={t("inspector.stage.rejectReason")} hint={t("inspector.stage.rejectReasonHint")} checked={s.rejectReasonRequired} disabled={!editable} onChange={(v) => update({ rejectReasonRequired: v })} />
        <Toggle label={t("inspector.stage.mandatory")} hint={t("inspector.stage.mandatoryHint")} checked={s.mandatory} disabled={!editable} onChange={(v) => update({ mandatory: v })} />
        <Field label={t("inspector.stage.timeLimit")} htmlFor="st-limit" hint={t("inspector.stage.optional")}>
          <div className="flex items-center gap-2">
            <TextInput
              id="st-limit"
              type="number"
              min={1}
              className="tabular w-24"
              disabled={!editable}
              placeholder={t("inspector.stage.none")}
              value={s.timeLimitHours ?? ""}
              onFocus={() => b.checkpoint()}
              onChange={(e) => update({ timeLimitHours: e.target.value ? Math.max(1, Number(e.target.value)) : null }, false)}
            />
            <span className="text-sm text-ink-2">{t("inspector.stage.hours")}</span>
          </div>
          <p className="mt-1.5 text-xs text-ink-3">{t("inspector.stage.timeLimitHint")}</p>
        </Field>
      </Section>
    </>
  );
}

// ─── Condition ──────────────────────────────────────────────────────────

function ConditionSettings({ db, block, badgeTypeId, editable, b }: { db: Database; block: Extract<WorkflowNode, { type: "condition" }>; badgeTypeId: ID; editable: boolean; b: Builder }) {
  const { t, defaultText, textField } = useWorkflowText();
  const c = block.condition;
  const regIds = useMemo(() => Object.values(db.registrations).filter((r) => r.badgeTypeIds.includes(badgeTypeId)).map((r) => r.id), [db, badgeTypeId]);
  const fields = useMemo(() => conditionFields(db, regIds), [db, regIds]);
  const { fieldOptions, valueOptions } = useFieldOptions(db, fields);
  const update = (fn: (cond: typeof c) => typeof c, history = true) =>
    b.edit((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === block.id && n.type === "condition" ? { ...n, condition: fn(n.condition) } : n)) }), history);
  const updateBranch = (id: ID, patch: Partial<(typeof c.branches)[number]>, history = true) =>
    update((cond) => ({ ...cond, branches: cond.branches.map((x) => (x.id === id ? { ...x, ...patch } : x)) }), history);
  const nextBranchId = () => {
    let i = c.branches.length + 1;
    while (c.branches.some((x) => x.id === `b${i}`)) i++;
    return `b${i}`;
  };

  return (
    <>
      <Section title={t("inspector.condition.section")}>
        <Field label={t("inspector.condition.label")} htmlFor="cond-label">
          <TextInput id="cond-label" disabled={!editable} onFocus={() => b.checkpoint()} {...textField(c.label, (label) => update((x) => ({ ...x, label }), false))} />
        </Field>
      </Section>
      <Section title={t("inspector.condition.paths")} hint={t("inspector.condition.pathsHint")}>
        {c.branches.map((br, i) => {
          const def = fields.find((f) => f.field === br.condition.field);
          const values = def ? valueOptions(def) : null;
          const valueless = VALUELESS_OPERATORS.includes(br.condition.operator);
          const multi = br.condition.operator === "isAnyOf" || br.condition.operator === "isNoneOf";
          const setRule = (patch: Partial<typeof br.condition>) => updateBranch(br.id, { condition: { ...br.condition, ...patch } });
          return (
            <div key={br.id} className="space-y-2 rounded-lg bg-subtle p-3 ring-1 ring-line">
              <div className="flex items-center gap-2">
                <span className="tabular inline-flex size-5 shrink-0 items-center justify-center rounded bg-indigo-100 text-2xs font-bold text-indigo-700">{i + 1}</span>
                <TextInput
                  aria-label={t("inspector.condition.pathName")}
                  disabled={!editable}
                  className="h-8"
                  onFocus={() => b.checkpoint()}
                  {...textField(br.label, (label) => updateBranch(br.id, { label }, false))}
                />
                {editable && c.branches.length > 1 && (
                  <Button size="sm" variant="ghost" iconOnly aria-label={t("inspector.condition.removePath")} onClick={() => update((x) => ({ ...x, branches: x.branches.filter((y) => y.id !== br.id) }))}>
                    <X className="size-3.5" />
                  </Button>
                )}
              </div>
              <Select
                label={t("inspector.condition.field")}
                placeholder={t("inspector.condition.chooseField")}
                searchable
                value={br.condition.field || null}
                options={fieldOptions}
                onChange={(field) => setRule({ field, operator: fields.find((f) => f.field === field)?.operators[0] ?? "is", value: [] })}
              />
              <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2">
                <Select
                  label={t("inspector.condition.operator")}
                  value={br.condition.operator}
                  options={(def?.operators ?? ["is"]).map((op) => ({ value: op, label: t(`operators.${op}`) }))}
                  onChange={(op) => {
                    const operator = op as ConditionOperator;
                    const single = operator === "is" || operator === "isNot" || operator === "contains";
                    setRule({ operator, value: VALUELESS_OPERATORS.includes(operator) ? [] : single ? br.condition.value.slice(0, 1) : br.condition.value });
                  }}
                />
                {valueless ? (
                  <span className="flex h-9 items-center px-2 text-sm text-ink-3">—</span>
                ) : values && multi ? (
                  <MultiSelect
                    label={t("inspector.condition.values")}
                    placeholder={t("inspector.condition.chooseValues")}
                    options={values}
                    value={br.condition.value}
                    summary={(l) => l.join(t("separator"))}
                    onChange={(value) => setRule({ value })}
                  />
                ) : values ? (
                  <Select label={t("inspector.condition.value")} placeholder={t("inspector.condition.chooseValue")} options={values} value={br.condition.value[0] ?? null} onChange={(v) => setRule({ value: [v] })} />
                ) : (
                  <TextInput aria-label={t("inspector.condition.value")} placeholder={t("inspector.condition.typeValue")} disabled={!editable} value={br.condition.value[0] ?? ""} onChange={(e) => setRule({ value: [e.target.value] })} />
                )}
              </div>
            </div>
          );
        })}
        {editable && (
          <Button
            size="sm"
            onClick={() => {
              const id = nextBranchId();
              update((x) => ({ ...x, branches: [...x.branches, { id, label: defaultText("path", x.branches.length + 1), condition: { id: `${id}c`, field: "", operator: "is", value: [] } }] }));
            }}
          >
            <Plus className="size-3.5" />
            {t("inspector.condition.addPath")}
          </Button>
        )}
        <p className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-ink-2 ring-1 ring-line">
          <Info className="mt-px size-3.5 shrink-0 text-ink-3" />
          {t("inspector.condition.otherwiseNote")}
        </p>
      </Section>
    </>
  );
}

// ─── Workflow details (nothing selected) ────────────────────────────────

function WorkflowDetails({ db, meta, published, editable, b, issues }: { db: Database; meta: WorkflowMeta; published: boolean; editable: boolean; b: Builder; issues: WorkflowIssue[] }) {
  const { t, textField } = useWorkflowText();
  const fmt = useFormat();
  const has = (code: WorkflowIssue["code"]) => issues.some((i) => i.code === code);
  return (
    <Section title={t("inspector.details.title")} hint={t("inspector.details.hint")}>
      <Field label={t("inspector.details.name")} htmlFor="wf-d-name" hint={t("inspector.details.nameHint")}>
        <TextInput id="wf-d-name" disabled={!editable} invalid={has("nameRequired") || has("nameTaken")} {...textField(meta.name, (name) => b.setMeta({ name }))} />
      </Field>
      <Field label={t("inspector.details.label")} htmlFor="wf-d-label" hint={t("inspector.details.labelHint")}>
        <TextInput id="wf-d-label" disabled={!editable} invalid={has("labelRequired")} {...textField(meta.label, (label) => b.setMeta({ label }))} />
      </Field>
      <Field label={t("inspector.details.badgeType")}>
        {published || !editable ? (
          <div className="flex items-center gap-2">
            <BadgeTypeChip id={meta.badgeTypeId} label={fmt.text(db.badgeTypes[meta.badgeTypeId]?.name)} />
            {published && <span className="text-xs text-ink-3">{t("inspector.details.fixed")}</span>}
          </div>
        ) : (
          <Select
            label={t("inspector.details.badgeType")}
            value={meta.badgeTypeId}
            onChange={(badgeTypeId) => b.setMeta({ badgeTypeId })}
            options={Object.values(db.badgeTypes).map((x) => ({ value: x.id, label: fmt.text(x.name) }))}
          />
        )}
      </Field>
      <Field label={t("inspector.details.description")} htmlFor="wf-d-desc" hint={t("inspector.details.optional")}>
        <TextArea id="wf-d-desc" rows={3} disabled={!editable} {...textField(meta.description, (description) => b.setMeta({ description }))} />
      </Field>
    </Section>
  );
}

// ─── Panel ──────────────────────────────────────────────────────────────

export function Inspector({
  db,
  meta,
  graph,
  selection,
  editable,
  published,
  issues,
  issueText,
  b,
  onSelect,
}: {
  db: Database;
  meta: WorkflowMeta;
  graph: WorkflowGraph;
  selection: Selection;
  editable: boolean;
  published: boolean;
  issues: WorkflowIssue[];
  issueText: (i: WorkflowIssue) => string;
  b: Builder;
  onSelect: (s: Selection) => void;
}) {
  const { t, handleLabel, nodeLabel, nodeName } = useWorkflowText();
  const fmt = useFormat();
  const remove = (id: ID) => {
    b.edit((g) => ({ nodes: g.nodes.filter((n) => n.id !== id), edges: g.edges.filter((e) => e.source !== id && e.target !== id) }));
    onSelect(null);
  };

  if (selection?.kind === "edge") {
    const e: WorkflowEdge | undefined = graph.edges.find((x) => x.id === selection.id);
    if (!e) return null;
    const from = graph.nodes.find((n) => n.id === e.source);
    const to = graph.nodes.find((n) => n.id === e.target);
    return (
      <div>
        <Header icon={GitBranch} tone="bg-slate-100 text-slate-600" kind={t("inspector.connection")} title={handleLabel(from, e.handle)} />
        <Section title={t("inspector.path")}>
          <p className="text-sm text-ink">
            <span className="font-semibold">{nodeName(from)}</span>
            <span className="mx-1.5 font-semibold" style={{ color: colorFor(["approve", "reject", "escalate", "next", "otherwise"].includes(e.handle) ? e.handle : "branch") }}>
              {t("inspector.pathArrow", { handle: handleLabel(from, e.handle) })}
            </span>
            <span className="font-semibold">{nodeName(to)}</span>
          </p>
          {editable && (
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                b.edit((g) => ({ ...g, edges: g.edges.filter((x) => x.id !== e.id) }));
                onSelect(null);
              }}
            >
              <Trash2 className="size-3.5" />
              {t("inspector.deleteConnection")}
            </Button>
          )}
        </Section>
      </div>
    );
  }

  const block = selection?.kind === "node" ? graph.nodes.find((n) => n.id === selection.id) : undefined;
  const own = issues.filter((i) => (block ? i.nodeId === block.id : !i.nodeId));
  const onDelete = editable && block ? () => remove(block.id) : undefined;

  if (!block) {
    return (
      <div>
        <Issues issues={own} text={issueText} />
        <WorkflowDetails db={db} meta={meta} published={published} editable={editable} b={b} issues={own} />
      </div>
    );
  }

  switch (block.type) {
    case "stage":
      return (
        <div>
          <Header icon={Users} tone="bg-indigo-50 text-indigo-600" kind={nodeLabel("stage")} title={nodeName(block)} onDelete={onDelete} />
          <Issues issues={own} text={issueText} />
          <StageSettings db={db} graph={graph} block={block} badgeTypeId={meta.badgeTypeId} editable={editable} b={b} />
        </div>
      );
    case "condition":
      return (
        <div>
          <Header icon={GitBranch} tone="bg-amber-50 text-amber-600" kind={nodeLabel("condition")} title={nodeName(block)} onDelete={onDelete} />
          <Issues issues={own} text={issueText} />
          <ConditionSettings db={db} block={block} badgeTypeId={meta.badgeTypeId} editable={editable} b={b} />
        </div>
      );
    case "start":
      return (
        <div>
          <Header icon={Play} tone="bg-indigo-50 text-indigo-600" kind={nodeLabel("start")} title={nodeLabel("start")} onDelete={onDelete} />
          <Issues issues={own} text={issueText} />
          <Section title={t("inspector.start.howItWorks")}>
            <p className="text-sm text-ink-2">{t("inspector.start.body")}</p>
          </Section>
        </div>
      );
    case "final":
      return (
        <div>
          <Header icon={BadgeCheck} tone="bg-emerald-50 text-emerald-600" kind={nodeLabel("final")} title={nodeLabel("final")} onDelete={onDelete} />
          <Issues issues={own} text={issueText} />
          <Section title={t("inspector.final.whatHappens")}>
            <ul className="list-disc space-y-1 ps-4 text-sm text-ink-2">
              <li>{t("inspector.final.lists")}</li>
              <li>{t("inspector.final.place")}</li>
              <li>{t("inspector.final.badge")}</li>
            </ul>
          </Section>
        </div>
      );
    case "rejected":
      return (
        <div>
          <Header icon={XCircle} tone="bg-rose-50 text-rose-600" kind={nodeLabel("rejected")} title={nodeLabel("rejected")} onDelete={onDelete} />
          <Issues issues={own} text={issueText} />
          <Section title={t("inspector.rejected.defaultReason")} hint={t("inspector.rejected.defaultReasonHint")}>
            <Select
              label={t("inspector.rejected.defaultReason")}
              value={block.defaultReasonId ?? "none"}
              onChange={(v) => b.edit((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === block.id && n.type === "rejected" ? { ...n, defaultReasonId: v === "none" ? undefined : v } : n)) }))}
              options={[{ value: "none", label: t("inspector.rejected.noDefault") }, ...Object.values(db.rejectReasons).map((r) => ({ value: r.id, label: fmt.text(r.label) }))]}
            />
          </Section>
        </div>
      );
  }
}
