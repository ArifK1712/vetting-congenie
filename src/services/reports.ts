"use client";

import * as rep from "@/domain/reports";
import type { ID, ReportFilters, ReportFormat, ReportKey } from "@/domain/types";
import { useAppStore } from "@/store/app";

/**
 * Mock API for reports: logging each download (the file is made in the
 * browser) and managing scheduled emails. Re-reads shared state first.
 */

const LATENCY_MS = 240;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fresh() {
  await wait(LATENCY_MS);
  await useAppStore.persist.rehydrate();
  return useAppStore.getState().db;
}

async function run<R extends { ok: boolean }>(apply: (db: NonNullable<Awaited<ReturnType<typeof fresh>>>, now: number) => R & { db?: unknown }) {
  const db = await fresh();
  if (!db) return { ok: false as const, error: "notFound" as const };
  const r = apply(db, Date.now());
  if (r.ok && r.db) useAppStore.getState().setDb(r.db as typeof db);
  return r;
}

export const reportService = {
  /** Call before handing the file to the user; refuses without Reports Export. */
  logDownload: (a: { report: ReportKey; format: ReportFormat; filters: ReportFilters; eventScope: ID | "all"; actorId: ID }) =>
    run((db, now) => rep.logDownload(db, { ...a, now })),
  saveSchedule: (a: { id?: ID; report: ReportKey; format: ReportFormat; filters: ReportFilters; eventScope: ID | "all"; frequency: "daily" | "weekly"; hour: number; weekday: number; actorId: ID }) =>
    run((db, now) => rep.saveSchedule(db, { ...a, now })),
  deleteSchedule: (a: { id: ID; actorId: ID }) => run((db, now) => rep.deleteSchedule(db, { ...a, now })),
};
