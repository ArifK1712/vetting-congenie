"use client";

import * as bl from "@/domain/blacklist";
import type { BlacklistResult, EntryDraft } from "@/domain/blacklist";
import type { BlacklistEntry, Database, ID } from "@/domain/types";
import { useAppStore } from "@/store/app";

/**
 * Mock API for the blacklist. Re-reads shared state first, so a change made
 * in another tab is detected ("stale").
 */

const LATENCY_MS = 320;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const localWrites = new Map<ID, number>();
export const entryWroteLocally = (id: ID, revision: number) => localWrites.get(id) === revision;

async function run(apply: (db: Database, now: number) => BlacklistResult): Promise<BlacklistResult> {
  await wait(LATENCY_MS);
  await useAppStore.persist.rehydrate();
  const db = useAppStore.getState().db;
  if (!db) return { ok: false, error: "notFound" };
  const result = apply(db, Date.now());
  if (result.ok) {
    localWrites.set(result.entryId, result.db.blacklist[result.entryId].revision);
    useAppStore.getState().setDb(result.db);
  }
  return result;
}

type Ref = { entryId: ID; expectedRevision: number; actorId: ID };

export const blacklistService = {
  propose: (a: { draft: EntryDraft; source: BlacklistEntry["source"]; sourceRequestId?: ID | null; actorId: ID }) => run((db, now) => bl.proposeEntry(db, { ...a, now })),
  edit: (a: Ref & { draft: EntryDraft }) => run((db, now) => bl.editEntry(db, { ...a, now })),
  approve: (a: Ref) => run((db, now) => bl.approveEntry(db, { ...a, now })),
  reject: (a: Ref & { note: string }) => run((db, now) => bl.rejectEntry(db, { ...a, now })),
  remove: (a: Ref & { reason: string }) => run((db, now) => bl.removeEntry(db, { ...a, now })),
  import: async (a: { drafts: EntryDraft[]; actorId: ID }) => {
    await wait(LATENCY_MS);
    await useAppStore.persist.rehydrate();
    const db = useAppStore.getState().db;
    if (!db) return { ok: false as const, error: "notFound" as const };
    const r = bl.importEntries(db, { ...a, now: Date.now() });
    if (r.ok) useAppStore.getState().setDb(r.db);
    return r;
  },
};

/** Errors come back as codes (bl.BlacklistError); screens show them with useBlacklistError() from features/blacklist/parts. */
