"use client";

import { DEFAULT_LAYOUT, normalizeLayout, type LayoutConfig } from "@/layout/config";
import type { ID } from "@/domain/types";

/**
 * Per-user preferences. The app talks to `preferencesService` only; today it
 * keeps preferences in this browser (localStorage), and a backend can replace
 * the adapter — e.g. GET/PUT /me/preferences/layout — without touching the
 * shell or the Appearance page.
 */

export interface LayoutPreferences {
  layout: LayoutConfig;
  /** The rail's current open/closed state (the person's last toggle), separate from the configured default. */
  railCollapsed: boolean;
}

export interface PreferencesAdapter {
  load(userId: ID): Promise<LayoutPreferences | null>;
  save(userId: ID, prefs: LayoutPreferences): Promise<void>;
}

const KEY = (userId: ID) => `vetting-prefs:${userId}`;

export const localPreferences: PreferencesAdapter = {
  async load(userId) {
    try {
      const raw = localStorage.getItem(KEY(userId));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<LayoutPreferences>;
      const layout = normalizeLayout(parsed.layout);
      return { layout, railCollapsed: typeof parsed.railCollapsed === "boolean" ? parsed.railCollapsed : layout.sidebar.defaultState === "collapsed" };
    } catch {
      return null;
    }
  },
  async save(userId, prefs) {
    try {
      localStorage.setItem(KEY(userId), JSON.stringify(prefs));
    } catch {
      // Storage full or blocked: the choice applies for this session only.
    }
  },
};

/** Swap this adapter for an API-backed one when the backend exists. */
let adapter: PreferencesAdapter = localPreferences;
export const setPreferencesAdapter = (a: PreferencesAdapter) => {
  adapter = a;
};

export const preferencesService = {
  load: (userId: ID) => adapter.load(userId),
  save: (userId: ID, prefs: LayoutPreferences) => adapter.save(userId, prefs),
  defaults: (): LayoutPreferences => ({ layout: DEFAULT_LAYOUT, railCollapsed: DEFAULT_LAYOUT.sidebar.defaultState === "collapsed" }),
};
