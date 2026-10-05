import { can } from "./permissions";
import type {
  ApplicantProfile,
  Attendee,
  Database,
  FieldAccessLevel,
  ID,
  Payment,
  UploadedDocument,
  VettingRequest,
} from "./types";

/** Profile fields that can be granted per team (5.6). Name is always visible. */
export const PROFILE_FIELDS = [
  "email",
  "mobile",
  "nationalId",
  "passportNo",
  "nationality",
  "dob",
  "company",
  "jobTitle",
] as const satisfies readonly (keyof ApplicantProfile)[];

export type ProfileField = (typeof PROFILE_FIELDS)[number];

export const fieldKey = {
  profile: (f: ProfileField) => `profile.${f}`,
  answer: (questionId: ID) => `answer.${questionId}`,
  document: (questionId: ID) => `document.${questionId}`,
  payment: "payment",
  moreInfo: "moreInfo",
};

export type AccessResolver = (key: string) => FieldAccessLevel;

/**
 * Which access applies to this viewer for this request:
 * 1. the team currently handling it, if the viewer is a member;
 * 2. Review All: view everything (download documents);
 * 3. a team that handled an earlier stage the viewer belongs to;
 * 4. otherwise nothing beyond the always-visible fields.
 */
export function resolveAccess(db: Database, viewerId: ID, request: VettingRequest): {
  resolve: AccessResolver;
  teamId: ID | null;
  basis: "currentTeam" | "reviewAll" | "pastTeam" | "none";
} {
  const memberOf = (teamId: ID | null) =>
    !!teamId && !!db.teams[teamId]?.members.some((m) => m.userId === viewerId);

  const fromTeam = (teamId: ID): AccessResolver => {
    const access = db.teams[teamId]?.access.find((a) => a.registrationId === request.registrationId);
    return (key) => access?.fields[key] ?? "hidden";
  };

  if (memberOf(request.currentTeamId)) {
    return { resolve: fromTeam(request.currentTeamId!), teamId: request.currentTeamId, basis: "currentTeam" };
  }
  if (can(db, viewerId, "queue.reviewAll")) {
    return {
      resolve: (key) => (key.startsWith("document.") ? "download" : "view"),
      teamId: null,
      basis: "reviewAll",
    };
  }
  const pastTeam = Object.values(db.stageExecutions)
    .filter((e) => e.requestId === request.id)
    .map((e) => e.teamId)
    .find(memberOf);
  if (pastTeam) return { resolve: fromTeam(pastTeam), teamId: pastTeam, basis: "pastTeam" };
  return { resolve: () => "hidden", teamId: null, basis: "none" };
}

export interface ProjectedAttendee {
  id: ID;
  fullName: string;
  fullNameAr?: string;
  profile: Partial<Record<ProfileField, string>>;
  editable: Set<ProfileField>;
  answers: { questionId: ID; value: string | string[]; editable: boolean }[];
  documents: (UploadedDocument & { downloadable: boolean })[];
  payment: Payment | null;
  moreInfoVisible: boolean;
}

/**
 * Strips every field the viewer may not see. In production this runs on the
 * server; components only ever receive the projected object (5.6: hidden
 * fields are never sent to the browser).
 */
export function projectAttendee(attendee: Attendee, resolve: AccessResolver): ProjectedAttendee {
  const profile: ProjectedAttendee["profile"] = {};
  const editable = new Set<ProfileField>();
  for (const f of PROFILE_FIELDS) {
    const level = resolve(fieldKey.profile(f));
    const value = attendee.profile[f];
    if (level !== "hidden" && value) profile[f] = value;
    if (level === "edit") editable.add(f);
  }
  return {
    id: attendee.id,
    fullName: attendee.profile.fullName,
    fullNameAr: attendee.profile.fullNameAr,
    profile,
    editable,
    answers: Object.entries(attendee.answers)
      .filter(([q]) => resolve(fieldKey.answer(q)) !== "hidden")
      .map(([questionId, value]) => ({
        questionId,
        value,
        editable: resolve(fieldKey.answer(questionId)) === "edit",
      })),
    documents: attendee.documents
      .filter((d) => resolve(fieldKey.document(d.questionId)) !== "hidden")
      .map((d) => ({ ...d, downloadable: resolve(fieldKey.document(d.questionId)) === "download" })),
    payment: resolve(fieldKey.payment) === "hidden" ? null : attendee.payment,
    moreInfoVisible: resolve(fieldKey.moreInfo) !== "hidden",
  };
}
