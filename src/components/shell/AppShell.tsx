"use client";

import { Suspense, type ReactNode } from "react";
import { StoreGate } from "@/store/StoreGate";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

function ShellSkeleton() {
  return (
    <div className="flex h-full">
      <div className="h-full w-64 shrink-0 border-e border-nav-line bg-nav" />
      <div className="flex-1">
        <div className="h-16 border-b border-line bg-surface" />
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <StoreGate fallback={<ShellSkeleton />}>
      <div className="flex h-full">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Suspense fallback={<div className="h-16 border-b border-line bg-surface" />}>
            <Header />
          </Suspense>
          <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </StoreGate>
  );
}
