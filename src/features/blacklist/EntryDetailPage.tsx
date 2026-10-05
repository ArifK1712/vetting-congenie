"use client";

import { CheckCircle2, ChevronRight, FileText, History, Hourglass, Lock, MoreHorizontal, Pencil, ScanSearch, SearchX, ShieldBan, Trash2, XCircle } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/Menu";
import { Pill } from "@/components/ui/Status";
import { toast } from "@/components/ui/Toast";
import { Tooltip } from "@/components/ui/Tooltip";
import { effectiveStatus, makerOf, needsApproval } from "@/domain/blacklist";
import type { BlacklistContent, BlacklistEntry, Database, ID, ListIdentity } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { useNow } from "@/lib/useNow";
import { useDb } from "@/store/app";
import { useViewer } from "@/store/useViewer";
import { ApprovalImpact, DecisionDialog, displayName, EntryStatus, HISTORY_LABEL, REASON_LABEL, SOURCE_LABEL, TypeChip } from "./parts";

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

function useEventsText(db: Database) {
  return (scope: "all" | ID[]) => (scope === "all" ? "All events" : scope.map((id) => db.events[id]?.name.en ?? id).join(" · "));
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
          <Row label="Passport">{identity.passportNo ? <span className="font-mono">{identity.passportNo}{identity.nationality ? ` · ${fmt.country(identity.nationality)}` : ""}</span> : null}</Row>
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

/** Field-by-field comparison of an active entry and its proposed change. */
function ChangeDiff({ db, entry }: { db: Database; entry: BlacklistEntry }) {
  const fmt = useFormat();
  const events = useEventsText(db);
  const pc = entry.pendingChange!;
  const text = (c: BlacklistContent) => ({
    Name: c.identity.fullName,
    "Other spellings": c.identity.aliases.join(" · "),
    "National ID / Iqama": c.identity.nationalId ?? "",
    Passport: c.identity.passportNo ? `${c.identity.passportNo} ${c.identity.nationality ?? ""}`.trim() : "",
    "Date of birth": c.identity.dob ?? "",
    Company: c.identity.company ?? "",
    Email: c.identity.email ?? "",
    Mobile: c.identity.mobile ?? "",
    Events: events(c.eventScope),
    "Reason type": REASON_LABEL[c.reasonType],
    "Reason details": c.reasonDetail,
    Evidence: c.evidence.map((f) => f.fileName).join(", "),
    "Start date": fmt.date(c.startsOn),
    "End date": c.endsOn ? fmt.date(c.endsOn) : "No end date",
  });
  const before = text(entry);
  const after = text(pc);
  const changed = (Object.keys(after) as (keyof typeof after)[]).filter((k) => before[k] !== after[k]);
  return (
    <table className="w-full table-fixed text-sm">
      <thead>
        <tr className="text-start">
          <th className="eyebrow w-36 px-4 py-2 text-start">Field</th>
          <th className="eyebrow px-4 py-2 text-start">Now</th>
          <th className="eyebrow px-4 py-2 text-start">Proposed</th>
        </tr>
      </thead>
      <tbody>
        {changed.map((k) => (
          <tr key={k} className="border-t border-amber-200/60 align-top">
            <td className="px-4 py-2 text-ink-2">{k}</td>
            <td dir="auto" className="px-4 py-2 text-ink-3 line-through decoration-rose-300">{before[k] || "—"}</td>
            <td dir="auto" className="px-4 py-2 font-medium text-ink">{after[k] || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function EntryDetailPage({ id }: { id: ID }) {
  const db = useDb();
  const viewer = useViewer();
  const fmt = useFormat();
  const now = useNow();
  const events = useEventsText(db);
  const [deciding, setDeciding] = useState<"approve" | "reject" | "remove" | null>(null);
  const entry = db.blacklist[id];

  if (!viewer.can("blacklist.view")) {
    return <EmptyState icon={Lock} title="You can't see the blacklist" body="This needs the Blacklist View permission." />;
  }
  if (!entry) {
    return (
      <EmptyState
        icon={SearchX}
        title="Entry not found"
        action={
          <Link href="/screening/blacklist" className="text-sm text-accent-text hover:underline">
            Back to the blacklist
          </Link>
        }
      />
    );
  }

  const status = effectiveStatus(entry, now);
  const waiting = needsApproval(entry);
  const maker = makerOf(entry);
  const own = maker === viewer.id;
  const canEdit = viewer.can("blacklist.propose") && status !== "removed" && status !== "expired";
  const matches = Object.values(db.matches).filter((m) => m.entryId === id).sort((a, b) => b.foundAt.localeCompare(a.foundAt));
  const history = Object.values(db.blacklistHistory).filter((h) => h.entryId === id).sort((a, b) => b.at.localeCompare(a.at));
  const name = displayName(entry);

  return (
    <div className="mx-auto max-w-[88rem] px-7 pt-6 pb-16">
      <nav className="flex items-center gap-1.5 text-xs font-medium text-ink-3">
        <Link href="/screening/blacklist" className="hover:text-accent-text">
          Blacklist
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="font-mono text-ink-2">{entry.id}</span>
      </nav>

      <header className="mt-4 rounded-xl bg-surface p-6 shadow-card ring-1 ring-line">
        <div className="flex flex-wrap items-start gap-5">
          <span className={cn("inline-flex size-14 shrink-0 items-center justify-center rounded-xl", status === "active" ? "bg-rose-50 text-rose-600" : "bg-hover text-ink-3")}>
            <ShieldBan className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="text-2xl font-bold tracking-tight text-ink">
                <bdi>{name}</bdi>
              </h1>
              <EntryStatus entry={entry} now={now} />
            </div>
            <p className="mt-1 text-sm text-ink-2">
              {REASON_LABEL[entry.reasonType]} · {events(entry.eventScope)} · {SOURCE_LABEL[entry.source]}
              {entry.sourceRequestId && (
                <>
                  {" "}
                  <Link href={`/requests/${entry.sourceRequestId}`} className="font-mono text-accent-text hover:underline">
                    {entry.sourceRequestId}
                  </Link>
                </>
              )}
            </p>
          </div>
          <span className="rounded-lg bg-subtle px-2.5 py-1 font-mono text-xs font-medium text-ink-2 ring-1 ring-line">{entry.id}</span>
          {(canEdit || (viewer.can("blacklist.approve") && status === "active")) && (
            <div className="flex items-center gap-2">
              {canEdit && (
                <Link href={`/screening/blacklist/${entry.id}/edit`}>
                  <Button>
                    <Pencil className="size-4" />
                    {status === "active" ? "Propose a change" : "Edit"}
                  </Button>
                </Link>
              )}
              {viewer.can("blacklist.approve") && status === "active" && (
                <Menu>
                  <MenuTrigger asChild>
                    <Button iconOnly aria-label="More actions">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </MenuTrigger>
                  <MenuContent align="end">
                    <MenuItem onSelect={() => setDeciding("remove")}>
                      <Trash2 className="size-4 text-rose-500" />
                      <span className="text-rose-700">Remove entry</span>
                    </MenuItem>
                  </MenuContent>
                </Menu>
              )}
            </div>
          )}
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-5 md:grid-cols-4">
          {[
            ["Proposed by", <span key="p" className="flex items-center gap-2"><Avatar name={db.users[entry.proposedBy]?.name ?? "?"} size="xs" />{db.users[entry.proposedBy]?.name} · {fmt.date(entry.proposedAt)}</span>],
            ["Approved by", entry.approvedBy ? <span key="a" className="flex items-center gap-2"><Avatar name={db.users[entry.approvedBy]?.name ?? "?"} size="xs" />{db.users[entry.approvedBy]?.name} · {fmt.date(entry.approvedAt!)}</span> : "Not yet"],
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

      {waiting && (
        <section className="mt-5 overflow-hidden rounded-xl bg-amber-50/70 ring-1 ring-amber-600/20">
          <div className="flex flex-wrap items-start gap-4 px-5 py-4">
            <Hourglass className="mt-0.5 size-5 shrink-0 text-amber-600" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-amber-950">{entry.pendingChange ? "A change is waiting for a second person" : "Waiting for a second person to approve"}</p>
              <p className="mt-0.5 text-sm text-amber-900/80">
                Proposed by {db.users[maker]?.name} {fmt.ago(entry.pendingChange?.proposedAt ?? entry.proposedAt, now)}.{" "}
                {entry.pendingChange ? "The current version keeps working until the change is approved." : "It matches no one until it is approved."}
              </p>
              <div className="mt-3 rounded-lg bg-white/80 px-4 py-3 ring-1 ring-amber-600/15">
                <p className="mb-1 text-xs font-bold text-ink">If approved now</p>
                <ApprovalImpact db={db} entry={entry} />
              </div>
            </div>
            {viewer.can("blacklist.approve") && (
              <Tooltip content={own ? "You proposed this, so a second person has to decide." : ""}>
                <span className="flex items-center gap-2">
                  <Button variant="danger" disabled={own} onClick={() => setDeciding("reject")}>
                    <XCircle className="size-4" />
                    Don’t approve
                  </Button>
                  <Button variant="success" disabled={own} onClick={() => setDeciding("approve")}>
                    <CheckCircle2 className="size-4" />
                    Approve
                  </Button>
                </span>
              </Tooltip>
            )}
          </div>
          {entry.pendingChange && (
            <div className="border-t border-amber-600/15 bg-white/60">
              <ChangeDiff db={db} entry={entry} />
            </div>
          )}
        </section>
      )}
      {entry.decisionNote && !waiting && (
        <p className="mt-5 flex items-start gap-2.5 rounded-xl bg-subtle px-5 py-3.5 text-sm text-ink-2 ring-1 ring-line">
          <XCircle className="mt-0.5 size-4 shrink-0 text-ink-3" />
          <span>
            <span className="font-semibold text-ink">Not approved:</span> {entry.decisionNote}
          </span>
        </p>
      )}
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
          <Card title="Identity" subtitle="ID numbers, passport, email and mobile must match exactly. Names are compared after removing accents and converting Arabic to English letters.">
            <IdentityRows identity={entry.identity} />
          </Card>
          <Card title="Reason" subtitle="Internal. Never shown to the attendee.">
            <dl>
              <Row label="Reason type">{REASON_LABEL[entry.reasonType]}</Row>
              <Row label="Details">
                <span dir="auto" className="whitespace-pre-line">{entry.reasonDetail}</span>
              </Row>
              <Row label="Evidence">
                {entry.evidence.length ? (
                  <ul className="space-y-1.5">
                    {entry.evidence.map((f) => (
                      <li key={f.id}>
                        <button type="button" onClick={() => toast("Downloads are simulated in the prototype")} className="inline-flex items-center gap-2 text-accent-text hover:underline">
                          <FileText className="size-4" />
                          {f.fileName}
                          <span className="text-xs text-ink-3">{(f.sizeKb / 1024).toFixed(1)} MB</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Row>
            </dl>
          </Card>
          <Card
            title="Matches"
            subtitle="Requests this entry has matched, and what was decided."
            action={
              matches.some((m) => m.status === "open") ? (
                <Link href="/screening/matches" className="inline-flex items-center gap-1 text-xs font-semibold text-accent-text hover:underline">
                  <ScanSearch className="size-3.5" />
                  Match Review
                </Link>
              ) : undefined
            }
          >
            {matches.length ? (
              <table className="w-full text-sm">
                <thead className="bg-subtle">
                  <tr>
                    {["Request", "Applicant", "Match", "Found", "Decision"].map((h) => (
                      <th key={h} className="eyebrow h-9 px-3 text-start first:ps-5 last:pe-5">
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
                        <td className="px-3 py-2.5 text-xs">
                          <Pill tone={m.strength === "strong" ? "rose" : "amber"} dot={false}>
                            {m.matchType === "id" ? "ID match" : m.matchType === "company" ? "Company" : m.matchType === "nameDob" ? "Name + DOB" : "Name only"} · {m.score}%
                          </Pill>
                        </td>
                        <td className="tabular px-3 py-2.5 text-xs text-ink-2">{fmt.date(m.foundAt)}</td>
                        <td className="px-3 py-2.5 pe-5 text-xs">
                          {m.status === "open" ? (
                            <Pill tone="amber">Open</Pill>
                          ) : (
                            <Tooltip content={m.decisionNote ?? ""}>
                              <span>
                                <Pill tone={m.status === "confirmed" ? "rose" : "emerald"}>{m.status === "confirmed" ? "Confirmed" : "Not the same person"}</Pill>
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
              <p className="px-5 py-6 text-center text-sm text-ink-3">No matches yet.</p>
            )}
          </Card>
        </div>

        <Card title="History" subtitle="Every proposal, decision and removal.">
          <ol className="px-5 py-2">
            {history.map((h) => (
              <li key={h.id} className="flex gap-3 border-b border-line py-3 last:border-b-0">
                <Avatar name={db.users[h.actorId]?.name ?? "?"} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">
                    <span className="font-semibold">{db.users[h.actorId]?.name}</span> <span className="text-ink-2">{HISTORY_LABEL[h.action]}</span>
                  </p>
                  {h.note && <p dir="auto" className="mt-1 border-s-2 border-line ps-2.5 text-xs text-ink-2">{h.note}</p>}
                  {(h.matched ?? 0) > 0 && (
                    <p className="mt-1 text-xs text-ink-3">
                      Matched {h.matched} request{h.matched === 1 ? "" : "s"}
                      {h.suspended ? `, suspended ${h.suspended} badge${h.suspended === 1 ? "" : "s"}` : ""}
                    </p>
                  )}
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

      {deciding && <DecisionDialog db={db} entry={entry} kind={deciding} onClose={() => setDeciding(null)} />}
    </div>
  );
}
