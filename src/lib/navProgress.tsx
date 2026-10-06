"use client";

import { usePathname as useFullPathname } from "next/navigation";
import { useEffect } from "react";
import { create } from "zustand";

/**
 * Instant feedback for page changes. As soon as a navigation starts (a link
 * click or a router push), we know the target path, so the shell can show the
 * matching skeleton and a progress bar right away instead of freezing on the
 * old page until the next one has loaded. Query-only changes (filters, tabs)
 * don't count: they don't swap the page.
 */
interface NavState {
  /** Full target pathname, with locale (e.g. "/en/queue"). */
  target: string | null;
  start: (target: string) => void;
  done: () => void;
}

export const useNav = create<NavState>()((set) => ({
  target: null,
  start: (target) => {
    if (typeof window === "undefined") return;
    const clean = target.replace(/\/+$/, "") || "/";
    if (clean === window.location.pathname.replace(/\/+$/, "")) return;
    set({ target: clean });
  },
  done: () => set({ target: null }),
}));

/** "/en/requests/VR-1" → "/requests/VR-1". */
export const stripLocale = (path: string) => path.replace(/^\/(en|ar)(?=\/|$)/, "") || "/";

function isPlainLeftClick(e: MouseEvent) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.defaultPrevented;
}

/** Thin top progress bar + completion tracking. Mount once per shell. */
export function NavProgress() {
  const target = useNav((s) => s.target);
  const start = useNav((s) => s.start);
  const done = useNav((s) => s.done);
  const pathname = useFullPathname();

  // Navigation finished: the URL path changed.
  useEffect(() => {
    done();
  }, [pathname, done]);

  // Link clicks (captured, so it runs before Next's own handler).
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!isPlainLeftClick(e)) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      start(url.pathname);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [start]);

  // Safety net: never leave a skeleton up if a navigation is abandoned.
  useEffect(() => {
    if (!target) return;
    const id = window.setTimeout(done, 15000);
    return () => window.clearTimeout(id);
  }, [target, done]);

  return <ProgressBar active={!!target} />;
}

/** Runs towards 90% while loading (CSS), then fills and fades out when done. */
function ProgressBar({ active }: { active: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5">
      <div className={active ? "nav-bar nav-bar-run" : "nav-bar nav-bar-done"} />
    </div>
  );
}
