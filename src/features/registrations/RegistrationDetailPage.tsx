"use client";

import { CalendarDays, ChevronRight, CircleAlert, History, Inbox, Loader2, Lock, RefreshCw, SearchX, Tag, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PAGE } from "@/design/layout";
import { Button } from "@/components/ui/Button";
import { DirIcon } from "@/components/ui/DirIcon";
import { EmptyState } from "@/components/ui/EmptyState";
import { BadgeTypeChip } from "@/components/ui/Status";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { toast } from "@/components/ui/Toast";
import { blocking, draftOf, validateSettings, type SettingsDraft } from "@/domain/registrations";
import type { ID } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { useNow } from "@/lib/useNow";
import { registrationService, settingsWroteLocally } from "@/services/registrations";
import { useAppStore, useDb } from "@/store/app";
import { useViewer } from "@/store/useViewer";
import { HistoryTab } from "./HistoryTab";
import { DETAIL_TABS, issueTab, useIssueText, VettingPill, type DetailTab } from "./parts";
import { QuestionsTab } from "./QuestionsTab";
import { VettingTab } from "./VettingTab";

export type DraftPatch = (p: Partial<SettingsDraft>) => void;

const tabFrom = (v: string | null): DetailTab => (DETAIL_TABS.includes(v as DetailTab) ? (v as DetailTab) : "vetting");

export function RegistrationDetailPage({ id }: { id: ID }) {
  const t = useTranslations("registrations");
  const ts = useTranslations("registrations.save");
  const fmt = useFormat();
  const db = useDb();
  const viewer = useViewer();
  const now = useNow();
  const params = useSearchParams();
  const reg = db.registrations[id];
  const settings = db.vettingSettings[id];

  const [tab, setTabState] = useState<DetailTab>(() => tabFrom(params.get("tab")));
  const [initial, setInitial] = useState<SettingsDraft | null>(() => (settings ? draftOf(settings) : null));
  const [draft, setDraft] = useState<SettingsDraft | null>(initial);
  const [loadedRevision, setLoadedRevision] = useState(settings?.revision ?? 0);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Alerts link to ?tab=questions on the page that is already open.
  const urlTab = params.get("tab");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- follow the URL when it changes from outside (alert links)
    setTabState(tabFrom(urlTab));
  }, [urlTab]);

  const setTab = (next: DetailTab) => {
    setTabState(next);
    const url = new URL(window.location.href);
    if (next === "vetting") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(window.history.state, "", url);
  };

  const patch: DraftPatch = (p) => {
    setDraft((d) => (d ? { ...d, ...p } : d));
    setServerError(null);
  };

  const issues = useMemo(() => (draft ? validateSettings(db, id, draft, viewer.id) : []), [db, id, draft, viewer.id]);
  const errors = issues.filter((i) => i.severity === "error");
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(initial), [draft, initial]);
  const issueText = useIssueText();
  const historyCount = useMemo(() => Object.values(db.registrationHistory ?? {}).filter((h) => h.registrationId === id).length, [db, id]);
  const requests = useMemo(() => Object.values(db.requests).filter((r) => r.registrationId === id).length, [db, id]);

  const stale = !!settings && settings.revision !== loadedRevision && !settingsWroteLocally(id, settings.revision);

  if (!viewer.can("registration.vettingSettings")) {
    return <EmptyState icon={Lock} title={t("noAccessTitle")} body={t("noAccessBody")} />;
  }
  if (!reg || !settings || !draft || !initial) {
    return (
      <EmptyState
        icon={SearchX}
        title={t("detail.notFound")}
        action={
          <Link href="/registrations" className="text-sm text-accent-text hover:underline">
            {t("detail.back")}
          </Link>
        }
      />
    );
  }

  const ev = db.events[reg.eventId];
  const tabLabel = (x: DetailTab) => t(`detail.tabs.${x}`);

  const reloadLatest = () => {
    const latest = useAppStore.getState().db?.vettingSettings[id];
    if (!latest) return;
    const next = draftOf(latest);
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
    if (!dirty || blocking(issues) || stale) return;
    setSaving(true);
    setServerError(null);
    const r = await registrationService.saveSettings({ registrationId: id, draft, actorId: viewer.id, expectedRevision: loadedRevision });
    setSaving(false);
    if (r.ok) {
      const saved = r.db.vettingSettings[id];
      setInitial(draftOf(saved));
      setDraft(draftOf(saved));
      setLoadedRevision(saved.revision);
      toast(ts("saved"));
    } else {
      setServerError(ts(`errors.${r.error}`));
    }
  };

  const updatedBy = settings.updatedBy ? db.users[settings.updatedBy]?.name : null;

  return (
    <div className={cn(PAGE, dirty ? "pb-32" : "pb-12")}>
      <nav className="flex items-center gap-1.5 text-xs font-medium text-ink-3">
        <Link href="/registrations" className="hover:text-accent-text">
          {t("detail.back")}
        </Link>
        <DirIcon icon={ChevronRight} className="size-3.5" />
        <span className="truncate text-ink-2">{fmt.text(reg.name)}</span>
      </nav>

      <header className="mt-4 rounded-xl bg-surface p-5 shadow-card ring-1 ring-line sm:p-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-ink">{fmt.text(reg.name)}</h1>
          <VettingPill enabled={settings.enabled} size="md" />
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-3">
          <History className="size-3.5 shrink-0" />
          {settings.updatedAt && updatedBy ? t("detail.updated", { time: fmt.ago(settings.updatedAt, now), name: updatedBy }) : t("detail.neverUpdated")}
        </p>
        <dl className="mt-5 grid gap-x-6 gap-y-4 border-t border-line pt-4 sm:grid-cols-3">
          <Fact icon={CalendarDays} tone="bg-sky-100 text-sky-600" label={t("detail.event")}>
            {fmt.text(ev?.name)} · <span className="ltr-data font-mono text-ink-2">{ev?.code}</span>
          </Fact>
          <Fact icon={Tag} tone="bg-yellow-100 text-yellow-700" label={t("columns.badgeTypes")}>
            <span className="flex flex-wrap gap-1">
              {reg.badgeTypeIds.map((b) => (
                <BadgeTypeChip key={b} id={b} label={fmt.text(db.badgeTypes[b]?.name)} />
              ))}
            </span>
          </Fact>
          <Fact icon={Inbox} tone="bg-indigo-100 text-indigo-600" label={t("columns.requests")}>
            <span className="tabular">{t("detail.requests", { count: requests, n: fmt.number(requests) })}</span>
          </Fact>
        </dl>
      </header>

      {stale && (
        <div role="alert" className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-attention/20 bg-attention-soft px-4 py-3 text-sm text-attention">
          <RefreshCw className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">{ts("stale")}</span>
          <Button size="sm" onClick={reloadLatest}>
            {ts("loadLatest")}
          </Button>
        </div>
      )}

      {issues.length > 0 && (
        <div className="mt-5 overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-line" aria-live="polite">
          <ul aria-label={t("issues.title")} className="divide-y divide-line">
            {issues.map((i, n) => (
              <li
                key={`${i.code}:${i.badgeTypeId ?? i.field ?? n}`}
                className={cn("flex flex-wrap items-start gap-x-3 gap-y-1.5 px-4 py-3 text-sm sm:px-5", i.severity === "error" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800")}
              >
                {i.severity === "error" ? <CircleAlert className="mt-0.5 size-4 shrink-0" /> : <TriangleAlert className="mt-0.5 size-4 shrink-0" />}
                <span className="min-w-0 flex-1">{issueText(i)}</span>
                {tab !== issueTab(i) && (
                  <button type="button" onClick={() => setTab(issueTab(i))} className="inline-flex items-center gap-1 text-xs font-semibold underline-offset-2 hover:underline">
                    {t("issues.goTo", { tab: tabLabel(issueTab(i)) })}
                    <DirIcon icon={ChevronRight} className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as DetailTab)} className="mt-5">
        <TabsList className="mb-5">
          <TabsTrigger value="vetting">{tabLabel("vetting")}</TabsTrigger>
          <TabsTrigger value="questions" count={reg.questions.length}>
            {tabLabel("questions")}
          </TabsTrigger>
          <TabsTrigger value="history" count={historyCount}>
            {tabLabel("history")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="vetting" className="outline-none">
          <VettingTab reg={reg} draft={draft} saved={settings} patch={patch} issues={issues} />
        </TabsContent>
        <TabsContent value="questions" className="outline-none">
          <QuestionsTab reg={reg} draft={draft} patch={patch} issues={issues} openVetting={() => setTab("vetting")} />
        </TabsContent>
        <TabsContent value="history" className="outline-none">
          <HistoryTab registrationId={id} />
        </TabsContent>
      </Tabs>

      {dirty && (
        <div className="sticky bottom-4 z-20 mt-6">
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
              ) : errors.length ? (
                <p className="text-xs font-medium text-rose-700">{ts("fixFirst", { count: errors.length, n: fmt.number(errors.length) })}</p>
              ) : (
                <p className="text-xs text-ink-3">{ts("unsavedHint")}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={discard} disabled={saving}>
                {ts("discard")}
              </Button>
              <Button variant="primary" onClick={() => void save()} disabled={saving || stale || errors.length > 0}>
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

function Fact({ icon: Icon, tone, label, children }: { icon: typeof Tag; tone: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-lg", tone)}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <dt className="text-xs font-semibold text-ink-3">{label}</dt>
        <dd className="mt-0.5 text-sm font-medium text-ink">{children}</dd>
      </div>
    </div>
  );
}
