"use client";

import {
  AlarmClock,
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Gauge,
  Hand,
  History,
  Inbox,
  Lock,
  MoreHorizontal,
  Pencil,
  Power,
  SearchX,
  ShieldAlert,
  Shuffle,
  Tag,
  TriangleAlert,
  UserRoundCog,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState, type ReactNode } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { DirIcon } from "@/components/ui/DirIcon";
import { EmptyState } from "@/components/ui/EmptyState";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/Menu";
import { BadgeTypeChip, Pill } from "@/components/ui/Status";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Tooltip } from "@/components/ui/Tooltip";
import { TONE, type Tone } from "@/design/tones";
import { can } from "@/domain/permissions";
import { teamLoad, teamStageUses, type StageUse } from "@/domain/teams";
import type { Database, ID, Team, TeamHistoryEvent } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { useNow } from "@/lib/useNow";
import { useDb } from "@/store/app";
import { useViewer } from "@/store/useViewer";
import { AccessMatrix, AccessStrip, BadgeScope, ConditionLine, TeamMark, TeamRolePill, TeamStatusPill, useChangeText, useEventScopeText } from "./parts";
import { DeactivateDialog, useActivateTeam } from "./StatusDialog";

const ASSIGNMENT_ICON: Record<Team["assignmentMode"], LucideIcon> = { selfClaim: Hand, leadAssigns: UserRoundCog, roundRobin: Shuffle };

function Card({ title, subtitle, action, children, className }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-line", className)}>
      <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function HeaderFact({ icon: Icon, tone, label, children }: { icon: LucideIcon; tone: Tone; label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-lg", TONE[tone].chip)}>
        <Icon className="size-4" strokeWidth={2.1} />
      </span>
      <div className="min-w-0">
        <dt className="text-xs font-medium text-ink-3">{label}</dt>
        <dd className="mt-0.5 text-sm font-semibold text-ink">{children}</dd>
      </div>
    </div>
  );
}

// ─── Overview ───────────────────────────────────────────────────────────

function AccessCard({ db, team }: { db: Database; team: Team }) {
  const t = useTranslations("teams.detail");
  const fmt = useFormat();
  const [open, setOpen] = useState<ID | null>(team.access[0]?.registrationId ?? null);
  return (
    <Card title={t("access.title")} subtitle={t("access.subtitle", { count: team.access.length, n: fmt.number(team.access.length) })}>
      <ul className="border-t border-line">
        {team.access.map((a) => {
          const reg = db.registrations[a.registrationId];
          if (!reg) return null;
          const expanded = open === reg.id;
          return (
            <li key={reg.id} className="border-b border-line last:border-b-0">
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : reg.id)}
                className="flex w-full flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3.5 text-start transition-colors outline-none hover:bg-subtle focus-visible:bg-subtle"
              >
                <span className="flex min-w-56 flex-1 items-center gap-3">
                  {expanded ? <ChevronDown className="size-4 shrink-0 text-ink-3" /> : <DirIcon icon={ChevronRight} className="size-4 shrink-0 text-ink-3" />}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">{fmt.text(reg.name)}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1">
                      <span className="ltr-data me-1 font-mono text-2xs font-medium text-ink-3">{db.events[reg.eventId]?.code}</span>
                      {reg.badgeTypeIds.map((b) => (
                        <BadgeTypeChip key={b} id={b} label={fmt.text(db.badgeTypes[b]?.name)} />
                      ))}
                    </span>
                  </span>
                </span>
                <AccessStrip reg={reg} fields={a.fields} />
              </button>
              {expanded && (
                <div className="border-t border-line">
                  <AccessMatrix reg={reg} fields={a.fields} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function LoadTile({ icon: Icon, tone, label, value, attention }: { icon: LucideIcon; tone: Tone; label: string; value: string; attention?: boolean }) {
  return (
    <div className="bg-surface px-4 py-3.5">
      <span className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
        <Icon className={cn("size-3.5", TONE[tone].text)} strokeWidth={2.25} />
        {label}
      </span>
      <span className={cn("tabular mt-1 block text-xl font-bold tracking-tight", attention ? "text-attention" : "text-ink")}>{value}</span>
    </div>
  );
}

function Overview({ db, team, load }: { db: Database; team: Team; load: ReturnType<typeof teamLoad> }) {
  const t = useTranslations("teams.detail");
  const fmt = useFormat();
  const eventText = useEventScopeText(db);
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_23rem]">
      <AccessCard db={db} team={team} />

      <div className="space-y-5">
        <Card
          title={t("load.title")}
          subtitle={t("load.subtitle")}
          action={
            load.open > 0 ? (
              <Link href={`/queue?team=${team.id}`} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-accent-text hover:underline">
                {t("load.openQueue")}
                <DirIcon icon={ArrowUpRight} className="size-3.5" />
              </Link>
            ) : undefined
          }
        >
          <div className="grid grid-cols-2 gap-px border-t border-line bg-line">
            <LoadTile icon={Inbox} tone="sky" label={t("load.open")} value={fmt.number(load.open)} />
            <LoadTile icon={AlarmClock} tone="amber" label={t("load.late")} value={fmt.number(load.late)} attention={load.late > 0} />
            <LoadTile icon={Hand} tone="indigo" label={t("load.unclaimed")} value={fmt.number(load.unclaimed)} />
            <LoadTile icon={CircleCheck} tone="emerald" label={t("load.decisions")} value={fmt.number(load.decisions)} />
          </div>
        </Card>

        <Card title={t("routing.title")} subtitle={t("routing.subtitle")}>
          <ol className="space-y-3.5 border-t border-line px-5 py-4">
            {[
              { k: "events" as const, body: eventText(team.eventScope) },
              { k: "badgeTypes" as const, body: <BadgeScope db={db} scope={team.badgeScope} max={6} /> },
              { k: "registrations" as const, body: t("routing.registrationCount", { count: team.access.length, n: fmt.number(team.access.length) }) },
            ].map((step, i) => (
              <li key={step.k} className="flex gap-3">
                <span className="tabular inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-2xs font-bold text-accent-text">
                  {fmt.number(i + 1)}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-ink-3">{t(`routing.${step.k}`)}</p>
                  <div className="mt-0.5 text-sm text-ink">{step.body}</div>
                </div>
              </li>
            ))}
            <li className="flex gap-3">
              <span className="tabular inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-2xs font-bold text-accent-text">{fmt.number(4)}</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-ink-3">
                  {t("routing.conditions")}
                  {team.conditions.length > 1 && <span className="ms-1.5 text-ink-2">· {team.conditionMatch === "all" ? t("routing.matchAll") : t("routing.matchAny")}</span>}
                </p>
                {team.conditions.length ? (
                  <ul className="mt-1.5 space-y-1.5">
                    {team.conditions.map((c) => (
                      <li key={c.id}>
                        <ConditionLine db={db} condition={c} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-0.5 text-sm text-ink-2">{t("routing.noConditions")}</p>
                )}
              </div>
            </li>
          </ol>
        </Card>
      </div>
    </div>
  );
}

// ─── Members ────────────────────────────────────────────────────────────

function Members({ db, team, load, canEdit }: { db: Database; team: Team; load: ReturnType<typeof teamLoad>; canEdit: boolean }) {
  const t = useTranslations("teams.detail.members");
  const fmt = useFormat();
  const members = [...team.members].sort((a, b) => (a.role === b.role ? 0 : a.role === "lead" ? -1 : 1));
  return (
    <Card
      title={t("title")}
      subtitle={t("subtitle", { n: fmt.number(team.maxOpenClaims) })}
      action={
        canEdit ? (
          <Link href={`/teams/${team.id}/edit#members`}>
            <Button size="sm">
              <Pencil className="size-3.5" />
              {t("manage")}
            </Button>
          </Link>
        ) : undefined
      }
    >
      <div className="@container overflow-x-auto border-t border-line">
        <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
          <thead className="bg-subtle">
            <tr>
              {(["member", "companyRole", "teamRole", "claims", "decisions"] as const).map((c) => (
                <th
                  key={c}
                  scope="col"
                  className={cn(
                    "eyebrow h-10 border-b border-line px-3 text-start first:ps-5 last:pe-5",
                    c === "companyRole" && "hidden w-48 @[44rem]:table-cell",
                    c === "teamRole" && "w-32",
                    c === "claims" && "w-44",
                    c === "decisions" && "hidden w-40 @[36rem]:table-cell",
                  )}
                >
                  {t(`columns.${c}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const user = db.users[m.userId];
              const stats = load.members.get(m.userId) ?? { claims: 0, decisions: 0 };
              const noAccess = !can(db, m.userId, "queue.access");
              const share = Math.min(1, stats.claims / Math.max(1, team.maxOpenClaims));
              return (
                <tr key={m.userId}>
                  <td className="h-16 border-b border-line px-3 ps-5">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={user?.name ?? "?"} size="md" />
                      <div className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate font-semibold text-ink">{user?.name}</span>
                          {noAccess && (
                            <Tooltip content={t("noQueueAccess")}>
                              <TriangleAlert className="size-3.5 shrink-0 text-amber-500" aria-label={t("noQueueAccess")} />
                            </Tooltip>
                          )}
                        </span>
                        <span className="ltr-data block truncate text-xs text-ink-3">{user?.email}</span>
                      </div>
                    </div>
                  </td>
                  <td className="hidden truncate border-b border-line px-3 text-ink-2 @[44rem]:table-cell">
                    <span className="block truncate">{fmt.text(db.roles[user?.roleId ?? ""]?.name)}</span>
                    <span className="block truncate text-xs text-ink-3">{fmt.text(user?.title)}</span>
                  </td>
                  <td className="border-b border-line px-3">
                    <TeamRolePill role={m.role} />
                  </td>
                  <td className="border-b border-line px-3">
                    <span className="tabular text-xs font-semibold text-ink">{t("claimsOf", { n: fmt.number(stats.claims), max: fmt.number(team.maxOpenClaims) })}</span>
                    <span className="mt-1 block h-1.5 w-28 overflow-hidden rounded-full bg-hover">
                      <span
                        className={cn("block h-full rounded-full", share >= 1 ? "bg-amber-500" : "bg-indigo-400")}
                        style={{ width: `${share * 100}%` }}
                      />
                    </span>
                  </td>
                  <td className="tabular hidden border-b border-line px-3 pe-5 font-semibold text-ink @[36rem]:table-cell">{fmt.number(stats.decisions)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ─── Used in stages ─────────────────────────────────────────────────────

function UsedIn({ db, team, uses }: { db: Database; team: Team; uses: StageUse[] }) {
  const t = useTranslations("teams.detail.usedIn");
  const fmt = useFormat();
  if (!uses.length) {
    return (
      <div className="rounded-xl bg-surface shadow-card ring-1 ring-line">
        <EmptyState icon={Workflow} title={t("emptyTitle")} body={t("emptyBody")} />
      </div>
    );
  }
  const groups = new Map<string, StageUse[]>();
  for (const u of uses) {
    const key = `${u.workflowId}:${u.source}`;
    groups.set(key, [...(groups.get(key) ?? []), u]);
  }
  const sourceTone = { live: "emerald", inactive: "gray", draft: "amber" } as const;

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 text-sm text-ink-2">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-ink-3" />
        {t("explainer")}
      </p>
      {[...groups.values()].map((list) => {
        const first = list[0];
        const wf = db.workflows[first.workflowId];
        return (
          <section key={`${first.workflowId}:${first.source}`} className="overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-line">
            <header className="flex flex-wrap items-center gap-3 px-5 py-3.5">
              <span className={cn("inline-flex size-8 items-center justify-center rounded-lg", TONE.violet.chip)}>
                <Workflow className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-bold text-ink">{fmt.text(wf?.name)}</h3>
                <p className="truncate text-xs text-ink-3">{fmt.text(wf?.label)}</p>
              </div>
              <Pill tone={sourceTone[first.source]}>
                {t(`source.${first.source}`)}
                {first.versionNo !== null && <span className="ltr-data opacity-70">v{first.versionNo}</span>}
              </Pill>
            </header>
            <ul className="border-t border-line">
              {list.map((u) => (
                <li key={`${u.nodeId}:${u.role}`} className="flex flex-wrap items-center gap-x-6 gap-y-2.5 border-b border-line px-5 py-3.5 last:border-b-0">
                  <div className="min-w-48 flex-1">
                    <p className="text-sm font-semibold text-ink">{fmt.text(u.stageName)}</p>
                    <p className="text-xs text-ink-3">
                      {u.role === "fallback" ? t("asFallback") : t("asPriority", { n: fmt.number(u.position), total: fmt.number(u.teams.length) })}
                    </p>
                  </div>
                  <ol aria-label={t("order")} className="flex flex-wrap items-center gap-1.5">
                    {u.teams.map((id, i) => (
                      <li key={id} className="flex items-center gap-1.5">
                        {i > 0 && <DirIcon icon={ChevronRight} className="size-3 text-ink-3" />}
                        <TeamChip db={db} id={id} current={id === team.id} label={fmt.number(i + 1)} />
                      </li>
                    ))}
                    {u.fallbackTeamId && (
                      <li className="flex items-center gap-1.5">
                        <span className="mx-1 h-4 w-px bg-line-strong" />
                        <TeamChip db={db} id={u.fallbackTeamId} current={u.fallbackTeamId === team.id} label={t("fallbackShort")} />
                      </li>
                    )}
                  </ol>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function TeamChip({ db, id, current, label }: { db: Database; id: ID; current: boolean; label: string }) {
  const fmt = useFormat();
  const name = fmt.text(db.teams[id]?.name);
  const body = (
    <>
      <span className={cn("tabular rounded px-1 text-2xs font-bold", current ? "bg-indigo-100 text-indigo-700" : "bg-hover text-ink-3")}>{label}</span>
      <span className="max-w-44 truncate">{name}</span>
    </>
  );
  const cls = cn(
    "inline-flex h-7 items-center gap-1.5 rounded-lg ps-1 pe-2.5 text-xs font-medium",
    current ? "bg-accent-soft text-accent-text ring-1 ring-indigo-200" : "bg-surface text-ink-2 ring-1 ring-line hover:bg-subtle",
  );
  return current ? (
    <span aria-current="true" className={cls}>
      {body}
    </span>
  ) : (
    <Link href={`/teams/${id}`} className={cls}>
      {body}
    </Link>
  );
}

// ─── History ────────────────────────────────────────────────────────────

const KIND_TONE: Record<TeamHistoryEvent["kind"], string> = {
  created: "bg-indigo-500",
  updated: "bg-sky-500",
  activated: "bg-emerald-500",
  deactivated: "bg-rose-500",
};

function HistoryList({ db, events, now }: { db: Database; events: TeamHistoryEvent[]; now: number }) {
  const t = useTranslations("teams.history");
  const fmt = useFormat();
  const changeText = useChangeText(db);
  return (
    <div className="rounded-xl bg-surface px-5 py-2 shadow-card ring-1 ring-line">
      <ol>
        {events.map((e) => {
          const actor = db.users[e.actorId];
          return (
            <li key={e.id} className="relative flex gap-3.5 border-b border-line py-4 last:border-b-0">
              <span className="relative h-fit shrink-0">
                <Avatar name={actor?.name ?? "?"} size="md" className="block" />
                <span aria-hidden className={cn("absolute -end-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-surface", KIND_TONE[e.kind])} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink">
                  <span className="font-semibold">{actor?.name}</span>
                  <span className="text-ink-2"> · {t(`kinds.${e.kind}`)}</span>
                </p>
                {e.changes.length > 0 && (
                  <ul className="mt-1.5 space-y-1">
                    {e.changes.map((c, i) => (
                      <li key={i} className="flex gap-2 text-sm text-ink-2">
                        <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-ink-3" />
                        <span>{changeText(c)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <Tooltip content={fmt.full(e.at)}>
                <time dateTime={e.at} className="tabular shrink-0 text-xs text-ink-3">
                  {fmt.ago(e.at, now)}
                </time>
              </Tooltip>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────

export function TeamDetailPage({ id }: { id: ID }) {
  const t = useTranslations("teams");
  const td = useTranslations("teams.detail");
  const ta = useTranslations("teams.assignment.modes");
  const fmt = useFormat();
  const db = useDb();
  const viewer = useViewer();
  const now = useNow();
  const eventText = useEventScopeText(db);
  const activate = useActivateTeam();
  const [deactivating, setDeactivating] = useState(false);
  const team = db.teams[id];

  const uses = useMemo(() => (team ? teamStageUses(db, team.id) : []), [db, team]);
  const load = useMemo(() => (team ? teamLoad(db, team.id, now) : null), [db, team, now]);
  const history = useMemo(
    () => Object.values(db.teamHistory).filter((h) => h.teamId === id).sort((a, b) => b.at.localeCompare(a.at)),
    [db, id],
  );

  if (!viewer.can("teams.view") && !viewer.can("teams.edit")) {
    return <EmptyState icon={Lock} title={t("empty.noAccessTitle")} body={t("empty.noAccessBody")} />;
  }
  if (!team || !load) {
    return (
      <EmptyState
        icon={SearchX}
        title={td("notFound")}
        action={
          <Link href="/teams" className="text-sm text-accent-text hover:underline">
            {td("backToTeams")}
          </Link>
        }
      />
    );
  }

  const canEdit = viewer.can("teams.edit");
  const AssignIcon = ASSIGNMENT_ICON[team.assignmentMode];

  return (
    <div className="mx-auto max-w-[88rem] px-4 pt-5 sm:px-6 lg:px-7 lg:pt-6 pb-16">
      <nav className="flex items-center gap-1.5 text-xs font-medium text-ink-3">
        <Link href="/teams" className="hover:text-accent-text">
          {td("backToTeams")}
        </Link>
        <DirIcon icon={ChevronRight} className="size-3.5" />
        <span className="text-ink-2">{fmt.text(team.name)}</span>
      </nav>

      <header className="mt-4 rounded-xl bg-surface p-6 shadow-card ring-1 ring-line">
        <div className="flex flex-wrap items-start gap-5">
          <TeamMark team={team} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="text-2xl font-bold tracking-tight text-ink">{fmt.text(team.name)}</h1>
              <TeamStatusPill status={team.status} size="md" />
            </div>
            {fmt.text(team.description) && <p className="mt-1 max-w-3xl text-sm text-ink-2">{fmt.text(team.description)}</p>}
            <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-3">
              <History className="size-3.5" />
              {td("updated", { time: fmt.ago(team.updatedAt, now) })}
            </p>
          </div>
          {canEdit && (
            <div className="flex items-center gap-2">
              <Link href={`/teams/${team.id}/edit`}>
                <Button variant="primary">
                  <Pencil className="size-4" />
                  {td("edit")}
                </Button>
              </Link>
              <Menu>
                <MenuTrigger asChild>
                  <Button iconOnly aria-label={td("more")}>
                    <MoreHorizontal className="size-4" />
                  </Button>
                </MenuTrigger>
                <MenuContent align="end">
                  {team.status === "active" ? (
                    <MenuItem onSelect={() => setDeactivating(true)}>
                      <Power className="size-4 text-rose-500" />
                      <span className="text-rose-700">{t("actions.deactivate")}</span>
                    </MenuItem>
                  ) : (
                    <MenuItem onSelect={() => void activate(team)}>
                      <Power className="size-4 text-emerald-600" />
                      {t("actions.activate")}
                    </MenuItem>
                  )}
                </MenuContent>
              </Menu>
            </div>
          )}
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-5 md:grid-cols-4">
          <HeaderFact icon={CalendarDays} tone="sky" label={td("facts.events")}>
            <span className="line-clamp-2">{eventText(team.eventScope)}</span>
          </HeaderFact>
          <HeaderFact icon={Tag} tone="gold" label={td("facts.badgeTypes")}>
            <BadgeScope db={db} scope={team.badgeScope} max={4} />
          </HeaderFact>
          <HeaderFact icon={AssignIcon} tone="violet" label={td("facts.assignment")}>
            {ta(`${team.assignmentMode}.label`)}
          </HeaderFact>
          <HeaderFact icon={Gauge} tone="teal" label={td("facts.maxClaims")}>
            {td("facts.maxClaimsValue", { n: fmt.number(team.maxOpenClaims) })}
          </HeaderFact>
        </dl>
      </header>

      <Tabs defaultValue="overview" className="mt-5">
        <TabsList className="mb-5">
          <TabsTrigger value="overview">{td("tabs.overview")}</TabsTrigger>
          <TabsTrigger value="members" count={team.members.length}>
            {td("tabs.members")}
          </TabsTrigger>
          <TabsTrigger value="usedIn" count={uses.length}>
            {td("tabs.usedIn")}
          </TabsTrigger>
          <TabsTrigger value="history" count={history.length}>
            {td("tabs.history")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="outline-none">
          <Overview db={db} team={team} load={load} />
        </TabsContent>
        <TabsContent value="members" className="outline-none">
          <Members db={db} team={team} load={load} canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="usedIn" className="outline-none">
          <UsedIn db={db} team={team} uses={uses} />
        </TabsContent>
        <TabsContent value="history" className="outline-none">
          <HistoryList db={db} events={history} now={now} />
        </TabsContent>
      </Tabs>

      {deactivating && <DeactivateDialog team={team} open onOpenChange={(o) => !o && setDeactivating(false)} />}
    </div>
  );
}
