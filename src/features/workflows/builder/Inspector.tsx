"use client";

import { ArrowDown, ArrowUp, BadgeCheck, CircleAlert, GitBranch, Info, Play, Plus, Trash2, TriangleAlert, Users, X, XCircle, type LucideIcon } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Field, TextArea, TextInput } from "@/components/ui/Field";
import { MultiSelect, Select } from "@/components/ui/Select";
import { BadgeTypeChip } from "@/components/ui/Status";
import { conditionFields, VALUELESS_OPERATORS } from "@/domain/teams";
import { edge as makeEdge, englishText, type WorkflowIssue, type WorkflowMeta } from "@/domain/workflowAdmin";
import type { ConditionOperator, Database, ID, StageAction, StageConfig, WorkflowEdge, WorkflowGraph, WorkflowNode } from "@/domain/types";
import { cn } from "@/lib/cn";
import { useFieldOptions } from "@/features/teams/EditorSections";
import { ACTION_LABEL, handleLabel, NODE_LABEL, nodeName } from "../text";
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
        <span className={cn("size-4 rounded-full bg-white shadow-xs transition-transform", checked && "translate-x-4")} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {hint && <span className="block text-xs text-ink-3">{hint}</span>}
      </span>
    </button>
  );
}

function Header({ icon: Icon, tone, kind, title, onDelete }: { icon: LucideIcon; tone: string; kind: string; title: string; onDelete?: () => void }) {
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
        <Button size="sm" variant="ghost" iconOnly aria-label="Delete block" onClick={onDelete}>
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
  const badgeName = db.badgeTypes[badgeTypeId]?.name.en ?? "this badge type";

  return (
    <>
      <Section title="Stage">
        <Field label="Name" htmlFor="st-name">
          <TextInput id="st-name" disabled={!editable} value={s.name.en} onFocus={() => b.checkpoint()} onChange={(e) => update({ name: englishText(e.target.value) }, false)} />
        </Field>
        <Field label="Instructions" htmlFor="st-instr" hint="Shown to reviewers">
          <TextArea id="st-instr" rows={3} disabled={!editable} value={s.instructions.en} onFocus={() => b.checkpoint()} onChange={(e) => update({ instructions: englishText(e.target.value) }, false)} />
        </Field>
      </Section>

      <Section title="Teams in order" hint="The request goes to the first team that matches it.">
        {s.teams.length === 0 && <p className="rounded-lg border border-dashed border-line-strong px-3 py-3 text-center text-xs text-ink-3">No team yet</p>}
        <ol className="space-y-1.5">
          {s.teams.map((id, i) => (
            <li key={id} className="flex items-center gap-2 rounded-lg bg-subtle px-2.5 py-2 ring-1 ring-line">
              <span className="tabular inline-flex size-5 shrink-0 items-center justify-center rounded bg-surface text-2xs font-bold text-ink-2 ring-1 ring-line">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{db.teams[id]?.name.en ?? "Unknown team"}</span>
                <span className={cn("block text-2xs", covers(id) ? "text-emerald-700" : "text-ink-3")}>{covers(id) ? `Covers ${badgeName}` : `Doesn't cover ${badgeName}`}</span>
              </span>
              {editable && (
                <span className="flex items-center">
                  <Button size="sm" variant="ghost" iconOnly aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" iconOnly aria-label="Move down" disabled={i === s.teams.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown className="size-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" iconOnly aria-label="Remove team" onClick={() => update({ teams: s.teams.filter((x) => x !== id) })}>
                    <X className="size-3.5" />
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ol>
        {editable && (
          <Select
            label="Add team"
            placeholder="Add a team…"
            value={null}
            searchable
            onChange={(id) => update({ teams: [...s.teams, id] })}
            options={activeTeams
              .filter((t) => !s.teams.includes(t.id))
              .map((t) => ({ value: t.id, label: t.name.en, hint: covers(t.id) ? `Covers ${badgeName}` : `Doesn't cover ${badgeName}` }))}
          />
        )}
        <Field label="Fallback team" hint="Gets anything no team matches">
          <Select
            label="Fallback team"
            placeholder="Choose a fallback team"
            value={s.fallbackTeamId}
            onChange={(id) => update({ fallbackTeamId: id })}
            options={activeTeams.map((t) => ({ value: t.id, label: t.name.en }))}
          />
        </Field>
      </Section>

      <Section title="Allowed actions" hint="Approve and Reject are always on.">
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
              {ACTION_LABEL[a]}
            </label>
          );
        })}
      </Section>

      {s.allowedActions.includes("escalate") && (
        <Section title="Escalate to" hint="Draw from the amber Escalate dot, or add a stage here.">
          {escalations.length === 0 && <p className="text-xs text-rose-600">No escalation target yet.</p>}
          <ul className="space-y-1.5">
            {escalations.map((e) => (
              <li key={e.id} className="flex items-center gap-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-sm text-amber-900 ring-1 ring-amber-600/15">
                <span className="min-w-0 flex-1 truncate">{nodeName(graph.nodes.find((n) => n.id === e.target))}</span>
                {editable && (
                  <Button size="sm" variant="ghost" iconOnly aria-label="Remove escalation" onClick={() => b.edit((g) => ({ ...g, edges: g.edges.filter((x) => x.id !== e.id) }))}>
                    <X className="size-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {editable && (
            <Select
              label="Add escalation target"
              placeholder="Add a stage…"
              value={null}
              onChange={(id) => b.edit((g) => ({ ...g, edges: [...g.edges, makeEdge(block.id, "escalate", id)] }))}
              options={otherStages.filter((n) => !escalations.some((e) => e.target === n.id)).map((n) => ({ value: n.id, label: nodeName(n) }))}
            />
          )}
        </Section>
      )}

      {s.allowedActions.includes("moreInfo") && (
        <Section title="After more information">
          <Select
            label="Return to"
            value={s.afterMoreInfoReturnTo}
            onChange={(v) => update({ afterMoreInfoReturnTo: v })}
            options={[{ value: "same", label: "The same stage (default)" }, ...otherStages.map((n) => ({ value: n.id, label: nodeName(n) }))]}
          />
        </Section>
      )}

      <Section title="Rules">
        <Toggle label="Reject reason required" hint="Reviewers must pick a reason to reject." checked={s.rejectReasonRequired} disabled={!editable} onChange={(v) => update({ rejectReasonRequired: v })} />
        <Toggle label="Mandatory" hint="Can never be skipped. Suggested for every security stage." checked={s.mandatory} disabled={!editable} onChange={(v) => update({ mandatory: v })} />
        <Field label="Time limit" htmlFor="st-limit" hint="Optional">
          <div className="flex items-center gap-2">
            <TextInput
              id="st-limit"
              type="number"
              min={1}
              className="tabular w-24"
              disabled={!editable}
              placeholder="None"
              value={s.timeLimitHours ?? ""}
              onFocus={() => b.checkpoint()}
              onChange={(e) => update({ timeLimitHours: e.target.value ? Math.max(1, Number(e.target.value)) : null }, false)}
            />
            <span className="text-sm text-ink-2">hours</span>
          </div>
          <p className="mt-1.5 text-xs text-ink-3">Late requests are highlighted and the team lead is told.</p>
        </Field>
      </Section>
    </>
  );
}

// ─── Condition ──────────────────────────────────────────────────────────

function ConditionSettings({ db, block, badgeTypeId, editable, b }: { db: Database; block: Extract<WorkflowNode, { type: "condition" }>; badgeTypeId: ID; editable: boolean; b: Builder }) {
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
      <Section title="Condition">
        <Field label="Label" htmlFor="cond-label">
          <TextInput id="cond-label" disabled={!editable} value={c.label.en} onFocus={() => b.checkpoint()} onChange={(e) => update((x) => ({ ...x, label: englishText(e.target.value) }), false)} />
        </Field>
      </Section>
      <Section title="Paths" hint="Checked in order. A request takes the first path whose rule is true.">
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
                  aria-label="Path name"
                  disabled={!editable}
                  className="h-8"
                  value={br.label.en}
                  onFocus={() => b.checkpoint()}
                  onChange={(e) => updateBranch(br.id, { label: englishText(e.target.value) }, false)}
                />
                {editable && c.branches.length > 1 && (
                  <Button size="sm" variant="ghost" iconOnly aria-label="Remove path" onClick={() => update((x) => ({ ...x, branches: x.branches.filter((y) => y.id !== br.id) }))}>
                    <X className="size-3.5" />
                  </Button>
                )}
              </div>
              <Select
                label="Field"
                placeholder="Choose a field"
                searchable
                value={br.condition.field || null}
                options={fieldOptions}
                onChange={(field) => setRule({ field, operator: fields.find((f) => f.field === field)?.operators[0] ?? "is", value: [] })}
              />
              <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2">
                <Select
                  label="Operator"
                  value={br.condition.operator}
                  options={(def?.operators ?? ["is"]).map((op) => ({ value: op, label: OPERATOR_LABEL[op] }))}
                  onChange={(op) => {
                    const operator = op as ConditionOperator;
                    const single = operator === "is" || operator === "isNot" || operator === "contains";
                    setRule({ operator, value: VALUELESS_OPERATORS.includes(operator) ? [] : single ? br.condition.value.slice(0, 1) : br.condition.value });
                  }}
                />
                {valueless ? (
                  <span className="flex h-9 items-center px-2 text-sm text-ink-3">—</span>
                ) : values && multi ? (
                  <MultiSelect label="Values" placeholder="Choose values" options={values} value={br.condition.value} summary={(l) => l.join(", ")} onChange={(value) => setRule({ value })} />
                ) : values ? (
                  <Select label="Value" placeholder="Choose a value" options={values} value={br.condition.value[0] ?? null} onChange={(v) => setRule({ value: [v] })} />
                ) : (
                  <TextInput aria-label="Value" placeholder="Type a value" disabled={!editable} value={br.condition.value[0] ?? ""} onChange={(e) => setRule({ value: [e.target.value] })} />
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
              update((x) => ({ ...x, branches: [...x.branches, { id, label: englishText(`Path ${x.branches.length + 1}`), condition: { id: `${id}c`, field: "", operator: "is", value: [] } }] }));
            }}
          >
            <Plus className="size-3.5" />
            Add path
          </Button>
        )}
        <p className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-ink-2 ring-1 ring-line">
          <Info className="mt-px size-3.5 shrink-0 text-ink-3" />
          Requests that match no path take the grey Otherwise connection. It must lead somewhere before you can publish.
        </p>
      </Section>
    </>
  );
}

const OPERATOR_LABEL: Record<ConditionOperator, string> = {
  is: "is",
  isNot: "is not",
  isAnyOf: "is any of",
  isNoneOf: "is none of",
  contains: "contains",
  isEmpty: "is empty",
  isNotEmpty: "is not empty",
};

// ─── Workflow details (nothing selected) ────────────────────────────────

function WorkflowDetails({ db, meta, published, editable, b, issues }: { db: Database; meta: WorkflowMeta; published: boolean; editable: boolean; b: Builder; issues: WorkflowIssue[] }) {
  const has = (code: WorkflowIssue["code"]) => issues.some((i) => i.code === code);
  return (
    <Section title="Workflow details" hint="Select a block on the canvas to edit it.">
      <Field label="Workflow name" htmlFor="wf-d-name" hint="Unique">
        <TextInput id="wf-d-name" disabled={!editable} invalid={has("nameRequired") || has("nameTaken")} value={meta.name.en} onChange={(e) => b.setMeta({ name: englishText(e.target.value) })} />
      </Field>
      <Field label="Label" htmlFor="wf-d-label" hint="Shown on each request">
        <TextInput id="wf-d-label" disabled={!editable} invalid={has("labelRequired")} value={meta.label.en} onChange={(e) => b.setMeta({ label: englishText(e.target.value) })} />
      </Field>
      <Field label="Badge type">
        {published || !editable ? (
          <div className="flex items-center gap-2">
            <BadgeTypeChip id={meta.badgeTypeId} label={db.badgeTypes[meta.badgeTypeId]?.name.en ?? ""} />
            {published && <span className="text-xs text-ink-3">Fixed after the first publish</span>}
          </div>
        ) : (
          <Select label="Badge type" value={meta.badgeTypeId} onChange={(badgeTypeId) => b.setMeta({ badgeTypeId })} options={Object.values(db.badgeTypes).map((x) => ({ value: x.id, label: x.name.en }))} />
        )}
      </Field>
      <Field label="Description" htmlFor="wf-d-desc" hint="Optional">
        <TextArea id="wf-d-desc" rows={3} disabled={!editable} value={meta.description.en} onChange={(e) => b.setMeta({ description: englishText(e.target.value) })} />
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
        <Header icon={GitBranch} tone="bg-slate-100 text-slate-600" kind="Connection" title={handleLabel(from, e.handle)} />
        <Section title="Path">
          <p className="text-sm text-ink">
            <span className="font-semibold">{nodeName(from)}</span>
            <span className="mx-1.5 font-semibold" style={{ color: colorFor(["approve", "reject", "escalate", "next", "otherwise"].includes(e.handle) ? e.handle : "branch") }}>
              {handleLabel(from, e.handle)} →
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
              Delete connection
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
          <Header icon={Users} tone="bg-indigo-50 text-indigo-600" kind={NODE_LABEL.stage} title={nodeName(block)} onDelete={onDelete} />
          <Issues issues={own} text={issueText} />
          <StageSettings db={db} graph={graph} block={block} badgeTypeId={meta.badgeTypeId} editable={editable} b={b} />
        </div>
      );
    case "condition":
      return (
        <div>
          <Header icon={GitBranch} tone="bg-amber-50 text-amber-600" kind={NODE_LABEL.condition} title={nodeName(block)} onDelete={onDelete} />
          <Issues issues={own} text={issueText} />
          <ConditionSettings db={db} block={block} badgeTypeId={meta.badgeTypeId} editable={editable} b={b} />
        </div>
      );
    case "start":
      return (
        <div>
          <Header icon={Play} tone="bg-indigo-50 text-indigo-600" kind={NODE_LABEL.start} title="Start" onDelete={onDelete} />
          <Issues issues={own} text={issueText} />
          <Section title="How it works">
            <p className="text-sm text-ink-2">A request enters the workflow here once it has passed the blacklist and watchlist checks. Exactly one Start block is allowed.</p>
          </Section>
        </div>
      );
    case "final":
      return (
        <div>
          <Header icon={BadgeCheck} tone="bg-emerald-50 text-emerald-600" kind={NODE_LABEL.final} title="Final approval" onDelete={onDelete} />
          <Issues issues={own} text={issueText} />
          <Section title="What happens here">
            <ul className="list-disc space-y-1 ps-4 text-sm text-ink-2">
              <li>The blacklist and watchlist are checked again.</li>
              <li>One place is taken from the registration limit. If it’s full, the request waits.</li>
              <li>The badge is issued and the approval email is sent.</li>
            </ul>
          </Section>
        </div>
      );
    case "rejected":
      return (
        <div>
          <Header icon={XCircle} tone="bg-rose-50 text-rose-600" kind={NODE_LABEL.rejected} title="Rejected" onDelete={onDelete} />
          <Issues issues={own} text={issueText} />
          <Section title="Default reason" hint="Used when the reviewer doesn’t pick one.">
            <Select
              label="Default reason"
              value={block.defaultReasonId ?? "none"}
              onChange={(v) => b.edit((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === block.id && n.type === "rejected" ? { ...n, defaultReasonId: v === "none" ? undefined : v } : n)) }))}
              options={[{ value: "none", label: "No default" }, ...Object.values(db.rejectReasons).map((r) => ({ value: r.id, label: r.label.en }))]}
            />
          </Section>
        </div>
      );
  }
}
