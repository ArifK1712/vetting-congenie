"use client";

import { Bell, CalendarDays, ChevronDown, Globe, RotateCcw, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from "@/components/ui/Menu";
import { toast } from "@/components/ui/Toast";
import { Tooltip } from "@/components/ui/Tooltip";
import { useFormat } from "@/i18n/format";
import { localeConfig } from "@/i18n/locales";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { PERSONA_IDS } from "@/mocks/seed/reference";
import { useAppStore, useDb, useSession } from "@/store/app";
import { useViewer } from "@/store/useViewer";

export function Header() {
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-line bg-surface px-6">
      <EventScope />
      <HeaderSearch />
      <div className="ms-auto flex items-center gap-1">
        <LanguageMenu />
        <Tooltip content={<NotificationsLabel />}>
          <button type="button" className="relative inline-flex size-9 items-center justify-center rounded-lg text-ink-2 hover:bg-hover hover:text-ink">
            <Bell className="size-[18px]" strokeWidth={1.75} />
            <span aria-hidden className="absolute end-2 top-2 size-2 rounded-full bg-rose-500 ring-2 ring-surface" />
            <span className="sr-only"><NotificationsLabel /></span>
          </button>
        </Tooltip>
        <div className="mx-1.5 h-5 w-px bg-line" />
        <PersonaMenu />
      </div>
    </header>
  );
}

function NotificationsLabel() {
  const t = useTranslations("header");
  return <>{t("notifications")}</>;
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
      <MenuTrigger className="inline-flex h-9 max-w-80 items-center gap-2.5 rounded-lg bg-surface ps-1.5 pe-2.5 text-sm text-ink shadow-xs ring-1 ring-inset ring-line-strong outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent">
        <span className="inline-flex size-6 items-center justify-center rounded-md bg-indigo-50 text-indigo-600">
          <CalendarDays className="size-3.5 shrink-0" strokeWidth={2} />
        </span>
        <span className="truncate font-semibold">{current ? fmt.text(current.name) : t("allEvents")}</span>
        <ChevronDown className="size-3.5 shrink-0 text-ink-3" />
      </MenuTrigger>
      <MenuContent className="w-80">
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

function HeaderSearch() {
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
  };

  return (
    <form onSubmit={submit} role="search" className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
      <input
        ref={input}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t("search")}
        aria-label={t("search")}
        className="h-9 w-full rounded-lg border border-transparent bg-canvas ps-9 pe-9 text-sm text-ink outline-none transition-colors placeholder:text-ink-3 hover:border-line focus:border-accent focus:bg-surface focus:ring-4 focus:ring-accent/10"
      />
      <kbd className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 rounded-sm border border-line bg-surface px-1.5 font-mono text-2xs text-ink-3 shadow-xs">
        /
      </kbd>
    </form>
  );
}

export function LanguageMenu() {
  const t = useTranslations("header");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const change = (next: string) => {
    if (next === locale) return;
    const query = Object.fromEntries(params.entries());
    router.replace({ pathname, query }, { locale: next as Locale, scroll: false });
  };

  return (
    <Menu>
      <MenuTrigger
        aria-label={t("language")}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-ink-2 outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Globe className="size-4" strokeWidth={1.75} />
        <span>{localeConfig[locale].nativeName}</span>
      </MenuTrigger>
      <MenuContent align="end">
        <MenuLabel>{t("language")}</MenuLabel>
        <MenuRadioGroup value={locale} onValueChange={change}>
          {routing.locales.map((l) => (
            <MenuRadioItem key={l} value={l}>
              <span lang={l} dir={localeConfig[l].dir}>{localeConfig[l].nativeName}</span>
            </MenuRadioItem>
          ))}
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

  return (
    <Menu>
      <MenuTrigger className="inline-flex h-11 items-center gap-2.5 rounded-lg ps-1.5 pe-2.5 text-start outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent">
        <Avatar name={viewer.user.name} size="md" />
        <span className="hidden leading-tight sm:block">
          <span className="block text-[13px] font-semibold text-ink">{viewer.user.name}</span>
          <span className="block text-xs text-ink-3">{fmt.text(viewer.role.name)}</span>
        </span>
        <ChevronDown className="size-3.5 text-ink-3" />
      </MenuTrigger>
      <MenuContent align="end" className="w-80">
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
