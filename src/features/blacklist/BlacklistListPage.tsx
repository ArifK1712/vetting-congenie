"use client";

import { CalendarClock, CheckCircle2, Eye, FileUp, Hourglass, Inbox, Lock, MoreHorizontal, Pencil, Plus, ScanSearch, Search, SearchX, ShieldBan, Trash2, XCircle, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { MultiFilter, SingleFilter } from "@/components/ui/FilterMenu";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/Menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Tooltip } from "@/components/ui/Tooltip";
import { TONE, type Tone } from "@/design/tones";
import { DAY_MS, effectiveStatus, makerOf, needsApproval, REASON_TYPES, retroMatches } from "@/domain/blacklist";
import { normalizeId, normalizeName } from "@/domain/screening";
import type { BlacklistEntry, Database } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { useNow } from "@/lib/useNow";
import { useDb } from "@/store/app";
import { useViewer } from "@/store/useViewer";
import { DecisionDialog, displayName, ENTRY_STATUSES, EntryStatus, MaskedIds, TypeChip, useReasonLabel, useSourceLabel, useStatusLabel } from "./parts";

function Metric({ icon: Icon, tone, label, value, hint, href }: { icon: LucideIcon; tone: Tone; label: string; value: number; hint: string; href?: string }) {
  const body = (
    <>
      <span className={cn("mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl", TONE[tone].chip)}>
        <Icon className="size-[18px]" strokeWidth={2.1} />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-ink-2">{label}</span>
        <span className="tabular mt-0.5 block text-2xl leading-tight font-bold tracking-tight text-ink">{value}</span>
        <span className="block truncate text-xs text-ink-3">{hint}</span>
      </span>
    </>
  );
  return href ? (
    <Link href={href} className="flex items-start gap-3.5 bg-surface px-5 py-4 transition-colors hover:bg-subtle">
      {body}
    </Link>
  ) : (
    <div className="flex items-start gap-3.5 bg-surface px-5 py-4">{body}</div>
  );
}

type EndFilter = "any" | "none" | "soon" | "past";

// ─── Approvals ──────────────────────────────────────────────────────────

function ApprovalCard({ db, entry, now, onDecide }: { db: Database; entry: BlacklistEntry; now: number; onDecide: (kind: "approve" | "reject") => void }) {
  const t = useTranslations("blacklist");
  const reasonLabel = useReasonLabel();
  const viewer = useViewer();
  const fmt = useFormat();
  const isChange = !!entry.pendingChange;
  const maker = makerOf(entry);
  const own = maker === viewer.id;
  const c = entry.pendingChange ?? entry;
  const hits = retroMatches(db, c.identity, c.eventScope, entry.id);
  const proposedAt = entry.pendingChange?.proposedAt ?? entry.proposedAt;
  const suspended = hits.filter((h) => h.approved).length;
  return (
    <li className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl bg-surface px-5 py-4 shadow-card ring-1 ring-line">
      <span className={cn("inline-flex size-10 shrink-0 items-center justify-center rounded-xl", isChange ? "bg-sky-50 text-sky-600" : "bg-amber-50 text-amber-600")}>
        {isChange ? <Pencil className="size-4" /> : <ShieldBan className="size-4" />}
      </span>
      <div className="min-w-56 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/screening/blacklist/${entry.id}`} className="text-sm font-bold text-ink hover:text-accent-text">
            <bdi>{displayName(c)}</bdi>
          </Link>
          <span className="font-mono text-xs text-ink-3">{entry.id}</span>
          <span className={cn("inline-flex h-5 items-center rounded-md px-1.5 text-2xs font-semibold", isChange ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-800")}>
            {isChange ? t("list.kindChange") : entry.source === "request" ? t("list.kindFromRequest", { id: entry.sourceRequestId ?? "" }) : entry.source === "import" ? t("list.kindImported") : t("list.kindNew")}
          </span>
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
          <span className="inline-flex items-center gap-1.5">
            <Avatar name={db.users[maker]?.name ?? "?"} size="xs" />
            {db.users[maker]?.name}
          </span>
          <span>· {fmt.ago(proposedAt, now)}</span>
          <span>· {reasonLabel(c.reasonType)}</span>
        </p>
      </div>
      <div className="w-56 text-xs">
        <p className="font-semibold text-ink">{hits.length ? t("list.wouldMatch", { count: hits.length, n: fmt.number(hits.length) }) : t("list.matchesNone")}</p>
        <p className="text-ink-3">{suspended ? t("list.wouldSuspend", { count: suspended, n: fmt.number(suspended) }) : t("list.noBadges")}</p>
      </div>
      {viewer.can("blacklist.approve") ? (
        <Tooltip content={own ? t("ownProposalHint") : ""}>
          <span className="flex items-center gap-2">
            <Button size="sm" variant="danger" disabled={own} onClick={() => onDecide("reject")}>
              <XCircle className="size-3.5" />
              {t("dontApprove")}
            </Button>
            <Button size="sm" variant="success" disabled={own} onClick={() => onDecide("approve")}>
              <CheckCircle2 className="size-3.5" />
              {t("approve")}
            </Button>
          </span>
        </Tooltip>
      ) : (
        <span className="text-xs text-ink-3">{t("list.needsApprove")}</span>
      )}
    </li>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────

export function BlacklistListPage() {
  const t = useTranslations("blacklist");
  const reasonLabel = useReasonLabel();
  const statusLabel = useStatusLabel();
  const sourceLabel = useSourceLabel();
  const db = useDb();
  const viewer = useViewer();
  const router = useRouter();
  const params = useSearchParams();
  const fmt = useFormat();
  const now = useNow();
  const canPropose = viewer.can("blacklist.propose");
  const canApprove = viewer.can("blacklist.approve");

  const [tab, setTab] = useState(params.get("tab") === "approvals" ? "approvals" : "all");
  const [search, setSearch] = useState("");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [type, setType] = useState("any");
  const [events, setEvents] = useState<string[]>([]);
  const [reasons, setReasons] = useState<string[]>([]);
  const [end, setEnd] = useState<EndFilter>("any");
  const [deciding, setDeciding] = useState<{ id: string; kind: "approve" | "reject" | "remove" } | null>(null);

  const entries = useMemo(() => Object.values(db.blacklist).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [db]);
  const waiting = entries.filter(needsApproval).sort((a, b) => (a.pendingChange?.proposedAt ?? a.proposedAt).localeCompare(b.pendingChange?.proposedAt ?? b.proposedAt));

  const rows = useMemo(() => {
    const q = search.trim();
    const qName = normalizeName(q);
    const qId = normalizeId(q);
    return entries.filter((e) => {
      const st = effectiveStatus(e, now);
      if (statuses.length && !statuses.includes(st)) return false;
      if (type !== "any" && e.identity.subjectType !== type) return false;
      if (events.length && e.eventScope !== "all" && !e.eventScope.some((x) => events.includes(x))) return false;
      if (reasons.length && !reasons.includes(e.reasonType)) return false;
      if (end === "none" && e.endsOn) return false;
      if (end === "soon" && (!e.endsOn || Date.parse(e.endsOn) < now || Date.parse(e.endsOn) > now + 30 * DAY_MS)) return false;
      if (end === "past" && (!e.endsOn || Date.parse(e.endsOn) >= now)) return false;
      if (!q) return true;
      const id = e.identity;
      const names = [id.fullName, ...id.aliases, id.company ?? ""].map(normalizeName);
      const ids = [id.nationalId, id.passportNo].map((x) => normalizeId(x));
      return e.id.toLowerCase().includes(q.toLowerCase()) || (qName && names.some((n) => n.includes(qName))) || (qId.length >= 3 && ids.some((x) => x.includes(qId)));
    });
  }, [entries, search, statuses, type, events, reasons, end, now]);

  if (!viewer.can("blacklist.view")) {
    return <EmptyState icon={Lock} title={t("list.noAccessTitle")} body={t("list.noAccessBody")} />;
  }

  const active = entries.filter((e) => effectiveStatus(e, now) === "active");
  const openMatches = Object.values(db.matches).filter((m) => m.listType === "blacklist" && m.status === "open").length;
  const endingSoon = active.filter((e) => e.endsOn && Date.parse(e.endsOn) < now + 30 * DAY_MS).length;
  const filtered = search || statuses.length || type !== "any" || events.length || reasons.length || end !== "any";
  const reset = () => {
    setSearch("");
    setStatuses([]);
    setType("any");
    setEvents([]);
    setReasons([]);
    setEnd("any");
  };
  const decidingEntry = deciding ? db.blacklist[deciding.id] : null;

  return (
    <div className="mx-auto max-w-[88rem] px-4 pt-5 sm:px-6 lg:px-7 lg:pt-7 pb-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink">{t("list.title")}</h1>
          <p className="mt-1.5 text-sm text-ink-2">{t("list.subtitle")}</p>
        </div>
        {canPropose && (
          <div className="flex items-center gap-2">
            <Link href="/screening/blacklist/import">
              <Button>
                <FileUp className="size-4" />
                {t("list.importFile")}
              </Button>
            </Link>
            <Link href="/screening/blacklist/new">
              <Button variant="primary">
                <Plus className="size-4" strokeWidth={2.5} />
                {t("list.addEntry")}
              </Button>
            </Link>
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-px overflow-hidden rounded-xl bg-line shadow-card ring-1 ring-line sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={ShieldBan} tone="rose" label={t("list.activeEntries")} value={active.length} hint={(() => {
            const n = active.filter((e) => e.identity.subjectType === "company").length;
            const people = active.length - n;
            return t("list.activeHint", { companies: n, c: fmt.number(n), people, p: fmt.number(people) });
          })()} />
        <Metric icon={Hourglass} tone="amber" label={t("list.waiting")} value={waiting.length} hint={(() => {
            const n = waiting.filter((e) => e.pendingChange).length;
            const fresh = waiting.length - n;
            return t("list.waitingHint", { fresh, f: fmt.number(fresh), changes: n, c: fmt.number(n) });
          })()} />
        <Metric icon={ScanSearch} tone="indigo" label={t("list.openMatches")} value={openMatches} hint={t("list.openMatchesHint")} href="/screening/matches" />
        <Metric icon={CalendarClock} tone="sky" label={t("list.endingSoon")} value={endingSoon} hint={t("list.endingSoonHint")} />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mt-5">
        <TabsList className="mb-5">
          <TabsTrigger value="all" count={entries.length}>
            {t("list.allEntries")}
          </TabsTrigger>
          <TabsTrigger value="approvals" count={waiting.length}>
            {t("list.waiting")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="outline-none">
          <section className="overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-line">
            <div className="flex flex-wrap items-center gap-2 px-5 py-3.5">
              <label className="relative me-1 w-full max-w-72">
                <span className="sr-only">{t("list.searchLabel")}</span>
                <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
                <input
                  dir="auto"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("list.searchPlaceholder")}
                  className="h-8 w-full rounded-lg border border-line-strong bg-surface ps-8 pe-3 text-sm outline-none placeholder:text-ink-3 focus:border-accent focus:ring-4 focus:ring-accent/10"
                />
              </label>
              <MultiFilter label={t("list.filterStatus")} value={statuses} onChange={setStatuses} options={ENTRY_STATUSES.map((value) => ({ value, label: statusLabel(value) }))} />
              <SingleFilter
                label={t("list.filterType")}
                value={type}
                defaultValue="any"
                onChange={setType}
                options={[
                  { value: "any", label: t("list.anyType") },
                  { value: "person", label: t("type.person") },
                  { value: "company", label: t("type.company") },
                ]}
              />
              <MultiFilter label={t("list.filterEvent")} value={events} onChange={setEvents} wide options={Object.values(db.events).map((e) => ({ value: e.id, label: fmt.text(e.name), hint: e.code }))} />
              <MultiFilter label={t("list.filterReason")} value={reasons} onChange={setReasons} options={REASON_TYPES.map((r) => ({ value: r, label: reasonLabel(r) }))} />
              <SingleFilter
                label={t("list.filterEnd")}
                value={end}
                defaultValue="any"
                onChange={(v) => setEnd(v as EndFilter)}
                options={[
                  { value: "any", label: t("list.endAny") },
                  { value: "none", label: t("list.endNone") },
                  { value: "soon", label: t("list.endSoon") },
                  { value: "past", label: t("list.endPast") },
                ]}
              />
              {filtered ? (
                <Button size="sm" variant="ghost" onClick={reset}>
                  {t("list.resetFilters")}
                </Button>
              ) : null}
              <span className="tabular ms-auto text-xs text-ink-3">
                {t("list.count", { shown: fmt.number(rows.length), total: fmt.number(entries.length) })}
              </span>
            </div>

            <div className="@container overflow-x-auto border-t border-line">
              {rows.length ? (
                <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
                  <thead className="bg-subtle">
                    <tr>
                      {[
                        [t("list.colEntry"), "w-24"],
                        [t("list.colName"), ""],
                        [t("list.colType"), "w-28 hidden @[56rem]:table-cell"],
                        [t("list.colIds"), "w-44 hidden @[64rem]:table-cell"],
                        [t("list.colEvents"), "w-32 hidden @[80rem]:table-cell"],
                        [t("list.colReason"), "w-44 hidden @[48rem]:table-cell"],
                        [t("list.colStatus"), "w-44"],
                        [t("list.colEnd"), "w-32 hidden @[72rem]:table-cell"],
                        [t("list.colAddedBy"), "w-36 hidden @[88rem]:table-cell"],
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
                      const td = "h-[64px] border-b border-line px-3 align-middle group-last:border-b-0";
                      return (
                        <tr key={e.id} onClick={() => router.push(`/screening/blacklist/${e.id}`)} className={cn("group cursor-pointer transition-colors hover:bg-subtle", (status === "removed" || status === "not_approved" || status === "expired") && "text-ink-3")}>
                          <td className={cn(td, "ps-5 font-mono text-xs font-medium text-ink-2")}>{e.id}</td>
                          <td className={cn(td, "truncate")}>
                            <span className="flex min-w-0 items-center gap-2.5">
                              <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-lg", status === "active" ? "bg-rose-50 text-rose-600" : "bg-hover text-ink-3")}>
                                <ShieldBan className="size-4" />
                              </span>
                              <span className="min-w-0">
                                <bdi className="block truncate font-semibold text-ink">{displayName(e)}</bdi>
                                <span className="block truncate text-xs text-ink-3">
                                  {e.identity.aliases.length ? <bdi>{e.identity.aliases.join(" · ")}</bdi> : sourceLabel(e.source)}
                                </span>
                              </span>
                            </span>
                          </td>
                          <td className={cn(td, "hidden @[56rem]:table-cell")}>
                            <TypeChip type={e.identity.subjectType} />
                          </td>
                          <td className={cn(td, "hidden @[64rem]:table-cell")}>
                            {e.identity.subjectType === "company" ? <span className="text-xs text-ink-3">{t("list.companyMatch")}</span> : <MaskedIds identity={e.identity} />}
                          </td>
                          <td className={cn(td, "hidden truncate text-xs text-ink-2 @[80rem]:table-cell")}>
                            {e.eventScope === "all" ? t("allEvents") : <bdi>{e.eventScope.map((id) => db.events[id]?.code).join(", ")}</bdi>}
                          </td>
                          <td className={cn(td, "hidden truncate text-ink-2 @[48rem]:table-cell")}>{reasonLabel(e.reasonType)}</td>
                          <td className={td}>
                            <EntryStatus entry={e} now={now} />
                          </td>
                          <td className={cn(td, "tabular hidden text-xs @[72rem]:table-cell", e.endsOn ? "text-ink-2" : "text-ink-3")}>{e.endsOn ? fmt.date(e.endsOn) : t("noEndDate")}</td>
                          <td className={cn(td, "hidden @[88rem]:table-cell")}>
                            <span className="flex items-center gap-1.5 truncate text-xs text-ink-2">
                              <Avatar name={db.users[e.proposedBy]?.name ?? "?"} size="xs" />
                              {db.users[e.proposedBy]?.name.split(" ")[0]}
                            </span>
                          </td>
                          <td className={cn(td, "pe-5 text-end")}>
                            <Menu>
                              <MenuTrigger asChild>
                                <Button size="sm" variant="ghost" iconOnly aria-label={t("list.actionsFor", { id: e.id })} onClick={(ev) => ev.stopPropagation()}>
                                  <MoreHorizontal className="size-4" />
                                </Button>
                              </MenuTrigger>
                              <MenuContent align="end">
                                <MenuItem onSelect={() => router.push(`/screening/blacklist/${e.id}`)}>
                                  <Eye className="size-4 text-ink-3" />
                                  {t("list.view")}
                                </MenuItem>
                                {canPropose && status !== "removed" && status !== "expired" && (
                                  <MenuItem onSelect={() => router.push(`/screening/blacklist/${e.id}/edit`)}>
                                    <Pencil className="size-4 text-ink-3" />
                                    {t("list.edit")}
                                  </MenuItem>
                                )}
                                {canApprove && status === "active" && (
                                  <>
                                    <MenuSeparator />
                                    <MenuItem onSelect={() => setDeciding({ id: e.id, kind: "remove" })}>
                                      <Trash2 className="size-4 text-rose-500" />
                                      <span className="text-rose-700">{t("list.remove")}</span>
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
                <EmptyState icon={SearchX} title={t("list.noRowsTitle")} body={t("list.noRowsBody")} action={<Button onClick={reset}>{t("list.resetFilters")}</Button>} />
              )}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="approvals" className="outline-none">
          {waiting.length ? (
            <>
              <p className="mb-3 text-sm text-ink-2">{t("list.oldestFirst")}</p>
              <ul className="space-y-2.5">
                {waiting.map((e) => (
                  <ApprovalCard key={e.id} db={db} entry={e} now={now} onDecide={(kind) => setDeciding({ id: e.id, kind })} />
                ))}
              </ul>
            </>
          ) : (
            <div className="rounded-xl bg-surface shadow-card ring-1 ring-line">
              <EmptyState icon={Inbox} title={t("list.nothingWaitingTitle")} body={t("list.nothingWaitingBody")} />
            </div>
          )}
        </TabsContent>
      </Tabs>

      {deciding && decidingEntry && <DecisionDialog db={db} entry={decidingEntry} kind={deciding.kind} onClose={() => setDeciding(null)} />}
    </div>
  );
}
