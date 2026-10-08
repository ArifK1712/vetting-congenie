"use client";

import * as RTabs from "@radix-ui/react-tabs";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export const Tabs = RTabs.Root;
export const TabsContent = RTabs.Content;

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    // Scrolls sideways on narrow screens (no visible scrollbar). The base line is an
    // inset shadow inside the row, so the active underline sits on it without
    // hanging below — which would make the row scroll vertically too.
    <RTabs.List className={cn("no-scrollbar flex items-end gap-6 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--c-line)]", className)}>
      {children}
    </RTabs.List>
  );
}

export function TabsTrigger({ value, children, count }: { value: string; children: ReactNode; count?: number }) {
  return (
    <RTabs.Trigger
      value={value}
      className="group inline-flex h-12 shrink-0 items-center gap-1.5 border-b-2 border-transparent text-sm font-medium whitespace-nowrap text-ink-3 transition-colors outline-none hover:text-ink focus-visible:text-ink data-[state=active]:border-accent data-[state=active]:font-semibold data-[state=active]:text-accent-text"
    >
      {children}
      {count !== undefined && count > 0 && (
        <span className="tabular inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-hover px-1 text-2xs font-semibold text-ink-2 group-data-[state=active]:bg-indigo-100 group-data-[state=active]:text-indigo-700">{count}</span>
      )}
    </RTabs.Trigger>
  );
}
