"use client";

import { ChevronRight, CircleSlash, Eye, FileText, Flag, History, Lock, MailCheck, MessageSquareText, MoreHorizontal, Pencil, SearchX, ShieldBan, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
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
import { displayName, REASON_LABEL, TypeChip } from "@/features/blacklist/parts";
import { ClearMatchDialog, extraStageLabel, HISTORY_LABEL, LevelMeter, LevelPill, matchesOf, notifyNames, ON_MATCH_HINT, ON_MATCH_LABEL, RemoveDialog, WatchStatus } from "./parts";

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
  const fmt = useFormat();
  const person = identity.subjectType === "person";
  return (
    <dl>
      <Row label="Type">
        <TypeChip type={identity.subjectType} />
      </Row>
      <Row label="Name">
        <bdi className="font-semibold">{identity.fullName}</bdi>
      </Row>
      <Row label="Other spellings">
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
          <Row label="National ID / Iqama">{identity.nationalId ? <span className="font-mono">{identity.nationalId}</span> : null}</Row>
          <Row label="Passport">{identity.passportNo ? <span><span className="font-mono">{identity.passportNo}</span>{identity.nationality ? ` · ${fmt.country(identity.nationality)}` : ""}</span> : null}</Row>
          <Row label="Date of birth">{identity.dob ? fmt.day(identity.dob) : null}</Row>
        </>
      ) : (
        <Row label="Company">{identity.company}</Row>
      )}
      <Row label="Email">{identity.email ? <span className="ltr-data">{identity.email}</span> : null}</Row>
      <Row label="Mobile">{identity.mobile ? <span className="ltr-data font-mono">{identity.mobile}</span> : null}</Row>
    </dl>
  );
}

export function WatchEntryDetailPage({ id }: { id: ID }) {
  const db = useDb();
  const viewer = useViewer();
  const fmt = useFormat();
  const now = useNow();
  const router = useRouter();
  const [removing, setRemoving] = useState(false);
  const [clearing, setClearing] = useState<ScreeningMatch | null>(null);
  const entry = db.watchlist[id];

  if (!viewer.can("watchlist.view")) {
    return <EmptyState icon={Lock} title="You can't see the watchlist" body="This needs the Watchlist View permission." />;
  }
  if (!entry) {
    return <EmptyState icon={SearchX} title="Entry not found" action={<Link href="/screening/watchlist" className="text-sm text-accent-text hover:underline">Back to the watchlist</Link>} />;
  }

  const status = effectiveStatus(entry, now);
  const canManage = viewer.can("watchlist.manage") && status === "active";
  const canMove = viewer.can("blacklist.propose") && status === "active";
  const matches = matchesOf(db, id).sort((a, b) => (a.status === "open" ? -1 : 1) - (b.status === "open" ? -1 : 1) || b.foundAt.localeCompare(a.foundAt));
  const history = Object.values(db.watchlistHistory).filter((h) => h.entryId === id).sort((a, b) => b.at.localeCompare(a.at));
  const events = entry.eventScope === "all" ? "All events" : entry.eventScope.map((e) => db.events[e]?.name.en).join(" · ");
  const OnIcon = entry.onMatch === "markEmail" ? MailCheck : entry.onMatch === "markStage" ? ShieldBan : Flag;

  return (
    <div className="mx-auto max-w-[88rem] px-7 pt-6 pb-16">
      <nav className="flex items-center gap-1.5 text-xs font-medium text-ink-3">
        <Link href="/screening/watchlist" className="hover:text-accent-text">
          Watchlist
        </Link>
        <ChevronRight className="size-3.5" />
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
              {events} · {ON_MATCH_LABEL[entry.onMatch]}
              {entry.sourceRequestId && (
                <>
                  {" "}· from{" "}
                  <Link href={`/requests/${entry.sourceRequestId}`} className="font-mono text-accent-text hover:underline">
                    {entry.sourceRequestId}
                  </Link>
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
                    Edit
                  </Button>
                </Link>
              )}
              <Menu>
                <MenuTrigger asChild>
                  <Button iconOnly aria-label="More actions">
                    <MoreHorizontal className="size-4" />
                  </Button>
                </MenuTrigger>
                <MenuContent align="end">
                  {canMove && (
                    <MenuItem onSelect={() => router.push(`/screening/blacklist/new?fromWatchlist=${entry.id}`)}>
                      <ShieldBan className="size-4 text-ink-3" />
                      Move to blacklist
                    </MenuItem>
                  )}
                  {canManage && (
                    <>
                      <MenuSeparator />
                      <MenuItem onSelect={() => setRemoving(true)}>
                        <Trash2 className="size-4 text-rose-500" />
                        <span className="text-rose-700">Remove entry</span>
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
            ["Added by", <span key="a" className="flex items-center gap-2"><Avatar name={db.users[entry.createdBy]?.name ?? "?"} size="xs" />{db.users[entry.createdBy]?.name} · {fmt.date(entry.createdAt)}</span>],
            ["Last changed", `${db.users[entry.updatedBy]?.name ?? ""} · ${fmt.date(entry.updatedAt)}`],
            ["Valid from", fmt.date(entry.startsOn)],
            ["Until", entry.endsOn ? fmt.date(entry.endsOn) : "No end date (until removed)"],
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
            <span className="font-semibold text-ink">Removed by {db.users[entry.removedBy ?? ""]?.name}</span> on {entry.removedAt ? fmt.date(entry.removedAt) : ""}: {entry.removalReason}
          </span>
        </p>
      )}

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-5">
          <Card title="On a match" subtitle="What happens to a request that matches this entry. It is never rejected by the watchlist alone.">
            <div className="flex items-start gap-3.5 px-5 py-4">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <OnIcon className="size-4" />
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold text-ink">{ON_MATCH_LABEL[entry.onMatch]}</p>
                <p className="text-ink-2">{ON_MATCH_HINT[entry.onMatch]}</p>
                {entry.onMatch === "markStage" && (
                  <p className="mt-1.5 text-ink-2">
                    Stage added: <span className="font-medium text-ink">{extraStageLabel(db, entry.extraStage)}</span>
                  </p>
                )}
                {entry.onMatch === "markEmail" && (
                  <p className="mt-1.5 text-ink-2">
                    Emails go to: <span className="font-medium text-ink">{notifyNames(db, entry.notify).join(", ")}</span>
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-start gap-3.5 border-t border-line bg-amber-50/50 px-5 py-4">
              <MessageSquareText className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <div className="text-sm">
                <p className="text-xs font-semibold text-amber-900">Note shown to reviewers on the request</p>
                <p dir="auto" className="mt-0.5 text-ink">{entry.reviewerNote || <span className="text-ink-3">No note</span>}</p>
              </div>
            </div>
          </Card>

          <Card title="Identity" subtitle="ID numbers, passport, email and mobile must match exactly; names are compared after removing accents and converting Arabic to English letters.">
            <IdentityRows identity={entry.identity} />
          </Card>

          <Card title="Reason" subtitle="Visible only to people with Watchlist View. Reviewers see the note above, not this.">
            <dl>
              <Row label="Reason type">{REASON_LABEL[entry.reasonType]}</Row>
              <Row label="Details">
                <span dir="auto" className="whitespace-pre-line">{entry.reason}</span>
              </Row>
              <Row label="Evidence">
                {entry.evidence.length ? (
                  <ul className="space-y-1.5">
                    {entry.evidence.map((f) => (
                      <li key={f.id}>
                        <button type="button" onClick={() => toast("Downloads are simulated in the prototype")} className="inline-flex items-center gap-2 text-accent-text hover:underline">
                          <FileText className="size-4" />
                          {f.fileName}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Row>
            </dl>
          </Card>

          <Card title="Matches" subtitle="Requests this entry has marked. Clear a match if it isn't the same person.">
            {matches.length ? (
              <table className="w-full text-sm">
                <thead className="bg-subtle">
                  <tr>
                    {["Request", "Applicant", "Status", "Match", "Found", ""].map((h, i) => (
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
                            {m.matchType === "id" ? "ID match" : m.matchType === "company" ? "Company" : m.matchType === "nameDob" ? "Name + DOB" : "Name only"} · {m.score}%
                          </Pill>
                        </td>
                        <td className="tabular px-3 py-2.5 text-xs text-ink-2">{fmt.date(m.foundAt)}</td>
                        <td className="px-3 py-2.5 pe-5 text-end text-xs">
                          {m.status === "open" ? (
                            r && !["rejected", "withdrawn"].includes(r.status) && (
                              <Button size="sm" onClick={() => setClearing(m)}>
                                <CircleSlash className="size-3.5" />
                                Not the same person
                              </Button>
                            )
                          ) : (
                            <Tooltip content={`${db.users[m.decidedBy ?? ""]?.name ?? ""}: ${m.decisionNote ?? ""}`}>
                              <span>
                                <Pill tone="emerald">Cleared</Pill>
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
              <p className="px-5 py-6 text-center text-sm text-ink-3">No requests matched yet.</p>
            )}
          </Card>
        </div>

        <Card title="History" subtitle="Every change, cleared match and removal.">
          <ol className="px-5 py-2">
            {history.map((h) => (
              <li key={h.id} className="flex gap-3 border-b border-line py-3 last:border-b-0">
                <Avatar name={db.users[h.actorId]?.name ?? "?"} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">
                    <span className="font-semibold">{db.users[h.actorId]?.name}</span> <span className="text-ink-2">{HISTORY_LABEL[h.action]}</span>
                    {h.ref && (
                      <>
                        {" "}
                        <Link href={h.action === "moved_to_blacklist" ? `/screening/blacklist/${h.ref}` : `/requests/${h.ref}`} className="font-mono text-xs text-accent-text hover:underline">
                          {h.ref}
                        </Link>
                      </>
                    )}
                  </p>
                  {h.note && <p dir="auto" className="mt-1 border-s-2 border-line ps-2.5 text-xs text-ink-2">{h.note}</p>}
                  {(h.marked ?? 0) > 0 && <p className="mt-1 text-xs text-ink-3">Marked {h.marked} request{h.marked === 1 ? "" : "s"}</p>}
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-3">
                    <History className="size-3" />
                    {fmt.dateTime(h.at)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      {removing && <RemoveDialog entry={entry} onClose={() => setRemoving(false)} />}
      {clearing && <ClearMatchDialog db={db} match={clearing} onClose={() => setClearing(null)} />}
    </div>
  );
}
