"use client";

import * as mr from "@/domain/matchReview";
import type { ReviewResult } from "@/domain/matchReview";
import type { Database, ID } from "@/domain/types";
import { useAppStore } from "@/store/app";

/**
 * Mock API for Match Review; re-reads shared state so a decision in another tab is detected.
 * Failures are ReviewError codes; the UI turns them into text (matchReview.errors).
 */

const LATENCY_MS = 320;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function run(apply: (db: Database, now: number) => ReviewResult): Promise<ReviewResult> {
  await wait(LATENCY_MS);
  await useAppStore.persist.rehydrate();
  const db = useAppStore.getState().db;
  if (!db) return { ok: false, error: "notFound" };
  const result = apply(db, Date.now());
  if (result.ok) useAppStore.getState().setDb(result.db);
  return result;
}

type Ref = { matchId: ID; expectedRevision: number; actorId: ID; note: string };

export const matchReviewService = {
  confirm: (a: Ref) => run((db, now) => mr.confirmMatch(db, { ...a, now })),
  clear: (a: Ref) => run((db, now) => mr.clearMatch(db, { ...a, now })),
};
