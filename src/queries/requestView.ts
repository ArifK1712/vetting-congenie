"use client";

import { useMemo } from "react";
import { approvedEarlierStage, canReassign, openClaims, previewApprove } from "@/domain/actions";
import { PROFILE_FIELDS, projectAttendee, resolveAccess } from "@/domain/fieldAccess";
import { roundsOf, validateAsk } from "@/domain/moreInfo";
import { buildProgress } from "@/domain/progress";
import { canClaim, isLate, requestTimeLimit, visibleRequestsFor } from "@/domain/queue";
import { visibleStatus } from "@/domain/status";
import type { BlacklistEntry, HistoryEvent, ID, InfoQuestion, LocalizedText, WatchlistEntry } from "@/domain/types";
import { stageOf } from "@/domain/workflow";
import { useDb, useSession } from "@/store/app";
import { useViewer } from "@/store/useViewer";

const SCREENING_ACTIONS = new Set(["screening_hold", "match_cleared", "match_confirmed"]);

/**
 * Everything the Request Detail page shows, already filtered for the current
 * viewer: hidden fields stripped, list details only with the right
 * permission, and screening history masked for those without Blacklist View.
 *
 * This is the read side of the request API (think GET /requests/:id): the
 * screen gets a view model plus reference data, never the whole database.
 * With a backend, only this hook's body changes.
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

    // List entries behind this request's matches: the only list data the page needs
    // (blacklist ones only reach viewers with Blacklist View, as `matches` is filtered).
    const watchEntries: Record<ID, WatchlistEntry> = {};
    const blacklistEntries: Record<ID, BlacklistEntry> = {};
    for (const m of matches) {
      if (m.listType === "watchlist" && db.watchlist[m.entryId]) watchEntries[m.entryId] = db.watchlist[m.entryId];
      if (m.listType === "blacklist" && db.blacklist[m.entryId]) blacklistEntries[m.entryId] = db.blacklist[m.entryId];
    }
    // Stage names by node, from the stages this request went through (for history lines).
    const stageNames: Record<ID, LocalizedText> = {};
    for (const e of Object.values(db.stageExecutions)) if (e.requestId === id) stageNames[e.stageNodeId] = e.stageName;
    const team = request.currentTeamId ? db.teams[request.currentTeamId] : null;
    const openClaimsByUser = Object.fromEntries((team?.members ?? []).map((m) => [m.userId, openClaims(db, m.userId, team!.id)]));
    const reassignBlocked = new Set((team?.members ?? []).filter((m) => approvedEarlierStage(db, m.userId, request)).map((m) => m.userId));

    return {
      /** Reference data for names and labels. */
      lookups: {
        users: db.users,
        roles: db.roles,
        teams: db.teams,
        events: db.events,
        badgeTypes: db.badgeTypes,
        registrations: db.registrations,
        workflows: db.workflows,
        workflowVersions: db.workflowVersions,
        rejectReasons: db.rejectReasons,
      },
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
      watchEntries,
      blacklistEntries,
      stageNames,
      /** Members who approved an earlier stage of this request (four-eyes: can't take it over). */
      reassignBlocked,
      /** Requests each current-team member has claimed in that team (shown when reassigning). */
      openClaimsByUser,
      canReassign: canReassign(db, viewer.id, request),
      /** The viewer is a member of the team handling the request now. */
      inCurrentTeam: !!request.currentTeamId && !!db.teams[request.currentTeamId]?.members.some((m) => m.userId === viewer.id),
      /** What Approve would do (next stage, or final approval with places used). */
      approvePreview: previewApprove(db, request),
      /** More Information rounds already sent. */
      infoRoundCount: roundsOf(db, id).length,
      /** Nationalities in use, for the correction field's choices. */
      nationalities: [...new Set(Object.values(db.attendees).map((a) => a.profile.nationality))],
      /** Checks an Ask for more information draft against this request. */
      validateAsk: (draft: { instructions: string; questions: InfoQuestion[]; returnToNodeId: ID }) => validateAsk(db, request, draft),
    };
  }, [db, viewer, id, now, eventScope]);
}

export type RequestView = NonNullable<ReturnType<typeof useRequestView>>;
