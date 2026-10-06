"use client";

import * as wl from "@/domain/watchlist";
import type { WatchDraft, WatchResult } from "@/domain/watchlist";
import type { Database, ID, WatchlistEntry } from "@/domain/types";
import { useAppStore } from "@/store/app";

/**
 * Mock API for the watchlist; re-reads shared state first so other tabs' changes are seen.
 * Failures are WatchError codes; the UI words them with useWatchlistError().
 */

const LATENCY_MS = 320;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const localWrites = new Map<ID, number>();
export const watchWroteLocally = (id: ID, revision: number) => localWrites.get(id) === revision;

async function fresh() {
  await wait(LATENCY_MS);
  await useAppStore.persist.rehydrate();
  return useAppStore.getState().db;
}

async function run(apply: (db: Database, now: number) => WatchResult): Promise<WatchResult> {
  const db = await fresh();
  if (!db) return { ok: false, error: "notFound" };
  const result = apply(db, Date.now());
  if (result.ok) {
    localWrites.set(result.entryId, result.db.watchlist[result.entryId].revision);
    useAppStore.getState().setDb(result.db);
  }
  return result;
}

type Ref = { entryId: ID; expectedRevision: number; actorId: ID };

export const watchlistService = {
  create: (a: { draft: WatchDraft; source: WatchlistEntry["source"]; sourceRequestId?: ID | null; actorId: ID }) => run((db, now) => wl.createWatchEntry(db, { ...a, now })),
  edit: (a: Ref & { draft: WatchDraft }) => run((db, now) => wl.editWatchEntry(db, { ...a, now })),
  remove: (a: Ref & { reason: string }) => run((db, now) => wl.removeWatchEntry(db, { ...a, now })),
  clearMatch: (a: { matchId: ID; note: string; actorId: ID }) => run((db, now) => wl.clearWatchMatch(db, { ...a, now })),
  movedToBlacklist: (a: { entryId: ID; blacklistId: ID; actorId: ID }) => run((db, now) => wl.noteMovedToBlacklist(db, { ...a, now })),
  import: async (a: { drafts: WatchDraft[]; actorId: ID }) => {
    const db = await fresh();
    if (!db) return { ok: false as const, error: "notFound" as const };
    const r = wl.importWatchEntries(db, { ...a, now: Date.now() });
    if (r.ok) useAppStore.getState().setDb(r.db);
    return r;
  },
};
