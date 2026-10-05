import { isLate, visibleRequestsFor } from "./queue";
import { can, teamsOfUser } from "./permissions";
import { OPEN_STATUSES, STATUS_ORDER, visibleStatus } from "./status";
import type { Database, ID, LocalizedText, RequestStatus } from "./types";
import { resolvePath } from "./workflow";

/**
 * Dashboard metrics (spec 14.1). Built from the same visibility rules as the
 * Review Queue, so each viewer only sees numbers for their events and teams.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export type DateRange = 7 | 30 | 90;

export interface DashboardFilters {
  registrationIds: ID[];
  badgeTypeIds: ID[];
  workflowIds: ID[];
  teamIds: ID[];
  range: DateRange;
}

export const DEFAULT_DASHBOARD_FILTERS: DashboardFilters = {
  registrationIds: [],
  badgeTypeIds: [],
  workflowIds: [],
  teamIds: [],
  range: 30,
};

function median(values: number[]) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Start of the day (UTC+3, the event time zone) for a timestamp. */
function dayKey(ms: number) {
  const riyadh = ms + 3 * HOUR;
  return new Date(riyadh - (riyadh % DAY)).toISOString().slice(0, 10);
}

export function buildDashboard(db: Database, viewerId: ID, eventScope: ID | "all", f: DashboardFilters, now: number) {
  const seesBlacklist = can(db, viewerId, "blacklist.view");
  const seesLists = seesBlacklist || can(db, viewerId, "watchlist.view");
  const from = now - f.range * DAY;

  const teamsByRequest = new Map<ID, Set<ID>>();
  for (const e of Object.values(db.stageExecutions)) {
    if (!teamsByRequest.has(e.requestId)) teamsByRequest.set(e.requestId, new Set());
    teamsByRequest.get(e.requestId)!.add(e.teamId);
  }
  const inList = (list: ID[], v: ID | null) => list.length === 0 || (!!v && list.includes(v));

  const requests = visibleRequestsFor(db, viewerId, eventScope).filter(
    (r) =>
      inList(f.registrationIds, r.registrationId) &&
      inList(f.badgeTypeIds, r.badgeTypeId) &&
      inList(f.workflowIds, r.workflowId) &&
      (f.teamIds.length === 0 || [...(teamsByRequest.get(r.id) ?? [])].some((t) => f.teamIds.includes(t))),
  );
  const ids = new Set(requests.map((r) => r.id));

  // ─── Status counts (Screening Hold masked without Blacklist View) ──
  const statusCounts = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<RequestStatus, number>;
  for (const r of requests) statusCounts[visibleStatus(r.status, seesBlacklist)]++;

  const open = requests.filter((r) => OPEN_STATUSES.includes(r.status));
  const late = open.filter((r) => isLate(db, r, now));
  const decidedInRange = requests.filter((r) => r.decidedAt && Date.parse(r.decidedAt) >= from && (r.status === "approved" || r.status === "rejected"));
  const approvedInRange = decidedInRange.filter((r) => r.status === "approved").length;
  const decisionHours = decidedInRange.map((r) => (Date.parse(r.decidedAt!) - Date.parse(r.submittedAt)) / HOUR);

  // ─── Daily series ───────────────────────────────────────────────────
  const days: { day: string; submitted: number; approved: number; rejected: number }[] = [];
  const index = new Map<string, (typeof days)[number]>();
  for (let t = from; t <= now; t += DAY) {
    const key = dayKey(t);
    if (index.has(key)) continue;
    const row = { day: key, submitted: 0, approved: 0, rejected: 0 };
    index.set(key, row);
    days.push(row);
  }
  for (const r of requests) {
    const submittedDay = index.get(dayKey(Date.parse(r.submittedAt)));
    if (submittedDay) submittedDay.submitted++;
    if (r.decidedAt && (r.status === "approved" || r.status === "rejected")) {
      const row = index.get(dayKey(Date.parse(r.decidedAt)));
      if (row) row[r.status]++;
    }
  }

  // ─── Requests waiting per stage ─────────────────────────────────────
  const stageMap = new Map<string, { key: string; name: LocalizedText; workflow: LocalizedText; claimed: number; unclaimed: number }>();
  for (const r of open) {
    if (!r.currentStageNodeId || !r.workflowVersionId) continue;
    const exec = Object.values(db.stageExecutions).find((e) => e.requestId === r.id && e.stageNodeId === r.currentStageNodeId && e.status !== "completed");
    const name = exec?.stageName;
    if (!name) continue;
    const key = `${r.workflowId}:${r.currentStageNodeId}`;
    if (!stageMap.has(key)) stageMap.set(key, { key, name, workflow: db.workflows[r.workflowId!].label, claimed: 0, unclaimed: 0 });
    stageMap.get(key)![r.claimedBy ? "claimed" : "unclaimed"]++;
  }
  const perStage = [...stageMap.values()].sort((a, b) => b.claimed + b.unclaimed - (a.claimed + a.unclaimed)).slice(0, 8);

  // ─── Pipeline: open requests along each workflow's stage sequence ───
  const pipeline = Object.values(db.workflows)
    .filter((w) => w.currentVersionId && inList(f.workflowIds, w.id))
    .map((w) => {
      const graph = db.workflowVersions[w.currentVersionId!].graph;
      const path = resolvePath(graph);
      const extra = graph.nodes.filter((n) => n.type === "stage" && !path.some((p) => p.id === n.id));
      const stages = [...path, ...extra].map((n) => {
        const here = open.filter((r) => r.workflowId === w.id && r.currentStageNodeId === n.id);
        return {
          nodeId: n.id,
          name: n.type === "stage" ? n.stage.name : { en: "", ar: "" },
          offPath: !path.some((p) => p.id === n.id),
          claimed: here.filter((r) => r.claimedBy).length,
          unclaimed: here.filter((r) => !r.claimedBy).length,
          late: here.filter((r) => isLate(db, r, now)).length,
        };
      });
      return { workflowId: w.id, label: w.label, badgeTypeId: w.badgeTypeId, stages, total: stages.reduce((s, x) => s + x.claimed + x.unclaimed, 0) };
    })
    .filter((w) => w.total > 0)
    .sort((a, b) => b.total - a.total);

  // ─── Time in stage (median hours of completed visits in range) ─────
  const stageTimes = new Map<string, { key: string; name: LocalizedText; hours: number[] }>();
  for (const e of Object.values(db.stageExecutions)) {
    if (!ids.has(e.requestId) || !e.completedAt || Date.parse(e.completedAt) < from) continue;
    const key = e.stageName.en;
    if (!stageTimes.has(key)) stageTimes.set(key, { key, name: e.stageName, hours: [] });
    stageTimes.get(key)!.hours.push((Date.parse(e.completedAt) - Date.parse(e.enteredAt)) / HOUR);
  }
  const timePerStage = [...stageTimes.values()]
    .map((s) => ({ key: s.key, name: s.name, medianHours: median(s.hours) ?? 0, count: s.hours.length }))
    .sort((a, b) => b.medianHours - a.medianHours);

  // ─── Late by team ───────────────────────────────────────────────────
  const lateTeams = new Map<ID, number>();
  for (const r of late) if (r.currentTeamId) lateTeams.set(r.currentTeamId, (lateTeams.get(r.currentTeamId) ?? 0) + 1);
  const lateByTeam = [...lateTeams.entries()]
    .map(([teamId, count]) => ({ teamId, name: db.teams[teamId].name, count, open: open.filter((r) => r.currentTeamId === teamId).length }))
    .sort((a, b) => b.count - a.count);

  // ─── Results by badge type ──────────────────────────────────────────
  const badgeMap = new Map<ID, { badgeTypeId: ID; approved: number; rejected: number; open: number }>();
  for (const r of requests) {
    if (!badgeMap.has(r.badgeTypeId)) badgeMap.set(r.badgeTypeId, { badgeTypeId: r.badgeTypeId, approved: 0, rejected: 0, open: 0 });
    const row = badgeMap.get(r.badgeTypeId)!;
    if (r.status === "approved") row.approved++;
    else if (r.status === "rejected") row.rejected++;
    else if (OPEN_STATUSES.includes(r.status) || r.status === "screening_hold") row.open++;
  }
  const byBadgeType = [...badgeMap.values()]
    .map((b) => ({ ...b, name: db.badgeTypes[b.badgeTypeId].name }))
    .sort((a, b) => b.approved + b.rejected + b.open - (a.approved + a.rejected + a.open));

  // ─── Places used per registration ───────────────────────────────────
  const regIds = new Set(requests.map((r) => r.registrationId));
  const placesUsed = Object.values(db.registrations)
    .filter((reg) => regIds.has(reg.id))
    .map((reg) => {
      const used = Object.values(db.allocations).filter((a) => a.registrationId === reg.id && a.state === "held").length;
      const waiting = Object.values(db.requests).filter((r) => r.registrationId === reg.id && r.awaitingCapacity).length;
      return { registrationId: reg.id, name: reg.name, eventId: reg.eventId, used, limit: reg.capacityLimit, waiting, share: used / reg.capacityLimit };
    })
    .sort((a, b) => b.share - a.share);

  // ─── Team workload (this week) ──────────────────────────────────────
  const weekAgo = now - 7 * DAY;
  const teamScope = can(db, viewerId, "queue.reviewAll") ? Object.values(db.teams) : teamsOfUser(db, viewerId);
  const reviewers = new Set(teamScope.flatMap((t) => (f.teamIds.length && !f.teamIds.includes(t.id) ? [] : t.members.map((m) => m.userId))));
  const decisionsByUser = new Map<ID, number>();
  for (const h of Object.values(db.history)) {
    if (!["approved_stage", "rejected", "escalated", "more_info_requested"].includes(h.action)) continue;
    if (Date.parse(h.at) < weekAgo || !ids.has(h.requestId) || typeof h.actorId !== "string") continue;
    decisionsByUser.set(h.actorId, (decisionsByUser.get(h.actorId) ?? 0) + 1);
  }
  const workload = [...reviewers]
    .map((userId) => ({
      userId,
      name: db.users[userId].name,
      open: requests.filter((r) => r.claimedBy === userId && r.status === "under_review").length,
      decisions: decisionsByUser.get(userId) ?? 0,
    }))
    .filter((w) => w.open || w.decisions)
    .sort((a, b) => b.open + b.decisions - (a.open + a.decisions));

  // ─── List matches (only with list permissions) ──────────────────────
  const listMatches = seesLists
    ? (["blacklist", "watchlist"] as const)
        .filter((l) => (l === "blacklist" ? seesBlacklist : can(db, viewerId, "watchlist.view")))
        .map((listType) => {
          const ms = Object.values(db.matches).filter((m) => m.listType === listType && ids.has(m.requestId) && Date.parse(m.foundAt) >= from);
          return {
            listType,
            open: ms.filter((m) => m.status === "open").length,
            confirmed: ms.filter((m) => m.status === "confirmed").length,
            cleared: ms.filter((m) => m.status === "cleared").length,
          };
        })
    : null;

  return {
    totals: {
      requests: requests.length,
      open: open.length,
      late: late.length,
      decided: decidedInRange.length,
      approved: approvedInRange,
      approvalRate: decidedInRange.length ? approvedInRange / decidedInRange.length : null,
      medianDecisionHours: median(decisionHours),
      awaitingCapacity: requests.filter((r) => r.awaitingCapacity).length,
    },
    statusCounts,
    daily: days,
    perStage,
    pipeline,
    timePerStage,
    lateByTeam,
    byBadgeType,
    placesUsed,
    workload,
    listMatches,
  };
}

export type Dashboard = ReturnType<typeof buildDashboard>;
