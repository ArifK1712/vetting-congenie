"use client";

import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { AlarmClock, ChevronRight, Eye, Inbox, Lock, MoreHorizontal, Pencil, Plus, Power, Search, SearchX, UserRoundCheck, UsersRound, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DirIcon } from "@/components/ui/DirIcon";
import { EmptyState } from "@/components/ui/EmptyState";
import { MultiFilter, SingleFilter } from "@/components/ui/FilterMenu";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/Menu";
import { Pill } from "@/components/ui/Status";
import { TONE, type Tone } from "@/design/tones";
import { teamLoad, teamStageUses } from "@/domain/teams";
import type { Team } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { useNow } from "@/lib/useNow";
import { useDb } from "@/store/app";
import { useViewer } from "@/store/useViewer";
import { BadgeScope, MemberStack, TeamMark, TeamStatusPill, useEventScopeText } from "./parts";
import { DeactivateDialog, useActivateTeam } from "./StatusDialog";

interface Row {
  index: number;
  team: Team;
  uses: ReturnType<typeof teamStageUses>;
  load: ReturnType<typeof teamLoad>;
}

const features = tableFeatures({});
const helper = createColumnHelper<typeof features, Row>();

/** Columns drop out by container width; team, members, status and actions always stay. */
const COLUMN_CLASS: Record<string, string> = {
  index: "w-12",
  team: "",
  badgeTypes: "hidden w-52 @[52rem]:table-cell",
  members: "w-52",
  usedIn: "hidden w-48 @[62rem]:table-cell",
  load: "hidden w-36 @[78rem]:table-cell",
  status: "w-28",
  actions: "w-16 text-end",
};

type StatusFilter = "all" | "active" | "inactive";

function Metric({ icon: Icon, tone, label, value, hint, hintTone }: { icon: LucideIcon; tone: Tone; label: string; value: string; hint: string; hintTone?: "attention" }) {
  return (
    <div className="flex items-start gap-3.5 bg-surface px-5 py-4">
      <span className={cn("mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl", TONE[tone].chip)}>
        <Icon className="size-[18px]" strokeWidth={2.1} />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-ink-2">{label}</p>
        <p className="tabular mt-0.5 text-2xl leading-tight font-bold tracking-tight text-ink">{value}</p>
        <p className={cn("mt-0.5 truncate text-xs", hintTone === "attention" ? "font-medium text-attention" : "text-ink-3")}>{hint}</p>
      </div>
    </div>
  );
}

export function TeamsListPage() {
  const t = useTranslations("teams");
  const fmt = useFormat();
  const db = useDb();
  const viewer = useViewer();
  const router = useRouter();
  const now = useNow();
  const eventText = useEventScopeText(db);
  const activate = useActivateTeam();
  const canEdit = viewer.can("teams.edit");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [badgeTypeIds, setBadgeTypeIds] = useState<string[]>([]);
  const [eventIds, setEventIds] = useState<string[]>([]);
  const [deactivating, setDeactivating] = useState<Team | null>(null);

  const all = useMemo<Row[]>(() => {
    const teams = Object.values(db.teams).sort(
      (a, b) => (a.status === b.status ? 0 : a.status === "active" ? -1 : 1) || a.createdAt.localeCompare(b.createdAt),
    );
    return teams.map((team, i) => ({ index: i + 1, team, uses: teamStageUses(db, team.id), load: teamLoad(db, team.id, now) }));
  }, [db, now]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const overlaps = (scope: "all" | string[], picked: string[]) => !picked.length || scope === "all" || scope.some((x) => picked.includes(x));
    return all.filter(
      ({ team }) =>
        (status === "all" || team.status === status) &&
        overlaps(team.badgeScope, badgeTypeIds) &&
        overlaps(team.eventScope, eventIds) &&
        (!q || `${team.name.en} ${team.name.ar}`.toLowerCase().includes(q)),
    );
  }, [all, search, status, badgeTypeIds, eventIds]);

  const totals = useMemo(() => {
    const active = all.filter((r) => r.team.status === "active");
    const people = new Set(active.flatMap((r) => r.team.members.map((m) => m.userId)));
    const leads = new Set(active.flatMap((r) => r.team.members.filter((m) => m.role === "lead").map((m) => m.userId)));
    return {
      active: active.length,
      total: all.length,
      people: people.size,
      leads: leads.size,
      open: active.reduce((s, r) => s + r.load.open, 0),
      unclaimed: active.reduce((s, r) => s + r.load.unclaimed, 0),
      late: active.reduce((s, r) => s + r.load.late, 0),
      lateTeams: active.filter((r) => r.load.late > 0).length,
    };
  }, [all]);

  const columns = useMemo(
    () =>
      helper.columns([
        helper.display({
          id: "index",
          header: () => t("columns.index"),
          cell: ({ row }) => <span className="tabular text-xs font-medium text-ink-3">{fmt.number(row.original.index)}</span>,
        }),
        helper.display({
          id: "team",
          header: () => t("columns.team"),
          cell: ({ row: { original: r } }) => (
            <div className="flex min-w-0 items-center gap-3">
              <TeamMark team={r.team} />
              <div className="min-w-0">
                <Link
                  href={`/teams/${r.team.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className={cn("block truncate font-semibold hover:text-accent-text", r.team.status === "inactive" ? "text-ink-2" : "text-ink")}
                >
                  {fmt.text(r.team.name)}
                </Link>
                <span className="block truncate text-xs text-ink-3">{eventText(r.team.eventScope)}</span>
              </div>
            </div>
          ),
        }),
        helper.display({
          id: "badgeTypes",
          header: () => t("columns.badgeTypes"),
          cell: ({ row: { original: r } }) => <BadgeScope db={db} scope={r.team.badgeScope} />,
        }),
        helper.display({
          id: "members",
          header: () => t("columns.members"),
          cell: ({ row: { original: r } }) => {
            const lead = r.team.members.find((m) => m.role === "lead");
            return (
              <div className="flex items-center gap-2.5">
                <MemberStack db={db} members={r.team.members} max={3} />
                <span className="min-w-0 text-xs">
                  <span className="tabular block font-semibold text-ink">{t("memberCount", { count: r.team.members.length, n: fmt.number(r.team.members.length) })}</span>
                  <span className="block truncate text-ink-3">{lead ? db.users[lead.userId]?.name.split(" ")[0] : t("noLead")}</span>
                </span>
              </div>
            );
          },
        }),
        helper.display({
          id: "usedIn",
          header: () => t("columns.usedIn"),
          cell: ({ row: { original: r } }) => {
            const live = r.uses.filter((u) => u.source !== "draft");
            if (!live.length) return <span className="text-xs text-ink-3">{t("notUsed")}</span>;
            const workflows = [...new Set(live.map((u) => u.workflowId))];
            return (
              <div className="min-w-0 text-xs">
                <span className="tabular block font-semibold text-ink">{t("stageCount", { count: live.length, n: fmt.number(live.length) })}</span>
                <span className="block truncate text-ink-3">{workflows.map((w) => fmt.text(db.workflows[w]?.label)).join(" · ")}</span>
              </div>
            );
          },
        }),
        helper.display({
          id: "load",
          header: () => t("columns.load"),
          cell: ({ row: { original: r } }) =>
            r.load.open === 0 ? (
              <span className="text-xs text-ink-3">{t("noOpen")}</span>
            ) : (
              <div className="flex items-center gap-2">
                <span className="tabular text-sm font-semibold text-ink">{fmt.number(r.load.open)}</span>
                {r.load.late > 0 && (
                  <span className="tabular inline-flex h-5 items-center gap-1 rounded-md bg-attention-soft px-1.5 text-2xs font-semibold text-attention">
                    <AlarmClock className="size-3" />
                    {t("lateCount", { n: fmt.number(r.load.late) })}
                  </span>
                )}
              </div>
            ),
        }),
        helper.display({
          id: "status",
          header: () => t("columns.status"),
          cell: ({ row: { original: r } }) => <TeamStatusPill status={r.team.status} />,
        }),
        helper.display({
          id: "actions",
          header: () => <span className="sr-only">{t("columns.actions")}</span>,
          cell: ({ row: { original: r } }) => (
            <Menu>
              <MenuTrigger asChild>
                <Button size="sm" variant="ghost" iconOnly aria-label={t("rowActions", { name: fmt.text(r.team.name) })} onClick={(e) => e.stopPropagation()}>
                  <MoreHorizontal className="size-4" />
                </Button>
              </MenuTrigger>
              <MenuContent align="end">
                <MenuItem onSelect={() => router.push(`/teams/${r.team.id}`)}>
                  <Eye className="size-4 text-ink-3" />
                  {t("actions.view")}
                </MenuItem>
                {canEdit && (
                  <>
                    <MenuItem onSelect={() => router.push(`/teams/${r.team.id}/edit`)}>
                      <Pencil className="size-4 text-ink-3" />
                      {t("actions.edit")}
                    </MenuItem>
                    <MenuSeparator />
                    {r.team.status === "active" ? (
                      <MenuItem onSelect={() => setDeactivating(r.team)}>
                        <Power className="size-4 text-rose-500" />
                        <span className="text-rose-700">{t("actions.deactivate")}</span>
                      </MenuItem>
                    ) : (
                      <MenuItem onSelect={() => void activate(r.team)}>
                        <Power className="size-4 text-emerald-600" />
                        {t("actions.activate")}
                      </MenuItem>
                    )}
                  </>
                )}
              </MenuContent>
            </Menu>
          ),
        }),
      ]),
    [t, fmt, db, eventText, canEdit, router, activate],
  );

  const table = useTable({ features, columns, data: rows });

  if (!viewer.can("teams.view") && !canEdit) {
    return <EmptyState icon={Lock} title={t("empty.noAccessTitle")} body={t("empty.noAccessBody")} />;
  }

  const filtered = search || status !== "all" || badgeTypeIds.length || eventIds.length;
  const reset = () => {
    setSearch("");
    setStatus("all");
    setBadgeTypeIds([]);
    setEventIds([]);
  };

  return (
    <div className="mx-auto max-w-[88rem] px-7 pt-7 pb-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink">{t("title")}</h1>
          <p className="mt-1.5 text-sm text-ink-2">{t("subtitle")}</p>
        </div>
        {canEdit ? (
          <Link href="/teams/new">
            <Button variant="primary">
              <Plus className="size-4" strokeWidth={2.5} />
              {t("create")}
            </Button>
          </Link>
        ) : (
          <Pill tone="slate" dot={false}>
            <Eye className="size-3.5" />
            {t("viewOnly")}
          </Pill>
        )}
      </div>

      <div className="mt-6 grid gap-px overflow-hidden rounded-xl bg-line shadow-card ring-1 ring-line sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={UsersRound} tone="indigo" label={t("summary.teams")} value={fmt.number(totals.active)} hint={t("summary.teamsHint", { total: fmt.number(totals.total) })} />
        <Metric icon={UserRoundCheck} tone="teal" label={t("summary.people")} value={fmt.number(totals.people)} hint={t("summary.peopleHint", { count: totals.leads, n: fmt.number(totals.leads) })} />
        <Metric icon={Inbox} tone="sky" label={t("summary.open")} value={fmt.number(totals.open)} hint={t("summary.openHint", { n: fmt.number(totals.unclaimed) })} />
        <Metric
          icon={AlarmClock}
          tone="amber"
          label={t("summary.late")}
          value={fmt.number(totals.late)}
          hint={totals.late ? t("summary.lateHint", { count: totals.lateTeams, n: fmt.number(totals.lateTeams) }) : t("summary.lateNone")}
          hintTone={totals.late ? "attention" : undefined}
        />
      </div>

      <section className="mt-5 overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-line">
        <div className="flex flex-wrap items-center gap-2 px-5 py-3.5">
          <label className="relative me-1 w-full max-w-64">
            <span className="sr-only">{t("search")}</span>
            <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
            <input
              dir="auto"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("search")}
              className="h-8 w-full rounded-lg border border-line-strong bg-surface ps-8 pe-3 text-sm outline-none placeholder:text-ink-3 focus:border-accent focus:ring-4 focus:ring-accent/10"
            />
          </label>
          <SingleFilter
            label={t("filters.status")}
            value={status}
            defaultValue="all"
            onChange={(v) => setStatus(v as StatusFilter)}
            options={[
              { value: "all", label: t("filters.any") },
              { value: "active", label: t("status.active") },
              { value: "inactive", label: t("status.inactive") },
            ]}
          />
          <MultiFilter
            label={t("filters.badgeType")}
            value={badgeTypeIds}
            onChange={setBadgeTypeIds}
            options={Object.values(db.badgeTypes).map((b) => ({ value: b.id, label: fmt.text(b.name) }))}
          />
          <MultiFilter
            label={t("filters.event")}
            value={eventIds}
            onChange={setEventIds}
            wide
            options={Object.values(db.events).map((e) => ({ value: e.id, label: fmt.text(e.name), hint: e.code }))}
          />
          {filtered ? (
            <Button size="sm" variant="ghost" onClick={reset}>
              {t("filters.reset")}
            </Button>
          ) : null}
          <span className="tabular ms-auto text-xs text-ink-3">{t("showing", { shown: fmt.number(rows.length), total: fmt.number(all.length) })}</span>
        </div>

        <div className="@container overflow-x-auto border-t border-line">
          {rows.length ? (
            <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
              <thead className="bg-subtle">
                {table.getHeaderGroups().map((group) => (
                  <tr key={group.id}>
                    {group.headers.map((header) => (
                      <th
                        key={header.id}
                        scope="col"
                        className={cn("eyebrow h-10 border-b border-line px-3 text-start whitespace-nowrap first:ps-5 last:pe-5", COLUMN_CLASS[header.column.id])}
                      >
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
                    onClick={() => router.push(`/teams/${row.original.team.id}`)}
                    className={cn("group cursor-pointer transition-colors hover:bg-subtle", row.original.team.status === "inactive" && "bg-subtle/60")}
                  >
                    {row.getAllCells().map((cell) => (
                      <td
                        key={cell.id}
                        className={cn(
                          "h-[68px] border-b border-line px-3 align-middle group-last:border-b-0 first:ps-5 last:pe-5",
                          cell.column.id !== "actions" && cell.column.id !== "badgeTypes" && "truncate",
                          COLUMN_CLASS[cell.column.id],
                        )}
                      >
                        <table.FlexRender cell={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState
              icon={SearchX}
              title={t("empty.title")}
              body={t("empty.body")}
              action={<Button onClick={reset}>{t("filters.reset")}</Button>}
            />
          )}
        </div>
      </section>

      <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-3">
        <DirIcon icon={ChevronRight} className="size-3.5" />
        {t("footnote")}
      </p>

      {deactivating && (
        <DeactivateDialog team={db.teams[deactivating.id]} open onOpenChange={(o) => !o && setDeactivating(null)} />
      )}
    </div>
  );
}
