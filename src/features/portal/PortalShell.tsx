"use client";

import { Suspense, type ReactNode } from "react";
import { LanguageSwitch, ThemeMenu } from "@/components/shell/Header";
import { PendingPage } from "@/components/shell/PendingPage";
import { PortalSkeleton } from "@/components/ui/Skeleton";
import { NavProgress } from "@/lib/navProgress";
import { StoreGate } from "@/store/StoreGate";
import { useTranslations } from "next-intl";

/** The attendee-facing frame: no admin navigation, just the event brand and a language switch. */
export function PortalShell({ children }: { children: ReactNode }) {
  const t = useTranslations("portal");
  return (
    <div className="min-h-full bg-canvas">
      <NavProgress />
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-4 sm:px-5">
          <span className="flex items-center gap-2.5">
            <span aria-hidden className="inline-flex size-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-on-accent">
              E
            </span>
            <span className="text-sm font-bold text-ink">{t("brand")}</span>
          </span>
          <span className="flex items-center gap-1">
            <Suspense>
              <LanguageSwitch />
            </Suspense>
            <ThemeMenu />
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-5 sm:py-10">
        <StoreGate fallback={<PortalSkeleton />}>
          <PendingPage>{children}</PendingPage>
        </StoreGate>
      </main>
    </div>
  );
}
