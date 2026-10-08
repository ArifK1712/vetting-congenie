"use client";

import { Eye, LayoutTemplate, RotateCcw, SlidersHorizontal, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";
import { useNavGroups } from "@/components/shell/nav/model";
import { Button } from "@/components/ui/Button";
import { FormSkeleton } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import { PAGE } from "@/design/layout";
import { DEFAULT_LAYOUT, normalizeLayout, sameLayout, type LayoutConfig } from "@/layout/config";
import { withPreset } from "@/layout/presets";
import { useLayoutStore } from "@/layout/store";
import { cn } from "@/lib/cn";
import { useViewer } from "@/store/useViewer";
import { LayoutOptions } from "./LayoutOptions";
import { LayoutPreview } from "./LayoutPreview";
import { PresetPicker } from "./PresetPicker";

/**
 * Settings → Appearance: the signed-in person's admin layout. Open to every
 * staff user (a personal preference, saved per user via preferencesService).
 */
export function AppearancePage() {
  const loaded = useLayoutStore((s) => s.loaded);
  const userId = useLayoutStore((s) => s.userId);
  if (!loaded) return <FormSkeleton />;
  // A persona switch loads another person's layout: start their page fresh.
  return <AppearanceEditor key={userId ?? "none"} />;
}

function AppearanceEditor() {
  const t = useTranslations("appearance");
  const viewer = useViewer();
  const groups = useNavGroups();
  const saved = useLayoutStore((s) => s.saved);
  const live = useLayoutStore((s) => s.draft);
  const preview = useLayoutStore((s) => s.preview);
  const cancelPreview = useLayoutStore((s) => s.cancelPreview);
  const save = useLayoutStore((s) => s.save);

  // The page's draft; while a live preview runs, the preview is the draft.
  const [edit, setEdit] = useState<LayoutConfig | null>(() => useLayoutStore.getState().draft);
  const draft = live ?? edit ?? saved;
  const dirty = !sameLayout(draft, saved);
  const previewing = !!live && dirty;
  const [saving, setSaving] = useState(false);

  // When the live preview ends (kept, gone back, saved), the page follows the saved layout again.
  useEffect(
    () =>
      useLayoutStore.subscribe((s, prev) => {
        if (prev.draft && !s.draft) setEdit(null);
      }),
    [],
  );

  const update = (next: LayoutConfig) => {
    const n = normalizeLayout(next);
    setEdit(n);
    if (useLayoutStore.getState().draft) preview(n);
  };
  const patch = (fn: (c: LayoutConfig) => LayoutConfig) => update(fn(draft));

  const discard = () => {
    setEdit(null);
    cancelPreview();
  };
  const onSave = async () => {
    setSaving(true);
    await save(draft);
    setSaving(false);
    setEdit(null);
    toast(t("actions.saved"));
  };

  const name = t(`presets.${draft.preset}.name`);

  return (
    <div className={cn(PAGE, "pb-12")} data-appearance>
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-80">
          <h1 className="text-3xl font-bold tracking-tight text-ink">{t("title")}</h1>
          <p className="mt-1.5 max-w-3xl text-sm text-ink-2">{t("subtitle")}</p>
        </div>
        <span className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-accent-soft px-3 text-xs font-semibold text-accent-text">
          <UserRound className="size-3.5" />
          {t("savedFor", { name: viewer.user.name })}
        </span>
      </header>

      <section className="mt-7" aria-labelledby="appearance-layout">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 id="appearance-layout" className="flex items-center gap-2 text-lg font-semibold text-ink">
              <span className="inline-flex size-7 items-center justify-center rounded-lg bg-info-soft text-info">
                <LayoutTemplate className="size-4" />
              </span>
              {t("layout.title")}
            </h2>
            <p className="mt-1 text-sm text-ink-3">{t("layout.body")}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => update(DEFAULT_LAYOUT)} disabled={sameLayout(draft, DEFAULT_LAYOUT)} data-reset>
            <RotateCcw className="size-3.5" />
            {t("actions.reset")}
          </Button>
        </div>

        <PresetPicker value={draft.preset} current={saved.preset} onChange={(id) => update(withPreset(draft, id))} />

        <div className="mt-6 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
          <Panel
            icon={<Eye className="size-4" />}
            tone="bg-accent-soft text-accent-text"
            title={t("preview.title")}
            body={t("preview.body")}
            className="xl:sticky xl:top-4 xl:self-start"
            action={
              previewing ? (
                <span className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-positive-soft px-3 text-xs font-semibold text-positive" data-live>
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-positive opacity-50" />
                    <span className="relative inline-flex size-2 rounded-full bg-positive" />
                  </span>
                  {t("preview.live")}
                </span>
              ) : (
                <Button variant="primary" size="sm" onClick={() => preview(draft)} disabled={!dirty} data-try-live>
                  <Eye className="size-3.5" />
                  {t("preview.tryLive")}
                </Button>
              )
            }
          >
            <LayoutPreview config={draft} groups={groups} label={t("preview.label", { name })} />
            <p className="mt-3 text-xs text-ink-3">{previewing ? t("preview.liveHint") : dirty ? null : t("preview.sameAsSaved")}</p>
          </Panel>

          <Panel icon={<SlidersHorizontal className="size-4" />} tone="bg-attention-soft text-attention" title={t("options.title")} body={t("options.body", { name })}>
            <LayoutOptions config={draft} patch={patch} />
          </Panel>
        </div>
      </section>

      {dirty && !previewing && (
        <div className="sticky bottom-4 z-20 mt-6" data-save-bar>
          <div className="anim-pop flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl bg-surface px-4 py-3 shadow-pop ring-1 ring-line sm:px-5">
            <span className="relative flex size-2.5 shrink-0">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-40" />
              <span className="relative inline-flex size-2.5 rounded-full bg-accent" />
            </span>
            <div className="min-w-0 flex-1 basis-48">
              <p className="text-sm font-semibold text-ink">{t("actions.unsaved")}</p>
              <p className="text-xs text-ink-3">{t("actions.unsavedHint")}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={discard} disabled={saving}>
                {t("actions.discard")}
              </Button>
              <Button variant="primary" onClick={() => void onSave()} disabled={saving}>
                {t("actions.save")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Panel({
  icon,
  tone,
  title,
  body,
  action,
  className,
  children,
}: {
  icon: ReactNode;
  tone: string;
  title: string;
  body: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("min-w-0 rounded-2xl bg-surface p-4 shadow-card ring-1 ring-line sm:p-5", className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 basis-56 items-start gap-2.5">
          <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-lg", tone)}>{icon}</span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-ink">{title}</h3>
            <p className="mt-0.5 text-xs text-ink-3">{body}</p>
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
