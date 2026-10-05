import { evaluateAll } from "./conditions";
import type { Attendee, Database, ID, StageConfig, Team, VettingRequest } from "./types";

type RoutableRequest = Pick<
  VettingRequest,
  "eventId" | "badgeTypeId" | "registrationId" | "watchlistLevel"
>;

/** Section 5.3: a team receives a request only when all four checks pass. */
export function teamAccepts(team: Team, request: RoutableRequest, attendee: Attendee): boolean {
  if (team.status !== "active") return false;
  if (team.eventScope !== "all" && !team.eventScope.includes(request.eventId)) return false;
  if (team.badgeScope !== "all" && !team.badgeScope.includes(request.badgeTypeId)) return false;
  if (!team.access.some((a) => a.registrationId === request.registrationId)) return false;
  return evaluateAll(team.conditions, team.conditionMatch, attendee, request);
}

/** Section 5.4: first matching team in priority order, otherwise the fallback team. */
export function routeStage(
  db: Database,
  stage: StageConfig,
  request: RoutableRequest,
  attendee: Attendee,
): { teamId: ID | null; viaFallback: boolean } {
  for (const teamId of stage.teams) {
    const team = db.teams[teamId];
    if (team && teamAccepts(team, request, attendee)) return { teamId, viaFallback: false };
  }
  return { teamId: stage.fallbackTeamId, viaFallback: true };
}
