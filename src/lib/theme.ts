"use client";

import { useSyncExternalStore } from "react";
import { QUERY, THEME_KEY as KEY } from "./themeScript";

/**
 * Light / Dark / System. The preference lives in localStorage; the resolved
 * theme is written to <html data-theme>, which the CSS tokens key off.
 * THEME_SCRIPT (themeScript.ts) applies it before first paint so there's no flash.
 */
export type ThemePref = "light" | "dark" | "system";
export type Theme = "light" | "dark";



function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "dark" || v === "system" ? v : "light";
  } catch {
    return "light";
  }
}

function resolve(pref: ThemePref): Theme {
  if (pref === "system") return typeof matchMedia !== "undefined" && matchMedia(QUERY).matches ? "dark" : "light";
  return pref;
}

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Writes the resolved theme to <html data-theme> (also after <html> is re-created, e.g. a language switch). */
export function applyTheme() {
  document.documentElement.dataset.theme = resolve(readPref());
}

function apply() {
  document.documentElement.dataset.theme = resolve(readPref());
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const mq = matchMedia(QUERY);
  const onStorage = (e: StorageEvent) => e.key === KEY && apply();
  mq.addEventListener("change", apply);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    mq.removeEventListener("change", apply);
    window.removeEventListener("storage", onStorage);
  };
}

export function setThemePref(pref: ThemePref) {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    // Private mode: the choice just won't persist.
  }
  apply();
}

/** The saved preference (Light is the default). */
export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribe, readPref, () => "light");
}

/** The theme actually showing, for code that needs colours in JS (charts, canvas). */
export function useTheme(): Theme {
  return useSyncExternalStore(
    subscribe,
    () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light"),
    () => "light",
  );
}
