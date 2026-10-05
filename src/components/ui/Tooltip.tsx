"use client";

import * as RT from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

export const TooltipProvider = RT.Provider;

export function Tooltip({
  content,
  children,
  side = "top",
}: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  if (!content) return <>{children}</>;
  return (
    <RT.Root>
      <RT.Trigger asChild>{children}</RT.Trigger>
      <RT.Portal>
        <RT.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className="anim-pop z-50 max-w-72 rounded-lg bg-surface px-2.5 py-1.5 text-xs font-medium text-ink-2 shadow-pop ring-1 ring-line"
        >
          {content}
        </RT.Content>
      </RT.Portal>
    </RT.Root>
  );
}
