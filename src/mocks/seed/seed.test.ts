import { describe, expect, it } from "vitest";
import { buildQueueRows } from "@/domain/queue";
import { canTransition } from "@/domain/status";
import { createSeed } from "./index";

const NOW = Date.parse("2026-10-05T12:00:00.000Z");

describe("seed", () => {
  const db = createSeed(NOW);
  const requests = Object.values(db.requests);

  it("is deterministic", () => {
    const again = createSeed(NOW);
    expect(Object.keys(again.requests)).toEqual(Object.keys(db.requests));
    expect(again.requests["VR-1100"]).toEqual(db.requests["VR-1100"]);
  });

  it("covers every Phase 1 status a reviewer will see", () => {
    const statuses = new Set(requests.map((r) => r.status));
    for (const s of ["pending_review", "under_review", "more_info_required", "escalated", "screening_hold", "approved", "rejected"]) {
      expect(statuses, s).toContain(s);
    }
  });

  it("never exceeds a registration limit", () => {
    for (const reg of Object.values(db.registrations)) {
      const used = Object.values(db.allocations).filter((a) => a.registrationId === reg.id).length;
      expect(used).toBeLessThanOrEqual(reg.capacityLimit);
    }
    expect(requests.some((r) => r.awaitingCapacity)).toBe(true);
  });

  it("gives only approved requests a badge", () => {
    for (const r of requests) if (r.badgeStatus !== "not_issued") expect(r.status).toBe("approved");
  });

  it("keeps every history transition legal", () => {
    for (const h of Object.values(db.history)) {
      if (h.fromStatus && h.toStatus && h.fromStatus !== h.toStatus) {
        expect(canTransition(h.fromStatus, h.toStatus), `${h.requestId} ${h.fromStatus}→${h.toStatus}`).toBe(true);
      }
    }
  });

  it("hides held requests from team-only reviewers", () => {
    const rows = buildQueueRows(db, "u_omar", "all", NOW);
    expect(rows.length).toBeGreaterThan(50);
    expect(rows.some((r) => r.status === "screening_hold")).toBe(false);
    const compliance = buildQueueRows(db, "u_sara", "all", NOW);
    expect(compliance.some((r) => r.status === "screening_hold")).toBe(true);
  });

  it("prints a distribution summary", () => {
    const counts: Record<string, number> = {};
    for (const r of requests) counts[r.status] = (counts[r.status] ?? 0) + 1;
    console.log(requests.length, counts, "blacklist", Object.keys(db.blacklist).length, "matches", Object.keys(db.matches).length, "bytes", JSON.stringify(db).length);
  });
});
