"use client";

import {
  ChartColumn,
  ClipboardList,
  Eye,
  FlaskConical,
  Inbox,
  LayoutGrid,
  Mail,
  Palette,
  ScanSearch,
  Settings2,
  ShieldBan,
  SlidersHorizontal,
  Users,
  UsersRound,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { useLocale } from "next-intl";
import { useMemo } from "react";
import { reviewQueue } from "@/domain/matchReview";
import { visibleRequestsFor } from "@/domain/queue";
import { OPEN_STATUSES } from "@/domain/status";
import type { Permission } from "@/domain/types";
import { localeConfig } from "@/i18n/locales";
import type { Locale } from "@/i18n/routing";
import { usePathname } from "@/i18n/navigation";
import { stripLocale, useNav } from "@/lib/navProgress";
import { useDb, useSession } from "@/store/app";
import { useViewer } from "@/store/useViewer";

/**
 * The app's navigation, defined once. Every navigation style (sidebar, rails,
 * top menus, hybrid section menu, phone drawer) renders these groups, so
 * permissions, counts and the active page behave the same in every layout.
 */

export type NavKey =
  | "dashboard" | "queue" | "attendees" | "matchReview" | "blacklist" | "watchlist"
  | "teams" | "workflows" | "registrations" | "reports" | "settings" | "simulate" | "outbox"
  | "appearance";

export type NavGroupKey = "operate" | "screening" | "configure" | "insights" | "prototype";

interface NavItemDef {
  key: NavKey;
  href: string;
  icon: LucideIcon;
  requires?: Permission[]; // any of
}

const GROUPS: { key: NavGroupKey; icon: LucideIcon; items: NavItemDef[] }[] = [
  {
    key: "operate",
    icon: Inbox,
    items: [
      { key: "dashboard", href: "/dashboard", icon: LayoutGrid, requires: ["reports.view"] },
      { key: "queue", href: "/queue", icon: Inbox, requires: ["queue.access", "queue.reviewAll"] },
      { key: "attendees", href: "/attendees", icon: Users, requires: ["queue.reviewAll", "reports.view"] },
    ],
  },
  {
    key: "screening",
    icon: ScanSearch,
    items: [
      { key: "matchReview", href: "/screening/matches", icon: ScanSearch, requires: ["blacklist.view"] },
      { key: "blacklist", href: "/screening/blacklist", icon: ShieldBan, requires: ["blacklist.view"] },
      { key: "watchlist", href: "/screening/watchlist", icon: Eye, requires: ["watchlist.view"] },
    ],
  },
  {
    key: "configure",
    icon: SlidersHorizontal,
    items: [
      { key: "teams", href: "/teams", icon: UsersRound, requires: ["teams.view", "teams.edit"] },
      { key: "workflows", href: "/workflows", icon: Workflow, requires: ["workflows.view", "workflows.edit"] },
      { key: "registrations", href: "/registrations", icon: ClipboardList, requires: ["registration.vettingSettings"] },
    ],
  },
  {
    key: "insights",
    icon: ChartColumn,
    items: [
      { key: "reports", href: "/reports", icon: ChartColumn, requires: ["reports.view"] },
      { key: "settings", href: "/settings", icon: Settings2, requires: ["registration.vettingSettings"] },
    ],
  },
  {
    key: "prototype",
    icon: FlaskConical,
    items: [
      { key: "simulate", href: "/dev/simulate", icon: FlaskConical },
      { key: "outbox", href: "/dev/outbox", icon: Mail },
    ],
  },
];

/** Count badge colours (brand tints). */
export const COUNT_TONE: Partial<Record<NavKey, string>> = {
  queue: "bg-indigo-100 text-indigo-700",
  matchReview: "bg-red-100 text-red-700",
  blacklist: "bg-amber-100 text-amber-800",
};

export interface NavItem extends NavItemDef {
  active: boolean;
  count?: number;
}
export interface NavGroup {
  key: NavGroupKey;
  icon: LucideIcon;
  items: NavItem[];
  active: boolean;
}

function useNavCounts(): Partial<Record<NavKey, number>> {
  const db = useDb();
  const viewer = useViewer();
  const eventScope = useSession((s) => s.eventScope);
  return useMemo(() => {
    const open = visibleRequestsFor(db, viewer.id, eventScope).filter((r) => OPEN_STATUSES.includes(r.status));
    // Decisions waiting in Match Review (open blacklist matches on live requests).
    const held = reviewQueue(db, 0).filter((c) => eventScope === "all" || c.request.eventId === eventScope);
    const pendingEntries = Object.values(db.blacklist).filter((b) => b.status === "pending_approval" || !!b.pendingChange);
    return { queue: open.length, matchReview: held.length, blacklist: pendingEntries.length };
  }, [db, viewer.id, eventScope]);
}

/** The groups and items this person may open, with counts and the active page marked. */
export function useNavGroups(): NavGroup[] {
  const current = usePathname();
  // Highlight where we're going as soon as a page change starts.
  const target = useNav((s) => s.target);
  const pathname = target ? stripLocale(target) : current;
  const viewer = useViewer();
  const counts = useNavCounts();
  return useMemo(
    () =>
      GROUPS.map((g) => {
        const items = g.items
          .filter((i) => !i.requires || i.requires.some((p) => viewer.can(p)))
          .map((i) => ({
            ...i,
            active: pathname === i.href || pathname.startsWith(`${i.href}/`) || (i.key === "queue" && pathname.startsWith("/requests")),
            count: counts[i.key],
          }));
        return { key: g.key, icon: g.icon, items, active: items.some((i) => i.active) };
      }).filter((g) => g.items.length > 0),
    [pathname, viewer, counts],
  );
}

/** Tooltip side pointing away from a start-side rail (right in LTR, left in RTL). */
export function useEndSide(): "left" | "right" {
  const locale = useLocale() as Locale;
  return localeConfig[locale].dir === "rtl" ? "left" : "right";
}

/** The personal Appearance page: pinned to the bottom of the sidebar and drawer, open to everyone. */
export function useAppearanceItem(): NavItem {
  const current = usePathname();
  const target = useNav((s) => s.target);
  const pathname = target ? stripLocale(target) : current;
  return { key: "appearance", href: "/appearance", icon: Palette, active: pathname === "/appearance" || pathname.startsWith("/appearance/") };
}
