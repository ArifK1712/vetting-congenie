import { beforeAll, describe, expect, it } from "vitest";
import { createSeed } from "@/mocks/seed";
import { submitRegistration, type Submission } from "./intake";
import { alertsFor } from "./notifications";
import { addQuestion, badgeCoverage, draftOf, hiddenNewQuestions, saveSettings, validateSettings } from "./registrations";
import type { Database } from "./types";

const NOW = Date.parse("2026-10-05T12:00:00.000Z");
let seed: Database;
beforeAll(() => {
  seed = createSeed(NOW);
});

const ADMIN = "u_sara";

let n = 0;
function form(over: Record<string, string | string[]> = {}, reg = "reg_gis_visitor", badge = "bt_visitor"): Submission {
  n++;
  return {
    registrationId: reg,
    badgeTypeId: badge,
    submissionKey: `test-${n}`,
    now: NOW,
    answers: {
      std_fullName: `Test Applicant ${n}`,
      std_email: `applicant${n}@example.com`,
      std_mobile: `+96650000${String(n).padStart(4, "0")}`,
      std_nationality: "SA",
      std_nationalId: `19${String(n).padStart(8, "0")}`,
      std_dob: "1990-04-12",
      std_company: "Test Holding",
      ...over,
    },
  };
}

function withoutAllotment(db: Database, reg: string, badge: string): Database {
  return {
    ...db,
    allotments: Object.fromEntries(Object.entries(db.allotments).filter(([, a]) => !(a.registrationId === reg && a.badgeTypeId === badge))),
  };
}

describe("registration intake (7.1)", () => {
  it("creates one request at the first stage's team, Pending Review", () => {
    const r = submitRegistration(seed, form());
    if (!r.ok) throw new Error(r.error);
    expect(r.outcome).toBe("underReview");
    const req = r.db.requests[r.requestId!];
    expect(req.status).toBe("pending_review");
    expect(req.currentTeamId).toBeTruthy();
    expect(req.workflowVersionId).toBe(seed.workflows[req.workflowId!].currentVersionId);
    expect(Object.values(r.db.outbox).some((m) => m.requestId === req.id && m.template === "submitted")).toBe(true);
  });

  it("AC05: submitting the same form twice creates one request", () => {
    const s = form();
    const first = submitRegistration(seed, s);
    if (!first.ok) throw new Error(first.error);
    const again = submitRegistration(first.db, s);
    if (!again.ok) throw new Error(again.error);
    expect(again.outcome).toBe("duplicate");
    expect(again.requestId).toBe(first.requestId);
    expect(Object.keys(again.db.requests).length).toBe(Object.keys(first.db.requests).length);
  });

  it("checks required fields first", () => {
    const r = submitRegistration(seed, form({ std_fullName: "" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing).toContain("std_fullName");
  });

  it("AC06: an applicant matching an active blacklist entry goes to Screening Hold", () => {
    const entry = Object.values(seed.blacklist).find((e) => e.status === "active" && e.identity.subjectType === "person" && e.identity.nationalId && e.eventScope === "all")!;
    const r = submitRegistration(seed, form({ std_nationalId: entry.identity.nationalId! }));
    if (!r.ok) throw new Error(r.error);
    expect(r.outcome).toBe("screeningHold");
    expect(r.db.requests[r.requestId!].status).toBe("screening_hold");
    expect(Object.values(r.db.matches).some((m) => m.requestId === r.requestId && m.entryId === entry.id && m.status === "open")).toBe(true);
  });

  it("auto-rejects on an exact identifier only when the registration says so", () => {
    const entry = Object.values(seed.blacklist).find((e) => e.status === "active" && e.identity.subjectType === "person" && e.identity.nationalId && e.eventScope === "all")!;
    const db: Database = { ...seed, vettingSettings: { ...seed.vettingSettings, reg_gis_visitor: { ...seed.vettingSettings.reg_gis_visitor, blacklistMatchAction: "autoRejectExact" } } };
    const r = submitRegistration(db, form({ std_nationalId: entry.identity.nationalId! }));
    if (!r.ok) throw new Error(r.error);
    expect(r.outcome).toBe("autoRejected");
    expect(r.db.requests[r.requestId!].status).toBe("rejected");
  });

  it("skips list screening that's turned off", () => {
    const entry = Object.values(seed.blacklist).find((e) => e.status === "active" && e.identity.subjectType === "person" && e.identity.nationalId && e.eventScope === "all")!;
    const db: Database = { ...seed, vettingSettings: { ...seed.vettingSettings, reg_gis_visitor: { ...seed.vettingSettings.reg_gis_visitor, blacklistScreening: false } } };
    const r = submitRegistration(db, form({ std_nationalId: entry.identity.nationalId! }));
    if (!r.ok) throw new Error(r.error);
    expect(r.outcome).toBe("underReview");
  });

  it("no workflow → Configuration Error and the admins are told; never skipped", () => {
    const db = withoutAllotment(seed, "reg_gis_visitor", "bt_visitor");
    const r = submitRegistration(db, form());
    if (!r.ok) throw new Error(r.error);
    expect(r.outcome).toBe("configurationError");
    expect(r.db.requests[r.requestId!].status).toBe("configuration_error");
    expect(alertsFor(r.db, ADMIN, NOW).some((a) => a.kind === "configError" && a.requestId === r.requestId)).toBe(true);
  });

  it("uncovered badge set to No vetting follows the normal process; Block refuses the submission", () => {
    const base = withoutAllotment(seed, "reg_gis_visitor", "bt_visitor");
    const set = (b: "noVetting" | "block"): Database => ({
      ...base,
      vettingSettings: { ...base.vettingSettings, reg_gis_visitor: { ...base.vettingSettings.reg_gis_visitor, uncoveredBadgeBehaviour: { bt_visitor: b } } },
    });
    const free = submitRegistration(set("noVetting"), form());
    expect(free.ok && free.outcome).toBe("noVetting");
    const blocked = submitRegistration(set("block"), form());
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error).toBe("blocked");
  });

  it("vetting off: no request is created", () => {
    const r = submitRegistration(seed, form({}, "reg_ref_visitor", "bt_visitor"));
    if (!r.ok) throw new Error(r.error);
    expect(r.outcome).toBe("noVetting");
    expect(r.requestId).toBeNull();
  });
});

describe("registration vetting settings (7, 15.1)", () => {
  it("AC23: can't be saved with vetting on and no strong identifier linked", () => {
    const s = seed.vettingSettings.reg_ref_visitor;
    const draft = { ...draftOf(s), enabled: true };
    expect(validateSettings(seed, "reg_ref_visitor", draft, ADMIN).map((i) => i.code)).toContain("noStrongId");
    const res = saveSettings(seed, { registrationId: "reg_ref_visitor", draft, actorId: ADMIN, expectedRevision: s.revision, now: NOW });
    expect(res.ok).toBe(false);
    // Passport + nationality is enough; date of birth is only a warning.
    const fixed = { ...draft, idFields: { ...draft.idFields, passportNo: "std_passportNo", nationality: "std_nationality" } };
    const issues = validateSettings(seed, "reg_ref_visitor", fixed, ADMIN);
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(issues.map((i) => i.code)).toContain("noDob");
    const ok = saveSettings(seed, { registrationId: "reg_ref_visitor", draft: fixed, actorId: ADMIN, expectedRevision: s.revision, now: NOW });
    if (!ok.ok) throw new Error(ok.error);
    expect(ok.db.vettingSettings.reg_ref_visitor.enabled).toBe(true);
    expect(Object.values(ok.db.registrationHistory).some((h) => h.action === "vetting_enabled")).toBe(true);
  });

  it("AC30: can't turn vetting on while a badge type has no workflow and no choice", () => {
    const db = withoutAllotment(seed, "reg_gis_visitor", "bt_visitor");
    const draft = draftOf(db.vettingSettings.reg_gis_visitor);
    expect(badgeCoverage(db, "reg_gis_visitor").find((c) => c.badgeTypeId === "bt_visitor")?.workflowId).toBeNull();
    expect(validateSettings(db, "reg_gis_visitor", draft, ADMIN).map((i) => i.code)).toContain("uncoveredBadge");
    const chosen = { ...draft, uncoveredBadgeBehaviour: { bt_visitor: "noVetting" as const } };
    expect(validateSettings(db, "reg_gis_visitor", chosen, ADMIN).filter((i) => i.severity === "error")).toEqual([]);
  });

  it("rejects a stale save", () => {
    const s = seed.vettingSettings.reg_gis_visitor;
    const res = saveSettings(seed, { registrationId: s.registrationId, draft: { ...draftOf(s), watchlistScreening: false }, actorId: ADMIN, expectedRevision: s.revision - 1, now: NOW });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("stale");
  });

  it("AC29: a new question is hidden from every team and the admins are notified", () => {
    const r = addQuestion(seed, {
      registrationId: "reg_gis_visitor",
      question: { label: { en: "Hotel name", ar: "اسم الفندق" }, type: "text", options: [] },
      actorId: ADMIN,
      now: NOW,
    });
    if (!r.ok) throw new Error(r.error);
    expect(hiddenNewQuestions(r.db).some((x) => x.question.id === r.questionId)).toBe(true);
    expect(alertsFor(r.db, ADMIN, NOW).some((a) => a.kind === "newQuestion" && a.registrationId === "reg_gis_visitor")).toBe(true);
    expect(Object.values(r.db.outbox).some((m) => m.template === "new_question")).toBe(true);
  });
});
