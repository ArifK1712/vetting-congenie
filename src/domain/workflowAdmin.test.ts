import { beforeAll, describe, expect, it } from "vitest";
import { createSeed } from "@/mocks/seed";
import type { Database, WorkflowGraph } from "./types";
import {
  allotmentOptions,
  coverageGaps,
  createWorkflow,
  duplicateWorkflow,
  edge,
  errorsOf,
  newNode,
  normalizeGraph,
  publishWorkflow,
  saveDraft,
  setAllotments,
  setWorkflowStatus,
  starterGraph,
  validateGraph,
  type WorkflowMeta,
  type WorkflowResult,
} from "./workflowAdmin";

const NOW = Date.parse("2026-10-05T12:00:00.000Z");
let seed: Database;
beforeAll(() => {
  seed = createSeed(NOW);
});

function ok(r: WorkflowResult): Database {
  if (!r.ok) throw new Error(`expected ok, got ${r.error} ${JSON.stringify(r.issues ?? r.clashes ?? "")}`);
  return r.db;
}
const codes = (db: Database, g: WorkflowGraph, badge = "bt_visitor") => validateGraph(db, g, badge).filter((i) => i.severity === "error").map((i) => i.code);
const metaOf = (db: Database, id: string): WorkflowMeta => {
  const w = db.workflows[id];
  return { name: w.name, label: w.label, description: w.description, badgeTypeId: w.badgeTypeId };
};

/** A complete graph using a team that covers visitors. */
function readyGraph(): WorkflowGraph {
  const g = starterGraph();
  const stage = g.nodes.find((n) => n.type === "stage")!;
  if (stage.type === "stage") stage.stage = { ...stage.stage, teams: ["t_gensec"], fallbackTeamId: "t_secreview" };
  return g;
}

describe("checks before publishing (6.4)", () => {
  it("passes every published seed version", () => {
    for (const v of Object.values(seed.workflowVersions)) {
      const wf = seed.workflows[v.workflowId];
      expect(errorsOf(validateGraph(seed, normalizeGraph(v.graph), wf.badgeTypeId)), v.id).toEqual([]);
    }
  });

  it("flags the unfinished seed draft", () => {
    const g = seed.workflows.wf_night.draft!;
    expect(codes(seed, g, "bt_contractor")).toEqual(expect.arrayContaining(["noTeam", "noFallback", "notConnected"]));
  });

  it("needs exactly one Start block and a Final approval", () => {
    const g = readyGraph();
    expect(codes(seed, { ...g, nodes: g.nodes.filter((n) => n.type !== "start") })).toContain("noStart");
    const twoStarts = { ...g, nodes: [...g.nodes, newNode("start", g, { x: 0, y: 0 })] };
    expect(codes(seed, twoStarts)).toContain("multipleStart");
    expect(codes(seed, normalizeGraph({ ...g, nodes: g.nodes.filter((n) => n.type !== "final") }))).toContain("noFinal");
  });

  it("flags unconnected actions and unreachable blocks", () => {
    const g = readyGraph();
    const loose = newNode("stage", g, { x: 400, y: 0 });
    const withLoose = { ...g, nodes: [...g.nodes, loose] };
    const c = codes(seed, withLoose);
    expect(c).toContain("unreachable");
    expect(c).toContain("notConnected");
  });

  it("flags a loop the request can never leave", () => {
    const g = readyGraph();
    const b = newNode("stage", g, { x: 0, y: 0 });
    if (b.type === "stage") b.stage = { ...b.stage, teams: ["t_gensec"], fallbackTeamId: "t_secreview" };
    // stage_1 approve → b, b approve → stage_1, both reject → each other: no way out.
    const graph: WorkflowGraph = {
      nodes: [...g.nodes, b],
      edges: [edge("start", "next", "stage_1"), edge("stage_1", "approve", b.id), edge("stage_1", "reject", b.id), edge(b.id, "approve", "stage_1"), edge(b.id, "reject", "stage_1")],
    };
    expect(codes(seed, graph)).toContain("endlessLoop");
  });

  it("requires a condition to have an Otherwise path", () => {
    const g = readyGraph();
    const cond = newNode("condition", g, { x: 0, y: 0 });
    if (cond.type === "condition") cond.condition.branches[0].condition = { id: "x", field: "screening.watchlistLevel", operator: "is", value: ["high"] };
    const graph: WorkflowGraph = {
      nodes: [...g.nodes, cond],
      edges: [edge("start", "next", cond.id), edge(cond.id, "b1", "stage_1"), ...g.edges.filter((e) => e.source !== "start")],
    };
    const issue = validateGraph(seed, graph, "bt_visitor").find((i) => i.code === "notConnected" && i.nodeId === cond.id);
    expect(issue?.detail).toBe("otherwise");
  });

  it("refuses inactive teams and teams with no reviewer", () => {
    const g = readyGraph();
    const s = g.nodes.find((n) => n.type === "stage")!;
    if (s.type === "stage") s.stage.teams = ["t_pilot"];
    expect(codes(seed, g)).toContain("teamInactive");
  });

  it("only warns when only the fallback team covers the badge type", () => {
    const g = readyGraph();
    const s = g.nodes.find((n) => n.type === "stage")!;
    if (s.type === "stage") s.stage.teams = ["t_media"];
    const issues = validateGraph(seed, g, "bt_visitor");
    expect(issues.find((i) => i.code === "onlyFallbackCovers")?.severity).toBe("warning");
    expect(errorsOf(issues)).toEqual([]);
  });
});

describe("normalising", () => {
  it("mirrors escalate edges into the stage settings", () => {
    const g = readyGraph();
    const senior = newNode("stage", g, { x: 300, y: 150 });
    const s = g.nodes.find((n) => n.id === "stage_1")!;
    if (s.type === "stage") s.stage.allowedActions = ["approve", "reject", "escalate"];
    const n = normalizeGraph({ nodes: [...g.nodes, senior], edges: [...g.edges, edge("stage_1", "escalate", senior.id)] });
    const out = n.nodes.find((x) => x.id === "stage_1");
    expect(out?.type === "stage" && out.stage.escalateTo).toEqual([senior.id]);
  });

  it("drops edges from an action that was switched off", () => {
    const g = readyGraph();
    const s = g.nodes.find((n) => n.id === "stage_1")!;
    if (s.type === "stage") s.stage.allowedActions = ["approve", "reject"];
    const n = normalizeGraph({ ...g, edges: [...g.edges, edge("stage_1", "escalate", "stage_1")] });
    expect(n.edges.some((e) => e.handle === "escalate")).toBe(false);
  });
});

describe("lifecycle", () => {
  const meta: WorkflowMeta = { name: { en: "Visitor Express", ar: "" }, label: { en: "Express", ar: "" }, description: { en: "", ar: "" }, badgeTypeId: "bt_visitor" };

  it("creates a draft, refuses a duplicate name", () => {
    const db = ok(createWorkflow(seed, { meta, actorId: "u_sara", now: NOW }));
    const wf = Object.values(db.workflows).find((w) => w.name.en === "Visitor Express")!;
    expect(wf.status).toBe("draft");
    const again = createWorkflow(db, { meta, actorId: "u_sara", now: NOW });
    expect(again.ok).toBe(false);
  });

  it("publishes version 1, then version 2 without touching requests in progress", () => {
    let db = ok(createWorkflow(seed, { meta, actorId: "u_sara", now: NOW }));
    const wf = Object.values(db.workflows).find((w) => w.name.en === "Visitor Express")!;
    const bad = publishWorkflow(db, { workflowId: wf.id, expectedRevision: wf.revision, meta, graph: starterGraph(), actorId: "u_sara", now: NOW });
    expect(bad.ok === false && bad.error).toBe("invalid");

    db = ok(publishWorkflow(db, { workflowId: wf.id, expectedRevision: wf.revision, meta, graph: readyGraph(), actorId: "u_sara", now: NOW }));
    expect(db.workflows[wf.id]).toMatchObject({ status: "active", draft: null });

    // Publishing a new VIP version leaves running VIP requests on their version.
    const vip = db.workflows.wf_vip;
    const running = Object.values(db.requests).filter((r) => r.workflowId === "wf_vip").map((r) => [r.id, r.workflowVersionId]);
    const graph = db.workflowVersions[vip.currentVersionId!].graph;
    db = ok(publishWorkflow(db, { workflowId: vip.id, expectedRevision: vip.revision, meta: metaOf(db, vip.id), graph, actorId: "u_sara", now: NOW }));
    expect(db.workflowVersions[db.workflows.wf_vip.currentVersionId!].versionNo).toBe(3);
    for (const [id, version] of running) expect(db.requests[id!].workflowVersionId).toBe(version);
  });

  it("refuses publishing without the Publish permission", () => {
    const wf = seed.workflows.wf_media;
    const r = publishWorkflow(seed, { workflowId: wf.id, expectedRevision: wf.revision, meta: metaOf(seed, wf.id), graph: wf.draft!, actorId: "u_daniel", now: NOW });
    expect(r).toEqual({ ok: false, error: "forbidden" });
  });

  it("refuses a save based on an older revision", () => {
    const wf = seed.workflows.wf_media;
    const r = saveDraft(seed, { workflowId: wf.id, expectedRevision: wf.revision - 1, meta: metaOf(seed, wf.id), graph: wf.draft!, actorId: "u_sara", now: NOW });
    expect(r).toEqual({ ok: false, error: "stale" });
  });

  it("locks the badge type once a version is published", () => {
    const wf = seed.workflows.wf_media;
    const r = saveDraft(seed, { workflowId: wf.id, expectedRevision: wf.revision, meta: { ...metaOf(seed, wf.id), badgeTypeId: "bt_vip" }, graph: wf.draft!, actorId: "u_sara", now: NOW });
    expect(r.ok === false && r.error).toBe("badgeTypeLocked");
  });

  it("duplicates as a new draft with a free name", () => {
    const db = ok(duplicateWorkflow(seed, { workflowId: "wf_vip", actorId: "u_sara", now: NOW }));
    const copy = Object.values(db.workflows).find((w) => w.name.en === "Copy of VIP Security Vetting")!;
    expect(copy).toMatchObject({ status: "draft", currentVersionId: null, badgeTypeId: "bt_vip" });
  });

  it("deactivates and reactivates a published workflow", () => {
    const wf = seed.workflows.wf_speaker;
    const off = ok(setWorkflowStatus(seed, { workflowId: wf.id, expectedRevision: wf.revision, status: "inactive", actorId: "u_sara", now: NOW }));
    expect(off.workflows[wf.id].status).toBe("inactive");
    expect(coverageGaps(off).some((g) => g.badgeTypeId === "bt_speaker")).toBe(true);
  });
});

describe("allotment (6.6)", () => {
  it("offers only registrations with the workflow's badge type", () => {
    const opts = allotmentOptions(seed, seed.workflows.wf_media);
    expect(opts.map((o) => o.registration.id).sort()).toEqual(["reg_gis_media", "reg_rdw_media"]);
  });

  it("reports a clash, and replaces when asked", () => {
    const wf = seed.workflows.wf_vip;
    const meta: WorkflowMeta = { name: { en: "VIP Lite", ar: "" }, label: { en: "VIP Lite", ar: "" }, description: { en: "", ar: "" }, badgeTypeId: "bt_vip" };
    let db = ok(createWorkflow(seed, { meta, actorId: "u_sara", now: NOW }));
    const lite = Object.values(db.workflows).find((w) => w.name.en === "VIP Lite")!;
    const g = starterGraph();
    const s = g.nodes.find((n) => n.type === "stage")!;
    if (s.type === "stage") s.stage = { ...s.stage, teams: ["t_vipsec"], fallbackTeamId: "t_secreview" };
    db = ok(publishWorkflow(db, { workflowId: lite.id, expectedRevision: lite.revision, meta, graph: g, actorId: "u_sara", now: NOW }));

    const clash = setAllotments(db, { workflowId: lite.id, registrationIds: ["reg_ref_vip"], replace: [], actorId: "u_sara", now: NOW });
    expect(clash).toEqual({ ok: false, error: "clash", clashes: ["reg_ref_vip"] });

    db = ok(setAllotments(db, { workflowId: lite.id, registrationIds: ["reg_ref_vip"], replace: ["reg_ref_vip"], actorId: "u_sara", now: NOW }));
    const owner = Object.values(db.allotments).find((a) => a.registrationId === "reg_ref_vip" && a.badgeTypeId === "bt_vip");
    expect(owner?.workflowId).toBe(lite.id);
    expect(Object.values(db.allotments).filter((a) => a.workflowId === wf.id)).toHaveLength(3);
  });

  it("refuses allotting a workflow that was never published", () => {
    const r = setAllotments(seed, { workflowId: "wf_night", registrationIds: ["reg_gis_contractor"], replace: ["reg_gis_contractor"], actorId: "u_sara", now: NOW });
    expect(r).toEqual({ ok: false, error: "notPublished" });
  });
});
