"use client";

import * as Popover from "@radix-ui/react-popover";
import { AlarmClock, ArrowUpRight, BadgeX, Bell, CheckCheck, Eye, FilePlus2, Inbox, MessageSquareReply, ShieldAlert, ShieldBan, TriangleAlert, UserRoundCog, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { usePortalContainer } from "@/components/ui/portal";
import { alertsFor, isUnread, markAllRead, unreadCount, type Alert, type AlertKind } from "@/domain/notifications";
import { useFormat } from "@/i18n/format";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { useNow } from "@/lib/useNow";
import { useAppStore, useDb } from "@/store/app";
import { useViewer } from "@/store/useViewer";

const ICON: Record<AlertKind, { icon: LucideIcon; tone: string }> = {
  newRequest: { icon: Inbox, tone: "bg-sky-50 text-sky-600" },
  escalated: { icon: ArrowUpRight, tone: "bg-orange-50 text-orange-600" },
  assigned: { icon: UserRoundCog, tone: "bg-indigo-50 text-indigo-600" },
  answers: { icon: MessageSquareReply, tone: "bg-emerald-50 text-emerald-600" },
  late: { icon: AlarmClock, tone: "bg-amber-50 text-amber-600" },
  entryWaiting: { icon: ShieldBan, tone: "bg-amber-50 text-amber-700" },
  blacklistMatch: { icon: ShieldAlert, tone: "bg-rose-50 text-rose-600" },
  watchlistMatch: { icon: Eye, tone: "bg-amber-50 text-amber-600" },
  badgeSuspended: { icon: BadgeX, tone: "bg-rose-50 text-rose-600" },
  configError: { icon: TriangleAlert, tone: "bg-orange-50 text-orange-600" },
  newQuestion: { icon: FilePlus2, tone: "bg-violet-50 text-violet-600" },
};

/** The header bell: alerts for the current persona (spec 16, in-app). */
export function AlertsMenu() {
  const t = useTranslations("alerts");
  const fmt = useFormat();
  const db = useDb();
  const viewer = useViewer();
  const now = useNow();
  const container = usePortalContainer();
  const [open, setOpen] = useState(false);
  const alerts = useMemo(() => alertsFor(db, viewer.id, now), [db, viewer.id, now]);
  const unread = unreadCount(db, viewer.id, alerts);

  const text = (a: Alert) => {
    const team = a.teamId ? fmt.text(db.teams[a.teamId]?.name) : "";
    const name = a.actorId && a.actorId !== "system" && a.actorId !== "attendee" ? (db.users[a.actorId]?.name ?? "") : "";
    // IDs are Latin: isolate them so Arabic punctuation around them stays in place.
    const iso = (v?: string) => (v ? `⁨${v}⁩` : "");
    return t(`kinds.${a.kind}`, { id: iso(a.requestId), team, name: iso(name), entry: iso(a.entryId), count: a.count ?? 0, n: fmt.number(a.count ?? 0), registration: a.registrationId ? fmt.text(db.registrations[a.registrationId]?.name) : "" });
  };

  const markRead = () => {
    const current = useAppStore.getState().db;
    if (current) useAppStore.getState().setDb(markAllRead(current, viewer.id, Date.now()));
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={`${t("title")} · ${t("unread", { count: unread, n: fmt.number(unread) })}`}
        className="relative inline-flex size-9 items-center justify-center rounded-lg text-ink-2 outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Bell className="size-[18px]" strokeWidth={1.75} />
        {unread > 0 && (
          <span className="tabular absolute -end-0.5 -top-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-surface">
            {unread > 99 ? "99+" : fmt.number(unread)}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal container={container}>
        <Popover.Content align="end" sideOffset={8} collisionPadding={12} className="anim-pop z-50 w-[24rem] overflow-hidden rounded-xl border border-line bg-surface shadow-pop">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div>
              <p className="text-sm font-bold text-ink">{t("title")}</p>
              <p className="text-xs text-ink-3">{t("unread", { count: unread, n: fmt.number(unread) })}</p>
            </div>
            {unread > 0 && (
              <button type="button" onClick={markRead} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-accent-text hover:bg-accent-soft">
                <CheckCheck className="size-3.5" />
                {t("markAllRead")}
              </button>
            )}
          </div>
          {alerts.length ? (
            <ul className="max-h-[26rem] overflow-y-auto py-1">
              {alerts.map((a) => {
                const { icon: Icon, tone } = ICON[a.kind];
                const fresh = isUnread(db, viewer.id, a);
                return (
                  <li key={a.id}>
                    <Link
                      href={a.href}
                      onClick={() => setOpen(false)}
                      className={cn("flex items-start gap-3 px-4 py-2.5 outline-none hover:bg-subtle focus-visible:bg-subtle", fresh && "bg-indigo-50/40")}
                    >
                      <span className={cn("mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg", tone)}>
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-sm", fresh ? "font-semibold text-ink" : "text-ink-2")}>{text(a)}</span>
                        <span className="block text-xs text-ink-3">{fmt.ago(a.at, now)}</span>
                      </span>
                      {fresh && <span aria-hidden className="mt-2 size-2 shrink-0 rounded-full bg-accent" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-ink-3">{t("empty")}</p>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
