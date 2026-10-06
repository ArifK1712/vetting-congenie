// Shared with the server layout, so it must not live in a "use client" module.
export const THEME_KEY = "vetting-theme";
export const QUERY = "(prefers-color-scheme: dark)";

/** Runs in <head> before paint: resolves the saved theme onto <html data-theme>. */
export const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_KEY}");var d=p==="dark"||(p==="system"&&matchMedia("${QUERY}").matches);document.documentElement.dataset.theme=d?"dark":"light"}catch(e){document.documentElement.dataset.theme="light"}})()`;
