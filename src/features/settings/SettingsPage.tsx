"use client";

import { History, Loader2, Lock, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PAGE } from "@/design/layout";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { toast } from "@/components/ui/Toast";
import { draftOfConfig, validateConfig, type ConfigDraft } from "@/domain/settings";
import { useFormat } from "@/i18n/format";
import { cn } from "@/lib/cn";
import { useNow } from "@/lib/useNow";
import { configWroteLocally, settingsService } from "@/services/settings";
import { useAppStore, useDb } from "@/store/app";
import { useViewer } from "@/store/useViewer";
import { GeneralTab } from "./GeneralTab";
import { HistoryTab } from "./HistoryTab";
import { ReasonsTab } from "./ReasonsTab";
import { TemplatesTab } from "./TemplatesTab";

export type SettingsTab = "general" | "reasons" | "emails" | "history";
const TABS: SettingsTab[] = ["general", "reasons", "emails", "history"];
const tabFrom = (v: string | null): SettingsTab => (TABS.includes(v as SettingsTab) ? (v as SettingsTab) : "general");

export type ConfigPatch = (p: Partial<ConfigDraft>) => void;

export function SettingsPage() {
  const t = useTranslations("settings");
  const ts = useTranslations("settings.save");
  const fmt = useFormat();
  const db = useDb();
  const viewer = useViewer();
  const now = useNow();
  const params = useSearchParams();
  const config = db.config;

  const [tab, setTabState] = useState<SettingsTab>(() => tabFrom(params.get("tab")));
  const [initial, setInitial] = useState<ConfigDraft>(() => draftOfConfig(config));
  const [draft, setDraft] = useState<ConfigDraft>(initial);
  const [loadedRevision, setLoadedRevision] = useState(config.revision);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const urlTab = params.get("tab");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- follow the URL when it changes from outside
    setTabState(tabFrom(urlTab));
  }, [urlTab]);

  const setTab = (next: SettingsTab) => {
    setTabState(next);
    const url = new URL(window.location.href);
    if (next === "general") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(window.history.state, "", url);
  };

  const patch: ConfigPatch = (p) => {
    setDraft((d) => ({ ...d, ...p }));
    setServerError(null);
  };

  const issues = useMemo(() => validateConfig(db, draft, viewer.id), [db, draft, viewer.id]);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(initial), [draft, initial]);
  const stale = config.revision !== loadedRevision && !configWroteLocally(config.revision);
  const historyCount = Object.keys(db.settingsHistory ?? {}).length;
  const editedTemplates = Object.keys(db.emailTemplates ?? {}).length;

  if (!viewer.can("registration.vettingSettings")) {
    return <EmptyState icon={Lock} title={t("noAccessTitle")} body={t("noAccessBody")} />;
  }

  const reloadLatest = () => {
    const latest = useAppStore.getState().db?.config;
    if (!latest) return;
    const next = draftOfConfig(latest);
    setInitial(next);
    setDraft(next);
    setLoadedRevision(latest.revision);
    setServerError(null);
  };

  const discard = () => {
    setDraft(initial);
    setServerError(null);
  };

  const save = async () => {
    if (!dirty || issues.length || stale) return;
    setSaving(true);
    setServerError(null);
    const r = await settingsService.saveConfig({ draft, actorId: viewer.id, expectedRevision: loadedRevision });
    setSaving(false);
    if (r.ok) {
      const saved = r.db.config;
      setInitial(draftOfConfig(saved));
      setDraft(draftOfConfig(saved));
      setLoadedRevision(saved.revision);
      toast(ts("saved"));
    } else {
      setServerError(ts(`errors.${r.error}`));
    }
  };

  const updatedBy = config.updatedBy ? db.users[config.updatedBy]?.name : null;

  return (
    <div className={cn(PAGE, dirty ? "pb-32" : "pb-12")}>
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-ink">{t("title")}</h1>
        <p className="mt-1.5 max-w-3xl text-sm text-ink-2">{t("subtitle")}</p>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-3">
          <History className="size-3.5 shrink-0" />
          {config.updatedAt && updatedBy ? t("updated", { time: fmt.ago(config.updatedAt, now), name: updatedBy }) : t("neverUpdated")}
        </p>
      </header>

      {stale && (
        <div role="alert" data-stale className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-attention/20 bg-attention-soft px-4 py-3 text-sm text-attention">
          <RefreshCw className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">{ts("stale")}</span>
          <Button size="sm" onClick={reloadLatest}>
            {ts("loadLatest")}
          </Button>
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as SettingsTab)} className="mt-5">
        <TabsList className="no-scrollbar mb-5">
          <TabsTrigger value="general">{t("tabs.general")}</TabsTrigger>
          <TabsTrigger value="reasons" count={Object.keys(db.rejectReasons).length}>
            {t("tabs.reasons")}
          </TabsTrigger>
          <TabsTrigger value="emails" count={editedTemplates}>
            {t("tabs.emails")}
          </TabsTrigger>
          <TabsTrigger value="history" count={historyCount}>
            {t("tabs.history")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="general" className="outline-none">
          <GeneralTab draft={draft} patch={patch} issues={issues} />
        </TabsContent>
        <TabsContent value="reasons" className="outline-none">
          <ReasonsTab />
        </TabsContent>
        <TabsContent value="emails" className="outline-none">
          <TemplatesTab />
        </TabsContent>
        <TabsContent value="history" className="outline-none">
          <HistoryTab />
        </TabsContent>
      </Tabs>

      {dirty && (
        <div className="sticky bottom-4 z-20 mt-6" data-save-bar>
          <div className="anim-pop flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl bg-surface px-4 py-3 shadow-pop ring-1 ring-line sm:px-5">
            <span className="relative flex size-2.5 shrink-0">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-40" />
              <span className="relative inline-flex size-2.5 rounded-full bg-accent" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{ts("unsaved")}</p>
              {serverError ? (
                <p role="alert" className="text-xs font-medium text-rose-700">
                  {serverError}
                </p>
              ) : issues.length ? (
                <p className="text-xs font-medium text-rose-700" data-fix-first>
                  {ts("fixFirst", { count: issues.length, n: fmt.number(issues.length) })}
                </p>
              ) : (
                <p className="text-xs text-ink-3">{ts("unsavedHint")}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={discard} disabled={saving}>
                {ts("discard")}
              </Button>
              <Button variant="primary" onClick={() => void save()} disabled={saving || stale || issues.length > 0}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                {saving ? ts("saving") : ts("save")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
