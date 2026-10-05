"use client";

import {
  ChartColumn,
  ClipboardList,
  Eye,
  FlaskConical,
  Inbox,
  LayoutGrid,
  Mail,
  PanelLeftClose,
  PanelLeftOpen,
  ScanSearch,
  Settings2,
  ShieldBan,
  Users,
  UsersRound,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { DirIcon } from "@/components/ui/DirIcon";
import { Tooltip } from "@/components/ui/Tooltip";
import { visibleRequestsFor } from "@/domain/queue";
import { OPEN_STATUSES } from "@/domain/status";
import type { Permission } from "@/domain/types";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { useAppStore, useDb } from "@/store/app";
import { useViewer } from "@/store/useViewer";

type NavKey =
  | "dashboard" | "queue" | "attendees" | "matchReview" | "blacklist" | "watchlist"
  | "teams" | "workflows" | "registrations" | "reports" | "settings" | "simulate" | "outbox";

interface NavItem {
  key: NavKey;
  href: string;
  icon: LucideIcon;
  requires?: Permission[]; // any of
}

const GROUPS: { key: "operate" | "screening" | "configure" | "insights" | "prototype"; items: NavItem[] }[] = [
  {
    key: "operate",
    items: [
      { key: "dashboard", href: "/dashboard", icon: LayoutGrid, requires: ["reports.view"] },
      { key: "queue", href: "/queue", icon: Inbox, requires: ["queue.access", "queue.reviewAll"] },
      { key: "attendees", href: "/attendees", icon: Users, requires: ["queue.reviewAll", "reports.view"] },
    ],
  },
  {
    key: "screening",
    items: [
      { key: "matchReview", href: "/screening/matches", icon: ScanSearch, requires: ["blacklist.view"] },
      { key: "blacklist", href: "/screening/blacklist", icon: ShieldBan, requires: ["blacklist.view"] },
      { key: "watchlist", href: "/screening/watchlist", icon: Eye, requires: ["watchlist.view"] },
    ],
  },
  {
    key: "configure",
    items: [
      { key: "teams", href: "/teams", icon: UsersRound, requires: ["teams.view", "teams.edit"] },
      { key: "workflows", href: "/workflows", icon: Workflow, requires: ["workflows.view", "workflows.edit"] },
      { key: "registrations", href: "/registrations", icon: ClipboardList, requires: ["registration.vettingSettings"] },
    ],
  },
  {
    key: "insights",
    items: [
      { key: "reports", href: "/reports", icon: ChartColumn, requires: ["reports.view"] },
      { key: "settings", href: "/settings", icon: Settings2, requires: ["registration.vettingSettings"] },
    ],
  },
  {
    key: "prototype",
    items: [
      { key: "simulate", href: "/dev/simulate", icon: FlaskConical },
      { key: "outbox", href: "/dev/outbox", icon: Mail },
    ],
  },
];

function useNavCounts(): Partial<Record<NavKey, number>> {
  const db = useDb();
  const viewer = useViewer();
  const eventScope = useAppStore((s) => s.eventScope);
  return useMemo(() => {
    const open = visibleRequestsFor(db, viewer.id, eventScope).filter((r) => OPEN_STATUSES.includes(r.status));
    const held = Object.values(db.requests).filter(
      (r) => r.status === "screening_hold" && (eventScope === "all" || r.eventId === eventScope),
    );
    const pendingEntries = Object.values(db.blacklist).filter((b) => b.status === "pending_approval");
    return {
      queue: open.length,
      matchReview: held.length,
      blacklist: pendingEntries.length,
    };
  }, [db, viewer.id, eventScope]);
}

export function Sidebar() {
  const t = useTranslations("navigation");
  const tApp = useTranslations("app");
  const pathname = usePathname();
  const viewer = useViewer();
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggle = useAppStore((s) => s.toggleSidebar);
  const counts = useNavCounts();

  const countTone: Partial<Record<NavKey, string>> = {
    queue: "bg-indigo-100 text-indigo-700",
    matchReview: "bg-red-100 text-red-700",
    blacklist: "bg-amber-100 text-amber-800",
  };

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-e border-nav-line bg-nav text-nav-text transition-[width] duration-150",
        collapsed ? "w-16" : "w-64",
      )}
    >
      <div className={cn("flex h-16 items-center gap-3", collapsed ? "justify-center" : "px-5")}>
        <LogoMark />
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <p className="text-[15px] font-bold tracking-tight text-nav-strong">{tApp("name")}</p>
            <p className="truncate text-2xs text-nav-muted">{tApp("workspace")}</p>
          </div>
        )}
      </div>

      <nav aria-label={t("mainNavigation")} className="flex-1 overflow-y-auto px-3 pt-2 pb-3">
        {GROUPS.map((group) => {
          const items = group.items.filter((i) => !i.requires || i.requires.some((p) => viewer.can(p)));
          if (!items.length) return null;
          return (
            <div key={group.key} className="mb-5">
              {!collapsed ? (
                <p className="eyebrow px-3 pb-2 !text-nav-muted">{t(`groups.${group.key}`)}</p>
              ) : (
                <div className="mx-3 mb-3 h-px bg-nav-line" />
              )}
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`) ||
                    (item.key === "queue" && pathname.startsWith("/requests"));
                  const count = counts[item.key];
                  const link = (
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex h-9 items-center gap-3 rounded-lg text-[13.5px] transition-colors",
                        collapsed ? "justify-center" : "px-3",
                        active ? "bg-nav-active font-semibold text-accent-text" : "hover:bg-nav-hover hover:text-nav-strong",
                      )}
                    >
                      {active && <span aria-hidden className="absolute inset-y-2 start-0 w-[3px] rounded-full bg-accent" />}
                      <item.icon
                        className={cn("size-[18px] shrink-0", active ? "text-accent" : "text-nav-muted group-hover:text-nav-text")}
                        strokeWidth={1.75}
                      />
                      {!collapsed && <span className="flex-1 truncate">{t(item.key)}</span>}
                      {!collapsed && count !== undefined && count > 0 && (
                        <span
                          className={cn(
                            "tabular inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-2xs font-semibold",
                            countTone[item.key] ?? "bg-hover text-nav-text",
                          )}
                        >
                          {count}
                        </span>
                      )}
                    </Link>
                  );
                  return (
                    <li key={item.key}>
                      {collapsed ? (
                        <Tooltip content={t(item.key)} side="right">
                          {link}
                        </Tooltip>
                      ) : (
                        link
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className={cn("border-t border-nav-line p-3", collapsed && "flex justify-center")}>
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? t("expand") : t("collapse")}
          className={cn(
            "flex h-9 items-center gap-3 rounded-lg text-[13px] text-nav-muted hover:bg-nav-hover hover:text-nav-strong",
            collapsed ? "w-9 justify-center" : "w-full px-3",
          )}
        >
          <DirIcon icon={collapsed ? PanelLeftOpen : PanelLeftClose} className="size-[18px]" strokeWidth={1.75} />
          {!collapsed && <span>{t("collapse")}</span>}
        </button>
      </div>
    </aside>
  );
}

function LogoMark() {
  return (
    <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
      <rect width="32" height="32" rx="9" fill="#4f46e5" />
            <path d="M10 11l6 10 6-10" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="22.5" cy="9.5" r="2.6" fill="#a5f3fc" />
    </svg>
  );
}
