import { Tx } from "./actions";
import { can, teamsOfUser } from "./permissions";
import { isLate } from "./queue";
import { hiddenNewQuestions } from "./registrations";
import { OPEN_STATUSES } from "./status";
import type { Database, ID } from "./types";

/**
 * In-app alerts (spec 16), worked out from what has happened rather than
 * stored one by one, so every action already in the history produces them.
 * Read state is one "last opened" time per user.
 */

export type AlertKind =
  | "newRequest" // routed to one of my teams
  | "escalated" // escalated into one of my teams
  | "assigned" // reassigned to me
  | "answers" // attendee answered More Information for my team
  | "late" // team lead: requests past their time limit (digest)
  | "entryWaiting" // blacklist approver: entry or change waiting (not mine)
  | "blacklistMatch" // blacklist approver: new open match
  | "watchlistMatch" // chosen on a watchlist entry
  | "badgeSuspended" // event admins
  | "configError" // vetting admins: a registration found no valid workflow
  | "newQuestion"; // vetting admins: a form question no team can see yet (AC29)

export interface Alert {
  id: string;
  kind: AlertKind;
  at: string;
  requestId?: ID;
  entryId?: ID;
  teamId?: ID;
  registrationId?: ID;
  actorId?: ID | "system" | "attendee";
  count?: number;
  /** Where clicking the alert goes (app path, without locale). */
  href: string;
}

const DAY = 86_400_000;
const WINDOW = 14 * DAY;
const LIMIT = 60;

export function alertsFor(db: Database, userId: ID, now: number): Alert[] {
  const user = db.users[userId];
  if (!user?.active) return [];
  const myTeams = new Set(teamsOfUser(db, userId).map((t) => t.id));
  const ledTeams = new Set(teamsOfUser(db, userId).filter((t) => t.members.some((m) => m.userId === userId && m.role === "lead")).map((t) => t.id));
  const approver = can(db, userId, "blacklist.approve");
  const admin = can(db, userId, "registration.vettingSettings");
  const since = now - WINDOW;
  const out: Alert[] = [];

  const escalatedAt = new Set(Object.values(db.history).filter((h) => h.action === "escalated").map((h) => `${h.requestId}@${h.at.slice(0, 16)}`));
  for (const h of Object.values(db.history)) {
    const t = Date.parse(h.at);
    if (t < since || t > now) continue;
    const r = db.requests[h.requestId];
    if (!r) continue;
    if (h.action === "routed" && h.teamId && myTeams.has(h.teamId)) {
      // Routing at the same minute as an escalation is the escalation arriving.
      const kind = escalatedAt.has(`${h.requestId}@${h.at.slice(0, 16)}`) ? "escalated" : "newRequest";
      out.push({ id: `${kind}:${h.id}`, kind, at: h.at, requestId: r.id, teamId: h.teamId, href: `/requests/${r.id}` });
    }
    if (h.action === "reassigned" && h.meta?.to === userId && h.actorId !== userId) {
      out.push({ id: `assigned:${h.id}`, kind: "assigned", at: h.at, requestId: r.id, actorId: h.actorId, href: `/requests/${r.id}` });
    }
    if (h.action === "more_info_received" && r.currentTeamId && myTeams.has(r.currentTeamId)) {
      out.push({ id: `answers:${h.id}`, kind: "answers", at: h.at, requestId: r.id, teamId: r.currentTeamId, href: `/requests/${r.id}` });
    }
    if (h.action === "configuration_error" && admin) {
      out.push({ id: `config:${h.id}`, kind: "configError", at: h.at, requestId: r.id, href: `/requests/${r.id}` });
    }
    if (h.action === "badge_suspended" && admin) {
      out.push({ id: `badge:${h.id}`, kind: "badgeSuspended", at: h.at, requestId: r.id, entryId: h.remarks, href: `/requests/${r.id}` });
    }
  }

  if (approver) {
    for (const e of Object.values(db.blacklist)) {
      const waitingSince = e.pendingChange?.proposedAt ?? (e.status === "pending_approval" ? e.proposedAt : null);
      const by = e.pendingChange?.proposedBy ?? e.proposedBy;
      if (waitingSince && by !== userId) out.push({ id: `entry:${e.id}:${waitingSince}`, kind: "entryWaiting", at: waitingSince, entryId: e.id, actorId: by, href: `/screening/blacklist/${e.id}` });
    }
    for (const m of Object.values(db.matches)) {
      if (m.listType !== "blacklist" || m.status !== "open" || Date.parse(m.foundAt) < since) continue;
      out.push({ id: `bl:${m.id}`, kind: "blacklistMatch", at: m.foundAt, requestId: m.requestId, entryId: m.entryId, href: `/screening/matches?match=${m.id}` });
    }
  }

  for (const m of Object.values(db.matches)) {
    if (m.listType !== "watchlist" || Date.parse(m.foundAt) < since) continue;
    const e = db.watchlist[m.entryId];
    if (!e || e.onMatch !== "markEmail") continue;
    if (e.notify.includes(userId) || e.notify.some((id) => myTeams.has(id))) {
      out.push({ id: `wl:${m.id}`, kind: "watchlistMatch", at: m.foundAt, requestId: m.requestId, entryId: m.entryId, href: `/requests/${m.requestId}` });
    }
  }

  if (admin) {
    for (const { registrationId, question } of hiddenNewQuestions(db)) {
      if (!question.addedAt || Date.parse(question.addedAt) < since) continue;
      out.push({ id: `q:${registrationId}:${question.id}`, kind: "newQuestion", at: question.addedAt, registrationId, actorId: question.addedBy, href: `/registrations/${registrationId}?tab=questions` });
    }
  }

  // Team leads: one digest of late requests in the teams they lead.
  if (ledTeams.size) {
    const late = Object.values(db.requests).filter((r) => r.currentTeamId && ledTeams.has(r.currentTeamId) && OPEN_STATUSES.includes(r.status) && isLate(db, r, now));
    if (late.length) {
      const team = [...ledTeams][0];
      out.push({ id: `late:${[...ledTeams].join(",")}:${late.length}`, kind: "late", at: new Date(now - (now % DAY)).toISOString(), count: late.length, teamId: team, href: `/queue?team=${team}` });
    }
  }

  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, LIMIT);
}

export function unreadCount(db: Database, userId: ID, alerts: Alert[]) {
  const seen = db.notificationReads?.[userId];
  return alerts.filter((a) => !seen || a.at > seen).length;
}

export const isUnread = (db: Database, userId: ID, a: Alert) => {
  const seen = db.notificationReads?.[userId];
  return !seen || a.at > seen;
};

export function markAllRead(db: Database, userId: ID, now: number): Database {
  const tx = new Tx(db, now);
  tx.db.notificationReads = { ...(db.notificationReads ?? {}), [userId]: new Date(now).toISOString() };
  return tx.db;
}
