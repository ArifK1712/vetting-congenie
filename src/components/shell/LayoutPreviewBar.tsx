"use client";

import { Eye } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "@/components/ui/Toast";
import { useLayout, useLayoutStore } from "@/layout/store";

/**
 * Shown on every page while a layout is being tried live from
 * Settings → Appearance: keep it (save) or go back to the saved layout.
 */
export function LayoutPreviewBar() {
  const t = useTranslations("appearance.previewBar");
  const tp = useTranslations("appearance.presets");
  const { previewing, config } = useLayout();
  const save = useLayoutStore((s) => s.save);
  const cancel = useLayoutStore((s) => s.cancelPreview);
  if (!previewing) return null;
  return (
    <div role="status" className="anim-pop fixed inset-x-3 bottom-3 z-[65] mx-auto flex max-w-xl flex-wrap items-center gap-3 rounded-xl bg-surface p-3 shadow-pop ring-1 ring-accent/40 sm:inset-x-6 sm:bottom-6 sm:flex-nowrap">
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-text">
        <Eye className="size-[18px]" strokeWidth={1.75} />
      </span>
      <p className="min-w-0 flex-1 text-sm text-ink-2">
        <span className="font-semibold text-ink">{t("title", { name: tp(`${config.preset}.name`) })}</span> {t("body")}
      </p>
      <div className="flex shrink-0 gap-2">
        <button type="button" onClick={cancel} className="inline-flex h-8 items-center rounded-lg px-3 text-sm font-medium text-ink-2 ring-1 ring-line hover:bg-hover">
          {t("cancel")}
        </button>
        <button
          type="button"
          onClick={async () => {
            await save(config);
            toast(t("saved"));
          }}
          className="inline-flex h-8 items-center rounded-lg bg-accent px-3 text-sm font-semibold text-on-accent hover:bg-accent-hover"
        >
          {t("save")}
        </button>
      </div>
    </div>
  );
}
