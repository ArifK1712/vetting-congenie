"use client";

import { DirectionProvider } from "@radix-ui/react-direction";
import { NextIntlClientProvider } from "next-intl";
import { useState, type ReactNode } from "react";
import { PortalContainerContext } from "@/components/ui/portal";
import en from "../../../messages/en.json";

/**
 * The Workflows area is English-only by product decision: whatever language
 * the rest of the app is in, these screens render in English, left to right.
 * Shared components inside (selects, dialogs, dates) pick up English from
 * this provider, and their pop-ups mount inside this subtree.
 */
export function EnglishOnly({ children }: { children: ReactNode }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  return (
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Riyadh">
      <DirectionProvider dir="ltr">
        <PortalContainerContext.Provider value={container}>
          <div dir="ltr" lang="en" className="locale-en h-full">
            {children}
            <div ref={setContainer} />
          </div>
        </PortalContainerContext.Provider>
      </DirectionProvider>
    </NextIntlClientProvider>
  );
}
