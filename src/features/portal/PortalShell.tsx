"use client";

import { Suspense, type ReactNode } from "react";
import { LanguageMenu } from "@/components/shell/Header";
import { StoreGate } from "@/store/StoreGate";
import { useTranslations } from "next-intl";

/** The attendee-facing frame: no admin navigation, just the event brand and a language switch. */
export function PortalShell({ children }: { children: ReactNode }) {
  const t = useTranslations("portal");
  return (
    <div className="min-h-full bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
          <span className="flex items-center gap-2.5">
            <span aria-hidden className="inline-flex size-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">
              E
            </span>
            <span className="text-sm font-bold text-ink">{t("brand")}</span>
          </span>
          <Suspense>
            <LanguageMenu />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10">
        <StoreGate fallback={<div className="h-64 animate-pulse rounded-2xl bg-surface ring-1 ring-line" />}>{children}</StoreGate>
      </main>
    </div>
  );
}
