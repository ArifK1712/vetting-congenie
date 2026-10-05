"use client";

import * as RD from "@radix-ui/react-dialog";
import { CircleAlert, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { FormEvent, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button, type ButtonProps } from "./Button";

/**
 * Confirmation dialog for important actions (8.3). Owns the form submit,
 * busy state and the server-style error line; content goes in children.
 */
export function ActionDialog({
  open,
  onOpenChange,
  title,
  description,
  icon,
  children,
  confirmLabel,
  confirmVariant = "primary",
  busy,
  error,
  onConfirm,
  confirmDisabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  confirmVariant?: ButtonProps["variant"];
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  confirmDisabled?: boolean;
}) {
  const t = useTranslations("actions.dialogs");
  const tc = useTranslations("common");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!busy && !confirmDisabled) onConfirm();
  };

  return (
    <RD.Root open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <RD.Portal>
        <RD.Overlay className="anim-fade fixed inset-0 z-50 bg-slate-900/20 backdrop-blur-[2px]" />
        <RD.Content
          className="anim-pop fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 rounded-2xl bg-surface shadow-pop ring-1 ring-line outline-none"
          onOpenAutoFocus={(e) => {
            // Focus the first field rather than the close button.
            const first = (e.currentTarget as HTMLElement).querySelector<HTMLElement>("textarea, input, [role=radio]");
            if (first) {
              e.preventDefault();
              first.focus();
            }
          }}
        >
          <form onSubmit={submit}>
            <div className="flex items-start gap-3.5 px-6 pt-6">
              {icon}
              <div className="min-w-0 flex-1">
                <RD.Title className="text-lg font-bold text-ink">{title}</RD.Title>
                {description ? (
                  <RD.Description className="mt-1 text-sm text-ink-2">{description}</RD.Description>
                ) : (
                  <RD.Description className="sr-only">{title}</RD.Description>
                )}
              </div>
              <RD.Close
                aria-label={tc("close")}
                disabled={busy}
                className="-me-2 -mt-1 inline-flex size-8 items-center justify-center rounded-lg text-ink-3 hover:bg-hover hover:text-ink"
              >
                <X className="size-4" />
              </RD.Close>
            </div>

            {children && <div className="space-y-5 px-6 pt-5">{children}</div>}

            {error && (
              <p role="alert" className="mx-6 mt-5 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 ring-1 ring-rose-600/15 ring-inset">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                {error}
              </p>
            )}

            <div className="mt-6 flex items-center justify-end gap-2 rounded-b-2xl border-t border-line bg-subtle px-6 py-4">
              <Button type="button" onClick={() => onOpenChange(false)} disabled={busy}>
                {t("cancel")}
              </Button>
              <Button type="submit" variant={confirmVariant} disabled={busy || confirmDisabled}>
                {busy ? t("working") : confirmLabel}
              </Button>
            </div>
          </form>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}

export function DialogIcon({ className, children }: { className: string; children: ReactNode }) {
  return <span className={cn("inline-flex size-10 shrink-0 items-center justify-center rounded-xl", className)}>{children}</span>;
}
