"use client";

import { Suspense, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { NavProgress } from "@/lib/navProgress";
import { StoreGate } from "@/store/StoreGate";
import { PendingPage, skeletonFor } from "./PendingPage";
import { Header } from "./Header";
import { MobileNav, Sidebar } from "./Sidebar";

/** First load (before the local data is read): the shell outline plus this page's skeleton. */
function ShellSkeleton() {
  const pathname = usePathname();
  return (
    <div className="flex h-full">
      <div className="hidden h-full w-16 shrink-0 border-e border-nav-line bg-nav md:block lg:w-64" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="h-14 shrink-0 border-b border-line bg-surface md:h-16" />
        <div className="min-h-0 flex-1 overflow-hidden">{skeletonFor(pathname)}</div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <NavProgress />
      <StoreGate fallback={<ShellSkeleton />}>
        <div className="flex h-full">
          <Sidebar />
          <MobileNav />
          <div className="flex min-w-0 flex-1 flex-col">
            <Suspense fallback={<div className="h-14 border-b border-line bg-surface md:h-16" />}>
              <Header />
            </Suspense>
            <main className="min-h-0 flex-1 overflow-y-auto">
              <PendingPage>{children}</PendingPage>
            </main>
          </div>
        </div>
      </StoreGate>
    </>
  );
}
