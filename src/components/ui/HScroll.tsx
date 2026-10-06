"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { DirIcon } from "@/components/ui/DirIcon";
import { cn } from "@/lib/cn";

/**
 * A horizontally scrollable row with no visible scrollbar. Touch and trackpad
 * scroll as usual; for a mouse, round arrow buttons and soft edge fades
 * appear only while there's more to see on that side. Works in RTL.
 */
export function HScroll({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  const t = useTranslations("common");
  const ref = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ back: false, forward: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // scrollLeft runs negative in RTL; use its size from the start edge.
    const from = Math.abs(el.scrollLeft);
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ back: from > 2, forward: from < max - 2 });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.addEventListener("scroll", measure, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", measure);
    };
  }, [measure]);

  const step = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === "rtl";
    el.scrollBy({ left: dir * (rtl ? -1 : 1) * el.clientWidth * 0.8, behavior: "smooth" });
  };

  const arrow = "absolute top-1/2 z-10 hidden size-8 -translate-y-1/2 items-center justify-center rounded-full bg-surface text-ink-2 shadow-raised ring-1 ring-line transition-opacity hover:text-ink sm:inline-flex";
  return (
    <div className="relative">
      <ul ref={ref} aria-label={label} className={cn("no-scrollbar flex overflow-x-auto scroll-smooth", className)}>
        {children}
      </ul>
      <span aria-hidden className={cn("pointer-events-none absolute inset-y-0 start-0 w-10 bg-gradient-to-r from-canvas to-transparent transition-opacity rtl:bg-gradient-to-l", edges.back ? "opacity-100" : "opacity-0")} />
      <span aria-hidden className={cn("pointer-events-none absolute inset-y-0 end-0 w-10 bg-gradient-to-l from-canvas to-transparent transition-opacity rtl:bg-gradient-to-r", edges.forward ? "opacity-100" : "opacity-0")} />
      <button type="button" aria-label={t("scrollBack")} onClick={() => step(-1)} className={cn(arrow, "start-1", !edges.back && "pointer-events-none opacity-0")} tabIndex={edges.back ? 0 : -1}>
        <DirIcon icon={ChevronLeft} className="size-4" />
      </button>
      <button type="button" aria-label={t("scrollForward")} onClick={() => step(1)} className={cn(arrow, "end-1", !edges.forward && "pointer-events-none opacity-0")} tabIndex={edges.forward ? 0 : -1}>
        <DirIcon icon={ChevronRight} className="size-4" />
      </button>
    </div>
  );
}
