"use client";

import { useSyncExternalStore } from "react";

/** Live `matchMedia` result. Server render assumes the query doesn't match. */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => matchMedia(query).matches,
    () => false,
  );
}

/** Below Tailwind's `lg` breakpoint (tablets and phones). */
export const useCompact = () => useMedia("(max-width: 1023.98px)");
