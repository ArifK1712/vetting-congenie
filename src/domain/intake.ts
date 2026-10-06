import { enterStage, Tx } from "./actions";
import { formOf, profileFieldOf } from "./registrations";
import { screenProfile, thresholdsOf, type MatchCandidate } from "./screening";
import { notifyWatchers } from "./watchlist";
import { requestPath } from "./workflow";
import type { ApplicantProfile, Attendee, Database, ID, UploadedDocument, VettingRequest, WatchlistLevel } from "./types";

/**
 * Spec 7.1: what happens when an attendee registers.
 * 1. The form is checked (required fields).
 * 2. The workflow is found for the registration + badge type.
 * 3. Exactly one request is created, even if submit is clicked twice (AC05).
 * 4. Blacklist and watchlist check (9, 10), as set on the registration.
 * 5. To the first stage's team (Pending Review), or Screening Hold on a blacklist match.
 * 6. The attendee is told it's under review; no badge yet.
 * No valid workflow → Configuration Error and the admins are told; vetting is never skipped.
 */

export interface Submission {
  registrationId: ID;
  badgeTypeId: ID;
  /** Answers by question id (standard and custom). Uploads are file names. */
  answers: Record<ID, string | string[]>;
  /** Same key on a retried submit → the same request (AC05). */
  submissionKey: string;
  payment?: Attendee["payment"];
  now: number;
}

export type IntakeOutcome =
  | "underReview" // request created, at the first stage
  | "screeningHold" // blacklist match, waiting for a decision
  | "autoRejected" // exact-identifier blacklist match with auto-reject on
  | "configurationError" // vetting on but no valid workflow
  | "noVetting" // vetting off, or badge type set to No vetting: normal process
  | "duplicate"; // the same submission was already received

export type IntakeError = "notFound" | "badBadgeType" | "blocked" | "missing";

export type IntakeResult =
  | { ok: true; db: Database; outcome: IntakeOutcome; attendeeId: ID; requestId: ID | null; blacklistHits: number; watchlistHits: number }
  | { ok: false; error: IntakeError; missing?: ID[] };

const iso = (ms: number) => new Date(ms).toISOString();
const RANK: Record<WatchlistLevel, number> = { low: 1, medium: 2, high: 3 };

function nextRequestId(db: Database) {
  let max = 1000;
  for (const id of Object.keys(db.requests)) {
    const n = Number(id.replace(/^VR-/, ""));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `VR-${max + 1}`;
}

/** Turns form answers into the attendee profile, custom answers and documents. */
function readForm(db: Database, s: Submission) {
  const reg = db.registrations[s.registrationId];
  const settings = db.vettingSettings[s.registrationId];
  const profile: Partial<Record<keyof ApplicantProfile, string>> = {};
  const answers: Record<ID, string | string[]> = {};
  const documents: UploadedDocument[] = [];
  const missing: ID[] = [];
  for (const q of formOf(reg)) {
    const raw = s.answers[q.id];
    const value = Array.isArray(raw) ? raw.filter(Boolean) : (raw ?? "").trim();
    const empty = Array.isArray(value) ? !value.length : !value;
    if (q.required && empty) missing.push(q.id);
    if (empty) continue;
    if (q.type === "upload") {
      const name = Array.isArray(value) ? value[0] : value;
      documents.push({
        id: `doc_${s.submissionKey}_${q.id}`,
        questionId: q.id,
        fileName: name,
        mime: /\.(jpe?g)$/i.test(name) ? "image/jpeg" : /\.png$/i.test(name) ? "image/png" : "application/pdf",
        sizeKb: 240,
        uploadedAt: iso(s.now),
      });
      continue;
    }
    const field = profileFieldOf(settings, q);
    if (field && !Array.isArray(value)) profile[field] = value;
    if (!q.profileField) answers[q.id] = value;
  }
  return {
    profile: {
      fullName: profile.fullName ?? "",
      fullNameAr: profile.fullNameAr,
      email: profile.email ?? "",
      mobile: profile.mobile ?? "",
      nationality: profile.nationality ?? "",
      nationalId: profile.nationalId,
      passportNo: profile.passportNo,
      dob: profile.dob ?? "",
      company: profile.company ?? "",
      jobTitle: profile.jobTitle ?? "",
    } satisfies ApplicantProfile,
    answers,
    documents,
    missing,
  };
}

export function submitRegistration(db: Database, s: Submission): IntakeResult {
  const reg = db.registrations[s.registrationId];
  if (!reg) return { ok: false, error: "notFound" };
  if (!reg.badgeTypeIds.includes(s.badgeTypeId)) return { ok: false, error: "badBadgeType" };

  // AC05: a retried submit returns what the first one created.
  const earlier = Object.values(db.attendees).find((x) => x.submissionKey === s.submissionKey);
  if (earlier) {
    const req = Object.values(db.requests).find((r) => r.attendeeId === earlier.id);
    return { ok: true, db, outcome: "duplicate", attendeeId: earlier.id, requestId: req?.id ?? null, blacklistHits: 0, watchlistHits: 0 };
  }

  // 1. Existing form rules.
  const form = readForm(db, s);
  if (form.missing.length) return { ok: false, error: "missing", missing: form.missing };

  const settings = db.vettingSettings[reg.id];
  const allot = Object.values(db.allotments).find(
    (a) => a.registrationId === reg.id && a.badgeTypeId === s.badgeTypeId && db.workflows[a.workflowId]?.status === "active",
  );
  const behaviour = settings?.uncoveredBadgeBehaviour[s.badgeTypeId];
  if (settings?.enabled && !allot && behaviour === "block") return { ok: false, error: "blocked" };

  const tx = new Tx(db, s.now);
  const attendee: Attendee = {
    id: tx.id("att"),
    eventId: reg.eventId,
    registrationId: reg.id,
    badgeTypeId: s.badgeTypeId,
    profile: form.profile,
    answers: form.answers,
    documents: form.documents,
    payment: s.payment ?? { status: "free", amount: 0 },
    registrationStatus: "submitted",
    submittedAt: iso(s.now),
    submissionKey: s.submissionKey,
  };

  // Vetting off for this registration or badge type: the normal process carries on.
  if (!settings?.enabled || (!allot && behaviour === "noVetting")) {
    tx.put("attendees", { ...attendee, registrationStatus: "confirmed" });
    return { ok: true, db: tx.db, outcome: "noVetting", attendeeId: attendee.id, requestId: null, blacklistHits: 0, watchlistHits: 0 };
  }
  tx.put("attendees", attendee);

  // 2–3. One request, on the allotted workflow's current version.
  const workflow = allot ? db.workflows[allot.workflowId] : null;
  const versionId = workflow?.currentVersionId ?? null;
  const graph = versionId ? db.workflowVersions[versionId]?.graph : null;
  const requestId = nextRequestId(db);
  let r: VettingRequest = {
    id: requestId,
    attendeeId: attendee.id,
    eventId: reg.eventId,
    registrationId: reg.id,
    badgeTypeId: s.badgeTypeId,
    workflowId: workflow?.id ?? null,
    workflowVersionId: versionId,
    status: "pending_review",
    currentStageNodeId: null,
    currentTeamId: null,
    claimedBy: null,
    screening: "clear",
    watchlistLevel: null,
    responseReceived: false,
    awaitingCapacity: false,
    badgeStatus: "not_issued",
    rejectReasonId: null,
    revision: 1,
    submittedAt: iso(s.now),
    stageEnteredAt: iso(s.now),
    decidedAt: null,
  };
  const path = graph ? requestPath(graph, attendee, r) : [];
  if (!graph || !path.length) {
    // Saved straight into Configuration Error (it's where the request starts, not a move).
    tx.put("requests", { ...r, status: "configuration_error" });
    tx.log({ requestId, action: "submitted", actorId: "attendee", toStatus: "configuration_error" });
    tx.log({ requestId, action: "configuration_error", actorId: "system", toStatus: "configuration_error", meta: { reason: !workflow ? "noWorkflow" : "noStage" } });
    tx.emailStaff("registration.vettingSettings", "configuration_error", requestId, { registration: reg.name.en });
    tx.email(attendee.profile.email, "submitted", requestId, { name: attendee.profile.fullName });
    return { ok: true, db: tx.db, outcome: "configurationError", attendeeId: attendee.id, requestId, blacklistHits: 0, watchlistHits: 0 };
  }
  tx.put("requests", r);
  tx.log({ requestId, action: "submitted", actorId: "attendee", toStatus: "pending_review" });

  // 4. List check, as configured on the registration.
  const hits = screenProfile(
    attendee.profile,
    reg.eventId,
    settings.blacklistScreening ? Object.values(db.blacklist) : [],
    settings.watchlistScreening ? Object.values(db.watchlist) : [],
    new Set(),
    thresholdsOf(db),
  );
  const addMatch = (listType: "blacklist" | "watchlist", m: MatchCandidate, status: "open" | "confirmed" = "open") =>
    tx.put("matches", {
      id: tx.id("m"), requestId, listType, entryId: m.entryId, matchType: m.matchType, matchedField: m.matchedField,
      score: m.score, strength: m.strength, stagePoint: "submission", status, foundAt: iso(s.now),
      decidedBy: status === "confirmed" ? "system" : null, decidedAt: status === "confirmed" ? iso(s.now) : null,
      decisionNote: status === "confirmed" ? "Auto-rejected: exact identifier match." : null,
    });

  for (const w of hits.watchlist) addMatch("watchlist", w);
  if (hits.watchlist.length) {
    const top = hits.watchlist.map((w) => db.watchlist[w.entryId].level).sort((a, b) => RANK[b] - RANK[a])[0];
    r = tx.updateRequest(r, { screening: "watchlist_hit", watchlistLevel: top });
    for (const w of hits.watchlist) {
      const entry = db.watchlist[w.entryId];
      tx.log({ requestId, action: "watchlist_marked", actorId: "system", remarks: entry.id, meta: { level: entry.level } });
      if (entry.onMatch === "markEmail") notifyWatchers(tx, entry, requestId);
    }
  }
  tx.log({ requestId, action: "screened", actorId: "system", meta: { blacklist: hits.blacklist.length, watchlist: hits.watchlist.length } });

  const done = (outcome: IntakeOutcome): IntakeResult => ({
    ok: true, db: tx.db, outcome, attendeeId: attendee.id, requestId, blacklistHits: hits.blacklist.length, watchlistHits: hits.watchlist.length,
  });

  // 5. Blacklist: hold for confirmation, or auto-reject on an exact identifier when enabled.
  if (hits.blacklist.length) {
    const exact = hits.blacklist.filter((b) => b.matchType === "id");
    if (settings.blacklistMatchAction === "autoRejectExact" && exact.length) {
      for (const b of hits.blacklist) addMatch("blacklist", b, b.matchType === "id" ? "confirmed" : "open");
      // Held, then confirmed by the rule at once: Screening Hold → Rejected.
      r = tx.updateRequest(r, { status: "screening_hold", screening: "blacklist_hit", currentStageNodeId: path[0].id });
      tx.log({ requestId, action: "screening_hold", actorId: "system", fromStatus: "pending_review", toStatus: "screening_hold", meta: { stagePoint: "submission" } });
      tx.updateRequest(r, { status: "rejected", rejectReasonId: "rr_blacklisted", decidedAt: iso(s.now) });
      tx.log({ requestId, action: "match_confirmed", actorId: "system", fromStatus: "screening_hold", toStatus: "rejected", remarks: exact[0].entryId, meta: { auto: true } });
      // The applicant message never reveals the list (7: rejection template).
      tx.email(attendee.profile.email, "rejected", requestId, { name: attendee.profile.fullName });
      return done("autoRejected");
    }
    for (const b of hits.blacklist) addMatch("blacklist", b);
    tx.updateRequest(r, { status: "screening_hold", screening: "blacklist_hit", currentStageNodeId: path[0].id });
    tx.log({ requestId, action: "screening_hold", actorId: "system", fromStatus: "pending_review", toStatus: "screening_hold", meta: { stagePoint: "submission" } });
    tx.emailStaff("blacklist.approve", "blacklist_match", requestId, { entry: hits.blacklist[0].entryId });
    tx.email(attendee.profile.email, "submitted", requestId, { name: attendee.profile.fullName });
    return done("screeningHold");
  }

  // To the first stage's team.
  enterStage(tx, r, path[0], "pending_review", s.now);
  // 6. "Your registration has been submitted for review."
  tx.email(attendee.profile.email, "submitted", requestId, { name: attendee.profile.fullName });
  return done("underReview");
}
