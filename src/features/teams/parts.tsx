"use client";

import { Download, Eye, EyeOff, Lock, PencilLine, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, type ReactNode } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Segmented } from "@/components/ui/Segmented";
import { BadgeTypeChip, Pill } from "@/components/ui/Status";
import { Tooltip } from "@/components/ui/Tooltip";
import { AVATAR_TONES, TONE } from "@/design/tones";
import { accessRows, accessSummary, FIELD_GROUPS, GROUP_LEVELS, type AccessRow, type FieldGroupKey } from "@/domain/teams";
import type { Condition, Database, FieldAccessLevel, ID, Registration, Team, TeamChange, TeamMember } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { cn } from "@/lib/cn";

// ─── Identity ───────────────────────────────────────────────────────────

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Two-letter monogram from the English name ("VIP Security Team" → "VS").
 * Used in both languages, like event codes: Arabic initials would mostly
 * be the article "ال" and tell teams apart poorly.
 */
function teamInitials(name: string) {
  const words = name.split(/\s+/).filter((w) => w && !/^(team|the|of|and|for)$/i.test(w));
  return words
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function TeamMark({ team, size = "md" }: { team: Pick<Team, "id" | "name" | "status">; size?: "sm" | "md" | "lg" }) {
  const tone = AVATAR_TONES[hash(team.id) % AVATAR_TONES.length];
  return (
    <span
      aria-hidden
      className={cn(
        "ltr-data inline-flex shrink-0 items-center justify-center font-bold",
        team.status === "inactive" ? TONE.gray.chip : TONE[tone].chip,
        size === "sm" && "size-8 rounded-lg text-[11px]",
        size === "md" && "size-9 rounded-lg text-xs",
        size === "lg" && "size-14 rounded-xl text-base",
      )}
    >
      {teamInitials(team.name.en || team.name.ar)}
    </span>
  );
}

export function TeamStatusPill({ status, size }: { status: Team["status"]; size?: "sm" | "md" }) {
  const t = useTranslations("teams.status");
  return (
    <Pill tone={status === "active" ? "emerald" : "gray"} size={size}>
      {t(status)}
    </Pill>
  );
}

export function TeamRolePill({ role }: { role: TeamMember["role"] }) {
  const t = useTranslations("teams.role");
  return role === "lead" ? (
    <Pill tone="violet" dot={false}>
      {t("lead")}
    </Pill>
  ) : (
    <span className="text-xs text-ink-2">{t("reviewer")}</span>
  );
}

export function BadgeScope({ db, scope, max = 3 }: { db: Database; scope: Team["badgeScope"]; max?: number }) {
  const t = useTranslations("teams");
  const fmt = useFormat();
  if (scope === "all") {
    return <span className="inline-flex h-5 items-center rounded-md bg-hover px-1.5 text-2xs font-semibold text-ink-2">{t("allBadgeTypes")}</span>;
  }
  const shown = scope.slice(0, max);
  const rest = scope.slice(max);
  return (
    <span className="flex flex-wrap items-center gap-1">
      {shown.map((id) => (
        <BadgeTypeChip key={id} id={id} label={fmt.text(db.badgeTypes[id]?.name)} />
      ))}
      {rest.length > 0 && (
        <Tooltip content={rest.map((id) => fmt.text(db.badgeTypes[id]?.name)).join(", ")}>
          <span className="tabular inline-flex h-5 items-center rounded-md bg-hover px-1.5 text-2xs font-semibold text-ink-2">
            {t("moreCount", { n: fmt.number(rest.length) })}
          </span>
        </Tooltip>
      )}
    </span>
  );
}

export function useEventScopeText(db: Database) {
  const t = useTranslations("teams");
  const fmt = useFormat();
  return useCallback(
    (scope: Team["eventScope"]) =>
      scope === "all" ? t("allEvents") : scope.map((id) => fmt.text(db.events[id]?.name)).join(" · "),
    [db, fmt, t],
  );
}

export function MemberStack({ db, members, max = 4 }: { db: Database; members: TeamMember[]; max?: number }) {
  const fmt = useFormat();
  const ordered = [...members].sort((a, b) => (a.role === "lead" ? -1 : b.role === "lead" ? 1 : 0));
  const shown = ordered.slice(0, max);
  const rest = ordered.length - shown.length;
  return (
    <Tooltip content={ordered.map((m) => db.users[m.userId]?.name).join(", ")}>
      <span className="flex items-center">
        {shown.map((m, i) => (
          <Avatar key={m.userId} name={db.users[m.userId]?.name ?? "?"} size="sm" className={cn(i > 0 && "-ms-2")} />
        ))}
        {rest > 0 && (
          <span className="tabular -ms-2 inline-flex size-7 items-center justify-center rounded-full bg-hover text-[10.5px] font-semibold text-ink-2 ring-2 ring-surface">
            +{fmt.number(rest)}
          </span>
        )}
      </span>
    </Tooltip>
  );
}

// ─── Field access ───────────────────────────────────────────────────────

export const LEVEL_STYLE: Record<FieldAccessLevel, { icon: LucideIcon; selected: string; pill: string }> = {
  hidden: { icon: EyeOff, selected: "bg-surface text-ink-2 ring-line-strong", pill: "bg-hover text-ink-3" },
  view: { icon: Eye, selected: "bg-sky-50 text-sky-700 ring-sky-200", pill: "bg-sky-50 text-sky-700" },
  edit: { icon: PencilLine, selected: "bg-violet-50 text-violet-700 ring-violet-200", pill: "bg-violet-50 text-violet-700" },
  download: { icon: Download, selected: "bg-emerald-50 text-emerald-700 ring-emerald-200", pill: "bg-emerald-50 text-emerald-700" },
};

export function LevelPill({ level }: { level: FieldAccessLevel }) {
  const t = useTranslations("teams.access.levels");
  const Icon = LEVEL_STYLE[level].icon;
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium whitespace-nowrap", LEVEL_STYLE[level].pill)}>
      <Icon className="size-3" strokeWidth={2.25} />
      {t(level)}
    </span>
  );
}

/** Label for an access row: profile field, question label, or fixed text. */
export function useRowLabel() {
  const tf = useTranslations("requestDetail.fields");
  const ta = useTranslations("teams.access");
  const fmt = useFormat();
  return useCallback(
    (row: AccessRow) => {
      if (row.group === "profile") return { label: tf(row.field) };
      if (row.group === "answers" || row.group === "documents") return { label: fmt.text(row.question.label) };
      return { label: ta(`rows.${row.group}`) };
    },
    [tf, ta, fmt],
  );
}

/**
 * The per-registration field matrix (5.6). Editable rows use a segmented
 * control limited to the levels the group allows; read-only rows show pills.
 */
export function AccessMatrix({
  reg,
  fields,
  onChange,
}: {
  reg: Registration;
  fields: Record<string, FieldAccessLevel>;
  onChange?: (fields: Record<string, FieldAccessLevel>) => void;
}) {
  const t = useTranslations("teams.access");
  const fmt = useFormat();
  const rowLabel = useRowLabel();
  const rows = accessRows(reg);
  const summary = accessSummary(reg, fields);
  const levelOf = (key: string) => fields[key] ?? "hidden";
  const setGroup = (group: FieldGroupKey, level: FieldAccessLevel) => {
    if (!onChange) return;
    const next = { ...fields };
    for (const r of rows) if (r.group === group) next[r.key] = level;
    onChange(next);
  };

  return (
    <div className="divide-y divide-line">
      <p className="flex items-center gap-2 px-5 py-2.5 text-xs text-ink-3">
        <Lock className="size-3.5 shrink-0" />
        {t("alwaysVisible")}
      </p>
      {FIELD_GROUPS.map((group) => {
        const groupRows = rows.filter((r) => r.group === group);
        if (!groupRows.length) return null;
        const s = summary[group];
        return (
          <section key={group} aria-label={t(`groups.${group}`)}>
            <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 bg-subtle px-5 py-2">
              <div className="flex items-baseline gap-2">
                <h4 className="text-xs font-bold text-ink">{t(`groups.${group}`)}</h4>
                <span className="tabular text-xs text-ink-3">{t("visibleOf", { visible: fmt.number(s.visible), total: fmt.number(s.total) })}</span>
              </div>
              {onChange && groupRows.length > 1 && (
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-ink-3">{t("setAll")}</span>
                  {GROUP_LEVELS[group].map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setGroup(group, level)}
                      className="rounded-md px-1.5 py-0.5 font-medium text-accent-text hover:bg-accent-soft"
                    >
                      {t(`levels.${level}`)}
                    </button>
                  ))}
                </div>
              )}
            </header>
            <ul className={cn(!onChange && "grid lg:grid-cols-2")}>
              {groupRows.map((row) => {
                const { label } = rowLabel(row);
                const level = levelOf(row.key);
                return (
                  <li key={row.key} className={cn("flex min-h-11 items-center justify-between gap-4 border-t border-line px-5 py-1.5", !onChange && "lg:even:border-s")}>
                    <span className={cn("min-w-0 truncate text-sm", level === "hidden" ? "text-ink-3" : "text-ink")}>{label}</span>
                    {onChange ? (
                      <Segmented
                        size="sm"
                        label={label}
                        value={level}
                        onChange={(v) => onChange({ ...fields, [row.key]: v })}
                        options={GROUP_LEVELS[group].map((l) => ({
                          value: l,
                          label: t(`levels.${l}`),
                          icon: LEVEL_STYLE[l].icon,
                          selectedClass: LEVEL_STYLE[l].selected,
                        }))}
                      />
                    ) : (
                      <LevelPill level={level} />
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/** Compact strip: one segment per group, filled by the share of visible fields. */
export function AccessStrip({ reg, fields }: { reg: Registration; fields: Record<string, FieldAccessLevel> }) {
  const t = useTranslations("teams.access");
  const fmt = useFormat();
  const summary = accessSummary(reg, fields);
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2">
      {FIELD_GROUPS.filter((g) => summary[g].total > 0).map((g) => {
        const s = summary[g];
        return (
          <li key={g} className="min-w-24">
            <span className="flex items-baseline justify-between gap-2 text-2xs">
              <span className="font-semibold text-ink-2">{t(`groups.${g}`)}</span>
              <span className="tabular text-ink-3">
                {fmt.number(s.visible)}/{fmt.number(s.total)}
              </span>
            </span>
            <span className="mt-1 flex h-1.5 gap-[2px]">
              {Array.from({ length: s.total }, (_, i) => (
                <span key={i} className={cn("h-full flex-1 rounded-full", i < s.visible ? "bg-indigo-400" : "bg-hover")} />
              ))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Text helpers ───────────────────────────────────────────────────────

/** Human-readable condition line, e.g. "Nationality is not Saudi Arabia". */
export function useConditionText(db: Database) {
  const t = useTranslations("teams.conditions");
  const tf = useTranslations("requestDetail.fields");
  const tp = useTranslations("payment");
  const tl = useTranslations("screening.level");
  const fmt = useFormat();
  return useCallback(
    (c: Condition) => {
      const [source, key] = c.field.split(".");
      let field = c.field;
      let valueLabel = (v: string) => v;
      if (source === "profile") {
        field = tf(key as "email");
        if (key === "nationality") valueLabel = fmt.country;
      } else if (source === "answer") {
        const q = Object.values(db.registrations).flatMap((r) => r.questions).find((x) => x.id === key);
        field = q ? fmt.text(q.label) : key;
        valueLabel = (v) => fmt.text(q?.options?.find((o) => o.value === v)?.label) || v;
      } else if (source === "payment") {
        field = t("fields.paymentStatus");
        valueLabel = (v) => tp(v as "paid");
      } else if (source === "screening") {
        field = t("fields.watchlistLevel");
        valueLabel = (v) => tl(v as "low");
      }
      return { field, operator: t(`operators.${c.operator}`), values: c.value.map(valueLabel) };
    },
    [db, fmt, t, tf, tp, tl],
  );
}

export function ConditionLine({ db, condition }: { db: Database; condition: Condition }) {
  const text = useConditionText(db)(condition);
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-sm">
      <span className="font-semibold text-ink">{text.field}</span>
      <span className="text-ink-3">{text.operator}</span>
      {text.values.map((v) => (
        <span key={v} className="inline-flex h-6 items-center rounded-md bg-accent-soft px-2 text-xs font-medium text-accent-text">
          <bdi>{v}</bdi>
        </span>
      ))}
    </span>
  );
}

/** One line per change in a team history entry. */
export function useChangeText(db: Database) {
  const t = useTranslations("teams.history.changes");
  const tr = useTranslations("teams.role");
  const ta = useTranslations("teams.assignment.modes");
  const fmt = useFormat();
  return useCallback(
    (c: TeamChange): ReactNode => {
      const name = (id: ID) => db.users[id]?.name ?? id;
      const reg = (id: ID) => {
        const r = db.registrations[id];
        return r ? `${fmt.text(r.name)} · ${db.events[r.eventId]?.code ?? ""}` : id;
      };
      switch (c.type) {
        case "memberAdded":
          return t("memberAdded", { name: name(c.userId), role: tr(c.role) });
        case "memberRemoved":
          return t("memberRemoved", { name: name(c.userId) });
        case "memberRole":
          return t("memberRole", { name: name(c.userId), role: tr(c.role) });
        case "accessAdded":
          return t("accessAdded", { registration: reg(c.registrationId) });
        case "accessRemoved":
          return t("accessRemoved", { registration: reg(c.registrationId) });
        case "accessChanged":
          return t("accessChanged", { registration: reg(c.registrationId), count: c.fields, n: fmt.number(c.fields) });
        case "conditions":
          return t("conditions", { count: c.count, n: fmt.number(c.count) });
        case "assignment":
          return t("assignment", { mode: ta(`${c.mode}.label`) });
        case "maxClaims":
          return t("maxClaims", { n: fmt.number(c.value) });
        case "claimsReleased":
          return t("claimsReleased", { name: name(c.userId), count: c.count, n: fmt.number(c.count) });
        default:
          return t(c.type);
      }
    },
    [db, fmt, t, tr, ta],
  );
}
