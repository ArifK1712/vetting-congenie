"use client";

import { Gauge, History, ListPlus, Settings2, ShieldCheck, ShieldOff, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import type { SettingsDraft } from "@/domain/registrations";
import type { ID, RegistrationHistoryEvent } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { cn } from "@/lib/cn";
import { useNow } from "@/lib/useNow";
import { useDb } from "@/store/app";

const ACTION: Record<RegistrationHistoryEvent["action"], { icon: LucideIcon; tone: string }> = {
  vetting_enabled: { icon: ShieldCheck, tone: "bg-emerald-100 text-emerald-600" },
  vetting_disabled: { icon: ShieldOff, tone: "bg-slate-100 text-slate-600" },
  settings_saved: { icon: Settings2, tone: "bg-indigo-100 text-indigo-600" },
  question_added: { icon: ListPlus, tone: "bg-violet-100 text-violet-600" },
  limit_changed: { icon: Gauge, tone: "bg-amber-100 text-amber-700" },
};

const SETTING_KEYS: (keyof SettingsDraft)[] = [
  "enabled",
  "uncoveredBadgeBehaviour",
  "blacklistScreening",
  "blacklistMatchAction",
  "watchlistScreening",
  "rejectionTemplateId",
  "idFields",
  "vettingQuestions",
];

export function HistoryTab({ registrationId }: { registrationId: ID }) {
  const t = useTranslations("registrations.history");
  const fmt = useFormat();
  const db = useDb();
  const now = useNow();
  const reg = db.registrations[registrationId];

  const events = useMemo(
    () =>
      Object.values(db.registrationHistory ?? {})
        .filter((h) => h.registrationId === registrationId)
        .sort((a, b) => b.at.localeCompare(a.at)),
    [db, registrationId],
  );

  if (!events.length) {
    return (
      <div className="rounded-xl bg-surface shadow-card ring-1 ring-line">
        <EmptyState icon={History} title={t("empty")} body={t("emptyBody")} />
      </div>
    );
  }

  return (
    <ol className="overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-line">
      {events.map((h) => {
        const actor = db.users[h.actorId]?.name ?? t("unknownUser");
        const { icon: Icon, tone } = ACTION[h.action];
        const question = h.action === "question_added" ? reg?.questions.find((q) => q.id === h.changes[0]) : null;
        const keys = h.action === "question_added" ? [] : SETTING_KEYS.filter((k) => k !== "enabled" && h.changes.includes(k));
        return (
          <li key={h.id} className="flex gap-3.5 border-b border-line px-4 py-4 last:border-b-0 sm:px-6">
            <div className="relative shrink-0">
              <Avatar name={actor} size="md" />
              <span className={cn("absolute -end-1 -bottom-1 inline-flex size-5 items-center justify-center rounded-full ring-2 ring-surface", tone)}>
                <Icon className="size-3" />
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink-2">
                <span className="font-semibold text-ink">{actor}</span>{" "}
                {h.action === "question_added"
                  ? t("question_added", { question: `“${question ? fmt.text(question.label) : t("unknownQuestion")}”` })
                  : h.action === "limit_changed"
                    ? t("limit_changed", { from: fmt.number(Number(h.changes[0]?.split("→")[0])), to: fmt.number(Number(h.changes[0]?.split("→")[1])) })
                    : t(h.action)}
              </p>
              {h.action === "limit_changed" && h.changes[1] && (
                <p dir="auto" className="mt-1.5 rounded-md bg-subtle px-2.5 py-1.5 text-xs text-ink-2 ring-1 ring-line ring-inset">{h.changes[1]}</p>
              )}
              {keys.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {keys.map((k) => (
                    <li key={k} className="inline-flex h-6 items-center rounded-md bg-subtle px-2 text-xs font-medium text-ink-2 ring-1 ring-line ring-inset">
                      {t(`keys.${k}`)}
                    </li>
                  ))}
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
