"use client";

import { DatabaseZap, RotateCcw, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "@/components/ui/Toast";
import { useAppStore, useStorageHealth } from "@/store/app";

/**
 * Shown while saves to the browser's storage fail (full or blocked): the demo
 * still works in memory, but changes would be lost on reload. Stays until the
 * next save works or the person dismisses it.
 */
export function StorageWarning() {
  const t = useTranslations("app.storage");
  const failed = useStorageHealth((s) => s.failed);
  const [dismissed, setDismissed] = useState(false);
  // Show it again if saving fails again after a dismiss.
  const [prevFailed, setPrevFailed] = useState(failed);
  if (failed !== prevFailed) {
    setPrevFailed(failed);
    if (failed) setDismissed(false);
  }
  if (!failed || dismissed) return null;

  const reset = () => {
    useAppStore.getState().resetDemo();
    if (!useStorageHealth.getState().failed) toast(t("done"));
  };

  return (
    <div role="alert" className="anim-pop fixed inset-x-3 bottom-3 z-[70] mx-auto max-w-2xl rounded-xl bg-surface p-4 shadow-pop ring-1 ring-amber-500/40 sm:inset-x-6 sm:bottom-6">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
          <DatabaseZap className="size-[18px]" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{t("title")}</p>
          <p className="mt-0.5 text-sm text-ink-2">{t("body")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-semibold text-on-accent hover:bg-accent-hover"
            >
              <RotateCcw className="size-3.5" />
              {t("reset")}
            </button>
            <button type="button" onClick={() => setDismissed(true)} className="inline-flex h-8 items-center rounded-lg px-3 text-sm font-medium text-ink-2 ring-1 ring-line hover:bg-hover">
              {t("dismiss")}
            </button>
          </div>
        </div>
        <button type="button" onClick={() => setDismissed(true)} aria-label={t("dismiss")} className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink">
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
