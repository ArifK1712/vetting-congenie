"use client";

import { DirectionProvider } from "@radix-ui/react-direction";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/Toast";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { useStoreHydration } from "@/store/StoreGate";

export function Providers({ dir, children }: { dir: "ltr" | "rtl"; children: ReactNode }) {
  useStoreHydration();
  return (
    <DirectionProvider dir={dir}>
      <TooltipProvider delayDuration={300}>
        {children}
        <Toaster />
      </TooltipProvider>
    </DirectionProvider>
  );
}
