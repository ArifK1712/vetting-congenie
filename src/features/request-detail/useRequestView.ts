"use client";

import { useMemo } from "react";
import { PROFILE_FIELDS, projectAttendee, resolveAccess } from "@/domain/fieldAccess";
import { buildProgress } from "@/domain/progress";
import { canClaim, isLate, requestTimeLimit, visibleRequestsFor } from "@/domain/queue";
import { visibleStatus } from "@/domain/status";
import type { HistoryEvent, ID } from "@/domain/types";
import { stageOf } from "@/domain/workflow";
import { useDb, useSession } from "@/store/app";
import { useViewer } from "@/store/useViewer";

const SCREENING_ACTIONS = new Set(["screening_hold", "match_cleared", "match_confirmed"]);

/**
 * Everything the Request Detail page shows, already filtered for the current
 * viewer: hidden fields stripped, list details only with the right
 * permission, and screening history masked for those without Blacklist View.
 */
export function useRequestView(id: ID, now: number) {
  const db = useDb();
  const viewer = useViewer();
  const eventScope = useSession((s) => s.eventScope);

  return useMemo(() => {
    const request = db.requests[id];
    if (!request) return null;
    // Detail is reachable from any event scope; visibility rules still apply.
    if (!visibleRequestsFor(db, viewer.id, "all").some((r) => r.id === id)) return null;
    void eventScope;

    const seesBlacklist = viewer.can("blacklist.view");
    const seesWatchlist = viewer.can("watchlist.view");
    const attendee = db.attendees[request.attendeeId];
    const access = resolveAccess(db, viewer.id, request);
    const applicant = projectAttendee(attendee, access.resolve);
    const registration = db.registrations[request.registrationId];
    const version = request.workflowVersionId ? db.workflowVersions[request.workflowVersionId] : null;
    const workflow = request.workflowId ? db.workflows[request.workflowId] : null;
    const stage = version ? stageOf(version.graph, request.currentStageNodeId) : undefined;

    const hiddenCount =
      PROFILE_FIELDS.filter((f) => attendee.profile[f] && !(f in applicant.profile)).length +
      (Object.keys(attendee.answers).length - applicant.answers.length) +
      (attendee.documents.length - applicant.documents.length) +
      (applicant.payment ? 0 : 1);

    const matches = Object.values(db.matches)
      .filter((m) => m.requestId === id)
      .filter((m) => (m.listType === "blacklist" ? seesBlacklist : true))
      .sort((a, b) => Date.parse(b.foundAt) - Date.parse(a.foundAt));
    const hasHiddenBlacklistHit =
      !seesBlacklist && Object.values(db.matches).some((m) => m.requestId === id && m.listType === "blacklist");

    const history: HistoryEvent[] = Object.values(db.history)
      .filter((h) => h.requestId === id)
      .map((h): HistoryEvent => {
        if (seesBlacklist) return h;
        if (SCREENING_ACTIONS.has(h.action)) {
          return { ...h, action: "screened", actorId: "system", remarks: undefined, meta: undefined, fromStatus: undefined, toStatus: undefined };
        }
        if (h.action === "screened" || h.action === "badge_suspended") return { ...h, meta: undefined, remarks: undefined };
        return h;
      })
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

    const infoRequests = Object.values(db.infoRequests)
      .filter((i) => i.requestId === id)
      .sort((a, b) => a.round - b.round);
    const comments = Object.values(db.comments)
      .filter((c) => c.requestId === id)
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

    return {
      db,
      viewer,
      request,
      status: visibleStatus(request.status, seesBlacklist),
      attendee,
      applicant,
      access,
      hiddenCount,
      registration,
      event: db.events[request.eventId],
      badgeType: db.badgeTypes[request.badgeTypeId],
      workflow,
      version,
      stage,
      team: request.currentTeamId ? db.teams[request.currentTeamId] : null,
      claimer: request.claimedBy ? db.users[request.claimedBy] : null,
      steps: buildProgress(db, request),
      matches,
      hasHiddenBlacklistHit,
      seesBlacklist,
      seesWatchlist,
      history,
      infoRequests,
      comments,
      late: isLate(db, request, now),
      timeLimitHours: requestTimeLimit(db, request),
      canClaim: canClaim(db, viewer.id, request),
    };
  }, [db, viewer, id, now, eventScope]);
}

export type RequestView = NonNullable<ReturnType<typeof useRequestView>>;
