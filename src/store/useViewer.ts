"use client";

import { useMemo } from "react";
import { permissionsOf } from "@/domain/permissions";
import type { Permission } from "@/domain/types";
import { useDb, useSession } from "./app";

/** The current persona and its permissions. */
export function useViewer() {
  const db = useDb();
  const personaId = useSession((s) => s.personaId);
  return useMemo(() => {
    const perms = permissionsOf(db, personaId);
    return {
      id: personaId,
      user: db.users[personaId],
      role: db.roles[db.users[personaId]?.roleId],
      can: (p: Permission) => perms.has(p),
    };
  }, [db, personaId]);
}

export type Viewer = ReturnType<typeof useViewer>;
