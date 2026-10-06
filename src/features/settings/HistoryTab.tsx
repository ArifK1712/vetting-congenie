"use client";

import { History, Link2, ListChecks, Mail, ScanSearch, Send, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { TEMPLATE_PARAMS } from "@/domain/settings";
import type { SettingsHistoryEvent } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { cn } from "@/lib/cn";
import { useNow } from "@/lib/useNow";
import { useDb } from "@/store/app";

const AREA: Record<SettingsHistoryEvent["area"], { icon: LucideIcon; tone: string }> = {
  matching: { icon: ScanSearch, tone: "bg-violet-100 text-violet-600" },
  moreInfo: { icon: Link2, tone: "bg-amber-100 text-amber-700" },
  sender: { icon: Send, tone: "bg-sky-100 text-sky-600" },
  rejectReasons: { icon: ListChecks, tone: "bg-rose-100 text-rose-600" },
  emailTemplates: { icon: Mail, tone: "bg-indigo-100 text-indigo-600" },
};

const EVENTS = [
  "matching_changed",
  "moreInfo_changed",
  "sender_changed",
  "rejectReasons_added",
  "rejectReasons_changed",
  "rejectReasons_deactivated",
  "rejectReasons_reactivated",
  "rejectReasons_reordered",
  "emailTemplates_changed",
  "emailTemplates_reset",
] as const;
type EventKey = (typeof EVENTS)[number] | "other";
const KEYS = ["nameWithDob", "nameOnly", "linkDays", "reminderHours"] as const;
type TemplateKey = "submitted" | "more_info" | "more_info_reminder" | "approved" | "rejected" | "watchlist_match" | "blacklist_entry_waiting" | "blacklist_match" | "badge_suspended" | "configuration_error" | "new_question" | "report_scheduled";

export function HistoryTab() {
  const t = useTranslations("settings.history");
  const to = useTranslations("outbox.templates");
  const fmt = useFormat();
  const db = useDb();
  const now = useNow();

  const events = useMemo(() => Object.values(db.settingsHistory ?? {}).sort((a, b) => b.at.localeCompare(a.at)), [db]);

  if (!events.length) {
    return (
      <div className="rounded-xl bg-surface shadow-card ring-1 ring-line">
        <EmptyState icon={History} title={t("empty")} body={t("emptyBody")} />
      </div>
    );
  }

  /** One change line, worded where we know its shape. */
  const change = (h: SettingsHistoryEvent, c: string) => {
    if (h.area === "emailTemplates" && TEMPLATE_PARAMS[c]) return { text: to(`${c as TemplateKey}.name`), ltr: false };
    const m = /^(\w+): (.+) → (.+)$/.exec(c);
    if (m && (KEYS as readonly string[]).includes(m[1])) {
      const key = m[1] as (typeof KEYS)[number];
      const unit = key === "nameWithDob" || key === "nameOnly" ? " %" : "";
      return { text: `${t(`keys.${key}`)}: ${fmt.number(Number(m[2]))}${unit} → ${fmt.number(Number(m[3]))}${unit}`, ltr: false };
    }
    return { text: c, ltr: h.area === "sender" };
  };

  return (
    <ol className="overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-line" data-settings-history>
      {events.map((h) => {
        const actor = db.users[h.actorId]?.name ?? t("unknownUser");
        const { icon: Icon, tone } = AREA[h.area] ?? AREA.matching;
        const key = `${h.area}_${h.action}`;
        const ev: EventKey = (EVENTS as readonly string[]).includes(key) ? (key as EventKey) : "other";
        return (
          <li key={h.id} data-history-event={h.area} className="flex gap-3.5 border-b border-line px-4 py-4 last:border-b-0 sm:px-6">
            <div className="relative shrink-0">
              <Avatar name={actor} size="md" />
              <span className={cn("absolute -end-1 -bottom-1 inline-flex size-5 items-center justify-center rounded-full ring-2 ring-surface", tone)}>
                <Icon className="size-3" />
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2">
                <span>
                  <span className="font-semibold text-ink">{actor}</span> {t(`events.${ev}`)}
                </span>
                <span className={cn("inline-flex h-5 items-center rounded-md px-1.5 text-2xs font-semibold", tone)}>{t(`areas.${h.area}`)}</span>
              </p>
              {h.changes.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {h.changes.map((c, i) => {
                    const x = change(h, c);
                    return (
                      <li
                        key={`${c}-${i}`}
                        dir={x.ltr ? "ltr" : "auto"}
                        className={cn("inline-flex min-h-6 max-w-full items-center rounded-md bg-subtle px-2 py-0.5 text-xs font-medium break-all text-ink-2 ring-1 ring-line ring-inset", x.ltr && "ltr-data")}
                      >
                        {x.text}
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="mt-1.5 text-xs text-ink-3">
                <time dateTime={h.at} title={fmt.full(h.at)}>
                  {fmt.dateTime(h.at)}
                </time>{" "}
                · {fmt.ago(h.at, now)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
