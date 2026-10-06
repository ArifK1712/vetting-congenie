import { beforeAll, describe, expect, it } from "vitest";
import { createSeed } from "@/mocks/seed";
import {
  approveEntry,
  draftFromEntry,
  draftFromRequest,
  editEntry,
  emptyDraft,
  errorsOf,
  importEntries,
  parseCsv,
  proposeEntry,
  readImport,
  rejectEntry,
  removeEntry,
  retroMatches,
  rowReady,
  templateCsv,
  validateEntry,
  type BlacklistResult,
  type EntryDraft,
} from "./blacklist";
import type { Database } from "./types";

const NOW = Date.parse("2026-10-05T12:00:00.000Z");
let seed: Database;
beforeAll(() => {
  seed = createSeed(NOW);
});

function ok(r: BlacklistResult): Database {
  if (!r.ok) throw new Error(`expected ok, got ${r.error} ${JSON.stringify(r.issues ?? "")}`);
  return r.db;
}
const codes = (d: EntryDraft) => errorsOf(validateEntry(seed, d, null, NOW)).map((i) => i.code);

function personDraft(over: Partial<EntryDraft["identity"]> = {}): EntryDraft {
  return {
    ...emptyDraft(NOW),
    identity: { subjectType: "person", fullName: "Test Person", aliases: [], nationalId: "1999999999", ...over },
    reasonType: "security_threat",
    reasonDetail: "Reported by venue security.",
  };
}

/** An approved request with an issued badge, and one in progress. */
const approvedReq = () => Object.values(seed.requests).find((r) => r.status === "approved" && r.badgeStatus === "issued" && !seed.attendees[r.attendeeId].profile.fullNameAr)!;
const pendingReq = () => Object.values(seed.requests).find((r) => r.status === "pending_review" && r.screening === "clear")!;

describe("entry rules (9.2)", () => {
  it("accepts a complete person entry", () => {
    expect(codes(personDraft())).toEqual([]);
  });

  it("needs a National ID or a passport with nationality for a person", () => {
    expect(codes(personDraft({ nationalId: undefined }))).toContain("idRequired");
    expect(codes(personDraft({ nationalId: undefined, passportNo: "X1234567" }))).toContain("nationalityRequired");
  });

  it("needs a company name for a company entry", () => {
    const d = { ...personDraft(), identity: { subjectType: "company" as const, fullName: "Acme", aliases: [] } };
    expect(codes(d)).toContain("companyRequired");
  });

  it("limits other spellings, reason length and evidence", () => {
    const d = { ...personDraft({ aliases: ["a", "b", "c", "d", "e", "f"] }), reasonDetail: "x".repeat(1001), evidence: [{ id: "f", fileName: "clip.mp4", sizeKb: 20000 }] };
    expect(codes(d)).toEqual(expect.arrayContaining(["tooManyAliases", "reasonDetailTooLong", "fileType", "fileTooLarge"]));
  });

  it("warns about an existing entry with the same ID number", () => {
    const existing = Object.values(seed.blacklist).find((e) => e.status === "active" && e.identity.nationalId)!;
    const issues = validateEntry(seed, personDraft({ nationalId: existing.identity.nationalId }), null, NOW);
    expect(issues.find((i) => i.code === "possibleDuplicate")).toMatchObject({ severity: "warning", ref: existing.id });
  });
});

describe("approval by a second person (9.3)", () => {
  it("creates a waiting entry that matches no one yet", () => {
    const r = approvedReq();
    const p = seed.attendees[r.attendeeId].profile;
    const db = ok(proposeEntry(seed, { draft: personDraft({ fullName: p.fullName, nationalId: p.nationalId, passportNo: p.passportNo, nationality: p.nationality }), source: "manual", actorId: "u_arif", now: NOW }));
    const entry = Object.values(db.blacklist).find((e) => e.proposedAt === new Date(NOW).toISOString())!;
    expect(entry.status).toBe("pending_approval");
    expect(db.requests[r.id].badgeStatus).toBe("issued");
  });

  it("refuses approval by the person who proposed it", () => {
    const db = ok(proposeEntry(seed, { draft: personDraft(), source: "manual", actorId: "u_arif", now: NOW }));
    const entry = Object.values(db.blacklist).find((e) => e.proposedAt === new Date(NOW).toISOString())!;
    expect(approveEntry(db, { entryId: entry.id, expectedRevision: entry.revision, actorId: "u_arif", now: NOW })).toEqual({ ok: false, error: "ownProposal" });
  });

  it("on approval suspends a matching approved badge and holds a request in progress", () => {
    const approved = approvedReq();
    const pending = pendingReq();
    const pa = seed.attendees[approved.attendeeId].profile;
    const pp = seed.attendees[pending.attendeeId].profile;
    let db = ok(proposeEntry(seed, { draft: personDraft({ fullName: pa.fullName, nationalId: pa.nationalId, passportNo: pa.passportNo, nationality: pa.nationality }), source: "manual", actorId: "u_arif", now: NOW }));
    db = ok(proposeEntry(db, { draft: personDraft({ fullName: pp.fullName, nationalId: pp.nationalId, passportNo: pp.passportNo, nationality: pp.nationality }), source: "manual", actorId: "u_arif", now: NOW + 1 }));
    const [e1, e2] = Object.values(db.blacklist).filter((e) => e.status === "pending_approval" && e.proposedBy === "u_arif" && Date.parse(e.proposedAt) >= NOW);

    const r1 = approveEntry(db, { entryId: e1.id, expectedRevision: e1.revision, actorId: "u_sara", now: NOW + 2 });
    db = ok(r1);
    expect(r1.ok && r1.suspended).toBe(1);
    expect(db.requests[approved.id].badgeStatus).toBe("suspended");

    db = ok(approveEntry(db, { entryId: e2.id, expectedRevision: e2.revision, actorId: "u_sara", now: NOW + 3 }));
    expect(db.requests[pending.id].status).toBe("screening_hold");
    expect(Object.values(db.matches).some((m) => m.requestId === pending.id && m.entryId === e2.id && m.status === "open")).toBe(true);
  });

  it("keeps an active entry working while a change waits, then applies it", () => {
    const e = Object.values(seed.blacklist).find((x) => x.status === "active" && !x.pendingChange && x.proposedBy === "u_arif")!;
    let db = ok(editEntry(seed, { entryId: e.id, draft: { ...draftFromEntry(e), reasonDetail: "Updated detail." }, expectedRevision: e.revision, actorId: "u_arif", now: NOW }));
    expect(db.blacklist[e.id].status).toBe("active");
    expect(db.blacklist[e.id].reasonDetail).toBe(e.reasonDetail);
    const waiting = db.blacklist[e.id];
    db = ok(approveEntry(db, { entryId: e.id, expectedRevision: waiting.revision, actorId: "u_sara", now: NOW + 1 }));
    expect(db.blacklist[e.id]).toMatchObject({ reasonDetail: "Updated detail.", pendingChange: null });
  });

  it("not approving needs a note; it releases a request held from that entry", () => {
    const r = pendingReq();
    const draft = draftFromRequest(seed, r.id, NOW)!;
    let db = ok(proposeEntry(seed, { draft: { ...draft, reasonType: "past_misconduct", reasonDetail: "Seen at gate." }, source: "request", sourceRequestId: r.id, actorId: "u_arif", now: NOW }));
    expect(db.requests[r.id].status).toBe("screening_hold");
    const entry = Object.values(db.blacklist).find((e) => e.sourceRequestId === r.id)!;
    expect(rejectEntry(db, { entryId: entry.id, expectedRevision: entry.revision, actorId: "u_sara", note: " ", now: NOW })).toEqual({ ok: false, error: "noteRequired" });
    db = ok(rejectEntry(db, { entryId: entry.id, expectedRevision: entry.revision, actorId: "u_sara", note: "Different person.", now: NOW + 1 }));
    expect(db.blacklist[entry.id].status).toBe("not_approved");
    expect(db.requests[r.id].status).toBe("pending_review");
  });

  it("removing needs a reason and the Approve permission", () => {
    const e = Object.values(seed.blacklist).find((x) => x.status === "active")!;
    expect(removeEntry(seed, { entryId: e.id, expectedRevision: e.revision, actorId: "u_omar", reason: "x", now: NOW })).toEqual({ ok: false, error: "forbidden" });
    const db = ok(removeEntry(seed, { entryId: e.id, expectedRevision: e.revision, actorId: "u_sara", reason: "Lifted by authority.", now: NOW }));
    expect(db.blacklist[e.id]).toMatchObject({ status: "removed", removedBy: "u_sara", removalReason: "Lifted by authority." });
  });

  it("previews who an identity would match", () => {
    const r = approvedReq();
    const p = seed.attendees[r.attendeeId].profile;
    const hits = retroMatches(seed, { subjectType: "person", fullName: p.fullName, aliases: [], nationalId: p.nationalId, passportNo: p.passportNo, nationality: p.nationality }, "all", null);
    expect(hits.some((h) => h.requestId === r.id && h.approved)).toBe(true);
  });
});

describe("import", () => {
  it("parses quoted CSV fields", () => {
    expect(parseCsv('a,b\n"x, y","he said ""hi"""\n')).toEqual([["a", "b"], ["x, y", 'he said "hi"']]);
  });

  it("reads the template and flags bad rows", () => {
    const text = `${templateCsv()}person,No Id,,,,,,,,,GIS26,past_misconduct,detail,2026-10-05,\ncompany,Acme,,,,,,,,Acme LLC,XYZ,other,detail,2026-10-05,\n`;
    const { rows, headerError } = readImport(seed, text, NOW);
    expect(headerError).toBeNull();
    expect(rows.map(rowReady)).toEqual([true, false, false]);
    expect(rows[1].issues.map((i) => i.code)).toContain("idRequired");
    expect(rows[2].readErrors[0]).toMatchObject({ code: "unknownEvent" });
  });

  it("imports ready rows as entries waiting for approval", () => {
    const { rows } = readImport(seed, templateCsv(), NOW);
    const r = importEntries(seed, { drafts: rows.map((x) => x.draft), actorId: "u_arif", now: NOW });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ids.map((id) => r.db.blacklist[id])).toEqual([expect.objectContaining({ status: "pending_approval", source: "import" })]);
  });
});
