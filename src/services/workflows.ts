"use client";

import * as wf from "@/domain/workflowAdmin";
import type { WorkflowMeta, WorkflowResult } from "@/domain/workflowAdmin";
import type { Database, ID, WorkflowGraph } from "@/domain/types";
import { useAppStore } from "@/store/app";

/**
 * Mock API for workflow administration. Re-reads shared state first, so a
 * change made in another tab is detected ("stale").
 */

const LATENCY_MS = 320;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const localWrites = new Map<ID, number>();
/** True when this tab wrote the workflow's current revision. */
export const workflowWroteLocally = (id: ID, revision: number) => localWrites.get(id) === revision;

async function run(apply: (db: Database, now: number) => WorkflowResult): Promise<WorkflowResult> {
  await wait(LATENCY_MS);
  await useAppStore.persist.rehydrate();
  const db = useAppStore.getState().db;
  if (!db) return { ok: false, error: "notFound" };
  const result = apply(db, Date.now());
  if (result.ok) {
    localWrites.set(result.workflowId, result.db.workflows[result.workflowId].revision);
    useAppStore.getState().setDb(result.db);
  }
  return result;
}

type Ref = { workflowId: ID; expectedRevision: number; actorId: ID };

export const workflowService = {
  create: (a: { meta: WorkflowMeta; actorId: ID }) => run((db, now) => wf.createWorkflow(db, { ...a, now })),
  saveDraft: (a: Ref & { meta: WorkflowMeta; graph: WorkflowGraph }) => run((db, now) => wf.saveDraft(db, { ...a, now })),
  discardDraft: (a: Ref) => run((db, now) => wf.discardDraft(db, { ...a, now })),
  publish: (a: Ref & { meta: WorkflowMeta; graph: WorkflowGraph }) => run((db, now) => wf.publishWorkflow(db, { ...a, now })),
  duplicate: (a: { workflowId: ID; actorId: ID }) => run((db, now) => wf.duplicateWorkflow(db, { ...a, now })),
  setStatus: (a: Ref & { status: "active" | "inactive" }) => run((db, now) => wf.setWorkflowStatus(db, { ...a, now })),
  allot: (a: { workflowId: ID; registrationIds: ID[]; replace: ID[]; actorId: ID }) => run((db, now) => wf.setAllotments(db, { ...a, now })),
};

/** Error codes returned by the service; screens show them as `workflows.errors.<code>`. */
export type WorkflowErrorCode = NonNullable<Extract<WorkflowResult, { ok: false }>["error"]>;
