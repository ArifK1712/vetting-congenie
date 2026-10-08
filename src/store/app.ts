"use client";

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { Database, ID } from "@/domain/types";
import { SCHEMA_VERSION, createSeed } from "@/mocks/seed";

/**
 * Whether the last save to localStorage worked. When the browser's storage is
 * full or blocked, the app keeps running in memory, but changes would be lost
 * on reload, so the shell shows a warning (StorageWarning) instead of failing
 * silently.
 */
export const useStorageHealth = create<{ failed: boolean; setFailed: (failed: boolean) => void }>()((set) => ({
  failed: false,
  setFailed: (failed) => set({ failed }),
}));

const reportSave = (ok: boolean) => {
  if (useStorageHealth.getState().failed !== !ok) useStorageHealth.getState().setFailed(!ok);
};

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
      reportSave(true);
    } catch {
      // Quota or privacy mode: keep state in memory only, and say so.
      reportSave(false);
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

// ─── Shared prototype database (synced across tabs) ─────────────────────

export const STORE_KEY = "vetting-prototype";

interface DataState {
  db: Database | null;
  hydrated: boolean;
  setDb: (db: Database) => void;
  resetDemo: () => void;
}

export const useAppStore = create<DataState>()(
  persist(
    (set) => ({
      db: null,
      hydrated: false,
      setDb: (db) => set({ db }),
      resetDemo: () => {
        // Free the space first, so the fresh demo data fits again.
        safeStorage.removeItem(STORE_KEY);
        set({ db: createSeed() });
      },
    }),
    {
      name: STORE_KEY,
      version: SCHEMA_VERSION,
      storage: createJSONStorage(() => safeStorage),
      skipHydration: true,
      partialize: ({ db }) => ({ db }),
      // A schema change drops the old demo data; it is re-seeded on load.
      migrate: () => ({ db: null }) as unknown as DataState,
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

// ─── Per-tab session: persona and view preferences ──────────────────────
// Kept separate so two tabs can act as two different personas against the
// same shared data. Restored on load, but never synced live between tabs.

export const SESSION_KEY = "vetting-prototype-session";

interface SessionState {
  personaId: ID;
  eventScope: ID | "all";
  setPersona: (id: ID) => void;
  setEventScope: (id: ID | "all") => void;
  /** Phones: the navigation drawer. Not persisted. */
  navOpen: boolean;
  setNavOpen: (open: boolean) => void;
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      personaId: "u_sara",
      eventScope: "all",
      setPersona: (personaId) => set({ personaId }),
      setEventScope: (eventScope) => set({ eventScope }),
      navOpen: false,
      setNavOpen: (navOpen) => set({ navOpen }),
    }),
    {
      name: SESSION_KEY,
      storage: createJSONStorage(() => safeStorage),
      skipHydration: true,
      partialize: ({ personaId, eventScope }) => ({ personaId, eventScope }),
    },
  ),
);
