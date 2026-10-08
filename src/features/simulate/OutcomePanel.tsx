"use client";

import {
  ArrowRight,
  Ban,
  CircleAlert,
  CopyCheck,
  ExternalLink,
  Eye,
  Mail,
  ScanSearch,
  SearchX,
  Send,
  ShieldAlert,
  ShieldBan,
  Sparkles,
  TriangleAlert,
  BadgeCheck,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { DirIcon } from "@/components/ui/DirIcon";
import { Pill, StatusPill } from "@/components/ui/Status";
import type { Tone } from "@/design/tones";
import type { IntakeResult } from "@/domain/intake";
import { badgeCoverage } from "@/domain/registrations";
import type { Database, ID } from "@/domain/types";
import { stageOf } from "@/domain/workflow";
import { useFormat } from "@/i18n/format";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

export const CARD = "rounded-xl bg-surface shadow-card ring-1 ring-line";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="min-w-0 text-end text-sm text-ink">{children}</dd>
    </div>
  );
}

const onOff = (on: boolean, label: string) => (
  <Pill tone={on ? "emerald" : "gray"}>{label}</Pill>
);

/** "What will happen": the registration's settings for the chosen badge type. */
export function PreviewCard({ db, registrationId, badgeTypeId }: { db: Database; registrationId: ID | null; badgeTypeId: ID | null }) {
  const t = useTranslations("simulate.preview");
  const fmt = useFormat();
  const settings = registrationId ? db.vettingSettings[registrationId] : undefined;
  const row = registrationId && badgeTypeId ? badgeCoverage(db, registrationId).find((c) => c.badgeTypeId === badgeTypeId) : undefined;

  let workflow: ReactNode = null;
  let expect: string | null = null;
  let tone = "sky" as "sky" | "orange" | "teal" | "amber";
  if (settings && row) {
    if (!settings.enabled) {
      workflow = <span className="text-ink-3">{t("notUsed")}</span>;
      expect = t("expect.vettingOff");
      tone = "teal";
    } else if (row.workflowId) {
      workflow = (
        <span dir="auto" className="font-medium">
          {t("workflowName", { name: fmt.text(db.workflows[row.workflowId].name), version: fmt.number(row.versionNo ?? 1) })}
        </span>
      );
      expect = t("expect.normal");
    } else if (row.behaviour === "noVetting") {
      workflow = <Pill tone="teal">{t("noVetting")}</Pill>;
      expect = t("expect.noVetting");
      tone = "teal";
    } else if (row.behaviour === "block") {
      workflow = <Pill tone="amber">{t("blocked")}</Pill>;
      expect = t("expect.blocked");
      tone = "amber";
    } else {
      workflow = <Pill tone="orange">{t("noWorkflow")}</Pill>;
      expect = t("expect.configurationError");
      tone = "orange";
    }
  }

  const banner: Record<typeof tone, string> = {
    sky: "bg-sky-50 text-sky-800 ring-sky-600/15",
    orange: "bg-orange-50 text-orange-800 ring-orange-600/20",
    teal: "bg-teal-50 text-teal-800 ring-teal-600/20",
    amber: "bg-amber-50 text-amber-800 ring-amber-600/20",
  };

  return (
    <section className={cn(CARD, "p-5")} aria-labelledby="sim-preview-title">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-700 ring-1 ring-violet-600/15 ring-inset">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 id="sim-preview-title" className="text-base font-semibold text-ink">
            {t("title")}
          </h2>
          <p className="text-xs text-ink-3">{t("subtitle")}</p>
        </div>
      </div>
      {!settings || !row ? (
        <p className="mt-4 text-sm text-ink-3">{t("pickFirst")}</p>
      ) : (
        <>
          <dl className="mt-3 divide-y divide-line">
            <Row label={t("vetting")}>{onOff(settings.enabled, settings.enabled ? t("on") : t("off"))}</Row>
            <Row label={t("workflow")}>{workflow}</Row>
            <Row label={t("blacklistScreening")}>{onOff(settings.enabled && settings.blacklistScreening, settings.enabled && settings.blacklistScreening ? t("on") : t("off"))}</Row>
            {settings.enabled && settings.blacklistScreening && <Row label={t("matchAction")}>{t(`actions.${settings.blacklistMatchAction}`)}</Row>}
            <Row label={t("watchlistScreening")}>{onOff(settings.enabled && settings.watchlistScreening, settings.enabled && settings.watchlistScreening ? t("on") : t("off"))}</Row>
          </dl>
          {expect && (
            <p className={cn("mt-3 flex gap-2 rounded-lg px-3 py-2.5 text-sm ring-1 ring-inset", banner[tone])}>
              <DirIcon icon={ArrowRight} className="mt-0.5 size-4 shrink-0" />
              <span>{expect}</span>
            </p>
          )}
        </>
      )}
    </section>
  );
}

// ─── Result ─────────────────────────────────────────────────────────────

export interface SimRun {
  /** When the run finished; tells two runs apart. */
  at: number;
  double: boolean;
  results: IntakeResult[];
  before: number;
  after: number;
}

type Key = Extract<IntakeResult, { ok: true }>["outcome"] | Extract<IntakeResult, { ok: false }>["error"];

const LOOK: Record<Key, { icon: LucideIcon; tone: Tone; tile: string; bar: string }> = {
  underReview: { icon: Send, tone: "sky", tile: "bg-sky-50 text-sky-700 ring-sky-600/20", bar: "bg-sky-500" },
  screeningHold: { icon: ShieldAlert, tone: "red", tile: "bg-red-50 text-red-700 ring-red-600/20", bar: "bg-red-500" },
  autoRejected: { icon: ShieldBan, tone: "rose", tile: "bg-rose-50 text-rose-700 ring-rose-600/20", bar: "bg-rose-500" },
  configurationError: { icon: TriangleAlert, tone: "orange", tile: "bg-orange-50 text-orange-700 ring-orange-600/20", bar: "bg-orange-500" },
  noVetting: { icon: BadgeCheck, tone: "teal", tile: "bg-teal-50 text-teal-700 ring-teal-600/20", bar: "bg-teal-500" },
  duplicate: { icon: CopyCheck, tone: "violet", tile: "bg-violet-50 text-violet-700 ring-violet-600/20", bar: "bg-violet-500" },
  blocked: { icon: Ban, tone: "amber", tile: "bg-amber-50 text-amber-800 ring-amber-600/20", bar: "bg-amber-500" },
  missing: { icon: CircleAlert, tone: "amber", tile: "bg-amber-50 text-amber-800 ring-amber-600/20", bar: "bg-amber-500" },
  notFound: { icon: SearchX, tone: "gray", tile: "bg-subtle text-ink-2 ring-line", bar: "bg-gray-400" },
  badBadgeType: { icon: SearchX, tone: "gray", tile: "bg-subtle text-ink-2 ring-line", bar: "bg-gray-400" },
};

const keyOf = (r: IntakeResult): Key => (r.ok ? r.outcome : r.error);

const linkBase = "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold shadow-xs transition-colors";
const linkClass = cn(linkBase, "bg-surface text-ink ring-1 ring-line-strong ring-inset hover:bg-subtle");

export function ResultCard({ db, run }: { db: Database; run: SimRun }) {
  const t = useTranslations("simulate.result");
  const tf = useTranslations("simulate.form");
  const ts = useTranslations("screening");
  const fmt = useFormat();
  // The submit that did the work; a lone duplicate is shown as it is.
  const main = run.results.find((r) => r.ok && r.outcome !== "duplicate") ?? run.results[0];
  const key = keyOf(main);
  const look = LOOK[key];
  const Icon = look.icon;
  const requestId = main.ok ? main.requestId : null;
  const request = requestId ? db.requests[requestId] : undefined;
  const attendee = main.ok ? db.attendees[main.attendeeId] : undefined;
  const version = request?.workflowVersionId ? db.workflowVersions[request.workflowVersionId] : undefined;
  const stage = version && request ? stageOf(version.graph, request.currentStageNodeId) : undefined;
  const team = request?.currentTeamId ? db.teams[request.currentTeamId] : undefined;
  const matches = requestId ? Object.values(db.matches).filter((m) => m.requestId === requestId) : [];
  const blacklistN = matches.filter((m) => m.listType === "blacklist").length;
  const watchlistN = matches.filter((m) => m.listType === "watchlist").length;
  const created = run.after - run.before;

  const ref = (chunks: ReactNode) => <span className="ltr-data font-mono font-semibold">{chunks}</span>;
  const id = requestId ?? "";
  let explain: ReactNode;
  switch (key) {
    case "underReview":
      explain = t.rich("explain.underReview", { id, ref, team: team ? fmt.text(team.name) : "—", stage: stage ? fmt.text(stage.name) : "—" });
      break;
    case "screeningHold":
    case "autoRejected":
    case "configurationError":
      explain = t.rich(`explain.${key}`, { id, ref });
      break;
    case "duplicate":
      explain = requestId ? t.rich("explain.duplicateOf", { id, ref }) : t("explain.duplicate");
      break;
    default:
      explain = t(`explain.${key}`);
  }
  const missingCount = !main.ok && main.error === "missing" ? (main.missing?.length ?? 0) : 0;

  return (
    <section
      className={cn(CARD, "anim-pop overflow-hidden")}
      aria-labelledby="sim-result-title"
      aria-live="polite"
      data-testid="sim-result"
      data-outcome={key}
      data-request-id={id}
      data-run={run.at}
    >
      <div aria-hidden className={cn("h-1", look.bar)} />
      <div className="p-5">
        <div className="flex items-start gap-3">
          <span className={cn("inline-flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset", look.tile)}>
            <Icon className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="eyebrow">{t("title")}</p>
            <h2 id="sim-result-title" className="text-lg font-semibold text-ink">
              {t(`outcomes.${key}`)}
            </h2>
          </div>
        </div>

        {run.double && (
          <div className={cn("mt-4 rounded-lg px-3.5 py-3 ring-1 ring-inset", created <= 1 ? "bg-emerald-50 ring-emerald-600/20" : "bg-rose-50 ring-rose-600/20")}>
            <p data-testid="sim-double" className={cn("text-sm font-bold", created <= 1 ? "text-emerald-800" : "text-rose-800")}>
              {t("double", { submits: fmt.number(2), count: created, n: fmt.number(created) })}
            </p>
            <ul className="mt-1.5 space-y-0.5 text-xs text-ink-2">
              {run.results.map((r, i) => (
                <li key={i} className="flex flex-wrap gap-x-1.5">
                  <span className="font-semibold">{t("doubleCall", { n: fmt.number(i + 1) })}:</span>
                  <span>{t(`outcomes.${keyOf(r)}`)}</span>
                  {r.ok && r.requestId && <span className="ltr-data font-mono">· {r.requestId}</span>}
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-xs text-ink-3">{t("requestsBefore", { before: fmt.number(run.before), after: fmt.number(run.after) })}</p>
          </div>
        )}

        {missingCount > 0 && <p className="mt-4 text-sm font-semibold text-amber-800">{tf("missingSummary", { count: missingCount, n: fmt.number(missingCount) })}</p>}
        <p className={cn("text-sm leading-relaxed text-ink-2", missingCount > 0 ? "mt-1" : "mt-4")}>{explain}</p>
        {request && watchlistN > 0 && request.status !== "screening_hold" && request.watchlistLevel && (
          <p className="mt-2 flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-600/20 ring-inset">
            <Eye className="mt-px size-3.5 shrink-0" />
            {t("watchNote", { level: ts(`level.${request.watchlistLevel}`) })}
          </p>
        )}

        {(request || attendee) && (
          <dl className="mt-4 divide-y divide-line border-t border-line">
            {attendee && (
              <Row label={t("applicant")}>
                <span dir="auto" className="font-medium">{attendee.profile.fullName}</span>
              </Row>
            )}
            {request && (
              <>
                <Row label={t("requestId")}>
                  <span className="ltr-data font-mono font-semibold">{request.id}</span>
                </Row>
                <Row label={t("status")}>
                  <StatusPill status={request.status} />
                </Row>
                <Row label={t("team")}>{team ? fmt.text(team.name) : t("none")}</Row>
                <Row label={t("stage")}>{stage ? fmt.text(stage.name) : t("none")}</Row>
                <Row label={t("blacklistMatches")}>
                  <Pill tone={blacklistN ? "red" : "gray"} dot={false}>{fmt.number(blacklistN)}</Pill>
                </Row>
                <Row label={t("watchlistMatches")}>
                  <Pill tone={watchlistN ? "amber" : "gray"} dot={false}>{fmt.number(watchlistN)}</Pill>
                </Row>
              </>
            )}
          </dl>
        )}

        {request && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/requests/${request.id}`} className={cn(linkBase, "bg-accent text-on-accent hover:bg-accent-hover")}>
              {t("openRequest")}
              <DirIcon icon={ArrowRight} className="size-3.5" />
            </Link>
            <Link href={`/portal/status/${request.id}`} target="_blank" rel="noopener" className={linkClass}>
              {t("statusPage")}
              <ExternalLink className="size-3.5 text-ink-3" />
              <span className="sr-only">{t("newTab")}</span>
            </Link>
            <Link href="/dev/outbox" className={linkClass}>
              <Mail className="size-3.5 text-ink-3" />
              {t("outbox")}
            </Link>
            {request.status === "screening_hold" && (
              <Link href="/screening/matches" className={cn(linkBase, "bg-red-50 text-red-700 ring-1 ring-red-600/20 ring-inset hover:bg-red-100")}>
                <ScanSearch className="size-3.5" />
                {t("matchReview")}
              </Link>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
