"use client";

import { useTranslations } from "next-intl";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Loading placeholders shown by the route `loading.tsx` files while the next
 * page loads. They mirror the real layouts (same paddings and card shapes) so
 * the page doesn't jump when content arrives. Theme-aware via tokens.
 */
export function Bone({ className, style }: { className?: string; style?: CSSProperties }) {
  return <span aria-hidden style={style} className={cn("block animate-pulse bg-active", !className?.includes("rounded") && "rounded-md", className)} />;
}

function Frame({ wide, children }: { wide?: boolean; children: ReactNode }) {
  const t = useTranslations("common");
  return (
    <div
      role="status"
      aria-busy="true"
      className={cn("mx-auto px-4 pt-5 pb-12 sm:px-6 lg:px-7 lg:pt-7", wide ? "max-w-[96rem]" : "max-w-[88rem]")}
    >
      <span className="sr-only">{t("loading")}</span>
      {children}
    </div>
  );
}

function Card({ className, children }: { className?: string; children?: ReactNode }) {
  return <div className={cn("rounded-xl bg-surface shadow-card ring-1 ring-line", className)}>{children}</div>;
}

function Title({ actions = true }: { actions?: boolean }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-2.5">
        <Bone className="h-8 w-56 max-w-[70vw]" />
        <Bone className="h-3.5 w-80 max-w-[80vw]" />
      </div>
      {actions && <Bone className="h-9 w-32 rounded-lg" />}
    </div>
  );
}

function Rows({ count = 8 }: { count?: number }) {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-3.5">
          <Bone className="size-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Bone className={cn("h-3.5", i % 3 === 0 ? "w-48" : i % 3 === 1 ? "w-36" : "w-56", "max-w-full")} />
            <Bone className="h-3 w-28 max-w-full" />
          </div>
          <Bone className="hidden h-3.5 w-24 sm:block" />
          <Bone className="hidden h-3.5 w-28 md:block" />
          <Bone className="h-6 w-24 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Lists: title, filter bar, table. */
export function ListSkeleton() {
  return (
    <Frame>
      <Title />
      <div className="mt-6 flex flex-wrap gap-2">
        <Bone className="h-8 w-64 max-w-full rounded-lg" />
        <Bone className="h-8 w-24 rounded-lg" />
        <Bone className="h-8 w-24 rounded-lg" />
        <Bone className="hidden h-8 w-24 rounded-lg sm:block" />
      </div>
      <Card className="mt-5 overflow-hidden">
        <div className="flex h-10 items-center gap-6 border-b border-line bg-subtle px-5">
          <Bone className="h-2.5 w-16" />
          <Bone className="h-2.5 w-24" />
          <Bone className="hidden h-2.5 w-20 sm:block" />
        </div>
        <Rows />
      </Card>
    </Frame>
  );
}

/** Review Queue: status tiles above the table. */
export function QueueSkeleton() {
  return (
    <Frame wide>
      <Title actions={false} />
      <Card className="mt-5 flex overflow-hidden">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className={cn("min-w-[8.75rem] flex-1 space-y-3 border-e border-line p-4 last:border-e-0", i > 1 && "hidden md:block")}>
            <Bone className="h-3 w-24" />
            <Bone className="h-7 w-14" />
            <Bone className="h-2.5 w-16" />
          </div>
        ))}
      </Card>
      <Card className="mt-5 overflow-hidden">
        <div className="flex gap-2 border-b border-line p-3">
          <Bone className="h-8 w-64 max-w-full rounded-lg" />
          <Bone className="h-8 w-20 rounded-lg" />
          <Bone className="hidden h-8 w-20 rounded-lg sm:block" />
        </div>
        <Rows />
      </Card>
    </Frame>
  );
}

/** Dashboard and reports: KPI cards and charts. */
export function DashboardSkeleton() {
  return (
    <Frame wide>
      <Title actions={false} />
      <div className="mt-5 flex flex-wrap gap-2">
        {[28, 24, 24, 22, 18].map((w, i) => (
          <Bone key={i} className="h-8 rounded-lg" style={{ width: `${w * 4}px` }} />
        ))}
      </div>
      <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i} className="space-y-4 p-5">
            <div className="flex items-center gap-2.5">
              <Bone className="size-8 rounded-lg" />
              <Bone className="h-3.5 w-28" />
            </div>
            <Bone className="h-8 w-20" />
            <Bone className="h-2.5 w-full" />
          </Card>
        ))}
      </div>
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="p-5">
          <Bone className="h-4 w-48" />
          <Bone className="mt-2 h-3 w-64 max-w-full" />
          <Bone className="mt-6 h-64 w-full rounded-lg" />
        </Card>
        <Card className="space-y-3 p-5">
          <Bone className="h-4 w-40" />
          <Bone className="h-3 w-full rounded-full" />
          {Array.from({ length: 4 }, (_, i) => (
            <Bone key={i} className="h-14 w-full rounded-lg" />
          ))}
        </Card>
      </div>
    </Frame>
  );
}

/** Detail pages: breadcrumb, header card, tabs, two columns. */
export function DetailSkeleton() {
  return (
    <Frame>
      <Bone className="h-3 w-40" />
      <Card className="mt-4 p-6">
        <div className="flex items-start gap-5">
          <Bone className="size-14 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-3">
            <Bone className="h-6 w-64 max-w-full" />
            <div className="flex gap-2">
              <Bone className="h-6 w-24 rounded-full" />
              <Bone className="h-6 w-20 rounded-full" />
            </div>
          </div>
          <Bone className="hidden h-9 w-36 rounded-lg sm:block" />
        </div>
      </Card>
      <div className="mt-5 flex gap-5 border-b border-line pb-3">
        {[20, 24, 16, 20].map((w, i) => (
          <Bone key={i} className="h-3.5" style={{ width: `${w * 4}px` }} />
        ))}
      </div>
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="space-y-4 p-6">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="grid grid-cols-[8rem_minmax(0,1fr)] gap-4">
              <Bone className="h-3.5 w-24" />
              <Bone className={cn("h-3.5", i % 2 ? "w-40" : "w-56", "max-w-full")} />
            </div>
          ))}
        </Card>
        <Card className="space-y-3 p-5">
          <Bone className="h-4 w-32" />
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Bone className="size-6 shrink-0 rounded-full" />
              <Bone className="h-3.5 flex-1" />
            </div>
          ))}
        </Card>
      </div>
    </Frame>
  );
}

/** Create / edit / import forms: stacked sections. */
export function FormSkeleton() {
  return (
    <Frame>
      <Bone className="h-3 w-40" />
      <div className="mt-4">
        <Title actions={false} />
      </div>
      <div className="mt-6 max-w-3xl space-y-5">
        {Array.from({ length: 3 }, (_, i) => (
          <Card key={i} className="space-y-5 p-6">
            <Bone className="h-4 w-40" />
            {Array.from({ length: 3 }, (_, j) => (
              <div key={j} className="space-y-2">
                <Bone className="h-3 w-28" />
                <Bone className="h-9 w-full rounded-lg" />
              </div>
            ))}
          </Card>
        ))}
      </div>
    </Frame>
  );
}

/** Workflow builder: toolbar, block palette, canvas, inspector. */
export function BuilderSkeleton() {
  const t = useTranslations("common");
  return (
    <div role="status" aria-busy="true" className="flex min-h-full flex-col lg:h-full">
      <span className="sr-only">{t("loading")}</span>
      <div className="flex items-center gap-4 border-b border-line bg-surface px-3 py-3 sm:px-5">
        <Bone className="size-8 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Bone className="h-5 w-48" />
          <Bone className="h-3 w-64 max-w-full" />
        </div>
        <Bone className="hidden h-8 w-24 rounded-lg sm:block" />
        <Bone className="h-8 w-20 rounded-lg" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="hidden w-60 space-y-2 border-e border-line bg-surface p-3 lg:block">
          {Array.from({ length: 6 }, (_, i) => (
            <Bone key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
        <div className="relative h-[62vh] min-h-[22rem] flex-1 bg-canvas lg:h-auto">
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-8">
            {[0, 1, 2].map((i) => (
              <Bone key={i} className="h-16 w-56 rounded-xl" />
            ))}
          </div>
        </div>
        <div className="space-y-4 border-t border-line bg-surface p-5 lg:w-[22rem] lg:border-s lg:border-t-0">
          <Bone className="h-4 w-32" />
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-2">
              <Bone className="h-3 w-24" />
              <Bone className="h-9 w-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Attendee portal card. */
export function PortalSkeleton() {
  const t = useTranslations("common");
  return (
    <div role="status" aria-busy="true" className="rounded-2xl bg-surface p-6 shadow-card ring-1 ring-line sm:p-8">
      <span className="sr-only">{t("loading")}</span>
      <Bone className="h-6 w-56 max-w-full" />
      <Bone className="mt-3 h-3.5 w-80 max-w-full" />
      <div className="mt-8 space-y-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Bone className="size-7 shrink-0 rounded-full" />
            <Bone className="h-3.5 flex-1" />
          </div>
        ))}
      </div>
    </div>
  );
}
