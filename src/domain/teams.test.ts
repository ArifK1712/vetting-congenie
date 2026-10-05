import { beforeAll, describe, expect, it } from "vitest";
import { createSeed } from "@/mocks/seed";
import { resolveAccess } from "./fieldAccess";
import {
  accessRows,
  applyAccessTo,
  deactivationBlockers,
  draftOf,
  emptyDraft,
  giveViewToAll,
  routingPreview,
  saveTeam,
  setTeamStatus,
  teamStageUses,
  validateTeam,
  type TeamDraft,
  type TeamResult,
} from "./teams";
import type { Database } from "./types";

const NOW = Date.parse("2026-10-05T12:00:00.000Z");
let seed: Database;
beforeAll(() => {
  seed = createSeed(NOW);
});

function ok(r: TeamResult): Database {
  if (!r.ok) throw new Error(`expected ok, got ${r.error} ${JSON.stringify(r.issues ?? r.blockers ?? "")}`);
  return r.db;
}

const codes = (db: Database, d: TeamDraft, id: string | null) => validateTeam(db, d, id).map((i) => i.code);

function validDraft(db: Database): TeamDraft {
  const reg = db.registrations.reg_gis_media;
  return {
    ...emptyDraft(),
    name: { en: "Press Desk", ar: "مكتب الصحافة" },
    members: [{ userId: "u_omar", role: "lead" }],
    badgeScope: ["bt_media"],
    access: [{ registrationId: reg.id, fields: giveViewToAll(reg) }],
  };
}

describe("validation (5.2, 5.5)", () => {
  it("accepts a complete draft", () => {
    expect(validateTeam(seed, validDraft(seed), null).filter((i) => i.severity === "error")).toEqual([]);
  });

  it("requires a name, a member and a registration", () => {
    expect(codes(seed, emptyDraft(), null)).toEqual(expect.arrayContaining(["nameRequired", "membersRequired", "accessRequired"]));
  });

  it("refuses a name already used by an active team, ignoring case", () => {
    const d = { ...validDraft(seed), name: { en: "document check team", ar: "" } };
    expect(codes(seed, d, null)).toContain("nameTaken");
  });

  it("allows reusing the name of an inactive team", () => {
    const d = { ...validDraft(seed), name: { en: "Exhibitor Pilot Team", ar: "" } };
    expect(codes(seed, d, null)).not.toContain("nameTaken");
  });

  it("flags registrations outside the team's events or badge types", () => {
    const d = { ...validDraft(seed), badgeScope: ["bt_vip"] };
    expect(codes(seed, d, null)).toContain("accessOutOfScope");
  });

  it("warns, without blocking, when a member lacks Review Queue Access", () => {
    const d = { ...validDraft(seed), members: [{ userId: "u_omar", role: "lead" as const }, { userId: "u_salma", role: "reviewer" as const }] };
    const issue = validateTeam(seed, d, null).find((i) => i.code === "memberNoQueueAccess");
    expect(issue).toMatchObject({ severity: "warning", ref: "u_salma" });
  });

  it("needs a lead when the lead gives out requests", () => {
    const d: TeamDraft = { ...validDraft(seed), members: [{ userId: "u_omar", role: "reviewer" }], assignmentMode: "leadAssigns" };
    expect(codes(seed, d, null)).toContain("leadRequired");
  });

  it("caps conditions at 10 and requires each to be complete", () => {
    const line = (i: number) => ({ id: `c${i}`, field: "profile.company", operator: "contains" as const, value: ["x"] });
    const d = { ...validDraft(seed), conditions: [...Array.from({ length: 11 }, (_, i) => line(i)), { id: "e", field: "profile.company", operator: "is" as const, value: [] }] };
    expect(codes(seed, d, null)).toEqual(expect.arrayContaining(["conditionsMax", "conditionIncomplete"]));
  });

  it("will not deactivate a team that has open requests or a live stage", () => {
    const d = { ...draftOf(seed.teams.t_vipsec), status: "inactive" as const };
    expect(codes(seed, d, "t_vipsec")).toContain("deactivateInUse");
  });

  it("will not remove the last reviewer of a team in use", () => {
    const d = { ...draftOf(seed.teams.t_media), members: [{ userId: "u_salma", role: "lead" as const }] };
    expect(codes(seed, d, "t_media")).toContain("lastReviewerInUse");
  });
});

describe("usage", () => {
  it("lists every stage that uses a team, priority and fallback", () => {
    const uses = teamStageUses(seed, "t_secreview");
    expect(uses.length).toBeGreaterThan(3);
    expect(uses.every((u) => u.role === "fallback")).toBe(true);
    expect(teamStageUses(seed, "t_intl")).toEqual([]);
  });

  it("reports what blocks deactivation", () => {
    const types = deactivationBlockers(seed, "t_docs").map((b) => b.type);
    expect(types).toContain("liveStage");
    expect(deactivationBlockers(seed, "t_intl")).toEqual([]);
  });

  it("previews how many requests the conditions let through", () => {
    const p = routingPreview(seed, draftOf(seed.teams.t_intl));
    expect(p.inScope).toBeGreaterThan(0);
    expect(p.matched).toBeLessThan(p.inScope);
  });
});

describe("saving", () => {
  it("creates a team with a history entry", () => {
    const db = ok(saveTeam(seed, { teamId: null, draft: validDraft(seed), expectedRevision: 0, actorId: "u_sara", now: NOW }));
    const team = Object.values(db.teams).find((t) => t.name.en === "Press Desk")!;
    expect(team.revision).toBe(1);
    const history = Object.values(db.teamHistory).filter((h) => h.teamId === team.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ kind: "created", actorId: "u_sara" });
  });

  it("refuses people without Teams Create / Edit", () => {
    const r = saveTeam(seed, { teamId: null, draft: validDraft(seed), expectedRevision: 0, actorId: "u_lina", now: NOW });
    expect(r).toEqual({ ok: false, error: "forbidden" });
  });

  it("refuses an edit based on an older revision", () => {
    const team = seed.teams.t_media;
    const r = saveTeam(seed, { teamId: team.id, draft: draftOf(team), expectedRevision: team.revision - 1, actorId: "u_sara", now: NOW });
    expect(r).toEqual({ ok: false, error: "stale" });
  });

  it("records each change and returns a removed member's claims to the team", () => {
    const claimed = Object.values(seed.requests).find(
      (r) => r.status === "under_review" && r.claimedBy && r.currentTeamId && !r.awaitingCapacity && seed.teams[r.currentTeamId].members.length > 1,
    )!;
    const team = seed.teams[claimed.currentTeamId!];
    const draft = draftOf(team);
    draft.members = draft.members.filter((m) => m.userId !== claimed.claimedBy);
    if (!draft.members.some((m) => m.role === "lead")) draft.members[0].role = "lead";
    draft.maxOpenClaims = 7;

    const db = ok(saveTeam(seed, { teamId: team.id, draft, expectedRevision: team.revision, actorId: "u_sara", now: NOW }));
    expect(db.teams[team.id].revision).toBe(team.revision + 1);
    expect(db.requests[claimed.id]).toMatchObject({ status: "pending_review", claimedBy: null });
    const entry = Object.values(db.teamHistory).find((h) => h.teamId === team.id && h.at === new Date(NOW).toISOString())!;
    const types = entry.changes.map((c) => c.type);
    expect(types).toEqual(expect.arrayContaining(["memberRemoved", "maxClaims", "claimsReleased"]));
  });

  it("changes what a member sees as soon as field access is saved", () => {
    const r = Object.values(seed.requests).find((x) => x.currentTeamId === "t_protocol")!;
    const reader = "u_reem";
    expect(resolveAccess(seed, reader, r).resolve("profile.nationalId")).toBe("hidden");

    const team = seed.teams.t_protocol;
    const draft = draftOf(team);
    draft.access = draft.access.map((a) => (a.registrationId === r.registrationId ? { ...a, fields: { ...a.fields, "profile.nationalId": "view" } } : a));
    const db = ok(saveTeam(seed, { teamId: team.id, draft, expectedRevision: team.revision, actorId: "u_sara", now: NOW }));
    expect(resolveAccess(db, reader, db.requests[r.id]).resolve("profile.nationalId")).toBe("view");
  });

  it("deactivates an unused team and reactivates it", () => {
    const t = seed.teams.t_intl;
    const off = ok(setTeamStatus(seed, { teamId: t.id, status: "inactive", expectedRevision: t.revision, actorId: "u_sara", now: NOW }));
    expect(off.teams[t.id].status).toBe("inactive");
    const on = ok(setTeamStatus(off, { teamId: t.id, status: "active", expectedRevision: t.revision + 1, actorId: "u_sara", now: NOW + 1000 }));
    expect(on.teams[t.id].status).toBe("active");
  });

  it("returns the blockers when deactivation is not allowed", () => {
    const t = seed.teams.t_docs;
    const r = setTeamStatus(seed, { teamId: t.id, status: "inactive", expectedRevision: t.revision, actorId: "u_sara", now: NOW });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("inUse");
  });
});

describe("field access shortcuts (5.6)", () => {
  it("applies one registration's levels to another, by field and then by group", () => {
    const src = seed.registrations.reg_gis_vip;
    const dst = seed.registrations.reg_gis_media;
    const fields = { ...giveViewToAll(src), "document.q_id_copy": "download" as const, "answer.q_purpose": "edit" as const };
    const applied = applyAccessTo(fields, src, dst);
    expect(applied["document.q_id_copy"]).toBe("download");
    // The media form's press card is not on the VIP form: it takes the level of the first document.
    expect(applied["document.q_press_card"]).toBe("download");
    expect(applied["answer.q_outlet"]).toBe("view");
    expect(Object.keys(applied)).toHaveLength(accessRows(dst).length);
  });

  it("never gives a level the group does not offer", () => {
    const reg = seed.registrations.reg_gis_media;
    const applied = applyAccessTo({ payment: "edit" } as never, reg, reg);
    expect(applied.payment).toBe("view");
  });
});
