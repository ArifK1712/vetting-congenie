"use client";

import { useEffect, type ReactNode } from "react";
import { sendDueReminders } from "@/domain/moreInfo";
import { runDueSchedules } from "@/domain/reports";
import { STORE_KEY, useAppStore, useSession } from "./app";

/**
 * The prototype database lives in localStorage, so it only exists on the
 * client. Shell chrome renders immediately; data views wait for hydration.
 * Also keeps open tabs in sync: a change in one tab rehydrates the others.
 */
export function useStoreHydration() {
  useEffect(() => {
    void useSession.persist.rehydrate();
    void useAppStore.persist.rehydrate();
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORE_KEY) void useAppStore.persist.rehydrate();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
}

export function StoreGate({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const ready = useAppStore((s) => s.hydrated && s.db !== null);
  // Time-based jobs the server would run: the 24-hour reminder for More
  // Information links, and scheduled report emails.
  useEffect(() => {
    if (!ready) return;
    const run = () => {
      const db = useAppStore.getState().db;
      if (!db) return;
      const now = Date.now();
      const next = runDueSchedules(sendDueReminders(db, now) ?? db, now);
      if (next !== db) useAppStore.getState().setDb(next);
    };
    run();
    const id = setInterval(run, 60_000);
    return () => clearInterval(id);
  }, [ready]);
  return <>{ready ? children : fallback}</>;
}
