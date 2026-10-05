"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import type { LocalizedText } from "@/domain/types";
import { localeConfig } from "./locales";

const TIME_ZONE = "Asia/Riyadh";
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * All user-visible dates, numbers and durations go through this hook so that
 * Arabic gets Gregorian dates with Latin digits (see i18n/locales.ts).
 */
export function useFormat() {
  const locale = useLocale();
  const t = useTranslations("duration");
  const { intl, dir } = localeConfig[locale];

  return useMemo(() => {
    const dateFmt = new Intl.DateTimeFormat(intl, { dateStyle: "medium", timeZone: TIME_ZONE });
    const dateTimeFmt = new Intl.DateTimeFormat(intl, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: TIME_ZONE,
    });
    const fullFmt = new Intl.DateTimeFormat(intl, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: TIME_ZONE,
    });
    const numberFmt = new Intl.NumberFormat(intl);
    let regions: Intl.DisplayNames | null = null;
    try {
      regions = new Intl.DisplayNames([locale], { type: "region" });
    } catch {
      regions = null;
    }

    const duration = (ms: number) => {
      const abs = Math.max(0, ms);
      if (abs < MINUTE) return t("justNow");
      if (abs < HOUR) return t("minutes", { m: Math.floor(abs / MINUTE) });
      if (abs < DAY) {
        const h = Math.floor(abs / HOUR);
        const m = Math.floor((abs % HOUR) / MINUTE);
        return h < 6 && m > 0 ? t("hoursMinutes", { h, m }) : t("hours", { h });
      }
      return t("daysHours", { d: Math.floor(abs / DAY), h: Math.floor((abs % DAY) / HOUR) });
    };

    return {
      locale,
      dir,
      date: (iso: string) => dateFmt.format(new Date(iso)),
      dateTime: (iso: string) => dateTimeFmt.format(new Date(iso)),
      full: (iso: string) => fullFmt.format(new Date(iso)),
      /** Calendar date given as YYYY-MM-DD (no time zone shift). */
      day: (ymd: string) =>
        new Intl.DateTimeFormat(intl, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${ymd}T00:00:00Z`)),
      number: (n: number) => numberFmt.format(n),
      duration,
      ago: (iso: string, now: number) => {
        const ms = now - Date.parse(iso);
        return ms < MINUTE ? t("justNow") : t("ago", { time: duration(ms) });
      },
      country: (code: string) => regions?.of(code) ?? code,
      text: (value: LocalizedText | null | undefined) => (value ? value[locale] || value.en : ""),
    };
  }, [intl, dir, locale, t]);
}

export type Formatter = ReturnType<typeof useFormat>;
