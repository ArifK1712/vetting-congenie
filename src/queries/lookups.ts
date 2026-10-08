"use client";

import { useShallow } from "zustand/react/shallow";
import type { Database } from "@/domain/types";
import { useAppStore } from "@/store/app";

/**
 * Reference data screens use to show names and labels (users, teams, events,
 * badge types…). With a backend this is one cached "reference" endpoint.
 *
 * Subscribes only to these tables, so a screen re-renders when one of them
 * changes, not on every request update.
 */
export type Lookups = Pick<
  Database,
  "users" | "roles" | "teams" | "events" | "badgeTypes" | "registrations" | "workflows" | "workflowVersions" | "rejectReasons"
>;

export function useLookups(): Lookups {
  return useAppStore(
    useShallow((s) => {
      const db = s.db;
      if (!db) throw new Error("useLookups used before the store was hydrated");
      return {
        users: db.users,
        roles: db.roles,
        teams: db.teams,
        events: db.events,
        badgeTypes: db.badgeTypes,
        registrations: db.registrations,
        workflows: db.workflows,
        workflowVersions: db.workflowVersions,
        rejectReasons: db.rejectReasons,
      };
    }),
  );
}
