"use client";

import { CalendarDays, ChevronDown, Menu as MenuIcon, Monitor, Moon, Palette, RotateCcw, Search, Sun, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from "@/components/ui/Menu";
import { toast } from "@/components/ui/Toast";
import { useFormat } from "@/i18n/format";
import { cn } from "@/lib/cn";
import { setThemePref, useThemePref, type ThemePref } from "@/lib/theme";
import { localeConfig } from "@/i18n/locales";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { PERSONA_IDS } from "@/mocks/seed/reference";
import { AlertsMenu } from "./AlertsMenu";
import { Brand } from "./nav/Brand";
import { useAppStore, useDb, useSession } from "@/store/app";
import { useViewer } from "@/store/useViewer";

/**
 * The top header. Layout presets without a start-side rail at the top pass
 * `brand` (the mark moves here) and `nav` (a second row with the main
 * navigation, shown from tablet width; phones always use the drawer).
 */
export function Header({ brand, nav }: { brand?: boolean; nav?: ReactNode }) {
  const t = useTranslations("header");
  const tNav = useTranslations("navigation");
  const setNavOpen = useSession((s) => s.setNavOpen);
  const [searching, setSearching] = useState(false);
  return (
    <header className="shrink-0 border-b border-line bg-surface">
    <div className="relative flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-4 md:h-16 lg:gap-4 lg:px-6">
      <button
        type="button"
        onClick={() => setNavOpen(true)}
        aria-label={tNav("open")}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-ink-2 hover:bg-hover hover:text-ink md:hidden"
      >
        <MenuIcon className="size-5" strokeWidth={1.75} />
      </button>
      {brand && (
        <>
          <Brand iconOnly className="hidden md:flex lg:hidden" />
          <Brand className="hidden shrink-0 lg:flex" />
          <div className="mx-1 hidden h-6 w-px bg-line md:block" />
        </>
      )}
      <EventScope />
      <div className="hidden min-w-0 flex-1 md:block md:max-w-md">
        <HeaderSearch />
      </div>
      <div className="ms-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
        <button
          type="button"
          onClick={() => setSearching(true)}
          aria-label={t("openSearch")}
          className="inline-flex size-9 items-center justify-center rounded-lg text-ink-2 hover:bg-hover hover:text-ink md:hidden"
        >
          <Search className="size-[18px]" strokeWidth={1.75} />
        </button>
        <LanguageSwitch className="me-0.5" />
        <ThemeMenu />
        <AlertsMenu />
        <div className="mx-1.5 hidden h-5 w-px bg-line sm:block" />
        <PersonaMenu />
      </div>
      {searching && (
        <div className="anim-fade absolute inset-0 z-20 flex items-center gap-2 bg-surface px-3 md:hidden">
          <div className="min-w-0 flex-1">
            <HeaderSearch autoFocus onDone={() => setSearching(false)} />
          </div>
          <button
            type="button"
            onClick={() => setSearching(false)}
            aria-label={t("closeSearch")}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-ink-2 hover:bg-hover hover:text-ink"
          >
            <X className="size-[18px]" strokeWidth={1.75} />
          </button>
        </div>
      )}
    </div>
    {nav && <div className="hidden border-t border-line md:block">{nav}</div>}
    </header>
  );
}

function EventScope() {
  const t = useTranslations("header");
  const db = useDb();
  const fmt = useFormat();
  const scope = useSession((s) => s.eventScope);
  const setScope = useSession((s) => s.setEventScope);
  const events = Object.values(db.events);
  const current = scope === "all" ? null : db.events[scope];
  return (
    <Menu>
      <MenuTrigger aria-label={t("eventScope")} className="inline-flex h-9 min-w-0 max-w-80 shrink items-center gap-2.5 rounded-lg bg-surface ps-1.5 pe-2.5 text-sm text-ink shadow-xs ring-1 ring-inset ring-line-strong outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent">
        <span className="inline-flex size-6 items-center justify-center rounded-md bg-indigo-50 text-indigo-600">
          <CalendarDays className="size-3.5 shrink-0" strokeWidth={2} />
        </span>
        <span className="hidden truncate font-semibold sm:inline">{current ? fmt.text(current.name) : t("allEvents")}</span>
        <ChevronDown className="size-3.5 shrink-0 text-ink-3" />
      </MenuTrigger>
      <MenuContent className="w-[min(20rem,calc(100vw-1.5rem))]">
        <MenuLabel>{t("eventScope")}</MenuLabel>
        <MenuRadioGroup value={scope} onValueChange={(v) => setScope(v)}>
          <MenuRadioItem value="all">{t("allEvents")}</MenuRadioItem>
          {events.map((e) => (
            <MenuRadioItem key={e.id} value={e.id}>
              <span className="min-w-0">
                <span className="block truncate">{fmt.text(e.name)}</span>
                <span className="block text-xs text-ink-3">
                  {fmt.text(e.venue)} · {fmt.day(e.startsOn)}
                </span>
              </span>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}

function HeaderSearch({ autoFocus, onDone }: { autoFocus?: boolean; onDone?: () => void }) {
  const t = useTranslations("header");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const urlQuery = pathname === "/queue" ? (params.get("q") ?? "") : null;
  const [value, setValue] = useState(urlQuery ?? "");
  const [prevQuery, setPrevQuery] = useState(urlQuery);
  if (urlQuery !== prevQuery) {
    setPrevQuery(urlQuery);
    if (urlQuery !== null) setValue(urlQuery);
  }
  const input = useRef<HTMLInputElement>(null);

  // "/" focuses search, a common pattern in operational tools.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA"].includes(target.tagName) && !target.isContentEditable) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    if (/^vr-\d+$/i.test(q)) router.push(`/requests/${q.toUpperCase()}`);
    else router.push(q ? { pathname: "/queue", query: { q } } : "/queue");
    onDone?.();
  };

  return (
    <form onSubmit={submit} role="search" className="relative w-full">
      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
      <input
        ref={input}
        autoFocus={autoFocus}
        onKeyDown={(e) => e.key === "Escape" && onDone?.()}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t("search")}
        aria-label={t("search")}
        className="h-9 w-full rounded-lg border border-transparent bg-canvas ps-9 pe-9 text-sm text-ink outline-none transition-colors placeholder:text-ink-3 hover:border-line focus:border-accent focus:bg-surface focus:ring-4 focus:ring-accent/10"
      />
      <kbd className="pointer-events-none absolute hidden md:block end-2.5 top-1/2 -translate-y-1/2 rounded-sm border border-line bg-surface px-1.5 font-mono text-2xs text-ink-3 shadow-xs">
        /
      </kbd>
    </form>
  );
}

/**
 * Two-option language toggle: one tap, both choices always visible, each
 * written in its own script. Keeps the current page and query.
 */
export function LanguageSwitch({ className }: { className?: string }) {
  const t = useTranslations("header");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const change = (next: Locale) => {
    if (next === locale) return;
    const query = Object.fromEntries(params.entries());
    router.replace({ pathname, query }, { locale: next, scroll: false });
  };

  return (
    <div role="radiogroup" aria-label={t("language")} className={cn("inline-flex h-8 items-center rounded-lg bg-canvas p-0.5 ring-1 ring-inset ring-line", className)}>
      {routing.locales.map((l) => {
        const on = l === locale;
        return (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={localeConfig[l].nativeName}
            title={localeConfig[l].nativeName}
            onClick={() => change(l)}
            lang={l}
            className={cn(
              "inline-flex h-7 min-w-9 items-center justify-center rounded-md px-2 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent",
              on ? "bg-surface font-bold text-ink shadow-xs ring-1 ring-line" : "font-medium text-ink-3 hover:text-ink",
            )}
          >
            {localeConfig[l].shortName}
          </button>
        );
      })}
    </div>
  );
}

const THEME_ICON = { light: Sun, dark: Moon, system: Monitor } as const;

export function ThemeMenu() {
  const t = useTranslations("header");
  const pref = useThemePref();
  const Icon = THEME_ICON[pref];
  return (
    <Menu>
      <MenuTrigger
        aria-label={`${t("theme")}: ${t(`themes.${pref}`)}`}
        className="inline-flex size-9 items-center justify-center rounded-lg text-ink-2 outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Icon className="size-[18px]" strokeWidth={1.75} />
      </MenuTrigger>
      <MenuContent align="end" className="w-44">
        <MenuLabel>{t("theme")}</MenuLabel>
        <MenuRadioGroup value={pref} onValueChange={(v) => setThemePref(v as ThemePref)}>
          {(["light", "dark", "system"] as const).map((k) => {
            const I = THEME_ICON[k];
            return (
              <MenuRadioItem key={k} value={k}>
                <span className="flex items-center gap-2.5">
                  <I className="size-4 text-ink-3" strokeWidth={1.75} />
                  {t(`themes.${k}`)}
                </span>
              </MenuRadioItem>
            );
          })}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}

function PersonaMenu() {
  const t = useTranslations("header");
  const db = useDb();
  const fmt = useFormat();
  const viewer = useViewer();
  const setPersona = useSession((s) => s.setPersona);
  const resetDemo = useAppStore((s) => s.resetDemo);
  const router = useRouter();

  return (
    <Menu>
      <MenuTrigger className="inline-flex h-11 items-center gap-2.5 rounded-lg ps-1 pe-1 sm:ps-1.5 sm:pe-2.5 text-start outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent">
        <Avatar name={viewer.user.name} size="md" />
        <span className="hidden leading-tight sm:block">
          <span className="block text-[13px] font-semibold text-ink">{viewer.user.name}</span>
          <span className="block text-xs text-ink-3">{fmt.text(viewer.role.name)}</span>
        </span>
        <ChevronDown className="hidden size-3.5 text-ink-3 sm:block" />
      </MenuTrigger>
      <MenuContent align="end" className="w-[min(20rem,calc(100vw-1.5rem))]">
        <MenuLabel>{t("viewingAs")}</MenuLabel>
        <p className="px-2 pb-2 text-xs text-ink-3">{t("personaHint")}</p>
        <MenuRadioGroup value={viewer.id} onValueChange={setPersona}>
          {PERSONA_IDS.map((id) => {
            const user = db.users[id];
            const role = db.roles[user.roleId];
            return (
              <MenuRadioItem key={id} value={id}>
                <span className="flex items-center gap-2.5">
                  <Avatar name={user.name} size="sm" />
                  <span className="min-w-0 leading-tight">
                    <span className="block truncate text-sm">{user.name}</span>
                    <span className="block truncate text-xs text-ink-3">
                      {fmt.text(role.name)} · {t("permissions", { count: role.permissions.length, n: role.permissions.length })}
                    </span>
                  </span>
                </span>
              </MenuRadioItem>
            );
          })}
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuItem onSelect={() => router.push("/appearance")}>
          <Palette className="size-4 text-ink-3" />
          {t("appearance")}
        </MenuItem>
        <MenuItem
          onSelect={() => {
            resetDemo();
            toast(t("resetDemoDone"));
          }}
        >
          <RotateCcw className="size-4 text-ink-3" />
          {t("resetDemo")}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
