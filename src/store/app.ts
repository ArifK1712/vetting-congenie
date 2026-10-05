"use client";

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { Database, ID } from "@/domain/types";
import { SCHEMA_VERSION, createSeed } from "@/mocks/seed";

export type Density = "compact" | "comfortable";

interface AppState {
  db: Database | null;
  hydrated: boolean;
  personaId: ID;
  eventScope: ID | "all";
  density: Density;
  sidebarCollapsed: boolean;
  setPersona: (id: ID) => void;
  setEventScope: (id: ID | "all") => void;
  setDensity: (d: Density) => void;
  toggleSidebar: () => void;
  resetDemo: () => void;
}

/** localStorage can be blocked or full; the prototype must still run in memory. */
const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
    } catch {
      /* quota or privacy mode: keep state in memory only */
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
};

export const STORE_KEY = "vetting-prototype";

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      db: null,
      hydrated: false,
      personaId: "u_omar",
      eventScope: "all",
      density: "comfortable",
      sidebarCollapsed: false,
      setPersona: (personaId) => set({ personaId }),
      setEventScope: (eventScope) => set({ eventScope }),
      setDensity: (density) => set({ density }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      resetDemo: () => set({ db: createSeed() }),
    }),
    {
      name: STORE_KEY,
      version: SCHEMA_VERSION,
      storage: createJSONStorage(() => safeStorage),
      skipHydration: true,
      partialize: ({ db, personaId, eventScope, density, sidebarCollapsed }) => ({
        db,
        personaId,
        eventScope,
        density,
        sidebarCollapsed,
      }),
      // A schema change drops the old demo data; it is re-seeded on load.
      migrate: (persisted) => ({ ...(persisted as object), db: null }) as unknown as AppState,
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (!state.db || state.db.schemaVersion !== SCHEMA_VERSION) {
          useAppStore.setState({ db: createSeed() });
        }
        useAppStore.setState({ hydrated: true });
      },
    },
  ),
);

/** The database, once hydrated. Components below <StoreGate> may assume it exists. */
export function useDb(): Database {
  const db = useAppStore((s) => s.db);
  if (!db) throw new Error("useDb used before the store was hydrated");
  return db;
}
