"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/Menu";
import { Tooltip } from "@/components/ui/Tooltip";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { COUNT_TONE, type NavGroup } from "./model";

/**
 * Navigation inside the header (second row), for the Top Navigation and
 * Hybrid presets. Tablet and desktop only; phones use the drawer.
 *  menus – each module opens a dropdown of its pages (Top Navigation)
 *  tabs  – each module is a tab; its pages are in the side rail (Hybrid)
 */
export function TopNav({ groups, variant, labels = "show" }: { groups: NavGroup[]; variant: "menus" | "tabs"; labels?: "show" | "tooltip" }) {
  const t = useTranslations("navigation");
  return (
    <nav aria-label={t("mainNavigation")} className="no-scrollbar flex h-11 items-stretch gap-1 overflow-x-auto px-3 sm:px-4 lg:px-6">
      {groups.map((g) => (variant === "menus" ? <GroupMenu key={g.key} group={g} labels={labels} /> : <GroupTab key={g.key} group={g} labels={labels} />))}
    </nav>
  );
}

const itemBase =
  "relative inline-flex shrink-0 items-center gap-2 px-3 text-[13.5px] whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent rounded-md";

function Underline({ on }: { on: boolean }) {
  return on ? <span aria-hidden className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent" /> : null;
}

function GroupMenu({ group, labels }: { group: NavGroup; labels: "show" | "tooltip" }) {
  const t = useTranslations("navigation");
  const router = useRouter();
  const name = t(`groups.${group.key}`);
  const total = group.items.reduce((n, i) => n + (i.count && COUNT_TONE[i.key] ? i.count : 0), 0);
  const trigger = (
    <MenuTrigger
      aria-label={labels === "show" ? undefined : name}
      className={cn(itemBase, group.active ? "font-semibold text-accent-text" : "text-nav-text hover:bg-nav-hover hover:text-nav-strong", "data-[state=open]:bg-nav-hover")}
    >
      <group.icon className={cn("size-4", group.active ? "text-accent" : "text-nav-muted")} strokeWidth={1.75} />
      {labels === "show" && <span>{name}</span>}
      {total > 0 && <span aria-hidden className="size-1.5 rounded-full bg-accent" />}
      <ChevronDown className="size-3.5 text-nav-muted" />
      <Underline on={group.active} />
    </MenuTrigger>
  );
  return (
    <Menu>
      {labels === "show" ? trigger : <Tooltip content={name} side="bottom">{trigger}</Tooltip>}
      <MenuContent className="w-60">
        <p className="eyebrow px-2 pt-1 pb-1.5">{name}</p>
        {group.items.map((item) => (
          <MenuItem key={item.key} onSelect={() => router.push(item.href)}>
            <item.icon className={cn("size-4", item.active ? "text-accent" : "text-ink-3")} strokeWidth={1.75} />
            <span className={cn("flex-1 truncate", item.active && "font-semibold text-accent-text")}>{t(item.key)}</span>
            {item.count !== undefined && item.count > 0 && (
              <span className={cn("tabular inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-2xs font-semibold", COUNT_TONE[item.key] ?? "bg-hover text-ink-2")}>
                {item.count}
              </span>
            )}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

function GroupTab({ group, labels }: { group: NavGroup; labels: "show" | "tooltip" }) {
  const t = useTranslations("navigation");
  const name = t(`groups.${group.key}`);
  // A tab opens the module's first page (or stays put if we're already in it).
  const href = (group.items.find((i) => i.active) ?? group.items[0]).href;
  const link = (
    <Link
      href={href}
      aria-current={group.active ? "true" : undefined}
      aria-label={labels === "show" ? undefined : name}
      className={cn(itemBase, group.active ? "font-semibold text-accent-text" : "text-nav-text hover:bg-nav-hover hover:text-nav-strong")}
    >
      <group.icon className={cn("size-4", group.active ? "text-accent" : "text-nav-muted")} strokeWidth={1.75} />
      {labels === "show" && <span>{name}</span>}
      <Underline on={group.active} />
    </Link>
  );
  return labels === "show" ? link : <Tooltip content={name} side="bottom">{link}</Tooltip>;
}
