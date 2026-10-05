"use client";

import * as actions from "@/domain/actions";
import type { ActionResult } from "@/domain/actions";
import type { Database, ID } from "@/domain/types";
import { useAppStore } from "@/store/app";

/**
 * Mock API for request actions. Shaped like a future backend: async, the
 * caller sends the revision it saw, and the domain rules decide. Before each
 * action the latest shared state is re-read from storage, so two tabs acting
 * at once behave like two users hitting one server (the second gets "stale").
 */

const LATENCY_MS = 280;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Revisions written by this tab, so its own changes are never shown as "changed by someone else". */
const localWrites = new Map<ID, number>();
export const wroteLocally = (requestId: ID, revision: number) => localWrites.get(requestId) === revision;

async function run(apply: (db: Database, now: number) => ActionResult, requestId?: ID): Promise<ActionResult> {
  await wait(LATENCY_MS);
  await useAppStore.persist.rehydrate();
  const db = useAppStore.getState().db;
  if (!db) return { ok: false, error: "notFound" };
  const result = apply(db, Date.now());
  if (result.ok) {
    if (requestId) localWrites.set(requestId, result.db.requests[requestId]?.revision ?? -1);
    useAppStore.getState().setDb(result.db);
  }
  return result;
}

interface Ref {
  requestId: ID;
  actorId: ID;
  expectedRevision: number;
}

export const requestService = {
  claim: (ref: Ref) => run((db, now) => actions.claim(db, { ...ref, now }), ref.requestId),
  release: (ref: Ref) => run((db, now) => actions.release(db, { ...ref, now }), ref.requestId),
  approve: (ref: Ref & { comment?: string }) => run((db, now) => actions.approve(db, { ...ref, now }), ref.requestId),
  retryFinal: (ref: Ref) => run((db, now) => actions.retryFinalApproval(db, { ...ref, now }), ref.requestId),
  reject: (ref: Ref & { reasonId: ID | null; comment?: string }) => run((db, now) => actions.reject(db, { ...ref, now }), ref.requestId),
  escalate: (ref: Ref & { targetNodeId: ID; remarks: string }) => run((db, now) => actions.escalate(db, { ...ref, now }), ref.requestId),
  reassign: (ref: Ref & { toUserId: ID; reason: string }) => run((db, now) => actions.reassign(db, { ...ref, now }), ref.requestId),
  comment: (ref: Omit<Ref, "expectedRevision"> & { body: string }) => run((db, now) => actions.addComment(db, { ...ref, now }), ref.requestId),
  correct: (ref: Ref & { field: string; value: string | string[]; reason?: string }) => run((db, now) => actions.correctField(db, { ...ref, now }), ref.requestId),
  reopen: (ref: Ref & { reason: string }) => run((db, now) => actions.reopenRequest(db, { ...ref, now }), ref.requestId),
  /** Logs a download in the request history (the file itself is simulated). */
  download: (ref: Omit<Ref, "expectedRevision"> & { documentId: ID }) => run((db, now) => actions.logDownload(db, { ...ref, now })),
};
