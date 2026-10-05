import { routeStage } from "@/domain/routing";
import { screenProfile, type MatchCandidate } from "@/domain/screening";
import { nodeById, requestPath, type StageNode } from "@/domain/workflow";
import type {
  Attendee,
  BlacklistEntry,
  BlacklistHistoryEvent,
  BlacklistReason,
  Database,
  HistoryEvent,
  ID,
  InfoRequest,
  ListIdentity,
  Registration,
  RequestStatus,
  ScreeningMatch,
  StageExecution,
  VettingRequest,
  WatchlistEntry,
  WatchlistHistoryEvent,
  WatchlistLevel,
} from "@/domain/types";
import { COMPANIES, MEDIA_OUTLETS, generatePerson, type GeneratedPerson } from "./people";
import { badgeTypes, events, registrations, rejectReasons, roles, users } from "./reference";
import { DAY, HOUR, createRng, iso, type Rng } from "./rng";
import { teamHistory, teams } from "./teams";
import { allotments, workflowVersions, workflows } from "./workflows";

export const SCHEMA_VERSION = 7;
const SEED = 20261005;

const byId = <T extends { id: ID }>(list: T[]) => Object.fromEntries(list.map((x) => [x.id, x])) as Record<ID, T>;

/** Applicants per registration, with badge-type mix. */
const PLAN: { registrationId: ID; count: number; badgeMix: Record<ID, number> }[] = [
  { registrationId: "reg_gis_visitor", count: 104, badgeMix: { bt_visitor: 92, bt_vip: 8 } },
  { registrationId: "reg_gis_vip", count: 30, badgeMix: { bt_vip: 1 } },
  { registrationId: "reg_gis_speaker", count: 36, badgeMix: { bt_speaker: 80, bt_vip: 20 } },
  { registrationId: "reg_gis_media", count: 30, badgeMix: { bt_media: 1 } },
  { registrationId: "reg_gis_exhibitor", count: 44, badgeMix: { bt_exhibitor: 75, bt_visitor: 25 } },
  { registrationId: "reg_gis_contractor", count: 38, badgeMix: { bt_contractor: 1 } },
  { registrationId: "reg_rdw_visitor", count: 40, badgeMix: { bt_visitor: 1 } },
  { registrationId: "reg_rdw_media", count: 36, badgeMix: { bt_media: 1 } },
  { registrationId: "reg_ref_vip", count: 16, badgeMix: { bt_vip: 1 } },
  { registrationId: "reg_ref_visitor", count: 34, badgeMix: { bt_visitor: 1 } },
];

const SESSION_TITLES = [
  "Financing resilient ports", "Digital twins for urban water networks", "Modular construction at scale",
  "Grid storage and the next decade", "Public–private partnership models", "Designing for extreme heat",
];
const DELEGATIONS = [
  "Office of the Deputy Minister", "Chamber of Commerce delegation", "Sovereign fund leadership",
  "Regional development authority", "Embassy commercial section",
];
const NOTES = [
  "Arriving with two staff members.", "Requires step-free access to the main hall.",
  "Will attend the opening ceremony only.", "",
  "سيحضر برفقة مدير المكتب.", "",
];

function buildAnswers(rng: Rng, reg: Registration, person: GeneratedPerson): Record<ID, string | string[]> {
  const answers: Record<ID, string | string[]> = {};
  for (const q of reg.questions) {
    if (q.type === "upload") continue;
    switch (q.id) {
      case "q_sponsor": answers[q.id] = rng.pick(COMPANIES); break;
      case "q_delegation": answers[q.id] = rng.pick(DELEGATIONS); break;
      case "q_session": answers[q.id] = rng.pick(SESSION_TITLES); break;
      case "q_outlet": answers[q.id] = rng.pick(MEDIA_OUTLETS); break;
      case "q_stand": answers[q.id] = `${rng.pick(["A", "B", "C"])}-${rng.int(10, 240)}`; break;
      case "q_notes": {
        const note = rng.pick(NOTES);
        if (note) answers[q.id] = note;
        break;
      }
      default:
        if (q.type === "multiChoice" && q.options) {
          answers[q.id] = q.options.filter(() => rng.chance(0.45)).map((o) => o.value);
          if ((answers[q.id] as string[]).length === 0) answers[q.id] = [q.options[0].value];
        } else if (q.options) {
          answers[q.id] = rng.pick(q.options).value;
        }
    }
  }
  void person;
  return answers;
}

const DOC_NAMES: Record<string, string[]> = {
  q_id_copy: ["passport_photo_page.pdf", "national_id_front_back.pdf", "passport_scan.jpg", "iqama_copy.pdf"],
  q_letter: ["nomination_letter.pdf", "company_letter_signed.pdf", "authorisation_letter.pdf"],
  q_press_card: ["press_card_2026.jpg", "media_credential.pdf"],
  q_work_order: ["work_order_WO-4471.pdf", "contractor_scope.pdf"],
};

export function createSeed(now: number = Date.now()): Database {
  const rng = createRng(SEED);
  let seq = 0;
  const id = (prefix: string) => `${prefix}_${(++seq).toString(36)}`;

  const db: Database = {
    schemaVersion: SCHEMA_VERSION,
    seededAt: iso(now),
    roles: byId(roles),
    users: byId(users),
    events: byId(events),
    badgeTypes: byId(badgeTypes),
    registrations: byId(registrations),
    vettingSettings: Object.fromEntries(
      registrations.map((r) => [
        r.id,
        {
          registrationId: r.id,
          enabled: true,
          uncoveredBadgeBehaviour: {},
          blacklistScreening: true,
          blacklistMatchAction: "hold",
          watchlistScreening: true,
          rejectionTemplateId: "tpl_reject_default",
        },
      ]),
    ),
    teams: byId(teams),
    teamHistory: byId(teamHistory),
    workflows: byId(workflows),
    workflowVersions: byId(workflowVersions),
    allotments: byId(allotments),
    attendees: {},
    requests: {},
    stageExecutions: {},
    history: {},
    infoRequests: {},
    comments: {},
    blacklist: {},
    blacklistHistory: {},
    watchlist: {},
    watchlistHistory: {},
    matches: {},
    allocations: {},
    rejectReasons: byId(rejectReasons),
    outbox: {},
  };

  // ─── 1. Applicants ──────────────────────────────────────────────────
  const shieldCompany = "Crescent Shield Trading";
  const people: { person: GeneratedPerson; reg: Registration; badgeTypeId: ID; submittedAt: number }[] = [];
  for (const plan of PLAN) {
    const reg = db.registrations[plan.registrationId];
    for (let i = 0; i < plan.count; i++) {
      const badgeTypeId = rng.weighted(plan.badgeMix);
      const isMedia = badgeTypeId === "bt_media";
      const person = generatePerson(rng, {
        company: isMedia ? rng.pick(MEDIA_OUTLETS) : undefined,
        jobTitle: isMedia ? rng.pick(["Journalist", "Photographer", "Editor", "Producer"]) : undefined,
      });
      // Skewed toward recent submissions, up to 21 days back.
      const ageMs = Math.pow(rng.next(), 1.5) * 21 * DAY + rng.int(5, 90) * 60_000;
      people.push({ person, reg, badgeTypeId, submittedAt: now - ageMs });
    }
  }
  // Two applicants from a blacklisted company.
  people[17].person.company = shieldCompany;
  people[203].person.company = shieldCompany;
  people.sort((a, b) => a.submittedAt - b.submittedAt);

  const attendees: Attendee[] = people.map(({ person, reg, badgeTypeId, submittedAt }) => {
    const attendeeId = id("att");
    const docs = reg.questions
      .filter((q) => q.type === "upload")
      .filter((q) => q.id === "q_id_copy" || rng.chance(0.9))
      .map((q) => {
        const fileName = rng.pick(DOC_NAMES[q.id] ?? ["document.pdf"]);
        return {
          id: id("doc"),
          questionId: q.id,
          fileName,
          mime: fileName.endsWith(".jpg") ? ("image/jpeg" as const) : ("application/pdf" as const),
          sizeKb: rng.int(180, 4200),
          uploadedAt: iso(submittedAt - rng.int(1, 20) * 60_000),
        };
      });
    const paid = ["bt_visitor", "bt_exhibitor"].includes(badgeTypeId);
    return {
      id: attendeeId,
      eventId: reg.eventId,
      registrationId: reg.id,
      badgeTypeId,
      profile: person,
      answers: buildAnswers(rng, reg, person),
      documents: docs,
      payment: paid
        ? {
            status: rng.chance(0.86) ? "paid" : "pending",
            amount: badgeTypeId === "bt_exhibitor" ? 1200 : rng.pick([250, 450]),
            invoiceNo: `INV-${rng.digits(6)}`,
          }
        : { status: "free", amount: 0 },
      registrationStatus: "submitted",
      submittedAt: iso(submittedAt),
    };
  });
  for (const a of attendees) db.attendees[a.id] = a;

  // ─── 2. Blacklist and watchlist ─────────────────────────────────────
  const BL_REASONS: { type: BlacklistReason; detail: string }[] = [
    { type: "security_threat", detail: "Flagged by venue security after the 2025 edition; attempted access to restricted back-of-house areas." },
    { type: "past_misconduct", detail: "Removed from the 2025 summit floor for harassment of exhibition staff." },
    { type: "fake_registration", detail: "Submitted forged media credentials in two previous events." },
    { type: "authority_instruction", detail: "Instruction received from the event security authority, ref. SEC-2026-114." },
    { type: "unpaid_dues", detail: "Outstanding exhibitor balance from 2025 not settled after three notices." },
  ];
  const identityOf = (p: GeneratedPerson, keep: (keyof ListIdentity)[]): ListIdentity => ({
    subjectType: "person",
    fullName: p.fullName,
    aliases: p.fullNameAr ? [p.fullNameAr] : [],
    ...Object.fromEntries(keep.map((k) => [k, p[k as keyof GeneratedPerson]])),
  });
  const spellVariant = (name: string) =>
    name
      .replace("Mohammed", "Mohamed")
      .replace("Al-", "Al ")
      .replace("Youssef", "Yousef")
      .replace("Abdullah", "Abdallah");

  const addBlacklist = (identity: ListIdentity, extra: Partial<BlacklistEntry> = {}) => {
    const reason = rng.pick(BL_REASONS);
    const proposedAt = now - rng.int(30, 200) * DAY;
    const entry: BlacklistEntry = {
      id: `BL-${String(Object.keys(db.blacklist).length + 101).padStart(4, "0")}`,
      identity,
      eventScope: "all",
      reasonType: reason.type,
      reasonDetail: reason.detail,
      evidence: rng.chance(0.6) ? [{ id: id("ev"), fileName: "incident_report.pdf", sizeKb: rng.int(200, 900) }] : [],
      startsOn: iso(proposedAt),
      endsOn: rng.chance(0.3) ? iso(now + rng.int(60, 400) * DAY) : null,
      status: "active",
      proposedBy: rng.pick(["u_arif", "u_tariq"]),
      proposedAt: iso(proposedAt),
      approvedBy: null,
      approvedAt: iso(proposedAt + rng.int(2, 30) * HOUR),
      source: "manual",
      sourceRequestId: null,
      pendingChange: null,
      decisionNote: null,
      removedBy: null,
      removedAt: null,
      removalReason: null,
      revision: 1,
      updatedAt: iso(proposedAt),
      ...extra,
    };
    entry.approvedBy = entry.status === "active" || entry.status === "removed" || entry.status === "expired"
      ? entry.proposedBy === "u_arif" ? "u_tariq" : "u_arif"
      : null;
    if (!entry.approvedBy) entry.approvedAt = null;
    entry.updatedAt = entry.approvedAt ?? entry.proposedAt;
    if (entry.status === "removed") {
      Object.assign(entry, {
        removedBy: entry.approvedBy,
        removedAt: iso(Date.parse(entry.approvedAt!) + 12 * DAY),
        removalReason: "Raised in error: the identity belongs to a different person.",
      });
      entry.updatedAt = entry.removedAt!;
    }
    if (entry.status === "not_approved") {
      entry.approvedAt = null;
      entry.decisionNote = "Not enough evidence. Attach the incident report and resubmit.";
    }
    db.blacklist[entry.id] = entry;
    return entry;
  };

  // Matches by design: ID, name + date of birth, name only, company.
  const pickIdx = (list: number[]) => list.map((i) => people[i % people.length].person);
  for (const p of pickIdx([12, 61, 140, 233, 301])) {
    addBlacklist(identityOf(p, p.nationalId ? ["nationalId", "nationality"] : ["passportNo", "nationality"]));
  }
  for (const p of pickIdx([88, 191, 266])) {
    addBlacklist({ ...identityOf(p, ["dob", "nationality"]), fullName: spellVariant(p.fullName) });
  }
  for (const p of pickIdx([45, 158, 320])) {
    addBlacklist({ ...identityOf(p, []), fullName: spellVariant(p.fullName), aliases: [], dob: "1975-03-14" });
  }
  addBlacklist({ subjectType: "company", fullName: shieldCompany, aliases: ["Crescent Shield Trading Co."], company: shieldCompany });
  // Independent entries that should not match anyone.
  for (let i = 0; i < 16; i++) {
    const p = generatePerson(rng);
    const status = i < 3 ? "pending_approval" : i < 5 ? "removed" : i === 5 ? "expired" : i === 6 ? "not_approved" : "active";
    addBlacklist(identityOf(p, p.nationalId ? ["nationalId", "dob"] : ["passportNo", "nationality", "dob"]), {
      status,
      ...(status === "pending_approval" ? { proposedAt: iso(now - rng.int(2, 40) * HOUR), proposedBy: i === 2 ? "u_tariq" : "u_arif" } : {}),
    });
  }

  const WL_NOTES = [
    "Check the company letter with the issuer before approving.",
    "Previous badge was shared with another person; confirm photo carefully.",
    "Verify the delegation with the Protocol Office.",
    "تحقق من صحة خطاب التفويض مع الجهة المصدرة.",
    "Confirm employment with the sponsoring organisation.",
  ];
  const addWatchlist = (identity: ListIdentity, level: WatchlistLevel) => {
    const createdAt = now - rng.int(20, 160) * DAY;
    const entry: WatchlistEntry = {
      id: `WL-${String(Object.keys(db.watchlist).length + 201).padStart(4, "0")}`,
      identity,
      eventScope: "all",
      level,
      onMatch: level === "high" ? "markStage" : level === "medium" ? "markEmail" : "mark",
      extraStage: level === "high" ? "watchlist_review" : null,
      notify: level !== "low" ? ["u_arif"] : [],
      reviewerNote: rng.pick(WL_NOTES),
      reasonType: "other",
      reason: "Raised by accreditation team after a previous event.",
      evidence: [],
      startsOn: iso(createdAt),
      endsOn: null,
      status: "active",
      createdBy: rng.pick(["u_arif", "u_tariq", "u_sara"]),
      createdAt: iso(createdAt),
      source: "manual",
      sourceRequestId: null,
      removedBy: null,
      removedAt: null,
      removalReason: null,
      revision: 1,
      updatedAt: iso(createdAt),
      updatedBy: "",
    };
    entry.updatedBy = entry.createdBy;
    // Varied reasons without drawing from the seeded random sequence.
    const n = Object.keys(db.watchlist).length;
    entry.reasonType = (["past_misconduct", "other", "fake_registration", "unpaid_dues"] as const)[n % 4];
    entry.reason = [
      "Badge was lent to another person at the 2025 edition.",
      "Raised by accreditation team after a previous event.",
      "Organisation letter could not be verified last year.",
      "Exhibitor balance settled late; confirm current standing.",
    ][n % 4];
    db.watchlist[entry.id] = entry;
  };
  [7, 33, 52, 79, 97, 120, 133, 171, 188, 207, 224, 249, 277, 290, 311, 344, 371, 390].forEach((i, n) => {
    const p = people[i % people.length].person;
    addWatchlist(identityOf(p, n % 2 ? ["email"] : p.passportNo ? ["passportNo", "nationality"] : ["nationalId"]),
      n % 5 === 0 ? "high" : n % 3 === 0 ? "medium" : "low");
  });
  for (let i = 0; i < 12; i++) {
    const p = generatePerson(rng);
    addWatchlist(identityOf(p, ["email", "dob"]), rng.pick(["low", "medium", "high"] as const));
  }

  // ─── 3. Requests ────────────────────────────────────────────────────
  const capacityUsed: Record<ID, number> = {};
  let historySeq = 0;
  const log = (e: Omit<HistoryEvent, "id">) => {
    const h = { ...e, id: `h_${(++historySeq).toString(36)}` };
    db.history[h.id] = h;
  };
  const addMatch = (requestId: ID, listType: "blacklist" | "watchlist", m: MatchCandidate, at: number, extra: Partial<ScreeningMatch> = {}) => {
    const match: ScreeningMatch = {
      id: id("m"),
      requestId,
      listType,
      entryId: m.entryId,
      matchType: m.matchType,
      matchedField: m.matchedField,
      score: m.score,
      strength: m.strength,
      stagePoint: "submission",
      status: "open",
      foundAt: iso(at),
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
      ...extra,
    };
    db.matches[match.id] = match;
    return match;
  };

  const blacklistActive = Object.values(db.blacklist);
  const watchlistActive = Object.values(db.watchlist);
  const v2PublishedAt = Date.parse(db.workflowVersions.wfv_vip_2.publishedAt);

  attendees.forEach((attendee, index) => {
    const requestId = `VR-${1001 + index}`;
    const submitted = Date.parse(attendee.submittedAt);
    const allotment = Object.values(db.allotments).find(
      (a) => a.registrationId === attendee.registrationId && a.badgeTypeId === attendee.badgeTypeId,
    )!;
    const workflow = db.workflows[allotment.workflowId];
    const versionId = workflow.id === "wf_vip" && submitted < v2PublishedAt ? "wfv_vip_1" : workflow.currentVersionId!;
    const graph = db.workflowVersions[versionId].graph;

    const request: VettingRequest = {
      id: requestId,
      attendeeId: attendee.id,
      eventId: attendee.eventId,
      registrationId: attendee.registrationId,
      badgeTypeId: attendee.badgeTypeId,
      workflowId: workflow.id,
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
      submittedAt: attendee.submittedAt,
      stageEnteredAt: attendee.submittedAt,
      decidedAt: null,
    };
    db.requests[requestId] = request;

    log({ requestId, action: "submitted", actorId: "attendee", at: attendee.submittedAt, toStatus: "pending_review" });

    // Screening at submission, using the real matching engine.
    const screenedAt = submitted + 4000;
    const hits = screenProfile(attendee.profile, attendee.eventId, blacklistActive, watchlistActive);
    for (const w of hits.watchlist) addMatch(requestId, "watchlist", w, screenedAt);
    if (hits.watchlist.length) {
      const levels = hits.watchlist.map((w) => db.watchlist[w.entryId].level);
      request.screening = "watchlist_hit";
      request.watchlistLevel = levels.includes("high") ? "high" : levels.includes("medium") ? "medium" : "low";
    }
    log({
      requestId,
      action: "screened",
      actorId: "system",
      at: iso(screenedAt),
      meta: { blacklist: hits.blacklist.length, watchlist: hits.watchlist.length },
    });

    // Resolve the path through condition nodes for this request.
    const path = requestPath(graph, attendee, request);
    const firstStage = path[0];

    const route = (stage: StageNode) => routeStage(db, stage.stage, request, attendee).teamId!;

    if (hits.blacklist.length) {
      const outcome = (now - submitted) / HOUR < 96 ? rng.weighted({ hold: 70, confirmed: 15, cleared: 15 }) : rng.weighted({ confirmed: 60, cleared: 40 });
      const decider = rng.pick(["u_arif", "u_tariq"]);
      const decidedAt = Math.min(now - HOUR, screenedAt + rng.int(2, 40) * HOUR);
      if (outcome === "hold" || decidedAt <= screenedAt) {
        for (const b of hits.blacklist) addMatch(requestId, "blacklist", b, screenedAt);
        request.status = "screening_hold";
        request.screening = "blacklist_hit";
        request.currentStageNodeId = firstStage.id;
        request.stageEnteredAt = iso(screenedAt);
        log({ requestId, action: "screening_hold", actorId: "system", at: iso(screenedAt), fromStatus: "pending_review", toStatus: "screening_hold" });
        return;
      }
      if (outcome === "confirmed") {
        for (const b of hits.blacklist)
          addMatch(requestId, "blacklist", b, screenedAt, { status: "confirmed", decidedBy: decider, decidedAt: iso(decidedAt), decisionNote: "Identity confirmed against entry." });
        request.status = "rejected";
        request.screening = "blacklist_hit";
        request.rejectReasonId = "rr_blacklisted";
        request.decidedAt = iso(decidedAt);
        request.stageEnteredAt = iso(screenedAt);
        log({ requestId, action: "screening_hold", actorId: "system", at: iso(screenedAt), fromStatus: "pending_review", toStatus: "screening_hold" });
        log({ requestId, action: "match_confirmed", actorId: decider, at: iso(decidedAt), fromStatus: "screening_hold", toStatus: "rejected" });
        return;
      }
      for (const b of hits.blacklist)
        addMatch(requestId, "blacklist", b, screenedAt, { status: "cleared", decidedBy: decider, decidedAt: iso(decidedAt), decisionNote: "Different person: date of birth and nationality do not match." });
      log({ requestId, action: "screening_hold", actorId: "system", at: iso(screenedAt), fromStatus: "pending_review", toStatus: "screening_hold" });
      log({ requestId, action: "match_cleared", actorId: decider, at: iso(decidedAt), fromStatus: "screening_hold", toStatus: "pending_review" });
    }

    // Decide where this request ends up.
    const ageH = (now - submitted) / HOUR;
    type Target = "pending" | "under" | "info" | "infoBack" | "escalated" | "approved" | "rejected" | "withdrawn";
    // Realistic ages: new submissions are mostly open, older ones mostly decided.
    const goalWeights: Partial<Record<Target, number>> =
      ageH < 6
        ? { pending: 75, under: 25 }
        : ageH < 48
          ? { pending: 30, under: 22, info: 10, infoBack: 5, escalated: 5, approved: 18, rejected: 7 }
          : ageH < 120
            ? { pending: 8, under: 9, info: 8, infoBack: 6, escalated: 4, approved: 46, rejected: 14, withdrawn: 3 }
            : { pending: 1.5, under: 1.5, info: 3, infoBack: 1, escalated: 1, approved: 66, rejected: 21, withdrawn: 5 };
    let goal: Target = rng.weighted<Target>(goalWeights);

    // How many stages are already complete.
    const n = path.length;
    const done = goal === "approved" ? n : rng.int(0, n - 1);
    let escalationNode: StageNode | undefined;
    if (goal === "escalated") {
      const from = path[done];
      const escId = from.stage.escalateTo[0];
      const esc = escId ? (nodeById(graph, escId) as StageNode | undefined) : undefined;
      if (esc && !path.some((p) => p.id === esc.id)) escalationNode = esc;
      else goal = "under";
    }

    // Time budget: completed work fits between submission and now.
    const budget = now - screenedAt;
    const finished = goal === "approved" || goal === "rejected" || goal === "withdrawn";
    const usedFraction = finished ? 0.25 + rng.next() * 0.6 : done === 0 ? 0 : 0.3 + rng.next() * 0.5;
    const segments = Math.max(1, done + (finished && goal !== "approved" ? 1 : 0));
    const segment = (budget * usedFraction) / segments;
    let clock = screenedAt + 60_000;
    const usedReviewers = new Set<ID>();

    const pickReviewer = (teamId: ID) => {
      const members = db.teams[teamId].members.map((m) => m.userId).filter((u) => !usedReviewers.has(u));
      const chosen = rng.pick(members.length ? members : db.teams[teamId].members.map((m) => m.userId));
      usedReviewers.add(chosen);
      return chosen;
    };
    const openExecution = (stage: StageNode, teamId: ID, enteredAt: number): StageExecution => {
      const exec: StageExecution = {
        id: id("se"),
        requestId,
        stageNodeId: stage.id,
        stageName: stage.stage.name,
        teamId,
        assignedUserId: null,
        status: "open",
        enteredAt: iso(enteredAt),
        claimedAt: null,
        completedAt: null,
        outcome: null,
      };
      db.stageExecutions[exec.id] = exec;
      log({ requestId, action: "routed", actorId: "system", at: iso(enteredAt), stageNodeId: stage.id, teamId });
      return exec;
    };
    const claim = (exec: StageExecution, at: number, userId: ID) => {
      exec.status = "claimed";
      exec.assignedUserId = userId;
      exec.claimedAt = iso(at);
      log({ requestId, action: "claimed", actorId: userId, at: iso(at), stageNodeId: exec.stageNodeId, fromStatus: "pending_review", toStatus: "under_review" });
    };

    const COMMENTS = ["ID copy verified against profile.", "Letter confirmed with issuer by phone.", "", "", "No concerns.", "تم التحقق من خطاب الجهة."];

    for (let i = 0; i < done; i++) {
      const stage = path[i];
      const teamId = route(stage);
      const exec = openExecution(stage, teamId, clock);
      const reviewer = pickReviewer(teamId);
      const claimAt = clock + segment * (0.2 + rng.next() * 0.5);
      claim(exec, claimAt, reviewer);
      const completeAt = clock + segment * (0.75 + rng.next() * 0.2);
      exec.status = "completed";
      exec.completedAt = iso(completeAt);
      exec.outcome = "approve";
      const comment = rng.pick(COMMENTS);
      log({ requestId, action: "approved_stage", actorId: reviewer, at: iso(completeAt), stageNodeId: stage.id, fromStatus: "under_review", toStatus: i === n - 1 ? "under_review" : "pending_review", remarks: comment || undefined });
      clock = completeAt + 30_000;
    }

    if (goal === "approved") {
      const reg = db.registrations[request.registrationId];
      const last = path[n - 1];
      request.currentStageNodeId = last.id;
      request.currentTeamId = route(last);
      const decidedAt = clock;
      const used = capacityUsed[reg.id] ?? 0;
      if (used >= reg.capacityLimit) {
        request.status = "under_review";
        request.awaitingCapacity = true;
        request.claimedBy = [...usedReviewers].pop() ?? null;
        request.stageEnteredAt = iso(decidedAt);
        log({ requestId, action: "limit_reached", actorId: "system", at: iso(decidedAt), remarks: `${used}/${reg.capacityLimit}` });
        return;
      }
      capacityUsed[reg.id] = used + 1;
      const allocationId = id("cap");
      db.allocations[allocationId] = { id: allocationId, requestId, registrationId: reg.id, state: "held", createdAt: iso(decidedAt) };
      request.status = "approved";
      request.decidedAt = iso(decidedAt);
      request.stageEnteredAt = iso(decidedAt);
      request.currentTeamId = null;
      log({ requestId, action: "final_approved", actorId: "system", at: iso(decidedAt), fromStatus: "under_review", toStatus: "approved", meta: { placesUsed: used + 1, limit: reg.capacityLimit } });
      if (attendee.payment.status !== "pending") {
        request.badgeStatus = "issued";
        log({ requestId, action: "badge_issued", actorId: "system", at: iso(decidedAt + 20_000) });
      }
      return;
    }

    // An open or just-decided current stage.
    const current = escalationNode ?? path[done];
    let currentTeam = route(path[done]);
    let enteredAt = clock;

    if (escalationNode) {
      const exec = openExecution(path[done], currentTeam, clock);
      const reviewer = pickReviewer(currentTeam);
      claim(exec, clock + segment * 0.3, reviewer);
      const at = clock + segment * 0.6 + HOUR;
      exec.status = "completed";
      exec.completedAt = iso(Math.min(at, now - 10 * 60_000));
      exec.outcome = "escalate";
      log({ requestId, action: "escalated", actorId: reviewer, at: exec.completedAt, stageNodeId: path[done].id, fromStatus: "under_review", toStatus: "escalated", remarks: "Delegation details could not be verified at this stage." });
      currentTeam = route(escalationNode);
      enteredAt = Date.parse(exec.completedAt) + 30_000;
      openExecution(escalationNode, currentTeam, enteredAt);
      Object.assign(request, { status: "escalated" as RequestStatus, currentStageNodeId: escalationNode.id, currentTeamId: currentTeam, stageEnteredAt: iso(enteredAt) });
      return;
    }

    const exec = openExecution(current, currentTeam, enteredAt);
    request.currentStageNodeId = current.id;
    request.currentTeamId = currentTeam;
    request.stageEnteredAt = iso(enteredAt);

    const remaining = now - enteredAt;
    const reviewer = () => pickReviewer(currentTeam);

    switch (goal) {
      case "pending":
        return;
      case "under": {
        const who = reviewer();
        claim(exec, enteredAt + remaining * (0.3 + rng.next() * 0.6), who);
        request.status = "under_review";
        request.claimedBy = who;
        if (rng.chance(0.25)) {
          const cid = id("c");
          db.comments[cid] = { id: cid, requestId, authorId: who, body: rng.pick(["Waiting on a call back from the sponsor.", "Photo looks older than ID issue date — checking.", "أتحقق من بيانات الوفد مع المراسم."]), at: iso(now - rng.int(10, 120) * 60_000) };
        }
        return;
      }
      case "info":
      case "infoBack": {
        const who = reviewer();
        const claimAt = enteredAt + remaining * 0.15;
        claim(exec, claimAt, who);
        const sentAt = enteredAt + remaining * 0.3;
        exec.status = "completed";
        exec.completedAt = iso(sentAt);
        exec.outcome = "moreInfo";
        const info: InfoRequest = {
          id: id("ir"),
          requestId,
          round: 1,
          stageNodeId: current.id,
          requestedBy: who,
          instructions: rng.pick([
            "Please upload a clearer copy of your passport photo page. The current file is cropped.",
            "We need an authorisation letter from your organisation on official letterhead.",
            "يرجى إرفاق خطاب تفويض من جهة العمل على الورق الرسمي.",
            "Please confirm your role in the delegation and the name of the head of delegation.",
          ]),
          questions: [
            { id: "iq1", label: "Upload document", type: "upload", required: true },
            { id: "iq2", label: "Comments for the reviewer", type: "longText", required: false },
          ],
          answers: null,
          status: now - sentAt > 7 * DAY ? "expired" : "sent",
          tokenExpiresAt: iso(sentAt + 7 * DAY),
          sentAt: iso(sentAt),
          answeredAt: null,
        };
        db.infoRequests[info.id] = info;
        log({ requestId, action: "more_info_requested", actorId: who, at: iso(sentAt), stageNodeId: current.id, fromStatus: "under_review", toStatus: "more_info_required" });
        if (goal === "info") {
          Object.assign(request, { status: "more_info_required" as RequestStatus, stageEnteredAt: iso(sentAt) });
          return;
        }
        const answeredAt = sentAt + Math.min(remaining * 0.4, 3 * DAY);
        info.status = "answered";
        info.answeredAt = iso(answeredAt);
        info.answers = { iq1: "authorisation_letter_signed.pdf", iq2: "Attached the signed letter as requested." };
        attendee.documents.push({ id: id("doc"), questionId: "q_letter", fileName: "authorisation_letter_signed.pdf", mime: "application/pdf", sizeKb: 640, uploadedAt: iso(answeredAt), infoRound: 1 });
        log({ requestId, action: "more_info_received", actorId: "attendee", at: iso(answeredAt), fromStatus: "more_info_required", toStatus: "pending_review" });
        openExecution(current, currentTeam, answeredAt + 10_000);
        Object.assign(request, { status: "pending_review" as RequestStatus, responseReceived: true, stageEnteredAt: iso(answeredAt) });
        return;
      }
      case "rejected": {
        const who = reviewer();
        claim(exec, enteredAt + segment * 0.3, who);
        const at = Math.min(enteredAt + segment * 0.8, now - 30 * 60_000);
        exec.status = "completed";
        exec.completedAt = iso(at);
        exec.outcome = "reject";
        const reason = rng.pick(["rr_docs", "rr_identity", "rr_security", "rr_eligibility", "rr_duplicate"]);
        log({ requestId, action: "rejected", actorId: who, at: iso(at), stageNodeId: current.id, fromStatus: "under_review", toStatus: "rejected", meta: { reasonId: reason } });
        Object.assign(request, { status: "rejected" as RequestStatus, rejectReasonId: reason, decidedAt: iso(at), currentTeamId: null });
        return;
      }
      case "withdrawn": {
        const at = enteredAt + remaining * 0.5;
        log({ requestId, action: "withdrawn", actorId: "attendee", at: iso(at), fromStatus: "pending_review", toStatus: "withdrawn" });
        Object.assign(request, { status: "withdrawn" as RequestStatus, decidedAt: iso(at), currentTeamId: null });
        return;
      }
    }
  });

  // ─── 4. Retro-screening: a new entry suspends two approved badges ──
  const approvedIssued = Object.values(db.requests).filter((r) => r.status === "approved" && r.badgeStatus === "issued");
  for (const r of [approvedIssued[5], approvedIssued[40]].filter(Boolean)) {
    const a = db.attendees[r.attendeeId];
    const at = now - rng.int(3, 20) * HOUR;
    const entry = addBlacklist(identityOf(a.profile as GeneratedPerson, a.profile.nationalId ? ["nationalId"] : ["passportNo", "nationality"]), {
      proposedAt: iso(at - 6 * HOUR),
      startsOn: iso(at),
      approvedAt: iso(at),
      reasonType: "authority_instruction",
      reasonDetail: "Instruction received from the event security authority, ref. SEC-2026-131.",
    });
    addMatch(r.id, "blacklist", { entryId: entry.id, matchType: "id", matchedField: a.profile.nationalId ? "nationalId" : "passportNo", score: 100, strength: "strong" }, at, { stagePoint: "retro" });
    r.badgeStatus = "suspended";
    r.screening = "blacklist_hit";
    log({ requestId: r.id, action: "badge_suspended", actorId: "system", at: iso(at + 5000), remarks: entry.id });
  }

  // ─── 5. A proposed change waiting on an active entry, and list history ──
  const changed = Object.values(db.blacklist).find((e) => e.status === "active" && e.reasonType !== "authority_instruction" && e.proposedBy === "u_arif");
  if (changed) {
    changed.pendingChange = {
      identity: { ...changed.identity, aliases: [...changed.identity.aliases, spellVariant(changed.identity.fullName) + " Jr."].slice(0, 5) },
      eventScope: changed.eventScope,
      reasonType: changed.reasonType,
      reasonDetail: `${changed.reasonDetail} Extended after a repeat attempt at the 2026 pre-event briefing.`,
      evidence: changed.evidence,
      startsOn: changed.startsOn,
      endsOn: iso(now + 365 * DAY),
      proposedBy: "u_tariq",
      proposedAt: iso(now - 9 * HOUR),
    };
    changed.revision = 2;
    changed.updatedAt = changed.pendingChange.proposedAt;
  }
  let h = 0;
  const logList = (e: Omit<BlacklistHistoryEvent, "id">) => {
    const event = { ...e, id: `blh_${(++h).toString(36)}` };
    db.blacklistHistory[event.id] = event;
  };
  for (const e of Object.values(db.blacklist)) {
    logList({ entryId: e.id, action: "proposed", actorId: e.proposedBy, at: e.proposedAt });
    if (e.approvedBy && e.approvedAt) logList({ entryId: e.id, action: "approved", actorId: e.approvedBy, at: e.approvedAt });
    if (e.status === "not_approved") logList({ entryId: e.id, action: "not_approved", actorId: e.proposedBy === "u_arif" ? "u_tariq" : "u_arif", at: iso(Date.parse(e.proposedAt) + DAY), note: e.decisionNote ?? undefined });
    if (e.removedBy && e.removedAt) logList({ entryId: e.id, action: "removed", actorId: e.removedBy, at: e.removedAt, note: e.removalReason ?? undefined });
    if (e.pendingChange) logList({ entryId: e.id, action: "change_proposed", actorId: e.pendingChange.proposedBy, at: e.pendingChange.proposedAt });
  }

  // ─── 6. Watchlist: one removed entry, and history for every entry ──
  const wlRemoved = Object.values(db.watchlist).find((w) => w.level === "low" && !Object.values(db.matches).some((m) => m.entryId === w.id));
  if (wlRemoved) {
    Object.assign(wlRemoved, {
      status: "removed",
      removedBy: "u_arif",
      removedAt: iso(Date.parse(wlRemoved.createdAt) + 20 * DAY),
      removalReason: "Concern resolved with the sponsoring organisation.",
      revision: 2,
    });
    wlRemoved.updatedAt = wlRemoved.removedAt!;
    wlRemoved.updatedBy = "u_arif";
  }
  let wh = 0;
  for (const w of Object.values(db.watchlist)) {
    const add = (e: Omit<WatchlistHistoryEvent, "id" | "entryId">) => {
      const id = `wlh_${(++wh).toString(36)}`;
      db.watchlistHistory[id] = { ...e, id, entryId: w.id };
    };
    add({ action: "created", actorId: w.createdBy, at: w.createdAt });
    for (const m of Object.values(db.matches)) {
      if (m.entryId === w.id && m.status === "cleared" && m.decidedBy && m.decidedAt) add({ action: "match_cleared", actorId: m.decidedBy, at: m.decidedAt, ref: m.requestId, note: m.decisionNote ?? undefined });
    }
    if (w.removedBy && w.removedAt) add({ action: "removed", actorId: w.removedBy, at: w.removedAt, note: w.removalReason ?? undefined });
  }

  return db;
}
