"use client";

import { useEffect } from "react";
import { create } from "zustand";
import type { ID } from "@/domain/types";
import { preferencesService } from "@/services/preferences";
import { useSession } from "@/store/app";
import { DEFAULT_LAYOUT, normalizeLayout, sameLayout, type LayoutConfig } from "./config";
import { LAYOUT_PRESETS, type LayoutPreset } from "./presets";

/**
 * The layout in use: the saved configuration for the signed-in user, or a
 * draft while they try a layout live from Settings → Appearance.
 */
interface LayoutState {
  userId: ID | null;
  saved: LayoutConfig;
  /** "Try it live": applied to the shell until saved or cancelled. */
  draft: LayoutConfig | null;
  railCollapsed: boolean;
  /** The rail's state while previewing a draft (starts at the draft's default). */
  draftRailCollapsed: boolean;
  loaded: boolean;
  load: (userId: ID) => Promise<void>;
  preview: (draft: LayoutConfig) => void;
  cancelPreview: () => void;
  save: (config: LayoutConfig) => Promise<void>;
  toggleRail: () => void;
}

export const useLayoutStore = create<LayoutState>()((set, get) => ({
  userId: null,
  saved: DEFAULT_LAYOUT,
  draft: null,
  railCollapsed: false,
  draftRailCollapsed: false,
  loaded: false,
  load: async (userId) => {
    const prefs = (await preferencesService.load(userId)) ?? preferencesService.defaults();
    set({ userId, saved: prefs.layout, railCollapsed: prefs.railCollapsed, draft: null, loaded: true });
  },
  preview: (draft) => {
    const d = normalizeLayout(draft);
    // Back to exactly the saved layout: the preview is over.
    if (sameLayout(d, get().saved)) {
      set({ draft: null });
      return;
    }
    const prev = get().draft;
    // Reset the preview rail only when the draft's preset or default changes.
    const reset = !prev || prev.preset !== d.preset || prev.sidebar.defaultState !== d.sidebar.defaultState;
    set({ draft: d, ...(reset ? { draftRailCollapsed: d.sidebar.defaultState === "collapsed" } : {}) });
  },
  cancelPreview: () => set({ draft: null }),
  save: async (config) => {
    const layout = normalizeLayout(config);
    const changedDefault = layout.sidebar.defaultState !== get().saved.sidebar.defaultState || layout.preset !== get().saved.preset;
    const railCollapsed = changedDefault ? layout.sidebar.defaultState === "collapsed" : get().railCollapsed;
    set({ saved: layout, draft: null, railCollapsed });
    const userId = get().userId;
    if (userId) await preferencesService.save(userId, { layout, railCollapsed });
  },
  toggleRail: () => {
    if (get().draft) {
      set({ draftRailCollapsed: !get().draftRailCollapsed });
      return;
    }
    const railCollapsed = !get().railCollapsed;
    set({ railCollapsed });
    const { userId, saved } = get();
    if (userId) void preferencesService.save(userId, { layout: saved, railCollapsed });
  },
}));

/** The layout the shell should render now (a live preview wins over the saved one). */
export function useLayout(): { config: LayoutConfig; preset: LayoutPreset; previewing: boolean; railCollapsed: boolean } {
  const saved = useLayoutStore((s) => s.saved);
  const draft = useLayoutStore((s) => s.draft);
  const railCollapsed = useLayoutStore((s) => s.railCollapsed);
  const draftRailCollapsed = useLayoutStore((s) => s.draftRailCollapsed);
  const config = draft ?? saved;
  return {
    config,
    preset: LAYOUT_PRESETS[config.preset],
    previewing: !!draft && !sameLayout(draft, saved),
    railCollapsed: draft ? draftRailCollapsed : railCollapsed,
  };
}

/** Loads the signed-in persona's layout, and again whenever the persona changes ("after refresh/login"). */
export function useLayoutLoader() {
  const personaId = useSession((s) => s.personaId);
  const load = useLayoutStore((s) => s.load);
  useEffect(() => {
    void load(personaId);
  }, [personaId, load]);
}
