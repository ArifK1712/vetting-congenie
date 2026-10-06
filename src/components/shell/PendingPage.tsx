"use client";

import type { ReactNode } from "react";
import { BuilderSkeleton, DashboardSkeleton, DetailSkeleton, FormSkeleton, ListSkeleton, PortalSkeleton, QueueSkeleton } from "@/components/ui/Skeleton";
import { stripLocale, useNav } from "@/lib/navProgress";

/** The skeleton that matches a target path (same choice as the routes' loading.tsx). */
export function skeletonFor(path: string): ReactNode {
  const p = stripLocale(path);
  if (p.startsWith("/portal")) return <PortalSkeleton />;
  if (p === "/dashboard" || p === "/reports") return <DashboardSkeleton />;
  if (p === "/queue") return <QueueSkeleton />;
  if (/^\/workflows\/[^/]+$/.test(p)) return <BuilderSkeleton />;
  if (/\/(new|edit|import)$/.test(p) || p === "/settings" || p === "/dev/simulate") return <FormSkeleton />;
  if (/^\/(requests|teams|registrations|screening\/blacklist|screening\/watchlist)\/[^/]+$/.test(p)) return <DetailSkeleton />;
  return <ListSkeleton />;
}

/**
 * Shows the next page's skeleton the moment a navigation starts, keeping the
 * current page mounted (hidden) until the new one replaces it.
 */
export function PendingPage({ children }: { children: ReactNode }) {
  const target = useNav((s) => s.target);
  return (
    <>
      {target && <div className="anim-fade">{skeletonFor(target)}</div>}
      <div className={target ? "hidden" : "contents"}>{children}</div>
    </>
  );
}
