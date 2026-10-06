"use client";

import { ShieldCheck, ShieldOff, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, type KeyboardEvent, type ReactNode } from "react";
import { Pill } from "@/components/ui/Status";
import { teamsSeeing, type SettingsIssue } from "@/domain/registrations";
import type { Database, FormQuestion, ID } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { cn } from "@/lib/cn";
import { useDb } from "@/store/app";

export type DetailTab = "vetting" | "questions" | "history";
export const DETAIL_TABS: DetailTab[] = ["vetting", "questions", "history"];

/** Which tab an issue is fixed on. */
export const issueTab = (i: SettingsIssue): DetailTab =>
  i.code === "noFullName" || i.code === "noStrongId" || i.code === "noDob" || i.code === "duplicateIdField" ? "questions" : "vetting";

export function VettingPill({ enabled, size = "sm" }: { enabled: boolean; size?: "sm" | "md" }) {
  const t = useTranslations("registrations");
  return (
    <Pill tone={enabled ? "emerald" : "slate"} size={size} dot={false}>
      {enabled ? <ShieldCheck className="size-3.5" /> : <ShieldOff className="size-3.5" />}
      {enabled ? t("vettingOn") : t("vettingOff")}
    </Pill>
  );
}

/** On/off switch with a label and hint; the whole row is the control. */
export function Switch({
  label,
  hint,
  checked,
  onChange,
  disabled,
  id,
}: {
  label: string;
  hint?: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-3 rounded-lg text-start outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed"
    >
      <SwitchTrack checked={checked} disabled={disabled} />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-ink-3">{hint}</span>}
      </span>
    </button>
  );
}

export function SwitchTrack({ checked, disabled }: { checked: boolean; disabled?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors",
        checked ? "bg-accent" : "bg-line-strong",
        disabled && "opacity-50",
      )}
    >
      <span className={cn("size-4 rounded-full bg-surface shadow-xs transition-transform", checked && "translate-x-4 rtl:-translate-x-4")} />
    </span>
  );
}

/** Compact switch without visible text (the label is for screen readers). */
export function MiniSwitch({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed"
    >
      <SwitchTrack checked={checked} disabled={disabled} />
    </button>
  );
}

/**
 * Radio choice shown as two or more cards. Unlike Segmented it allows "nothing
 * chosen yet" (a required choice), keeping the first option focusable.
 */
export function ChoiceCards<V extends string>({
  label,
  value,
  onChange,
  options,
  invalid,
  disabled,
  className,
}: {
  label: string;
  value: V | null;
  onChange: (v: V) => void;
  options: { value: V; label: string; hint?: string; icon?: LucideIcon; tone?: string; badge?: string }[];
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  const onKey = (e: KeyboardEvent) => {
    const keys = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
    const forward = e.key === "ArrowDown" || e.key === (rtl ? "ArrowLeft" : "ArrowRight");
    const i = Math.max(0, options.findIndex((o) => o.value === value));
    const next = options[(i + (forward ? 1 : options.length - 1)) % options.length];
    onChange(next.value);
    document.getElementById(`${id}-${next.value}`)?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} aria-invalid={invalid || undefined} onKeyDown={onKey} className={cn("grid gap-2 sm:grid-cols-2", className)}>
      {options.map((o, i) => {
        const selected = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            id={`${id}-${o.value}`}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            tabIndex={selected || (!value && i === 0) ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-start ring-1 transition-colors outline-none ring-inset focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60",
              selected ? (o.tone ?? "bg-accent-soft ring-indigo-300") : invalid ? "bg-surface ring-rose-300 hover:bg-subtle" : "bg-surface ring-line hover:bg-subtle",
            )}
          >
            <span
              className={cn(
                "mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                selected ? "border-accent bg-accent" : "border-line-strong bg-surface",
              )}
            >
              {selected && <span className="size-1.5 rounded-full bg-surface" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-start gap-1.5 text-sm font-medium text-ink">
                {Icon && <Icon className="mt-0.5 size-3.5 shrink-0 text-ink-3" />}
                <span className="min-w-0">
                  {o.label}
                  {o.badge && <span className="ms-1.5 inline-flex rounded-md bg-hover px-1.5 align-middle text-2xs font-semibold text-ink-2">{o.badge}</span>}
                </span>
              </span>
              {o.hint && <span className="mt-0.5 block text-xs text-ink-3">{o.hint}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Card section used on the Vetting and Form questions tabs. */
export function Card({
  id,
  icon: Icon,
  tone,
  title,
  subtitle,
  action,
  invalid,
  children,
}: {
  id?: string;
  icon: LucideIcon;
  tone: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  invalid?: boolean;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className={cn("scroll-mt-6 rounded-xl bg-surface shadow-card ring-1", invalid ? "ring-rose-200" : "ring-line")}>
      <header className="flex flex-wrap items-start gap-3.5 px-5 pt-5 pb-4 sm:px-6">
        <span className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-xl", tone)}>
          <Icon className="size-[18px]" strokeWidth={2.1} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={id ? `${id}-title` : undefined} className="text-base font-bold text-ink">
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 text-sm text-ink-2">{subtitle}</p>}
        </div>
        {action}
      </header>
      <div className="border-t border-line">{children}</div>
    </section>
  );
}

/** Text for a settings issue. */
export function useIssueText() {
  const t = useTranslations("registrations.issues");
  const tf = useTranslations("registrations.questions.fields");
  const db = useDb();
  const fmt = useFormat();
  return (i: SettingsIssue) =>
    t(i.code, {
      badgeType: i.badgeTypeId ? fmt.text(db.badgeTypes[i.badgeTypeId]?.name) : "",
      field: i.field ? tf(i.field) : "",
    });
}

/**
 * Teams that can see a question's answer. Standard questions use the team's
 * profile field access (the name is always visible to teams with the registration).
 */
export function teamsSeeingQuestion(db: Database, registrationId: ID, q: FormQuestion): ID[] {
  if (!q.profileField) return teamsSeeing(db, registrationId, q);
  return Object.values(db.teams)
    .filter((t) => {
      const access = t.access.find((x) => x.registrationId === registrationId);
      if (!access) return false;
      if (q.profileField === "fullName" || q.profileField === "fullNameAr") return true;
      const level = access.fields[`profile.${q.profileField}`];
      return !!level && level !== "hidden";
    })
    .map((t) => t.id);
}

/** Registrations in the header's event scope. */
export const inScope = (db: Database, scope: ID | "all") =>
  Object.values(db.registrations).filter((r) => scope === "all" || r.eventId === scope);
