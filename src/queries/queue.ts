"use client";

import { useMemo } from "react";
import { buildProgress } from "@/domain/progress";
import { applyQueueFilters, buildQueueRows, type QueueFilters } from "@/domain/queue";
import type { ID } from "@/domain/types";
import { useDb, useSession } from "@/store/app";
import { useViewer } from "@/store/useViewer";

/**
 * Read side of the Review Queue. Today it runs the domain queries over the
 * local database; with a backend, only these hook bodies change (to a fetch,
 * e.g. GET /queue?…), and the screens stay as they are.
 */

/** Queue rows for the viewer and event scope, filtered, with tile counts. */
export function useQueue(filters: QueueFilters, now: number) {
  const db = useDb();
  const viewer = useViewer();
  const eventScope = useSession((s) => s.eventScope);
  const allRows = useMemo(() => buildQueueRows(db, viewer.id, eventScope, now), [db, viewer.id, eventScope, now]);
  const filtered = useMemo(() => applyQueueFilters(allRows, filters, viewer.id, now), [allRows, filters, viewer.id, now]);
  return { allRows, ...filtered };
}

/** The current revision of a request, for actions that need it (claim from the list). */
export function useRequestRevisions() {
  const db = useDb();
  return (id: ID) => db.requests[id]?.revision ?? 0;
}

/** What the queue's preview pane shows for one request. */
export function useRequestPreview(id: ID) {
  const db = useDb();
  return useMemo(() => {
    const request = db.requests[id];
    if (!request) return null;
    return {
      request,
      steps: buildProgress(db, request),
    };
  }, [db, id]);
}
