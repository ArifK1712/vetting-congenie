"use client";

import { ChevronRight, CircleSlash, Eye, FileText, Flag, History, Lock, MailCheck, MessageSquareText, MoreHorizontal, Pencil, SearchX, ShieldBan, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { PAGE } from "@/design/layout";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { DirIcon } from "@/components/ui/DirIcon";
import { EmptyState } from "@/components/ui/EmptyState";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/Menu";
import { Pill, StatusLabel } from "@/components/ui/Status";
import { toast } from "@/components/ui/Toast";
import { Tooltip } from "@/components/ui/Tooltip";
import { effectiveStatus } from "@/domain/watchlist";
import type { ID, ListIdentity, ScreeningMatch } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { useNow } from "@/lib/useNow";
import { useDb } from "@/store/app";
import { useViewer } from "@/store/useViewer";
import { displayName, TypeChip, useReasonLabel } from "@/features/blacklist/parts";
import { ClearMatchDialog, LevelMeter, LevelPill, matchesOf, RemoveDialog, useExtraStageLabel, useNotifyNames, useOnMatchHint, useOnMatchLabel, useWatchHistoryLabel, WatchStatus } from "./parts";

function Card({ title, subtitle, children, action }: { title: string; subtitle?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-line">
      <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div>
          <h2 className="text-sm font-bold text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p>}
        </div>
        {action}
      </header>
      <div className="border-t border-line">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_minmax(0,1fr)] gap-4 border-b border-line px-5 py-2.5 text-sm last:border-b-0">
      <dt className="text-ink-3">{label}</dt>
      <dd className="min-w-0 text-ink">{children ?? <span className="text-ink-3">—</span>}</dd>
    </div>
  );
}

function IdentityRows({ identity }: { identity: ListIdentity }) {
  const t = useTranslations("watchlist.field");
  const fmt = useFormat();
  const person = identity.subjectType === "person";
  return (
    <dl>
      <Row label={t("type")}>
        <TypeChip type={identity.subjectType} />
      </Row>
      <Row label={t("name")}>
        <bdi className="font-semibold">{identity.fullName}</bdi>
      </Row>
      <Row label={t("otherSpellings")}>
        {identity.aliases.length ? (
          <span className="flex flex-wrap gap-1.5">
            {identity.aliases.map((a) => (
              <span key={a} dir="auto" className="rounded-md bg-hover px-2 py-0.5 text-xs">
                {a}
              </span>
            ))}
          </span>
        ) : null}
      </Row>
      {person ? (
        <>
          <Row label={t("nationalId")}>{identity.nationalId ? <span className="ltr-data font-mono">{identity.nationalId}</span> : null}</Row>
          <Row label={t("passport")}>{identity.passportNo ? <span><span className="ltr-data font-mono">{identity.passportNo}</span>{identity.nationality ? ` · ${fmt.country(identity.nationality)}` : ""}</span> : null}</Row>
          <Row label={t("dob")}>{identity.dob ? fmt.day(identity.dob) : null}</Row>
        </>
      ) : (
        <Row label={t("company")}>{identity.company ? <bdi>{identity.company}</bdi> : null}</Row>
      )}
      <Row label={t("email")}>{identity.email ? <span className="ltr-data">{identity.email}</span> : null}</Row>
      <Row label={t("mobile")}>{identity.mobile ? <span className="ltr-data font-mono">{identity.mobile}</span> : null}</Row>
    </dl>
  );
}

export function WatchEntryDetailPage({ id }: { id: ID }) {
  const t = useTranslations("watchlist");
  const td = useTranslations("watchlist.detail");
  const reasonLabel = useReasonLabel();
  const onMatchLabel = useOnMatchLabel();
  const onMatchHint = useOnMatchHint();
  const historyLabel = useWatchHistoryLabel();
  const db = useDb();
  const stageLabel = useExtraStageLabel(db);
  const notifyNames = useNotifyNames(db);
  const viewer = useViewer();
  const fmt = useFormat();
  const now = useNow();
  const router = useRouter();
  const [removing, setRemoving] = useState(false);
  const [clearing, setClearing] = useState<ScreeningMatch | null>(null);
  const entry = db.watchlist[id];

  if (!viewer.can("watchlist.view")) {
    return <EmptyState icon={Lock} title={t("noAccessTitle")} body={td("noAccessBody")} />;
  }
  if (!entry) {
    return (
      <EmptyState
        icon={SearchX}
        title={t("entryNotFound")}
        action={
          <Link href="/screening/watchlist" className="text-sm text-accent-text hover:underline">
            {t("backToList")}
          </Link>
        }
      />
    );
  }

  const status = effectiveStatus(entry, now);
  const canManage = viewer.can("watchlist.manage") && status === "active";
  const canMove = viewer.can("blacklist.propose") && status === "active";
  const matches = matchesOf(db, id).sort((a, b) => (a.status === "open" ? -1 : 1) - (b.status === "open" ? -1 : 1) || b.foundAt.localeCompare(a.foundAt));
  const history = Object.values(db.watchlistHistory).filter((h) => h.entryId === id).sort((a, b) => b.at.localeCompare(a.at));
  const events = entry.eventScope === "all" ? t("form.allEvents") : entry.eventScope.map((e) => (db.events[e] ? fmt.text(db.events[e].name) : e)).join(" · ");
  const OnIcon = entry.onMatch === "markEmail" ? MailCheck : entry.onMatch === "markStage" ? ShieldBan : Flag;
  const sep = fmt.locale === "ar" ? "، " : ", ";
  const requestLink = (id: ID) =>
    function RequestLink(chunks: ReactNode) {
      return (
        <Link href={`/requests/${id}`} className="font-mono text-accent-text hover:underline">
          {chunks}
        </Link>
      );
    };

  return (
    <div className={cn(PAGE, "pb-16")}>
      <nav className="flex items-center gap-1.5 text-xs font-medium text-ink-3">
        <Link href="/screening/watchlist" className="hover:text-accent-text">
          {t("breadcrumb")}
        </Link>
        <DirIcon icon={ChevronRight} className="size-3.5" />
        <span className="font-mono text-ink-2">{entry.id}</span>
      </nav>

      <header className="mt-4 rounded-xl bg-surface p-6 shadow-card ring-1 ring-line">
        <div className="flex flex-wrap items-start gap-5">
          <span className={cn("inline-flex size-14 shrink-0 items-center justify-center rounded-xl", status === "active" ? "bg-amber-50 text-amber-600" : "bg-hover text-ink-3")}>
            <Eye className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="text-2xl font-bold tracking-tight text-ink">
                <bdi>{displayName(entry)}</bdi>
              </h1>
              <span className="flex items-center gap-2">
                <LevelMeter level={entry.level} />
                <LevelPill level={entry.level} size="md" />
              </span>
              <WatchStatus entry={entry} now={now} />
            </div>
            <p className="mt-1 text-sm text-ink-2">
              {events} · {onMatchLabel(entry.onMatch)}
              {entry.sourceRequestId && (
                <>
                  {" "}· {td.rich("fromRequest", { id: entry.sourceRequestId, link: requestLink(entry.sourceRequestId) })}
                </>
              )}
            </p>
          </div>
          <span className="rounded-lg bg-subtle px-2.5 py-1 font-mono text-xs font-medium text-ink-2 ring-1 ring-line">{entry.id}</span>
          {(canManage || canMove) && (
            <div className="flex items-center gap-2">
              {canManage && (
                <Link href={`/screening/watchlist/${entry.id}/edit`}>
                  <Button>
                    <Pencil className="size-4" />
                    {td("edit")}
                  </Button>
                </Link>
              )}
              <Menu>
                <MenuTrigger asChild>
                  <Button iconOnly aria-label={td("moreActions")}>
                    <MoreHorizontal className="size-4" />
                  </Button>
                </MenuTrigger>
                <MenuContent align="end">
                  {canMove && (
                    <MenuItem onSelect={() => router.push(`/screening/blacklist/new?fromWatchlist=${entry.id}`)}>
                      <ShieldBan className="size-4 text-ink-3" />
                      {td("moveToBlacklist")}
                    </MenuItem>
                  )}
                  {canManage && (
                    <>
                      <MenuSeparator />
                      <MenuItem onSelect={() => setRemoving(true)}>
                        <Trash2 className="size-4 text-rose-500" />
                        <span className="text-rose-700">{td("removeEntry")}</span>
                      </MenuItem>
                    </>
                  )}
                </MenuContent>
              </Menu>
            </div>
          )}
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-5 md:grid-cols-4">
          {[
            [td("addedBy"), <span key="a" className="flex items-center gap-2"><Avatar name={db.users[entry.createdBy]?.name ?? "?"} size="xs" />{db.users[entry.createdBy]?.name} · {fmt.date(entry.createdAt)}</span>],
            [td("lastChanged"), `${db.users[entry.updatedBy]?.name ?? ""} · ${fmt.date(entry.updatedAt)}`],
            [td("validFrom"), fmt.date(entry.startsOn)],
            [td("until"), entry.endsOn ? fmt.date(entry.endsOn) : td("untilRemoved")],
          ].map(([label, value]) => (
            <div key={label as string}>
              <dt className="text-xs font-medium text-ink-3">{label}</dt>
              <dd className="mt-0.5 text-sm font-medium text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </header>

      {entry.status === "removed" && (
        <p className="mt-5 flex items-start gap-2.5 rounded-xl bg-subtle px-5 py-3.5 text-sm text-ink-2 ring-1 ring-line">
          <Trash2 className="mt-0.5 size-4 shrink-0 text-ink-3" />
          <span>
            <span className="font-semibold text-ink">{td("removedBy", { name: db.users[entry.removedBy ?? ""]?.name ?? "" })}</span> {td("removedOn", { date: entry.removedAt ? fmt.date(entry.removedAt) : "" })} <bdi>{entry.removalReason}</bdi>
          </span>
        </p>
      )}

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-5">
          <Card title={td("onMatch")} subtitle={td("onMatchHint")}>
            <div className="flex items-start gap-3.5 px-5 py-4">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <OnIcon className="size-4" />
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold text-ink">{onMatchLabel(entry.onMatch)}</p>
                <p className="text-ink-2">{onMatchHint(entry.onMatch)}</p>
                {entry.onMatch === "markStage" && (
                  <p className="mt-1.5 text-ink-2">
                    {td("stageAdded")} <span className="font-medium text-ink">{stageLabel(entry.extraStage)}</span>
                  </p>
                )}
                {entry.onMatch === "markEmail" && (
                  <p className="mt-1.5 text-ink-2">
                    {td("emailsTo")} <span className="font-medium text-ink">{notifyNames(entry.notify).join(sep)}</span>
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-start gap-3.5 border-t border-line bg-amber-50/50 px-5 py-4">
              <MessageSquareText className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <div className="text-sm">
                <p className="text-xs font-semibold text-amber-900">{td("reviewerNote")}</p>
                <p dir="auto" className="mt-0.5 text-ink">{entry.reviewerNote || <span className="text-ink-3">{td("noNote")}</span>}</p>
              </div>
            </div>
          </Card>

          <Card title={td("identity")} subtitle={td("identityHint")}>
            <IdentityRows identity={entry.identity} />
          </Card>

          <Card title={td("reason")} subtitle={td("reasonHint")}>
            <dl>
              <Row label={td("reasonType")}>{reasonLabel(entry.reasonType)}</Row>
              <Row label={td("details")}>
                <span dir="auto" className="whitespace-pre-line">{entry.reason}</span>
              </Row>
              <Row label={td("evidence")}>
                {entry.evidence.length ? (
                  <ul className="space-y-1.5">
                    {entry.evidence.map((f) => (
                      <li key={f.id}>
                        <button type="button" onClick={() => toast(td("downloadsSimulated"))} className="inline-flex items-center gap-2 text-accent-text hover:underline">
                          <FileText className="size-4" />
                          <bdi>{f.fileName}</bdi>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Row>
            </dl>
          </Card>

          <Card title={td("matches")} subtitle={td("matchesHint")}>
            {matches.length ? (
              <table className="w-full text-sm">
                <thead className="bg-subtle">
                  <tr>
                    {[td("colRequest"), td("colApplicant"), td("colStatus"), td("colMatch"), td("colFound"), ""].map((h, i) => (
                      <th key={i} className="eyebrow h-9 px-3 text-start first:ps-5 last:pe-5">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matches.map((m) => {
                    const r = db.requests[m.requestId];
                    const a = r ? db.attendees[r.attendeeId] : null;
                    return (
                      <tr key={m.id} className="border-t border-line">
                        <td className="px-3 py-2.5 ps-5">
                          <Link href={`/requests/${m.requestId}`} className="font-mono text-xs text-accent-text hover:underline">
                            {m.requestId}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5">
                          <bdi>{a?.profile.fullName}</bdi>
                        </td>
                        <td className="px-3 py-2.5 text-xs">{r && <StatusLabel status={r.status} />}</td>
                        <td className="px-3 py-2.5 text-xs">
                          <Pill tone={m.strength === "strong" ? "orange" : "amber"} dot={false}>
                            {td(`matchType.${m.matchType}`)} · {td("score", { score: fmt.number(m.score) })}
                          </Pill>
                        </td>
                        <td className="tabular px-3 py-2.5 text-xs text-ink-2">{fmt.date(m.foundAt)}</td>
                        <td className="px-3 py-2.5 pe-5 text-end text-xs">
                          {m.status === "open" ? (
                            r && !["rejected", "withdrawn"].includes(r.status) && (
                              <Button size="sm" onClick={() => setClearing(m)}>
                                <CircleSlash className="size-3.5" />
                                {td("notSamePerson")}
                              </Button>
                            )
                          ) : (
                            <Tooltip content={`${db.users[m.decidedBy ?? ""]?.name ?? ""}: ${m.decisionNote ?? ""}`}>
                              <span>
                                <Pill tone="emerald">{td("cleared")}</Pill>
                              </span>
                            </Tooltip>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="px-5 py-6 text-center text-sm text-ink-3">{td("noMatches")}</p>
            )}
          </Card>
        </div>

        <Card title={td("history")} subtitle={td("historyHint")}>
          <ol className="px-5 py-2">
            {history.map((h) => {
              // A created event's ref is the request the entry was added from; it's shown as a note line.
              const fromRequest = h.action === "created" ? h.ref : undefined;
              return (
                <li key={h.id} className="flex gap-3 border-b border-line py-3 last:border-b-0">
                  <Avatar name={db.users[h.actorId]?.name ?? "?"} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink">
                      <span className="font-semibold">{db.users[h.actorId]?.name}</span> <span className="text-ink-2">{historyLabel(h.action)}</span>
                      {h.ref && !fromRequest && (
                        <>
                          {" "}
                          <Link href={h.action === "moved_to_blacklist" ? `/screening/blacklist/${h.ref}` : `/requests/${h.ref}`} className="font-mono text-xs text-accent-text hover:underline">
                            {h.ref}
                          </Link>
                        </>
                      )}
                    </p>
                    {fromRequest && <p className="mt-1 border-s-2 border-line ps-2.5 text-xs text-ink-2">{td.rich("fromRequestNote", { id: fromRequest, link: requestLink(fromRequest) })}</p>}
                    {h.note && <p dir="auto" className="mt-1 border-s-2 border-line ps-2.5 text-xs text-ink-2">{h.note}</p>}
                    {(h.marked ?? 0) > 0 && <p className="mt-1 text-xs text-ink-3">{td("historyMarked", { count: h.marked ?? 0, n: fmt.number(h.marked ?? 0) })}</p>}
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-3">
                      <History className="size-3" />
                      {fmt.dateTime(h.at)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
      </div>

      {removing && <RemoveDialog entry={entry} onClose={() => setRemoving(false)} />}
      {clearing && <ClearMatchDialog db={db} match={clearing} onClose={() => setClearing(null)} />}
    </div>
  );
}
