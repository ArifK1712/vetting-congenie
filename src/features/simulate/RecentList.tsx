"use client";

import { ArrowRight, FlaskConical } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { DirIcon } from "@/components/ui/DirIcon";
import { EmptyState } from "@/components/ui/EmptyState";
import { BadgeTypeChip, Pill, StatusLabel } from "@/components/ui/Status";
import type { Database } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { useNow } from "@/lib/useNow";
import { CARD } from "./OutcomePanel";

const LIMIT = 12;

/** Attendees created from this page (submission key "sim-…"), newest first. */
export function RecentList({ db }: { db: Database }) {
  const t = useTranslations("simulate.recent");
  const fmt = useFormat();
  const now = useNow();
  const rows = useMemo(() => {
    const byAttendee = new Map(Object.values(db.requests).map((r) => [r.attendeeId, r]));
    return Object.values(db.attendees)
      .filter((a) => a.submissionKey?.startsWith("sim-"))
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
      .slice(0, LIMIT)
      .map((a) => ({ attendee: a, request: byAttendee.get(a.id) }));
  }, [db]);

  return (
    <section className={cn(CARD, "mt-6 overflow-hidden")} aria-labelledby="sim-recent-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-4">
        <div>
          <h2 id="sim-recent-title" className="text-base font-semibold text-ink">
            {t("title")}
          </h2>
          <p className="text-xs text-ink-3">{t("subtitle")}</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={FlaskConical} title={t("empty")} body={t("emptyBody")} />
      ) : (
        <>
          <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,0.9fr)] gap-4 bg-subtle px-5 py-2 text-xs font-semibold text-ink-3 lg:grid">
            <span>{t("name")}</span>
            <span>{t("registration")}</span>
            <span>{t("badge")}</span>
            <span>{t("outcome")}</span>
            <span>{t("request")}</span>
          </div>
          <ul className="divide-y divide-line" data-testid="sim-recent">
            {rows.map(({ attendee: a, request: r }) => {
              const reg = db.registrations[a.registrationId];
              const event = db.events[a.eventId];
              return (
                <li
                  key={a.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 px-5 py-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,0.9fr)] lg:items-center"
                >
                  <div className="min-w-0">
                    <p dir="auto" className="truncate text-sm font-semibold text-ink">
                      {a.profile.fullName}
                    </p>
                    <p className="text-xs text-ink-3">{fmt.ago(a.submittedAt, now)}</p>
                  </div>
                  <p className="col-span-2 min-w-0 truncate text-xs text-ink-2 lg:col-span-1 lg:text-sm">
                    <span className="ltr-data font-mono text-2xs text-ink-3">{event?.code}</span> {reg ? fmt.text(reg.name) : a.registrationId}
                  </p>
                  <div className="row-start-1 col-start-2 lg:col-start-auto lg:row-start-auto">
                    <BadgeTypeChip id={a.badgeTypeId} label={fmt.text(db.badgeTypes[a.badgeTypeId]?.name)} />
                  </div>
                  <div>{r ? <StatusLabel status={r.status} /> : <Pill tone="teal">{t("confirmed")}</Pill>}</div>
                  <div className="text-end lg:text-start">
                    {r ? (
                      <Link
                        href={`/requests/${r.id}`}
                        aria-label={t("open", { id: r.id })}
                        className="inline-flex items-center gap-1 text-sm font-semibold text-accent-text hover:underline"
                      >
                        <span className="ltr-data font-mono">{r.id}</span>
                        <DirIcon icon={ArrowRight} className="size-3.5" />
                      </Link>
                    ) : (
                      <span className="text-xs text-ink-3">{t("noRequest")}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
