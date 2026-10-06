"use client";

import * as st from "@/domain/settings";
import type { ConfigDraft } from "@/domain/settings";
import type { Database, ID, LocalizedText } from "@/domain/types";
import { useAppStore } from "@/store/app";

/** Mock API for the Settings page. Re-reads shared state first so other tabs' changes are seen. */

const LATENCY_MS = 280;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let localRevision: number | null = null;
/** True when this tab made the latest settings save (so it isn't shown as someone else's change). */
export const configWroteLocally = (revision: number) => localRevision === revision;

async function run<R extends { ok: boolean }>(apply: (db: Database, now: number) => R & { db?: Database }): Promise<R | { ok: false; error: "notFound" }> {
  await wait(LATENCY_MS);
  await useAppStore.persist.rehydrate();
  const db = useAppStore.getState().db;
  if (!db) return { ok: false, error: "notFound" };
  const r = apply(db, Date.now());
  if (r.ok && r.db) useAppStore.getState().setDb(r.db);
  return r;
}

export const settingsService = {
  saveConfig: async (a: { draft: ConfigDraft; actorId: ID; expectedRevision: number }) => {
    const r = await run((db, now) => st.saveConfig(db, { ...a, now }));
    if (r.ok) localRevision = useAppStore.getState().db?.config.revision ?? null;
    return r;
  },
  addReason: (a: { label: LocalizedText; actorId: ID }) => run((db, now) => st.addReason(db, { ...a, now })),
  renameReason: (a: { id: ID; label: LocalizedText; actorId: ID }) => run((db, now) => st.renameReason(db, { ...a, now })),
  setReasonActive: (a: { id: ID; active: boolean; actorId: ID }) => run((db, now) => st.setReasonActive(db, { ...a, now })),
  moveReason: (a: { id: ID; direction: -1 | 1; actorId: ID }) => run((db, now) => st.moveReason(db, { ...a, now })),
  saveTemplate: (a: { key: string; subject: LocalizedText; body: LocalizedText; actorId: ID }) => run((db, now) => st.saveTemplate(db, { ...a, now })),
  resetTemplate: (a: { key: string; actorId: ID }) => run((db, now) => st.resetTemplate(db, { ...a, now })),
};
