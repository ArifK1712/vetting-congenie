"use client";

import { CalendarClock, Eye, FileUp, Flag, Lock, MailCheck, MoreHorizontal, Pencil, Plus, Search, SearchX, ShieldBan, Trash2, TriangleAlert, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { MultiFilter, SingleFilter } from "@/components/ui/FilterMenu";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/Menu";
import { Pill } from "@/components/ui/Status";
import { TONE, type Tone } from "@/design/tones";
import { DAY_MS } from "@/domain/blacklist";
import { normalizeId, normalizeName } from "@/domain/screening";
import { effectiveStatus, LEVELS } from "@/domain/watchlist";
import type { WatchlistEntry } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { useNow } from "@/lib/useNow";
import { useDb } from "@/store/app";
import { useViewer } from "@/store/useViewer";
import { displayName, MaskedIds, TypeChip } from "@/features/blacklist/parts";
import { LEVEL_LABEL, LevelMeter, LevelPill, ON_MATCH_LABEL, RemoveDialog, STATUS_LABEL, WatchStatus } from "./parts";

function Metric({ icon: Icon, tone, label, value, hint }: { icon: LucideIcon; tone: Tone; label: string; value: number; hint: string }) {
  return (
    <div className="flex items-start gap-3.5 bg-surface px-5 py-4">
      <span className={cn("mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl", TONE[tone].chip)}>
        <Icon className="size-[18px]" strokeWidth={2.1} />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-ink-2">{label}</span>
        <span className="tabular mt-0.5 block text-2xl leading-tight font-bold tracking-tight text-ink">{value}</span>
        <span className="block truncate text-xs text-ink-3">{hint}</span>
      </span>
    </div>
  );
}

const ON_MATCH_ICON: Record<WatchlistEntry["onMatch"], LucideIcon> = { mark: Flag, markEmail: MailCheck, markStage: ShieldBan };

export function WatchlistListPage() {
  const db = useDb();
  const viewer = useViewer();
  const router = useRouter();
  const fmt = useFormat();
  const now = useNow();
  const canManage = viewer.can("watchlist.manage");

  const [search, setSearch] = useState("");
  const [levels, setLevels] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>(["active"]);
  const [type, setType] = useState("any");
  const [events, setEvents] = useState<string[]>([]);
  const [onMatch, setOnMatch] = useState<string[]>([]);
  const [removing, setRemoving] = useState<string | null>(null);

  const entries = useMemo(() => Object.values(db.watchlist).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [db]);
  const matchCount = useMemo(() => {
    const map = new Map<string, { open: number; total: number }>();
    for (const m of Object.values(db.matches)) {
      if (m.listType !== "watchlist") continue;
      const c = map.get(m.entryId) ?? { open: 0, total: 0 };
      c.total++;
      if (m.status === "open") c.open++;
      map.set(m.entryId, c);
    }
    return map;
  }, [db]);

  const rows = useMemo(() => {
    const q = search.trim();
    const qName = normalizeName(q);
    const qId = normalizeId(q);
    return entries.filter((e) => {
      if (levels.length && !levels.includes(e.level)) return false;
      if (statuses.length && !statuses.includes(effectiveStatus(e, now))) return false;
      if (type !== "any" && e.identity.subjectType !== type) return false;
      if (events.length && e.eventScope !== "all" && !e.eventScope.some((x) => events.includes(x))) return false;
      if (onMatch.length && !onMatch.includes(e.onMatch)) return false;
      if (!q) return true;
      const id = e.identity;
      const names = [id.fullName, ...id.aliases, id.company ?? ""].map(normalizeName);
      return e.id.toLowerCase().includes(q.toLowerCase()) || (qName && names.some((n) => n.includes(qName))) || (qId.length >= 3 && [id.nationalId, id.passportNo].some((x) => normalizeId(x).includes(qId))) || (!!id.email && id.email.includes(q.toLowerCase()));
    });
  }, [entries, search, levels, statuses, type, events, onMatch, now]);

  if (!viewer.can("watchlist.view")) {
    return <EmptyState icon={Lock} title="You can't see the watchlist" body="The watchlist needs the Watchlist View permission. Reviewers only see the level and the reviewer note on a request." />;
  }

  const active = entries.filter((e) => effectiveStatus(e, now) === "active");
  const marked = new Set(Object.values(db.matches).filter((m) => m.listType === "watchlist" && m.status === "open" && db.watchlist[m.entryId]?.status === "active").map((m) => m.requestId));
  const filtered = search || levels.length || statuses.join() !== "active" || type !== "any" || events.length || onMatch.length;
  const reset = () => {
    setSearch("");
    setLevels([]);
    setStatuses(["active"]);
    setType("any");
    setEvents([]);
    setOnMatch([]);
  };

  return (
    <div className="mx-auto max-w-[88rem] px-7 pt-7 pb-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink">Watchlist</h1>
          <p className="mt-1.5 text-sm text-ink-2">People and companies who need a more careful check. A match never rejects anyone on its own: it marks the request, and can email people or add a review stage.</p>
        </div>
        {canManage ? (
          <div className="flex items-center gap-2">
            <Link href="/screening/watchlist/import">
              <Button>
                <FileUp className="size-4" />
                Import file
              </Button>
            </Link>
            <Link href="/screening/watchlist/new">
              <Button variant="primary">
                <Plus className="size-4" strokeWidth={2.5} />
                Add entry
              </Button>
            </Link>
          </div>
        ) : (
          <Pill tone="slate" dot={false}>
            <Eye className="size-3.5" />
            View only
          </Pill>
        )}
      </div>

      <div className="mt-6 grid gap-px overflow-hidden rounded-xl bg-line shadow-card ring-1 ring-line sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Eye} tone="indigo" label="Active entries" value={active.length} hint={LEVELS.map((l) => `${active.filter((e) => e.level === l).length} ${LEVEL_LABEL[l].toLowerCase()}`).join(" · ")} />
        <Metric icon={TriangleAlert} tone="orange" label="High level" value={active.filter((e) => e.level === "high").length} hint={`${active.filter((e) => e.onMatch === "markStage").length} add a review stage`} />
        <Metric icon={Flag} tone="amber" label="Requests marked" value={marked.size} hint="Open matches on active entries" />
        <Metric icon={CalendarClock} tone="sky" label="Ending in 30 days" value={active.filter((e) => e.endsOn && Date.parse(e.endsOn) < now + 30 * DAY_MS).length} hint="Active entries with an end date" />
      </div>

      <section className="mt-5 overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-line">
        <div className="flex flex-wrap items-center gap-2 px-5 py-3.5">
          <label className="relative me-1 w-full max-w-72">
            <span className="sr-only">Search the watchlist</span>
            <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
            <input
              dir="auto"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, ID, email or entry"
              className="h-8 w-full rounded-lg border border-line-strong bg-surface ps-8 pe-3 text-sm outline-none placeholder:text-ink-3 focus:border-accent focus:ring-4 focus:ring-accent/10"
            />
          </label>
          <MultiFilter label="Level" value={levels} onChange={setLevels} options={LEVELS.map((l) => ({ value: l, label: LEVEL_LABEL[l] }))} />
          <MultiFilter label="Status" value={statuses} onChange={setStatuses} options={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))} />
          <SingleFilter
            label="Type"
            value={type}
            defaultValue="any"
            onChange={setType}
            options={[
              { value: "any", label: "Any type" },
              { value: "person", label: "Person" },
              { value: "company", label: "Company" },
            ]}
          />
          <MultiFilter label="Event" value={events} onChange={setEvents} wide options={Object.values(db.events).map((e) => ({ value: e.id, label: e.name.en, hint: e.code }))} />
          <MultiFilter label="On match" value={onMatch} onChange={setOnMatch} wide options={Object.entries(ON_MATCH_LABEL).map(([value, label]) => ({ value, label }))} />
          {filtered ? (
            <Button size="sm" variant="ghost" onClick={reset}>
              Reset filters
            </Button>
          ) : null}
          <span className="tabular ms-auto text-xs text-ink-3">
            {rows.length} of {entries.length}
          </span>
        </div>

        <div className="@container overflow-x-auto border-t border-line">
          {rows.length ? (
            <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
              <thead className="bg-subtle">
                <tr>
                  {[
                    ["Entry", "w-24"],
                    ["Name", ""],
                    ["Level", "w-32"],
                    ["Type", "w-28 hidden @[76rem]:table-cell"],
                    ["ID numbers", "w-44 hidden @[66rem]:table-cell"],
                    ["On match", "w-52 hidden @[52rem]:table-cell"],
                    ["Matches", "w-24"],
                    ["Status", "w-28"],
                    ["End date", "w-32 hidden @[86rem]:table-cell"],
                    ["", "w-14"],
                  ].map(([h, cls], i) => (
                    <th key={i} scope="col" className={cn("eyebrow h-10 border-b border-line px-3 text-start whitespace-nowrap first:ps-5 last:pe-5", cls)}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const status = effectiveStatus(e, now);
                  const mc = matchCount.get(e.id) ?? { open: 0, total: 0 };
                  const Icon = ON_MATCH_ICON[e.onMatch];
                  const td = "h-[64px] border-b border-line px-3 align-middle group-last:border-b-0";
                  return (
                    <tr key={e.id} onClick={() => router.push(`/screening/watchlist/${e.id}`)} className={cn("group cursor-pointer transition-colors hover:bg-subtle", status !== "active" && "text-ink-3")}>
                      <td className={cn(td, "ps-5 font-mono text-xs font-medium text-ink-2")}>{e.id}</td>
                      <td className={cn(td, "truncate")}>
                        <span className="block min-w-0">
                          <bdi className="block truncate font-semibold text-ink">{displayName(e)}</bdi>
                          <span dir="auto" className="block truncate text-xs text-ink-3">
                            {e.reviewerNote || (e.identity.aliases.length ? e.identity.aliases.join(" · ") : "—")}
                          </span>
                        </span>
                      </td>
                      <td className={td}>
                        <span className="flex items-center gap-2">
                          <LevelMeter level={e.level} />
                          <LevelPill level={e.level} />
                        </span>
                      </td>
                      <td className={cn(td, "hidden @[76rem]:table-cell")}>
                        <TypeChip type={e.identity.subjectType} />
                      </td>
                      <td className={cn(td, "hidden @[66rem]:table-cell")}>
                        {e.identity.subjectType === "company" ? (
                          <span className="text-xs text-ink-3">Company match</span>
                        ) : e.identity.nationalId || e.identity.passportNo ? (
                          <MaskedIds identity={e.identity} />
                        ) : (
                          <span className="ltr-data block truncate text-xs text-ink-2">{e.identity.email ?? "—"}</span>
                        )}
                      </td>
                      <td className={cn(td, "hidden truncate text-xs text-ink-2 @[52rem]:table-cell")}>
                        <span className="flex items-center gap-1.5">
                          <Icon className="size-3.5 shrink-0 text-ink-3" />
                          {ON_MATCH_LABEL[e.onMatch]}
                        </span>
                      </td>
                      <td className={cn(td, "tabular text-xs")}>
                        <span className="font-semibold text-ink">{mc.total}</span>
                        {mc.open > 0 && <span className="ms-1 text-amber-700">· {mc.open} open</span>}
                      </td>
                      <td className={td}>
                        <WatchStatus entry={e} now={now} />
                      </td>
                      <td className={cn(td, "tabular hidden text-xs @[86rem]:table-cell", e.endsOn ? "text-ink-2" : "text-ink-3")}>{e.endsOn ? fmt.date(e.endsOn) : "No end date"}</td>
                      <td className={cn(td, "pe-5 text-end")}>
                        <Menu>
                          <MenuTrigger asChild>
                            <Button size="sm" variant="ghost" iconOnly aria-label={`Actions for ${e.id}`} onClick={(ev) => ev.stopPropagation()}>
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </MenuTrigger>
                          <MenuContent align="end">
                            <MenuItem onSelect={() => router.push(`/screening/watchlist/${e.id}`)}>
                              <Eye className="size-4 text-ink-3" />
                              View
                            </MenuItem>
                            {canManage && status === "active" && (
                              <MenuItem onSelect={() => router.push(`/screening/watchlist/${e.id}/edit`)}>
                                <Pencil className="size-4 text-ink-3" />
                                Edit
                              </MenuItem>
                            )}
                            {viewer.can("blacklist.propose") && status === "active" && (
                              <MenuItem onSelect={() => router.push(`/screening/blacklist/new?fromWatchlist=${e.id}`)}>
                                <ShieldBan className="size-4 text-ink-3" />
                                Move to blacklist
                              </MenuItem>
                            )}
                            {canManage && status === "active" && (
                              <>
                                <MenuSeparator />
                                <MenuItem onSelect={() => setRemoving(e.id)}>
                                  <Trash2 className="size-4 text-rose-500" />
                                  <span className="text-rose-700">Remove</span>
                                </MenuItem>
                              </>
                            )}
                          </MenuContent>
                        </Menu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <EmptyState icon={SearchX} title="No entries match" body="Try another search, or reset the filters." action={<Button onClick={reset}>Reset filters</Button>} />
          )}
        </div>
      </section>

      {removing && db.watchlist[removing] && <RemoveDialog entry={db.watchlist[removing]} onClose={() => setRemoving(null)} />}
    </div>
  );
}
