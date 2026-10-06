"use client";

import * as intake from "@/domain/intake";
import * as reg from "@/domain/registrations";
import type { NewQuestion, SettingsDraft } from "@/domain/registrations";
import type { ID } from "@/domain/types";
import { useAppStore } from "@/store/app";

/**
 * Mock API for registration vetting settings, form questions and the
 * registration form itself (Simulate registration). Re-reads shared state
 * first so other tabs' changes are seen. Failures are error codes.
 */

const LATENCY_MS = 320;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const localWrites = new Map<ID, number>();
const inFlight = new Map<string, Promise<intake.IntakeResult>>();
/** True when this tab made the latest save (so it isn't shown as someone else's change). */
export const settingsWroteLocally = (registrationId: ID, revision: number) => localWrites.get(registrationId) === revision;

async function fresh() {
  await wait(LATENCY_MS);
  await useAppStore.persist.rehydrate();
  return useAppStore.getState().db;
}

export const registrationService = {
  saveSettings: async (a: { registrationId: ID; draft: SettingsDraft; actorId: ID; expectedRevision: number }) => {
    const db = await fresh();
    if (!db) return { ok: false as const, error: "notFound" as const };
    const r = reg.saveSettings(db, { ...a, now: Date.now() });
    if (r.ok) {
      localWrites.set(a.registrationId, r.db.vettingSettings[a.registrationId].revision);
      useAppStore.getState().setDb(r.db);
    }
    return r;
  },
  addQuestion: async (a: { registrationId: ID; question: NewQuestion; actorId: ID }) => {
    const db = await fresh();
    if (!db) return { ok: false as const, error: "notFound" as const };
    const r = reg.addQuestion(db, { ...a, now: Date.now() });
    if (r.ok) useAppStore.getState().setDb(r.db);
    return r;
  },
  /**
   * The attendee's submit. Same submissionKey twice → one request (AC05): a
   * retry that arrives while the first is still in flight gets the first
   * one's result as a duplicate, and a later retry is caught by the domain.
   */
  submit: (s: Omit<intake.Submission, "now">) => {
    const running = inFlight.get(s.submissionKey);
    if (running) {
      return running.then((r): intake.IntakeResult => (r.ok ? { ...r, outcome: "duplicate", blacklistHits: 0, watchlistHits: 0 } : r));
    }
    const p = (async (): Promise<intake.IntakeResult> => {
      const db = await fresh();
      if (!db) return { ok: false, error: "notFound" };
      const r = intake.submitRegistration(db, { ...s, now: Date.now() });
      if (r.ok && r.db !== db) useAppStore.getState().setDb(r.db);
      return r;
    })().finally(() => inFlight.delete(s.submissionKey));
    inFlight.set(s.submissionKey, p);
    return p;
  },
};
