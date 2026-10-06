"use client";

import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { CircleCheck, Copy, Eye, Lock, MoreHorizontal, Pencil, Plus, Power, Rocket, Search, SearchX, Share2, TriangleAlert, Workflow as WorkflowIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { PAGE } from "@/design/layout";
import { Button } from "@/components/ui/Button";
import { ActionDialog, DialogIcon } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, TextArea, TextInput } from "@/components/ui/Field";
import { SingleFilter } from "@/components/ui/FilterMenu";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/Menu";
import { Select } from "@/components/ui/Select";
import { BadgeTypeChip, Pill } from "@/components/ui/Status";
import { toast } from "@/components/ui/Toast";
import { Tooltip } from "@/components/ui/Tooltip";
import { allotmentsOf, coverageGaps, errorsOf, stagesOf, validateMeta, type WorkflowIssue } from "@/domain/workflowAdmin";
import type { Database, Workflow } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { workflowService } from "@/services/workflows";
import { useDb } from "@/store/app";
import { useViewer } from "@/store/useViewer";
import { useWorkflowText } from "./text";

const STATUS_TONE = { draft: "amber", active: "emerald", inactive: "gray" } as const;

export function WorkflowStatusPill({ status }: { status: Workflow["status"] }) {
  const { statusLabel } = useWorkflowText();
  return <Pill tone={STATUS_TONE[status]}>{statusLabel(status)}</Pill>;
}

interface Row {
  wf: Workflow;
  stages: number;
  allotted: { name: string; code: string }[];
  versionNo: number | null;
}

const features = tableFeatures({});
const helper = createColumnHelper<typeof features, Row>();

const COLUMN_CLASS: Record<string, string> = {
  name: "",
  label: "hidden w-52 @[86rem]:table-cell",
  badge: "w-32",
  stages: "w-24",
  allotted: "hidden w-60 @[58rem]:table-cell",
  version: "w-40",
  status: "w-28",
  actions: "w-16 text-end",
};

// ─── Create dialog ──────────────────────────────────────────────────────

function CreateWorkflowDialog({ db, open, onOpenChange }: { db: Database; open: boolean; onOpenChange: (o: boolean) => void }) {
  const viewer = useViewer();
  const router = useRouter();
  const t = useTranslations("workflows");
  const fmt = useFormat();
  const { newText } = useWorkflowText();
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [badgeTypeId, setBadgeTypeId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meta = { name: newText(name), label: newText(label), description: newText(description), badgeTypeId: badgeTypeId ?? "" };
  const issues = validateMeta(db, meta, null);
  const has = (code: WorkflowIssue["code"]) => tried && issues.some((i) => i.code === code);
  const taken = Object.values(db.workflows).filter((w) => w.badgeTypeId === badgeTypeId);

  const create = async () => {
    setTried(true);
    if (errorsOf(issues).length) return;
    setBusy(true);
    const r = await workflowService.create({ meta, actorId: viewer.id });
    setBusy(false);
    if (!r.ok) return setError(t(`errors.${r.error}`));
    toast(t("create.created", { name: name.trim() }));
    onOpenChange(false);
    router.push(`/workflows/${r.workflowId}`);
  };

  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("create.title")}
      description={t("create.description")}
      icon={
        <DialogIcon className="bg-violet-50 text-violet-600">
          <WorkflowIcon className="size-5" />
        </DialogIcon>
      }
      confirmLabel={t("create.confirm")}
      busy={busy}
      error={error}
      onConfirm={create}
    >
      <Field label={t("create.name")} htmlFor="wf-name" hint={t("create.nameHint")}>
        <TextInput id="wf-name" value={name} maxLength={100} invalid={has("nameRequired") || has("nameTaken")} placeholder={t("create.namePlaceholder")} onChange={(e) => setName(e.target.value)} />
        {has("nameTaken") && <p className="mt-1.5 text-xs text-rose-600">{t("issues.nameTaken")}</p>}
      </Field>
      <Field label={t("create.label")} htmlFor="wf-label" hint={t("create.labelHint")}>
        <TextInput id="wf-label" value={label} maxLength={100} invalid={has("labelRequired")} placeholder={t("create.labelPlaceholder")} onChange={(e) => setLabel(e.target.value)} />
      </Field>
      <Field label={t("create.badgeType")}>
        <Select
          label={t("create.badgeType")}
          placeholder={t("create.badgeTypePlaceholder")}
          invalid={has("badgeTypeRequired")}
          value={badgeTypeId}
          onChange={setBadgeTypeId}
          options={Object.values(db.badgeTypes).map((b) => ({ value: b.id, label: fmt.text(b.name) }))}
        />
        {badgeTypeId && taken.length > 0 && (
          <p className="mt-1.5 text-xs text-ink-3">{t("create.alreadyUsed", { names: taken.map((w) => fmt.text(w.name)).join(t("separator")) })}</p>
        )}
      </Field>
      <Field label={t("create.descriptionLabel")} htmlFor="wf-desc" hint={t("create.optional")}>
        <TextArea id="wf-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
    </ActionDialog>
  );
}

// ─── Status dialog ──────────────────────────────────────────────────────

function DeactivateDialog({ wf, onClose }: { wf: Workflow; onClose: () => void }) {
  const viewer = useViewer();
  const db = useDb();
  const t = useTranslations("workflows");
  const fmt = useFormat();
  const name = fmt.text(wf.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allotted = allotmentsOf(db, wf.id).length;
  const confirm = async () => {
    setBusy(true);
    const r = await workflowService.setStatus({ workflowId: wf.id, expectedRevision: wf.revision, status: "inactive", actorId: viewer.id });
    setBusy(false);
    if (!r.ok) return setError(t(`errors.${r.error}`));
    toast(t("deactivate.done", { name }));
    onClose();
  };
  return (
    <ActionDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("deactivate.title", { name })}
      description={t("deactivate.description")}
      icon={
        <DialogIcon className="bg-rose-50 text-rose-600">
          <Power className="size-5" />
        </DialogIcon>
      }
      confirmLabel={t("deactivate.confirm")}
      confirmVariant="danger"
      busy={busy}
      error={error}
      onConfirm={confirm}
    >
      {allotted > 0 && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800 ring-1 ring-amber-600/20 ring-inset">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          {t("deactivate.allotted", { count: allotted, n: fmt.number(allotted) })}
        </p>
      )}
    </ActionDialog>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────

export function WorkflowsListPage() {
  const db = useDb();
  const viewer = useViewer();
  const router = useRouter();
  const fmt = useFormat();
  const t = useTranslations("workflows");
  const canEdit = viewer.can("workflows.edit");
  const canPublish = viewer.can("workflows.publish");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [creating, setCreating] = useState(false);
  const [deactivating, setDeactivating] = useState<Workflow | null>(null);

  const all = useMemo<Row[]>(
    () =>
      Object.values(db.workflows)
        .sort((a, b) => ({ active: 0, draft: 1, inactive: 2 })[a.status] - ({ active: 0, draft: 1, inactive: 2 })[b.status] || a.createdAt.localeCompare(b.createdAt))
        .map((wf) => {
          const current = wf.currentVersionId ? db.workflowVersions[wf.currentVersionId] : null;
          return {
            wf,
            stages: stagesOf(current?.graph ?? wf.draft).length,
            versionNo: current?.versionNo ?? null,
            allotted: allotmentsOf(db, wf.id).map((a) => {
              const reg = db.registrations[a.registrationId];
              return { name: reg ? fmt.text(reg.name) : "", code: db.events[reg?.eventId ?? ""]?.code ?? "" };
            }),
          };
        }),
    [db, fmt],
  );
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((r) => (status === "all" || r.wf.status === status) && (!q || `${r.wf.name.en} ${r.wf.name.ar} ${r.wf.label.en} ${r.wf.label.ar}`.toLowerCase().includes(q)));
  }, [all, search, status]);
  const gaps = useMemo(() => coverageGaps(db), [db]);

  const duplicate = async (wf: Workflow) => {
    const r = await workflowService.duplicate({ workflowId: wf.id, actorId: viewer.id });
    if (!r.ok) return toast(t(`errors.${r.error}`));
    toast(t("list.toasts.duplicated", { name: fmt.text(wf.name) }));
    router.push(`/workflows/${r.workflowId}`);
  };
  const activate = async (wf: Workflow) => {
    const r = await workflowService.setStatus({ workflowId: wf.id, expectedRevision: wf.revision, status: "active", actorId: viewer.id });
    toast(r.ok ? t("list.toasts.activated", { name: fmt.text(wf.name) }) : t(`errors.${r.error}`));
  };

  const columns = useMemo(
    () =>
      helper.columns([
        helper.display({
          id: "name",
          header: () => t("list.columns.name"),
          cell: ({ row: { original: r } }) => (
            <div className="flex min-w-0 items-center gap-3">
              <span className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-lg", r.wf.status === "inactive" ? "bg-gray-100 text-gray-500" : "bg-violet-100 text-violet-600")}>
                <WorkflowIcon className="size-4" />
              </span>
              <div className="min-w-0">
                <Link href={`/workflows/${r.wf.id}`} onClick={(e) => e.stopPropagation()} className="block truncate font-semibold text-ink hover:text-accent-text">
                  {fmt.text(r.wf.name)}
                </Link>
                <span className="block truncate text-xs text-ink-3">{fmt.text(r.wf.description) || fmt.text(r.wf.label)}</span>
              </div>
            </div>
          ),
        }),
        helper.display({ id: "label", header: () => t("list.columns.label"), cell: ({ row: { original: r } }) => <span className="truncate text-ink-2">{fmt.text(r.wf.label)}</span> }),
        helper.display({
          id: "badge",
          header: () => t("list.columns.badge"),
          cell: ({ row: { original: r } }) => <BadgeTypeChip id={r.wf.badgeTypeId} label={fmt.text(db.badgeTypes[r.wf.badgeTypeId]?.name)} />,
        }),
        helper.display({
          id: "stages",
          header: () => t("list.columns.stages"),
          cell: ({ row: { original: r } }) => <span className="tabular font-semibold text-ink">{r.stages}</span>,
        }),
        helper.display({
          id: "allotted",
          header: () => t("list.columns.allotted"),
          cell: ({ row: { original: r } }) =>
            r.allotted.length ? (
              <Tooltip content={r.allotted.map((a) => `${a.name} · ${a.code}`).join(t("separator"))}>
                <span className="block min-w-0 text-xs">
                  <span className="tabular block font-semibold text-ink">{t("registrations", { count: r.allotted.length, n: fmt.number(r.allotted.length) })}</span>
                  <span className="block truncate text-ink-3">{r.allotted.map((a) => `${a.name.replace(" Registration", "")} · ${a.code}`).join(t("separator"))}</span>
                </span>
              </Tooltip>
            ) : (
              <span className="text-xs text-ink-3">{r.wf.currentVersionId ? t("list.notAllotted") : t("list.publishFirst")}</span>
            ),
        }),
        helper.display({
          id: "version",
          header: () => t("list.columns.version"),
          cell: ({ row: { original: r } }) => (
            <div className="flex flex-wrap items-center gap-1.5">
              {r.versionNo ? (
                <span className="tabular inline-flex h-5 items-center rounded-md bg-hover px-1.5 font-mono text-2xs font-semibold text-ink-2">{t("version", { n: r.versionNo })}</span>
              ) : (
                <span className="text-xs text-ink-3">{t("list.notPublished")}</span>
              )}
              {r.wf.draft && r.versionNo !== null && (
                <Tooltip content={r.wf.draftSavedAt ? t("list.draftSavedAt", { date: fmt.dateTime(r.wf.draftSavedAt) }) : ""}>
                  <span className="inline-flex h-5 items-center gap-1 rounded-md bg-amber-50 px-1.5 text-2xs font-semibold text-amber-800 ring-1 ring-amber-600/20 ring-inset">
                    <Pencil className="size-2.5" />
                    {t("list.draftChanges")}
                  </span>
                </Tooltip>
              )}
            </div>
          ),
        }),
        helper.display({ id: "status", header: () => t("list.columns.status"), cell: ({ row: { original: r } }) => <WorkflowStatusPill status={r.wf.status} /> }),
        helper.display({
          id: "actions",
          header: () => <span className="sr-only">{t("list.columns.actions")}</span>,
          cell: ({ row: { original: r } }) => (
            <Menu>
              <MenuTrigger asChild>
                <Button size="sm" variant="ghost" iconOnly aria-label={t("list.menu.actionsFor", { name: fmt.text(r.wf.name) })} onClick={(e) => e.stopPropagation()}>
                  <MoreHorizontal className="size-4" />
                </Button>
              </MenuTrigger>
              <MenuContent align="end">
                <MenuItem onSelect={() => router.push(`/workflows/${r.wf.id}`)}>
                  <Eye className="size-4 text-ink-3" />
                  {t("list.menu.view")}
                </MenuItem>
                {canEdit && (
                  <>
                    <MenuItem onSelect={() => router.push(`/workflows/${r.wf.id}?edit=1`)}>
                      <Pencil className="size-4 text-ink-3" />
                      {t("list.menu.edit")}
                    </MenuItem>
                    <MenuItem onSelect={() => void duplicate(r.wf)}>
                      <Copy className="size-4 text-ink-3" />
                      {t("list.menu.duplicate")}
                    </MenuItem>
                    {r.wf.currentVersionId && r.wf.status === "active" && (
                      <MenuItem onSelect={() => router.push(`/workflows/${r.wf.id}?allot=1`)}>
                        <Share2 className="size-4 text-ink-3" />
                        {t("list.menu.allot")}
                      </MenuItem>
                    )}
                  </>
                )}
                {canPublish && (
                  <>
                    {r.wf.draft && (
                      <MenuItem onSelect={() => router.push(`/workflows/${r.wf.id}?publish=1`)}>
                        <Rocket className="size-4 text-ink-3" />
                        {t("list.menu.publish")}
                      </MenuItem>
                    )}
                    {r.wf.currentVersionId && <MenuSeparator />}
                    {r.wf.currentVersionId && r.wf.status === "active" && (
                      <MenuItem onSelect={() => setDeactivating(r.wf)}>
                        <Power className="size-4 text-rose-500" />
                        <span className="text-rose-700">{t("list.menu.deactivate")}</span>
                      </MenuItem>
                    )}
                    {r.wf.currentVersionId && r.wf.status === "inactive" && (
                      <MenuItem onSelect={() => void activate(r.wf)}>
                        <Power className="size-4 text-emerald-600" />
                        {t("list.menu.activate")}
                      </MenuItem>
                    )}
                  </>
                )}
              </MenuContent>
            </Menu>
          ),
        }),
      ]),
    [db, fmt, t, canEdit, canPublish, router], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const table = useTable({ features, columns, data: rows });

  if (!viewer.can("workflows.view") && !canEdit) {
    return <EmptyState icon={Lock} title={t("noAccess.title")} body={t("noAccess.body")} />;
  }

  return (
    <div className={cn(PAGE, "pb-12")}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink">{t("list.title")}</h1>
          <p className="mt-1.5 text-sm text-ink-2">{t("list.subtitle")}</p>
        </div>
        {canEdit ? (
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="size-4" strokeWidth={2.5} />
            {t("list.create")}
          </Button>
        ) : (
          <Pill tone="slate" dot={false}>
            <Eye className="size-3.5" />
            {t("list.viewOnly")}
          </Pill>
        )}
      </div>

      {gaps.length ? (
        <div className="mt-6 rounded-xl bg-amber-50 px-5 py-4 ring-1 ring-amber-600/20">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <TriangleAlert className="size-4" />
            {t("list.gaps", { count: gaps.length, n: fmt.number(gaps.length) })}
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {gaps.map((g) => {
              const reg = db.registrations[g.registrationId];
              return (
                <li key={`${g.registrationId}:${g.badgeTypeId}`} className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-2.5 py-1 text-xs text-ink ring-1 ring-amber-600/20">
                  {fmt.text(reg.name)} · <span className="font-mono text-ink-3">{db.events[reg.eventId]?.code}</span>
                  <BadgeTypeChip id={g.badgeTypeId} label={fmt.text(db.badgeTypes[g.badgeTypeId]?.name)} />
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="mt-6 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-600/15">
          <CircleCheck className="size-4 shrink-0" />
          {t("list.noGaps")}
        </p>
      )}

      <section className="mt-5 overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-line">
        <div className="flex flex-wrap items-center gap-2 px-5 py-3.5">
          <label className="relative me-1 w-full max-w-72">
            <span className="sr-only">{t("list.search")}</span>
            <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("list.searchPlaceholder")}
              className="h-8 w-full rounded-lg border border-line-strong bg-surface ps-8 pe-3 text-sm outline-none placeholder:text-ink-3 focus:border-accent focus:ring-4 focus:ring-accent/10"
            />
          </label>
          <SingleFilter
            label={t("list.statusFilter")}
            value={status}
            defaultValue="all"
            onChange={setStatus}
            options={[
              { value: "all", label: t("list.anyStatus") },
              { value: "draft", label: t("status.draft") },
              { value: "active", label: t("status.active") },
              { value: "inactive", label: t("status.inactive") },
            ]}
          />
          <span className="tabular ms-auto text-xs text-ink-3">
            {t("list.count", { shown: fmt.number(rows.length), total: fmt.number(all.length) })}
          </span>
        </div>
        <div className="@container overflow-x-auto border-t border-line">
          {rows.length ? (
            <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
              <thead className="bg-subtle">
                {table.getHeaderGroups().map((group) => (
                  <tr key={group.id}>
                    {group.headers.map((header) => (
                      <th key={header.id} scope="col" className={cn("eyebrow h-10 border-b border-line px-3 text-start whitespace-nowrap first:ps-5 last:pe-5", COLUMN_CLASS[header.column.id])}>
                        <table.FlexRender header={header} />
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => router.push(`/workflows/${row.original.wf.id}`)}
                    className={cn("group cursor-pointer transition-colors hover:bg-subtle", row.original.wf.status === "inactive" && "bg-subtle/60")}
                  >
                    {row.getAllCells().map((cell) => (
                      <td
                        key={cell.id}
                        className={cn("h-[68px] border-b border-line px-3 align-middle group-last:border-b-0 first:ps-5 last:pe-5", cell.column.id !== "actions" && "truncate", COLUMN_CLASS[cell.column.id])}
                      >
                        <table.FlexRender cell={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState icon={SearchX} title={t("list.emptyTitle")} body={t("list.emptyBody")} />
          )}
        </div>
      </section>

      {creating && <CreateWorkflowDialog db={db} open onOpenChange={(o) => !o && setCreating(false)} />}
      {deactivating && <DeactivateDialog wf={db.workflows[deactivating.id]} onClose={() => setDeactivating(null)} />}
    </div>
  );
}
