"use client";

import * as DM from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export const Menu = DM.Root;
export const MenuTrigger = DM.Trigger;

export function MenuContent({
  children,
  align = "start",
  className,
}: {
  children: ReactNode;
  align?: "start" | "end" | "center";
  className?: string;
}) {
  return (
    <DM.Portal>
      <DM.Content
        align={align}
        sideOffset={6}
        collisionPadding={8}
        className={cn(
          "anim-pop z-50 min-w-48 rounded-xl border border-line bg-surface p-1.5 text-sm shadow-pop",
          className,
        )}
      >
        {children}
      </DM.Content>
    </DM.Portal>
  );
}

const itemClass =
  "flex h-8 cursor-default select-none items-center gap-2.5 rounded-md px-2 text-ink outline-none data-[highlighted]:bg-hover data-[disabled]:text-ink-3";

export function MenuItem({ children, onSelect, disabled }: { children: ReactNode; onSelect?: () => void; disabled?: boolean }) {
  return (
    <DM.Item className={itemClass} onSelect={onSelect} disabled={disabled}>
      {children}
    </DM.Item>
  );
}

export function MenuRadioGroup({ value, onValueChange, children }: { value: string; onValueChange: (v: string) => void; children: ReactNode }) {
  return (
    <DM.RadioGroup value={value} onValueChange={onValueChange}>
      {children}
    </DM.RadioGroup>
  );
}

export function MenuRadioItem({ value, children }: { value: string; children: ReactNode }) {
  return (
    <DM.RadioItem value={value} className={cn(itemClass, "h-auto min-h-8 py-1.5 pe-8 relative")}>
      {children}
      <DM.ItemIndicator className="absolute end-2 text-accent">
        <Check className="size-4" />
      </DM.ItemIndicator>
    </DM.RadioItem>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <DM.Label className="eyebrow px-2 pt-2 pb-1">{children}</DM.Label>;
}

export function MenuSeparator() {
  return <DM.Separator className="my-1 h-px bg-line" />;
}
