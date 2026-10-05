"use client";

import { Construction } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Link } from "@/i18n/navigation";

/** Stand-in for areas scheduled in later build steps. */
export type PlaceholderArea =
  | "dashboard" | "attendees" | "matchReview" | "blacklist" | "watchlist" | "teams"
  | "workflows" | "registrations" | "reports" | "settings" | "simulate" | "outbox";

export function Placeholder({ area }: { area: PlaceholderArea }) {
  const t = useTranslations("placeholder");
  const nav = useTranslations("navigation");
  return (
    <div className="mx-auto max-w-3xl px-8 pt-16">
      <EmptyState
        icon={Construction}
        title={t("title", { area: nav(area) })}
        body={t("body")}
        action={
          <Link href="/queue">
            <Button variant="secondary">{t("goToQueue")}</Button>
          </Link>
        }
      />
    </div>
  );
}
