"use client";

import { ExternalLink, Inbox, Mail, Search, UserRound, UsersRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { SingleFilter } from "@/components/ui/FilterMenu";
import type { EmailOutboxItem } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { useDb } from "@/store/app";

const TEMPLATES = ["more_info", "more_info_reminder", "approved", "rejected", "watchlist_match", "blacklist_entry_waiting", "blacklist_match", "badge_suspended"] as const;
type Template = (typeof TEMPLATES)[number];
const known = (t: string): t is Template => (TEMPLATES as readonly string[]).includes(t);

/** Where the email's button leads: the attendee portal for attendees, the app for staff. */
function linkOf(m: EmailOutboxItem): string | null {
  switch (m.template) {
    case "more_info":
    case "more_info_reminder":
      return m.params.token ? `/portal/info/${m.params.token}` : null;
    case "approved":
    case "rejected":
      return m.requestId ? `/portal/status/${m.requestId}` : null;
    case "blacklist_entry_waiting":
      return m.params.entry ? `/screening/blacklist/${m.params.entry}` : null;
    case "blacklist_match":
    case "badge_suspended":
      return "/screening/matches";
    default:
      return m.requestId ? `/requests/${m.requestId}` : null;
  }
}

export function OutboxPage() {
  const t = useTranslations("outbox");
  const fmt = useFormat();
  const db = useDb();
  const [search, setSearch] = useState("");
  const [audience, setAudience] = useState("all");
  const [template, setTemplate] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);

  const staff = useMemo(() => new Set(Object.values(db.users).map((u) => u.email.toLowerCase())), [db]);
  const all = useMemo(() => Object.values(db.outbox).sort((a, b) => b.sentAt.localeCompare(a.sentAt)), [db]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((m) => {
      const isStaff = staff.has(m.to.toLowerCase());
      if (audience === "staff" && !isStaff) return false;
      if (audience === "attendee" && isStaff) return false;
      if (template !== "all" && m.template !== template) return false;
      return !q || m.to.toLowerCase().includes(q) || (m.requestId ?? "").toLowerCase().includes(q);
    });
  }, [all, search, audience, template, staff]);
  const current = rows.find((m) => m.id === selected) ?? rows[0];

  const name = (m: EmailOutboxItem) => (known(m.template) ? t(`templates.${m.template}.name`) : m.template);

  return (
    <div className="mx-auto max-w-[96rem] px-7 pt-7 pb-12">
      <h1 className="text-3xl font-bold tracking-tight text-ink">{t("title")}</h1>
      <p className="mt-1.5 text-sm text-ink-2">{t("subtitle")}</p>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <label className="relative w-full max-w-72">
          <span className="sr-only">{t("search")}</span>
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
          <input
            dir="auto"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("search")}
            className="h-8 w-full rounded-lg border border-line-strong bg-surface ps-8 pe-3 text-sm outline-none placeholder:text-ink-3 focus:border-accent focus:ring-4 focus:ring-accent/10"
          />
        </label>
        <SingleFilter label={t("audience")} value={audience} defaultValue="all" onChange={setAudience} options={(["all", "attendee", "staff"] as const).map((a) => ({ value: a, label: t(`audiences.${a}`) }))} />
        <SingleFilter label={t("template")} value={template} defaultValue="all" onChange={setTemplate} options={[{ value: "all", label: t("audiences.all") }, ...TEMPLATES.map((k) => ({ value: k, label: t(`templates.${k}.name`) }))]} />
        <span className="tabular ms-auto text-xs text-ink-3">{t("count", { shown: fmt.number(rows.length), total: fmt.number(all.length) })}</span>
      </div>

      {rows.length === 0 ? (
        <div className="mt-5 rounded-xl bg-surface shadow-card ring-1 ring-line">
          <EmptyState icon={Inbox} title={t("empty")} />
        </div>
      ) : (
        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[26rem_minmax(0,1fr)]">
          <ul className="max-h-[calc(100vh-15rem)] divide-y divide-line overflow-y-auto rounded-xl bg-surface shadow-card ring-1 ring-line">
            {rows.map((m) => {
              const on = m.id === current?.id;
              const isStaff = staff.has(m.to.toLowerCase());
              return (
                <li key={m.id}>
                  <button type="button" onClick={() => setSelected(m.id)} className={cn("flex w-full items-start gap-3 px-4 py-3 text-start outline-none hover:bg-subtle focus-visible:bg-subtle", on && "bg-accent-soft")}>
                    <span className={cn("mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg", isStaff ? "bg-violet-50 text-violet-600" : "bg-sky-50 text-sky-600")}>
                      {isStaff ? <UsersRound className="size-4" /> : <UserRound className="size-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{name(m)}</span>
                        <span className="tabular shrink-0 text-xs text-ink-3">{fmt.dateTime(m.sentAt)}</span>
                      </span>
                      <span className="ltr-data block truncate text-xs text-ink-2">{m.to}</span>
                      {m.requestId && <span className="block font-mono text-2xs text-ink-3">{m.requestId}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {current ? <Preview m={current} isStaff={staff.has(current.to.toLowerCase())} /> : <p className="text-sm text-ink-3">{t("select")}</p>}
        </div>
      )}
    </div>
  );
}

function Preview({ m, isStaff }: { m: EmailOutboxItem; isStaff: boolean }) {
  const t = useTranslations("outbox");
  const fmt = useFormat();
  const link = linkOf(m);
  const tpl = known(m.template) ? m.template : null;
  const params = {
    name: m.params.name ?? "",
    date: m.params.expires ? fmt.full(m.params.expires) : "",
    id: m.requestId ?? "",
    entry: m.params.entry ?? "",
    level: m.params.level ?? "",
  };
  const external = !isStaff;
  return (
    <article className="overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-line lg:sticky lg:top-4">
      <dl className="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 border-b border-line bg-subtle px-6 py-4 text-sm">
        <dt className="text-ink-3">{t("from")}</dt>
        <dd className="ltr-data text-ink">{t("sender")}</dd>
        <dt className="text-ink-3">{t("to")}</dt>
        <dd className="ltr-data text-ink">{m.to}</dd>
        <dt className="text-ink-3">{t("sent")}</dt>
        <dd className="text-ink">{fmt.full(m.sentAt)}</dd>
        {m.requestId && (
          <>
            <dt className="text-ink-3">{t("request")}</dt>
            <dd>
              <Link href={`/requests/${m.requestId}`} className="font-mono text-xs text-accent-text hover:underline">
                {m.requestId}
              </Link>
            </dd>
          </>
        )}
      </dl>
      <div className="px-8 py-7">
        <p className="flex items-center gap-2 text-xs font-semibold text-ink-3">
          <Mail className="size-3.5" />
          {tpl ? t(`templates.${tpl}.name`) : m.template}
        </p>
        <h2 className="mt-2 text-xl font-bold text-ink">{tpl ? t(`templates.${tpl}.subject`, params) : m.template}</h2>
        {tpl && <p className="mt-4 text-sm leading-relaxed text-ink-2">{t(`templates.${tpl}.body`, params)}</p>}
        {tpl === "approved" && <p className="mt-2 text-sm text-ink-2">{m.params.badge === "yes" ? t("templates.approved.badgeYes") : t("templates.approved.badgeLater")}</p>}
        {tpl && link && (
          external ? (
            <a href={`/${fmt.locale}${link}`} target="_blank" rel="noreferrer" className="mt-6 inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover">
              {t(`templates.${tpl}.button`)}
              <ExternalLink className="size-4" />
            </a>
          ) : (
            <Link href={link} className="mt-6 inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover">
              {t(`templates.${tpl}.button`)}
            </Link>
          )
        )}
      </div>
    </article>
  );
}
