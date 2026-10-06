"use client";

import { ChevronRight, CircleCheck, ClipboardList, EyeOff, Fingerprint, Inbox, Lock, Search, SearchX, ShieldCheck, TriangleAlert, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { PAGE } from "@/design/layout";
import { Button } from "@/components/ui/Button";
import { DirIcon } from "@/components/ui/DirIcon";
import { EmptyState } from "@/components/ui/EmptyState";
import { SingleFilter } from "@/components/ui/FilterMenu";
import { BadgeTypeChip } from "@/components/ui/Status";
import { TONE, type Tone } from "@/design/tones";
import { registrationSummary } from "@/domain/registrations";
import type { Registration } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { useDb, useSession } from "@/store/app";
import { useViewer } from "@/store/useViewer";
import { inScope, VettingPill } from "./parts";

type VettingFilter = "all" | "on" | "off";

interface Row {
  reg: Registration;
  summary: ReturnType<typeof registrationSummary>;
}

function Metric({ icon: Icon, tone, label, value, hint, hintTone }: { icon: LucideIcon; tone: Tone; label: string; value: string; hint: string; hintTone?: "attention" | "violet" }) {
  return (
    <div className="flex items-start gap-3.5 bg-surface px-5 py-4">
      <span className={cn("mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl", TONE[tone].chip)}>
        <Icon className="size-[18px]" strokeWidth={2.1} />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-ink-2">{label}</p>
        <p className="tabular mt-0.5 text-2xl leading-tight font-bold tracking-tight text-ink">{value}</p>
        <p className={cn("mt-0.5 truncate text-xs", hintTone === "attention" ? "font-medium text-attention" : hintTone === "violet" ? "font-medium text-violet-700" : "text-ink-3")}>{hint}</p>
      </div>
    </div>
  );
}

/** Grid used by the header and every row once the list is wide enough. */
const GRID = "@[60rem]:grid @[60rem]:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_8.5rem_minmax(0,1.25fr)_minmax(0,1.25fr)_6.5rem] @[60rem]:items-center @[60rem]:gap-4";

export function RegistrationsListPage() {
  const t = useTranslations("registrations");
  const fmt = useFormat();
  const db = useDb();
  const viewer = useViewer();
  const scope = useSession((s) => s.eventScope);

  const [search, setSearch] = useState("");
  const [vetting, setVetting] = useState<VettingFilter>("all");

  const all = useMemo<Row[]>(
    () =>
      inScope(db, scope)
        .map((reg) => ({ reg, summary: registrationSummary(db, reg.id) }))
        .sort((a, b) => (db.events[a.reg.eventId]?.startsOn ?? "").localeCompare(db.events[b.reg.eventId]?.startsOn ?? "") || a.reg.name.en.localeCompare(b.reg.name.en)),
    [db, scope],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter(({ reg, summary }) => {
      if (vetting === "on" && !summary.enabled) return false;
      if (vetting === "off" && summary.enabled) return false;
      if (!q) return true;
      const ev = db.events[reg.eventId];
      return `${reg.name.en} ${reg.name.ar} ${ev?.name.en ?? ""} ${ev?.name.ar ?? ""} ${ev?.code ?? ""}`.toLowerCase().includes(q);
    });
  }, [all, search, vetting, db]);

  const totals = useMemo(() => {
    const on = all.filter((r) => r.summary.enabled).length;
    return {
      total: all.length,
      events: new Set(all.map((r) => r.reg.eventId)).size,
      on,
      off: all.length - on,
      attention: all.filter((r) => r.summary.uncovered > 0 || !r.summary.idsOk).length,
      hidden: all.reduce((s, r) => s + r.summary.newHidden, 0),
    };
  }, [all]);

  if (!viewer.can("registration.vettingSettings")) {
    return <EmptyState icon={Lock} title={t("noAccessTitle")} body={t("noAccessBody")} />;
  }

  const filtered = !!search || vetting !== "all";
  const reset = () => {
    setSearch("");
    setVetting("all");
  };

  return (
    <div className={cn(PAGE, "pb-12")}>
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-ink">{t("title")}</h1>
        <p className="mt-1.5 max-w-3xl text-sm text-ink-2">{t("subtitle")}</p>
      </div>

      <div className="mt-6 grid gap-px overflow-hidden rounded-xl bg-line shadow-card ring-1 ring-line sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={ClipboardList} tone="indigo" label={t("summary.registrations")} value={fmt.number(totals.total)} hint={t("summary.registrationsHint", { count: totals.events, n: fmt.number(totals.events) })} />
        <Metric icon={ShieldCheck} tone="emerald" label={t("summary.vettingOn")} value={fmt.number(totals.on)} hint={t("summary.vettingOnHint", { count: totals.off, n: fmt.number(totals.off) })} />
        <Metric
          icon={TriangleAlert}
          tone="amber"
          label={t("summary.attention")}
          value={fmt.number(totals.attention)}
          hint={totals.attention ? t("summary.attentionHint") : t("summary.attentionNone")}
          hintTone={totals.attention ? "attention" : undefined}
        />
        <Metric
          icon={EyeOff}
          tone="violet"
          label={t("summary.hidden")}
          value={fmt.number(totals.hidden)}
          hint={totals.hidden ? t("summary.hiddenHint") : t("summary.hiddenNone")}
          hintTone={totals.hidden ? "violet" : undefined}
        />
      </div>

      <section className="@container mt-5 overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-line">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3.5 sm:px-5">
          <label className="relative me-1 w-full max-w-72">
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
          <SingleFilter
            label={t("filters.vetting")}
            value={vetting}
            defaultValue="all"
            onChange={(v) => setVetting(v as VettingFilter)}
            options={[
              { value: "all", label: t("filters.any") },
              { value: "on", label: t("filters.on") },
              { value: "off", label: t("filters.off") },
            ]}
          />
          {filtered && (
            <Button size="sm" variant="ghost" onClick={reset}>
              {t("filters.reset")}
            </Button>
          )}
          <span className="tabular ms-auto text-xs text-ink-3">{t("showing", { shown: fmt.number(rows.length), total: fmt.number(all.length) })}</span>
        </div>

        {rows.length ? (
          <>
            <div className={cn("hidden border-y border-line bg-subtle px-5 @[60rem]:grid", GRID)}>
              {(["registration", "badgeTypes", "vetting", "coverage", "checks", "requests"] as const).map((c) => (
                <span key={c} className={cn("eyebrow flex h-10 items-center", c === "requests" && "justify-end")}>
                  {t(`columns.${c}`)}
                </span>
              ))}
            </div>
            <ul className="border-t border-line @[60rem]:border-t-0">
              {rows.map((r) => (
                <li key={r.reg.id} className="border-b border-line last:border-b-0">
                  <RegistrationRow row={r} />
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="border-t border-line">
            {filtered ? (
              <EmptyState icon={SearchX} title={t("empty.title")} body={t("empty.body")} action={<Button onClick={reset}>{t("filters.reset")}</Button>} />
            ) : (
              <EmptyState icon={Inbox} title={t("empty.scopeTitle")} body={t("empty.scopeBody")} />
            )}
          </div>
        )}
      </section>

      <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-3">
        <DirIcon icon={ChevronRight} className="size-3.5" />
        {t("footnote")}
      </p>
    </div>
  );
}

function RegistrationRow({ row: { reg, summary: s } }: { row: Row }) {
  const t = useTranslations("registrations");
  const fmt = useFormat();
  const db = useDb();
  const ev = db.events[reg.eventId];
  return (
    <Link
      href={`/registrations/${reg.id}`}
      className={cn("group flex flex-col gap-2.5 px-4 py-4 transition-colors outline-none hover:bg-subtle focus-visible:bg-subtle sm:px-5", GRID)}
    >
      {/* Registration */}
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink group-hover:text-accent-text">{fmt.text(reg.name)}</p>
          <p className="truncate text-xs text-ink-3">
            {fmt.text(ev?.name)} · <span className="ltr-data font-mono">{ev?.code}</span>
          </p>
        </div>
        <span className="@[60rem]:hidden">
          <VettingPill enabled={s.enabled} />
        </span>
      </div>

      {/* Badge types */}
      <div className="flex min-w-0 flex-wrap gap-1">
        {reg.badgeTypeIds.map((b) => (
          <BadgeTypeChip key={b} id={b} label={fmt.text(db.badgeTypes[b]?.name)} />
        ))}
      </div>

      {/* Vetting */}
      <div className="hidden @[60rem]:block">
        <VettingPill enabled={s.enabled} />
      </div>

      {/* Coverage */}
      <div className="min-w-0 text-xs">
        <p className="tabular font-medium text-ink">{t("coverage.covered", { count: s.badgeTypes, covered: fmt.number(s.covered), n: fmt.number(s.badgeTypes) })}</p>
        {s.uncovered > 0 ? (
          <p className="mt-0.5 inline-flex items-center gap-1 font-semibold text-attention">
            <TriangleAlert className="size-3" />
            {t("coverage.needsChoice", { count: s.uncovered, n: fmt.number(s.uncovered) })}
          </p>
        ) : s.noVetting + s.blocked > 0 ? (
          <p className="mt-0.5 text-ink-3">
            {[
              s.noVetting ? t("coverage.noVetting", { count: s.noVetting, n: fmt.number(s.noVetting) }) : null,
              s.blocked ? t("coverage.blocked", { count: s.blocked, n: fmt.number(s.blocked) }) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
      </div>

      {/* Checks */}
      <div className="flex min-w-0 flex-wrap gap-1.5">
        {s.idsOk ? (
          <span className="inline-flex h-[22px] items-center gap-1 rounded-full bg-emerald-50 px-2 text-xs font-medium text-emerald-700 ring-1 ring-emerald-600/20 ring-inset">
            <CircleCheck className="size-3.5" />
            {t("idsOk")}
          </span>
        ) : (
          <span className="inline-flex h-[22px] items-center gap-1 rounded-full bg-rose-50 px-2 text-xs font-medium text-rose-700 ring-1 ring-rose-600/15 ring-inset">
            <Fingerprint className="size-3.5" />
            {t("noStrongId")}
          </span>
        )}
        {s.newHidden > 0 && (
          <span className="inline-flex h-[22px] items-center gap-1 rounded-full bg-violet-50 px-2 text-xs font-medium text-violet-700 ring-1 ring-violet-600/15 ring-inset">
            <EyeOff className="size-3.5" />
            {t("newHidden", { count: s.newHidden, n: fmt.number(s.newHidden) })}
          </span>
        )}
      </div>

      {/* Requests */}
      <div className="flex items-center justify-between gap-2 @[60rem]:justify-end">
        <span className="tabular text-xs font-medium text-ink-2">{t("requests", { count: s.requests, n: fmt.number(s.requests) })}</span>
        <DirIcon icon={ChevronRight} className="size-4 text-ink-3 group-hover:text-accent-text @[60rem]:hidden" />
      </div>
    </Link>
  );
}

