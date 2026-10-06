"use client";

import * as att from "@/domain/attendees";
import type { BadgeChannel } from "@/domain/attendees";
import type { Database, ID } from "@/domain/types";
import { useAppStore } from "@/store/app";

/**
 * Mock API for the Attendees list: badge production through any channel
 * (all gated by 11.2), freeing places, withdrawing, and the registration
 * limit (11.3). Re-reads shared state first so other tabs' changes are seen.
 */

const LATENCY_MS = 320;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fresh(): Promise<Database | null> {
  await wait(LATENCY_MS);
  await useAppStore.persist.rehydrate();
  return useAppStore.getState().db;
}

async function run<R extends { ok: boolean }>(apply: (db: Database, now: number) => R & { db?: Database }): Promise<R | { ok: false; error: "notFound" }> {
  const db = await fresh();
  if (!db) return { ok: false, error: "notFound" };
  const r = apply(db, Date.now());
  if (r.ok && r.db) useAppStore.getState().setDb(r.db);
  return r;
}

export const attendeeService = {
  /** Download, generate, bulk print, kiosk scan, API: one gate for all (AC17). */
  produceBadges: (a: { attendeeIds: ID[]; channel: BadgeChannel; actorId: ID | "attendee" }) => run((db, now) => att.produceBadges(db, { ...a, now })),
  releasePlace: (a: { requestId: ID; reason: string; actorId: ID; expectedRevision: number }) => run((db, now) => att.releasePlace(db, { ...a, now })),
  withdraw: (a: { requestId: ID; reason: string; actorId: ID; expectedRevision: number }) => run((db, now) => att.withdrawRequest(db, { ...a, now })),
  setLimit: (a: { registrationId: ID; limit: number; reason: string; actorId: ID }) => run((db, now) => att.setCapacityLimit(db, { ...a, now })),
};
