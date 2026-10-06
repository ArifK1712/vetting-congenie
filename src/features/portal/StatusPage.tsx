"use client";

import { BadgeCheck, Check, CircleAlert, Clock, Download, FileQuestion, Info, Loader2, SearchX, ShieldX, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { BadgeBlock } from "@/domain/attendees";
import { attendeeView } from "@/domain/moreInfo";
import type { ID } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { useNow } from "@/lib/useNow";
import { attendeeService } from "@/services/attendees";
import { useDb } from "@/store/app";

/**
 * 13.3: the attendee's progress. Submitted → Under review → Decision, with
 * "Information required" only when needed. Never shows stages, teams,
 * reviewers or list matches; Screening Hold reads "Under review".
 */
export function StatusPage({ id }: { id: ID }) {
  const t = useTranslations("portal");
  const fmt = useFormat();
  const db = useDb();
  const now = useNow();
  const v = attendeeView(db, id, now);

  if (!v) {
    return (
      <div className="rounded-2xl bg-surface p-10 text-center shadow-card ring-1 ring-line">
        <SearchX className="mx-auto size-8 text-ink-3" />
        <p className="mt-3 text-base font-semibold text-ink">{t("notFound")}</p>
      </div>
    );
  }

  const decided = v.phase === "approved" || v.phase === "rejected" || v.phase === "withdrawn";
  const steps = [
    { key: "submitted", label: t("steps.submitted"), done: true, current: false, tone: "done" },
    {
      key: "review",
      label: v.phase === "info" ? t("steps.info") : t("steps.review"),
      done: decided,
      current: !decided,
      tone: v.phase === "info" ? "attention" : "active",
    },
    { key: "decision", label: t("steps.decision"), done: decided, current: false, tone: v.phase === "approved" ? "positive" : "done" },
  ] as const;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl bg-surface p-7 shadow-card ring-1 ring-line">
        <p className="text-sm font-medium text-accent-text">{fmt.text(v.event.name)}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">{t("statusTitle")}</h1>
        <p className="mt-1 text-sm text-ink-2">
          <bdi>{v.attendee.profile.fullName}</bdi> · <span className="ltr-data font-mono text-xs">{t("requestId", { id })}</span>
        </p>

        <ol className="mt-7 flex items-start">
          {steps.map((s, i) => (
            <li key={s.key} className="relative flex flex-1 flex-col items-center text-center">
              {i > 0 && <span aria-hidden className={cn("absolute top-4 end-1/2 h-0.5 w-full", steps[i].done || steps[i].current ? "bg-indigo-300" : "bg-line")} />}
              <span
                className={cn(
                  "relative z-[1] inline-flex size-8 items-center justify-center rounded-full ring-4 ring-surface",
                  s.done ? (s.tone === "positive" ? "bg-emerald-500 text-white" : "bg-accent text-white") : s.current ? (s.tone === "attention" ? "bg-amber-400 text-white" : "bg-indigo-100 text-accent-text") : "bg-hover text-ink-3",
                )}
              >
                {s.done ? <Check className="size-4" strokeWidth={3} /> : s.current ? (s.tone === "attention" ? <FileQuestion className="size-4" /> : <Clock className="size-4" />) : <span className="size-2 rounded-full bg-current" />}
              </span>
              <span className={cn("mt-2 text-sm", s.current ? "font-semibold text-ink" : s.done ? "text-ink" : "text-ink-3")}>{s.label}</span>
              {s.key === "submitted" && <span className="text-xs text-ink-3">{fmt.date(v.request.submittedAt)}</span>}
            </li>
          ))}
        </ol>

        <div
          className={cn(
            "mt-7 flex items-start gap-3 rounded-xl px-4 py-3.5 text-sm",
            v.phase === "approved" ? "bg-emerald-50 text-emerald-900" : v.phase === "info" ? "bg-amber-50 text-amber-900" : v.phase === "review" ? "bg-indigo-50 text-indigo-900" : "bg-subtle text-ink-2",
          )}
        >
          {v.phase === "approved" ? <BadgeCheck className="mt-0.5 size-5 shrink-0" /> : v.phase === "rejected" ? <XCircle className="mt-0.5 size-5 shrink-0" /> : <Info className="mt-0.5 size-5 shrink-0" />}
          <div>
            <p className="font-medium">{t(`phase.${v.phase}`)}</p>
            {v.badge && <p className="mt-1">{t(`badge.${v.badge}`)}</p>}
            {!decided && <p className="mt-1 text-xs opacity-80">{t("noBadgeYet")}</p>}
          </div>
        </div>

        {v.phase === "approved" && <BadgeDownload attendeeId={v.attendee.id} />}

        {v.info && (
          <div className="mt-4 rounded-xl px-4 py-4 ring-1 ring-amber-600/20">
            {v.info.state === "open" ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-ink-2">{t("provideBy", { date: fmt.full(v.info.tokenExpiresAt) })}</p>
                <Link href={`/portal/info/${v.info.token}`} className="inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-semibold text-white shadow-accent hover:bg-accent-hover">
                  {t("provide")}
                </Link>
              </div>
            ) : (
              <p className="flex items-start gap-2 text-sm text-ink-2">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
                {t("expiredContact")}
              </p>
            )}
          </div>
        )}
      </section>

      <dl className="grid gap-px overflow-hidden rounded-2xl bg-line shadow-card ring-1 ring-line sm:grid-cols-2">
        {[
          [t("details.event"), fmt.text(v.event.name)],
          [t("details.registration"), fmt.text(v.registration.name)],
          [t("details.badgeType"), fmt.text(v.badgeType.name)],
          [t("details.submitted"), fmt.full(v.request.submittedAt)],
        ].map(([label, value]) => (
          <div key={label} className="bg-surface px-5 py-4">
            <dt className="text-xs text-ink-3">{label}</dt>
            <dd className="mt-0.5 text-sm font-medium text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** 11.2: the attendee downloads their badge; the same gate as every other channel applies. */
function BadgeDownload({ attendeeId }: { attendeeId: ID }) {
  const t = useTranslations("portal.status");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: true } | { ok: false; reason: BadgeBlock } | null>(null);

  const download = async () => {
    setBusy(true);
    try {
      const r = await attendeeService.produceBadges({ attendeeIds: [attendeeId], channel: "download", actorId: "attendee" });
      if (r.ok) setResult(r.printed.length ? { ok: true } : { ok: false, reason: r.blocked[0]?.reason ?? "notApproved" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => void download()}
        disabled={busy}
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-white shadow-accent hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-70"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        {busy ? t("badgeDownloading") : t("badgeDownload")}
      </button>
      <div aria-live="polite" className="min-w-0 flex-1">
        {result?.ok === true && (
          <p data-badge-result="ok" className="flex items-start gap-2 text-sm text-emerald-700">
            <BadgeCheck className="mt-0.5 size-4 shrink-0" />
            {t("badgeDownloaded")}
          </p>
        )}
        {result?.ok === false && (
          <div data-badge-result="refused" role="alert" className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-800 ring-1 ring-rose-600/15 ring-inset">
            <ShieldX className="mt-0.5 size-4 shrink-0" />
            <span>
              <span className="block font-semibold">{t("badgeRefused")}</span>
              {t(`badgeRefusal.${result.reason}`)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
