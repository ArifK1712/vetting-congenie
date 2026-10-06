"use client";

import { useServerInsertedHTML } from "next/navigation";
import { useLayoutEffect, useRef } from "react";
import { applyTheme } from "@/lib/theme";
import { THEME_SCRIPT } from "@/lib/themeScript";

/**
 * Puts the theme bootstrap (THEME_SCRIPT) into the server HTML only, ahead of
 * the page, so the saved theme applies before first paint. It's never part of
 * the client render, so React doesn't warn about a <script> in a component,
 * and re-renders leave <html data-theme> alone. When <html> itself is
 * re-created (switching language changes the root layout), the attribute is
 * restored before paint.
 */
export function ThemeScript() {
  const sent = useRef(false);
  useServerInsertedHTML(() => {
    if (sent.current) return null;
    sent.current = true;
    return <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />;
  });
  useLayoutEffect(() => {
    if (!document.documentElement.dataset.theme) applyTheme();
  });
  return null;
}
