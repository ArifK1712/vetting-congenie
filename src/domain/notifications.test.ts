import { beforeAll, describe, expect, it } from "vitest";
import { createSeed } from "@/mocks/seed";
import { emptyDraft, proposeEntry } from "./blacklist";
import { alertsFor, markAllRead, unreadCount } from "./notifications";
import type { Database } from "./types";

const NOW = Date.parse("2026-10-05T12:00:00.000Z");
let seed: Database;
beforeAll(() => {
  seed = createSeed(NOW);
});

describe("alerts (16)", () => {
  it("reviewers hear about new requests in their teams", () => {
    expect(alertsFor(seed, "u_omar", NOW).some((a) => a.kind === "newRequest")).toBe(true);
  });

  it("team leads get a digest of late requests", () => {
    const late = alertsFor(seed, "u_yousef", NOW).find((a) => a.kind === "late");
    expect(late?.count).toBeGreaterThan(0);
  });

  it("blacklist approvers see open matches and entries waiting, but not their own proposals", () => {
    const sara = alertsFor(seed, "u_sara", NOW);
    expect(sara.some((a) => a.kind === "blacklistMatch")).toBe(true);
    const r = proposeEntry(seed, {
      draft: { ...emptyDraft(NOW), identity: { subjectType: "person", fullName: "Alert Test", aliases: [], nationalId: "1555555555" }, reasonType: "other", reasonDetail: "x" },
      source: "manual",
      actorId: "u_arif",
      now: NOW,
    });
    if (!r.ok) throw new Error(r.error);
    expect(alertsFor(r.db, "u_sara", NOW).some((a) => a.kind === "entryWaiting" && a.entryId === r.entryId)).toBe(true);
    expect(alertsFor(r.db, "u_arif", NOW).some((a) => a.kind === "entryWaiting" && a.entryId === r.entryId)).toBe(false);
    // ...and the other approvers were emailed.
    expect(Object.values(r.db.outbox).some((m) => m.template === "blacklist_entry_waiting" && m.to === "sara.alotaibi@vetting.app")).toBe(true);
  });

  it("reviewers without list permissions never get list alerts", () => {
    expect(alertsFor(seed, "u_omar", NOW).some((a) => a.kind === "blacklistMatch" || a.kind === "entryWaiting")).toBe(false);
  });

  it("opening the alerts marks them read", () => {
    const alerts = alertsFor(seed, "u_sara", NOW);
    expect(unreadCount(seed, "u_sara", alerts)).toBeGreaterThan(0);
    const db = markAllRead(seed, "u_sara", NOW + 1000);
    expect(unreadCount(db, "u_sara", alertsFor(db, "u_sara", NOW + 1000))).toBe(0);
  });
});
