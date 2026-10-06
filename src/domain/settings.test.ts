import { beforeAll, describe, expect, it } from "vitest";
import { createSeed } from "@/mocks/seed";
import { askMoreInfo } from "./moreInfo";
import { matchIdentity, thresholdsOf } from "./screening";
import { addReason, draftOfConfig, fillTemplate, moveReason, orderedReasons, renameReason, resetTemplate, saveConfig, saveTemplate, setReasonActive, thresholdImpact, validateConfig } from "./settings";
import type { Database } from "./types";

const NOW = Date.parse("2026-10-05T12:00:00.000Z");
let seed: Database;
beforeAll(() => {
  seed = createSeed(NOW);
});
const ADMIN = "u_sara";

describe("general settings", () => {
  it("starts from the spec defaults", () => {
    expect(seed.config.matching).toEqual({ nameWithDob: 90, nameOnly: 85 });
    expect(seed.config.moreInfo).toEqual({ linkDays: 7, reminderHours: 24 });
  });

  it("validates ranges and the reminder against the link lifetime", () => {
    const d = draftOfConfig(seed.config);
    expect(validateConfig(seed, { ...d, matching: { nameWithDob: 80, nameOnly: 85 } }, ADMIN).map((i) => i.code)).toContain("dobBelowName");
    expect(validateConfig(seed, { ...d, moreInfo: { linkDays: 1, reminderHours: 24 } }, ADMIN).map((i) => i.code)).toContain("reminderAfterExpiry");
    expect(validateConfig(seed, { ...d, senderAddress: "nope" }, ADMIN).map((i) => i.code)).toContain("senderInvalid");
    expect(validateConfig(seed, { ...d, matching: { nameWithDob: 101, nameOnly: 85 } }, ADMIN).map((i) => i.code)).toContain("thresholdRange");
  });

  it("only Blacklist Approve can change the thresholds", () => {
    const d = { ...draftOfConfig(seed.config), matching: { nameWithDob: 92, nameOnly: 88 } };
    const db: Database = {
      ...seed,
      roles: { ...seed.roles, role_x: { id: "role_x", name: { en: "x", ar: "x" }, permissions: ["registration.vettingSettings"] } },
      users: { ...seed.users, u_x: { ...seed.users.u_sara, id: "u_x", roleId: "role_x" } },
    };
    expect(validateConfig(db, d, "u_x").map((i) => i.code)).toContain("matchingNeedsApprove");
    expect(validateConfig(db, d, ADMIN)).toEqual([]);
  });

  it("saves, logs each area, and the new values are used from then on", () => {
    const d = { ...draftOfConfig(seed.config), matching: { nameWithDob: 95, nameOnly: 92 }, moreInfo: { linkDays: 3, reminderHours: 12 } };
    const r = saveConfig(seed, { draft: d, actorId: ADMIN, expectedRevision: 1, now: NOW });
    if (!r.ok) throw new Error(r.error);
    expect(thresholdsOf(r.db)).toEqual({ nameWithDob: 95, nameOnly: 92 });
    expect(Object.values(r.db.settingsHistory).map((h) => h.area).sort()).toEqual(["matching", "moreInfo"]);
    expect(saveConfig(r.db, { draft: d, actorId: ADMIN, expectedRevision: 1, now: NOW }).ok).toBe(false); // stale

    // A new More Information link now lasts 3 days.
    const req = Object.values(r.db.requests).find((x) => x.status === "under_review" && x.claimedBy)!;
    const asked = askMoreInfo(r.db, {
      requestId: req.id, actorId: req.claimedBy!, expectedRevision: req.revision, now: NOW, instructions: "x",
      questions: [{ id: "q1", label: "Q", type: "text", required: true }], returnToNodeId: req.currentStageNodeId!,
    });
    if (asked.ok) {
      const ir = Object.values(asked.db.infoRequests).find((i) => i.requestId === req.id && i.status === "sent")!;
      expect(Date.parse(ir.tokenExpiresAt) - NOW).toBe(3 * 86_400_000);
    }
  });

  it("previews the effect of new thresholds without changing anything", () => {
    const loose = thresholdImpact(seed, { nameWithDob: 75, nameOnly: 70 });
    const strict = thresholdImpact(seed, { nameWithDob: 100, nameOnly: 100 });
    expect(loose.checked).toBeGreaterThan(0);
    expect(loose.proposed.requests).toBeGreaterThanOrEqual(loose.current.requests);
    expect(strict.proposed.requests).toBeLessThanOrEqual(strict.current.requests);
  });

  it("matchIdentity respects the thresholds", () => {
    const identity = { subjectType: "person" as const, fullName: "Mohammed Abdullah Al-Harbi", aliases: [] };
    const profile = { ...Object.values(seed.attendees)[0].profile, fullName: "Mohamed Abdulla Al Harbi", nationalId: undefined, passportNo: undefined, email: "x@y.z", mobile: "0" };
    expect(matchIdentity(profile, identity, { nameWithDob: 90, nameOnly: 70 })).not.toBeNull();
    expect(matchIdentity(profile, identity, { nameWithDob: 100, nameOnly: 100 })).toBeNull();
  });
});

describe("reject reasons (8.4)", () => {
  it("adds, renames, reorders and deactivates; Blacklisted can't be turned off", () => {
    const a = addReason(seed, { label: { en: "Late application", ar: "" }, actorId: ADMIN, now: NOW });
    if (!a.ok) throw new Error(a.error);
    expect(addReason(a.db, { label: { en: "late application", ar: "" }, actorId: ADMIN, now: NOW }).ok).toBe(false);
    const id = a.reasonId!;
    expect(a.db.rejectReasons[id].label.ar).toBe("Late application");
    const r = renameReason(a.db, { id, label: { en: "Applied too late", ar: "تقدّم متأخرًا" }, actorId: ADMIN, now: NOW });
    if (!r.ok) throw new Error(r.error);
    const m = moveReason(r.db, { id, direction: -1, actorId: ADMIN, now: NOW });
    if (!m.ok) throw new Error(m.error);
    const list = orderedReasons(m.db);
    expect(list[list.length - 2].id).toBe(id);
    expect(setReasonActive(m.db, { id: "rr_blacklisted", active: false, actorId: ADMIN, now: NOW }).ok).toBe(false);
    const off = setReasonActive(m.db, { id, active: false, actorId: ADMIN, now: NOW });
    if (!off.ok) throw new Error(off.error);
    expect(off.db.rejectReasons[id].active).toBe(false);
    expect(Object.values(off.db.settingsHistory).filter((h) => h.area === "rejectReasons").length).toBe(4);
  });

  it("reviewers can't edit the list", () => {
    expect(addReason(seed, { label: { en: "x", ar: "x" }, actorId: "u_omar", now: NOW }).ok).toBe(false);
  });
});

describe("email templates (16)", () => {
  it("saves an edited template and can reset it", () => {
    const r = saveTemplate(seed, { key: "approved", subject: { en: "Hi {name}", ar: "مرحبًا {name}" }, body: { en: "Approved, {name}.", ar: "تمت الموافقة يا {name}." }, actorId: ADMIN, now: NOW });
    if (!r.ok) throw new Error(r.error);
    expect(fillTemplate(r.db.emailTemplates.approved.subject.en, { name: "Lama" })).toBe("Hi Lama");
    const back = resetTemplate(r.db, { key: "approved", actorId: ADMIN, now: NOW });
    if (!back.ok) throw new Error(back.error);
    expect(back.db.emailTemplates.approved).toBeUndefined();
  });

  it("rejects unknown placeholders, empty text, and list words in attendee emails", () => {
    const bad = saveTemplate(seed, { key: "rejected", subject: { en: "About {badge}", ar: "" }, body: { en: "You are on the blacklist.", ar: "x" }, actorId: ADMIN, now: NOW });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect([...new Set(bad.templateIssues?.map((i) => i.code))].sort()).toEqual(["empty", "mentionsLists", "unknownPlaceholder"]);
    // Staff emails may name the lists.
    expect(saveTemplate(seed, { key: "blacklist_match", subject: { en: "Blacklist match on {id}", ar: "مطابقة {id}" }, body: { en: "Entry {entry}.", ar: "{entry}" }, actorId: ADMIN, now: NOW }).ok).toBe(true);
  });
});
