"use client";

import { useTranslations } from "next-intl";
import { Tooltip } from "@/components/ui/Tooltip";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { COUNT_TONE, useEndSide, type NavGroup, type NavItem } from "./model";

/**
 * The list of navigation links, in three looks:
 *  full  – icon, name and count, with group titles
 *  icons – icon only (name in a tooltip), a dot for counts
 *  mini  – icon with a small name underneath (or a tooltip when labels are hidden)
 */
export type NavListVariant = "full" | "icons" | "mini";

export function NavList({
  groups,
  variant,
  showTitles = true,
  labels = "show",
  className,
}: {
  groups: NavGroup[];
  variant: NavListVariant;
  showTitles?: boolean;
  labels?: "show" | "tooltip";
  className?: string;
}) {
  const t = useTranslations("navigation");
  return (
    <nav aria-label={t("mainNavigation")} className={cn("flex-1 overflow-y-auto", variant === "full" ? "px-3" : "px-2", "pt-2 pb-3", className)}>
      {groups.map((group, gi) => (
        <div key={group.key} className={variant === "full" ? "mb-5" : "mb-3"}>
          {showTitles &&
            (variant === "full" ? (
              <p className="eyebrow px-3 pb-2 !text-nav-muted">{t(`groups.${group.key}`)}</p>
            ) : gi > 0 ? (
              <div className="mx-2 mb-3 h-px bg-nav-line" />
            ) : null)}
          <ul className={variant === "mini" ? "space-y-1" : "space-y-0.5"}>
            {group.items.map((item) => (
              <li key={item.key}>
                <NavLink item={item} variant={variant} labels={labels} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function NavLink({ item, variant, labels = "show" }: { item: NavItem; variant: NavListVariant; labels?: "show" | "tooltip" }) {
  const t = useTranslations("navigation");
  const side = useEndSide();
  const name = t(item.key);
  const count = item.count && item.count > 0 ? item.count : 0;

  if (variant === "full") {
    return (
      <Link
        href={item.href}
        aria-current={item.active ? "page" : undefined}
        className={cn(
          "group relative flex h-9 items-center gap-3 rounded-lg px-3 text-[13.5px] transition-colors",
          item.active ? "bg-nav-active font-semibold text-accent-text" : "hover:bg-nav-hover hover:text-nav-strong",
        )}
      >
        {item.active && <span aria-hidden className="absolute inset-y-2 start-0 w-[3px] rounded-full bg-accent" />}
        <item.icon className={cn("size-[18px] shrink-0", item.active ? "text-accent" : "text-nav-muted group-hover:text-nav-text")} strokeWidth={1.75} />
        <span className="flex-1 truncate">{name}</span>
        {count > 0 && (
          <span className={cn("tabular inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-2xs font-semibold", COUNT_TONE[item.key] ?? "bg-hover text-nav-text")}>
            {count}
          </span>
        )}
      </Link>
    );
  }

  const mini = variant === "mini";
  const showLabel = mini && labels === "show";
  const link = (
    <Link
      href={item.href}
      aria-current={item.active ? "page" : undefined}
      aria-label={showLabel ? undefined : name}
      className={cn(
        "group relative flex items-center justify-center rounded-lg transition-colors",
        showLabel ? "min-h-14 flex-col gap-1 px-0.5 py-1.5" : "h-9",
        item.active ? "bg-nav-active text-accent-text" : "text-nav-muted hover:bg-nav-hover hover:text-nav-strong",
      )}
    >
      {item.active && <span aria-hidden className="absolute inset-y-2 start-0 w-[3px] rounded-full bg-accent" />}
      <item.icon className={cn("size-[18px] shrink-0", item.active ? "text-accent" : "group-hover:text-nav-text")} strokeWidth={1.75} />
      {showLabel && <span className={cn("line-clamp-2 w-full text-center text-[10.5px] leading-[1.15] break-words", item.active && "font-semibold")}>{name}</span>}
      {count > 0 && <span aria-hidden className={cn("absolute top-1.5 end-1.5 size-2 rounded-full ring-2 ring-nav", COUNT_TONE[item.key] ? "bg-accent" : "bg-nav-muted")} />}
    </Link>
  );
  return showLabel ? link : <Tooltip content={count > 0 ? `${name} · ${count}` : name} side={side}>{link}</Tooltip>;
}
