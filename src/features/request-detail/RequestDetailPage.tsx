"use client";

import { ChevronRight, ClipboardList, CornerDownLeft, ExternalLink, Eye, Gauge, Layers, RefreshCw, SearchX, ShieldAlert, UsersRound, Workflow, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { DirIcon } from "@/components/ui/DirIcon";
import { EmptyState } from "@/components/ui/EmptyState";
import { BadgeTypeChip, StatusPill } from "@/components/ui/Status";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { TONE, type Tone } from "@/design/tones";
import type { ID } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { useNow } from "@/lib/useNow";
import { wroteLocally } from "@/services/requests";
import { useAppStore } from "@/store/app";
import { RequestFlags } from "@/features/requests/parts";
import { FINAL_STATUSES } from "@/domain/status";
import { CorrectDialog } from "./CorrectDialog";
import { CommentsPanel, DecisionPanel, FactsPanel } from "./SidePanel";
import { AnswersTab, ApplicantTab, DocumentsTab, HistoryTab, MoreInfoTab, ProgressTab, ScreeningTab } from "./tabs";
import { useRequestView, type RequestView } from "./useRequestView";

function Bar({ tone, icon: Icon, children }: { tone: "danger" | "attention" | "accent"; icon: typeof ShieldAlert; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border px-4 py-3 text-sm",
        tone === "danger" && "border-danger/20 bg-danger-soft text-danger",
        tone === "attention" && "border-attention/20 bg-attention-soft text-attention",
        tone === "accent" && "border-accent/15 bg-accent-soft text-accent-text",
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Bars({ view }: { view: RequestView }) {
  const t = useTranslations("requestDetail.bars");
  const tl = useTranslations("screening.level");
  const { request } = view;
  const watch = view.matches.find((m) => m.listType === "watchlist" && m.status !== "cleared");
  const watchEntry = watch ? view.db.watchlist[watch.entryId] : null;
  const retro = view.matches.some((m) => m.listType === "blacklist" && m.stagePoint === "retro" && m.status === "open");

  const bars: ReactNode[] = [];
  if (view.seesBlacklist && request.status === "screening_hold") {
    bars.push(<Bar key="bl" tone="danger" icon={ShieldAlert}>{t("blacklist")}</Bar>);
  } else if (view.seesBlacklist && retro) {
    bars.push(<Bar key="retro" tone="danger" icon={ShieldAlert}>{t("blacklistRetro")}</Bar>);
  } else if (view.hasHiddenBlacklistHit) {
    bars.push(<Bar key="hit" tone="attention" icon={ShieldAlert}>{t("hit")}</Bar>);
  }
  if (watchEntry) {
    bars.push(
      <Bar key="wl" tone="attention" icon={Eye}>
        <span className="font-medium">{t("watchlist", { level: tl(watchEntry.level) })}</span>
        <span dir="auto" className="block text-ink-2">{watchEntry.reviewerNote}</span>
      </Bar>,
    );
  }
  if (request.awaitingCapacity) bars.push(<Bar key="cap" tone="attention" icon={Gauge}>{t("awaitingCapacity")}</Bar>);
  if (request.responseReceived && request.status === "pending_review") {
    bars.push(<Bar key="resp" tone="accent" icon={CornerDownLeft}>{t("responseReceived")}</Bar>);
  }
  return bars.length ? <div className="space-y-2">{bars}</div> : null;
}

export function RequestDetailPage({ id }: { id: ID }) {
  const t = useTranslations("requestDetail");
  const tc = useTranslations("common");
  const fmt = useFormat();
  const now = useNow();
  const view = useRequestView(id, now);

  // The revision this viewer has acknowledged. If someone else acts (another
  // tab, another persona), the stored revision moves ahead: actions lock and a
  // banner offers a reload, as in spec 13.1 / 8.3.
  const currentRevision = view?.request.revision ?? 0;
  const [seen, setSeen] = useState({ id, revision: currentRevision });
  const [correcting, setCorrecting] = useState<string | null>(null);
  if (seen.id !== id) setSeen({ id, revision: currentRevision });
  const stale = !!view && seen.id === id && currentRevision !== seen.revision && !wroteLocally(id, currentRevision);
  const acknowledge = () =>
    setSeen({ id, revision: useAppStore.getState().db?.requests[id]?.revision ?? currentRevision });

  if (!view) {
    return (
      <EmptyState
        icon={SearchX}
        title={t("notFound")}
        action={
          <Link href="/queue" className="text-sm text-accent-text hover:underline">
            {t("backToQueue")}
          </Link>
        }
      />
    );
  }

  const { request, applicant } = view;
  // Corrections only on an open request the viewer is up to date with.
  const canCorrect = !stale && !FINAL_STATUSES.includes(request.status);
  const stageName = view.stage ? fmt.text(view.stage.name) : null;

  return (
    <div className="mx-auto max-w-[88rem] px-4 pt-5 sm:px-6 lg:px-7 lg:pt-6 pb-16">
      <nav className="flex items-center gap-1.5 text-xs font-medium text-ink-3">
        <Link href="/queue" className="hover:text-accent-text">
          {t("backToQueue")}
        </Link>
        <DirIcon icon={ChevronRight} className="size-3.5" />
        <span className="ltr-data font-mono text-ink-2">{request.id}</span>
      </nav>

      <header className="mt-4 rounded-xl bg-surface p-6 shadow-card ring-1 ring-line">
        <div className="flex flex-wrap items-start gap-5">
          <Avatar name={applicant.fullName} size="xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="text-2xl font-bold tracking-tight text-ink">
                <bdi>{applicant.fullName}</bdi>
              </h1>
              <StatusPill status={view.status} />
              <BadgeTypeChip id={view.badgeType.id} label={fmt.text(view.badgeType.name)} />
            </div>
            {applicant.fullNameAr && (
              <p className="mt-0.5 text-sm text-ink-2">
                <span lang="ar" dir="rtl">{applicant.fullNameAr}</span>
              </p>
            )}
            <RequestFlags late={view.late} timeLimitHours={view.timeLimitHours} responseReceived={false} awaitingCapacity={false} />
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="ltr-data rounded-lg bg-subtle px-2.5 py-1 font-mono text-xs font-medium text-ink-2 ring-1 ring-line">{request.id}</span>
            <a href={`/${fmt.locale}/portal/status/${request.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-accent-text hover:underline">
              <ExternalLink className="size-3.5" />
              {t("attendeeView")}
            </a>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-5 md:grid-cols-4">
          <HeaderFact icon={ClipboardList} tone="sky" label={t("meta.registration")} value={fmt.text(view.registration.name)} />
          <HeaderFact
            icon={Workflow}
            tone="violet"
            label={t("meta.workflow")}
            value={view.workflow ? fmt.text(view.workflow.label) : "—"}
            hint={view.version ? tc("version", { n: view.version.versionNo }) : undefined}
          />
          <HeaderFact icon={Layers} tone="indigo" label={t("meta.stage")} value={stageName && !request.decidedAt ? stageName : "—"} />
          <HeaderFact icon={UsersRound} tone="teal" label={t("meta.team")} value={view.team && !request.decidedAt ? fmt.text(view.team.name) : "—"} />
        </dl>
      </header>

      {stale && <ChangedBanner view={view} now={now} onReload={acknowledge} />}

      <div className="mt-4">
        <Bars view={view} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <Tabs defaultValue="applicant" className="rounded-xl bg-surface px-6 pb-6 shadow-card ring-1 ring-line">
          <TabsList>
            <TabsTrigger value="applicant">{t("tabs.applicant")}</TabsTrigger>
            {applicant.answers.length > 0 && <TabsTrigger value="answers">{t("tabs.answers")}</TabsTrigger>}
            {applicant.documents.length > 0 && (
              <TabsTrigger value="documents" count={applicant.documents.length}>
                {t("tabs.documents")}
              </TabsTrigger>
            )}
            <TabsTrigger value="screening" count={view.matches.length}>
              {t("tabs.screening")}
            </TabsTrigger>
            <TabsTrigger value="progress">{t("tabs.progress")}</TabsTrigger>
            {applicant.moreInfoVisible && (
              <TabsTrigger value="moreInfo" count={view.infoRequests.length}>
                {t("tabs.moreInfo")}
              </TabsTrigger>
            )}
            <TabsTrigger value="history">{t("tabs.history")}</TabsTrigger>
          </TabsList>
          <div className="pt-2">
            <TabsContent value="applicant"><ApplicantTab view={view} onCorrect={canCorrect ? setCorrecting : undefined} /></TabsContent>
            <TabsContent value="answers"><AnswersTab view={view} onCorrect={canCorrect ? setCorrecting : undefined} /></TabsContent>
            <TabsContent value="documents"><DocumentsTab view={view} /></TabsContent>
            <TabsContent value="screening"><ScreeningTab view={view} /></TabsContent>
            <TabsContent value="progress"><ProgressTab view={view} now={now} /></TabsContent>
            <TabsContent value="moreInfo"><MoreInfoTab view={view} now={now} revision={currentRevision} canAct={!stale} /></TabsContent>
            <TabsContent value="history"><HistoryTab view={view} /></TabsContent>
          </div>
        </Tabs>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <DecisionPanel view={view} revision={stale ? seen.revision : currentRevision} stale={stale} onActed={acknowledge} />
          <FactsPanel view={view} now={now} />
          <CommentsPanel view={view} />
        </aside>
      </div>
      {correcting && (
        <CorrectDialog
          view={view}
          revision={currentRevision}
          field={correcting}
          onClose={() => setCorrecting(null)}
          onDone={() => {
            setCorrecting(null);
            acknowledge();
          }}
        />
      )}
    </div>
  );
}

function HeaderFact({
  icon: Icon,
  tone,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  tone: Tone;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-lg", TONE[tone].chip)}>
        <Icon className="size-4" strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <dt className="text-xs text-ink-3">{label}</dt>
        <dd className="truncate text-sm font-semibold text-ink">
          {value}
          {hint && <span className="ms-1.5 font-normal text-ink-3">{hint}</span>}
        </dd>
      </div>
    </div>
  );
}

function ChangedBanner({ view, now, onReload }: { view: RequestView; now: number; onReload: () => void }) {
  const t = useTranslations("actions.live");
  const fmt = useFormat();
  const latest = view.history.find((h) => h.actorId !== view.viewer.id);
  const actor = latest && latest.actorId !== "system" && latest.actorId !== "attendee" ? view.db.users[latest.actorId] : null;
  const time = latest ? fmt.ago(latest.at, now) : "";
  return (
    <div role="status" className="anim-pop mt-4 flex items-center gap-3 rounded-xl bg-indigo-50 px-4 py-3 text-sm text-indigo-800 ring-1 ring-indigo-200 ring-inset">
      <RefreshCw className="size-4 shrink-0" />
      <span className="flex-1">{actor ? t("changedBy", { name: actor.name, time }) : t("changed", { time })}</span>
      <Button size="sm" onClick={onReload}>
        {t("reload")}
      </Button>
    </div>
  );
}
