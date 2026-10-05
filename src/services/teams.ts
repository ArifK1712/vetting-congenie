"use client";

import * as teams from "@/domain/teams";
import type { TeamDraft, TeamResult } from "@/domain/teams";
import type { Database, ID, Team } from "@/domain/types";
import { useAppStore } from "@/store/app";

/**
 * Mock API for team configuration. Like the request service it re-reads the
 * shared state first, so an edit made in another tab is detected ("stale").
 */

const LATENCY_MS = 320;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Team revisions written by this tab, so its own saves are not reported as someone else's. */
const localWrites = new Map<ID, number>();
export const teamWroteLocally = (teamId: ID, revision: number) => localWrites.get(teamId) === revision;

async function run(apply: (db: Database, now: number) => TeamResult): Promise<TeamResult> {
  await wait(LATENCY_MS);
  await useAppStore.persist.rehydrate();
  const db = useAppStore.getState().db;
  if (!db) return { ok: false, error: "notFound" };
  const result = apply(db, Date.now());
  if (result.ok) {
    localWrites.set(result.teamId, result.db.teams[result.teamId].revision);
    useAppStore.getState().setDb(result.db);
  }
  return result;
}

export const teamService = {
  save: (a: { teamId: ID | null; draft: TeamDraft; expectedRevision: number; actorId: ID }) =>
    run((db, now) => teams.saveTeam(db, { ...a, now })),
  setStatus: (a: { teamId: ID; status: Team["status"]; expectedRevision: number; actorId: ID }) =>
    run((db, now) => teams.setTeamStatus(db, { ...a, now })),
};
