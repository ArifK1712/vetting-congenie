"use client";

import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown, ChevronRight, CircleAlert, Copy, Eye, Info, Plus, Power, PowerOff, Search, Trash2, TriangleAlert, UserPlus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState, type ReactNode } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { DirIcon } from "@/components/ui/DirIcon";
import { ChoiceList, Field, TextArea, TextInput } from "@/components/ui/Field";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "@/components/ui/Menu";
import { Segmented } from "@/components/ui/Segmented";
import { MultiSelect, Select, type SelectOption } from "@/components/ui/Select";
import { BADGE_TYPE_TONE, TONE } from "@/design/tones";
import { can } from "@/domain/permissions";
import {
  applyAccessTo,
  CONDITIONS_MAX,
  conditionFields,
  DESCRIPTION_MAX,
  fillAccess,
  giveViewToAll,
  MAX_CLAIMS_LIMIT,
  NAME_MAX,
  registrationsInScope,
  VALUELESS_OPERATORS,
  type ConditionField,
  type TeamDraft,
  type TeamIssue,
} from "@/domain/teams";
import type { Condition, ConditionOperator, Database, ID, Team, TeamMember } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { cn } from "@/lib/cn";
import { AccessMatrix, AccessStrip } from "./parts";

export type Patch = (patch: Partial<TeamDraft>) => void;

// ─── Layout ─────────────────────────────────────────────────────────────

export function Section({
  id,
  index,
  title,
  subtitle,
  action,
  issues,
  showErrors,
  children,
}: {
  id: string;
  index: number;
  title: string;
  subtitle: string;
  action?: ReactNode;
  issues: TeamIssue[];
  showErrors: boolean;
  children: ReactNode;
}) {
  const fmt = useFormat();
  const hasError = showErrors && issues.some((i) => i.severity === "error");
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn("scroll-mt-6 rounded-xl bg-surface shadow-card ring-1", hasError ? "ring-rose-200" : "ring-line")}
    >
      <header className="flex flex-wrap items-start gap-3.5 px-6 pt-5 pb-4">
        <span
          className={cn(
            "tabular inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
            hasError ? "bg-rose-50 text-rose-600" : "bg-accent-soft text-accent-text",
          )}
        >
          {fmt.number(index)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={`${id}-title`} className="text-base font-bold text-ink">
            {title}
          </h2>
          <p className="mt-0.5 text-sm text-ink-2">{subtitle}</p>
        </div>
        {action}
      </header>
      <div className="border-t border-line">{children}</div>
    </section>
  );
}

/** Inline messages for one section: errors only after the first save attempt; warnings always. */
export function IssueList({ issues, showErrors, text }: { issues: TeamIssue[]; showErrors: boolean; text: (i: TeamIssue) => string }) {
  const shown = issues.filter((i) => i.severity === "warning" || showErrors);
  if (!shown.length) return null;
  return (
    <ul className="space-y-1.5">
      {shown.map((i, n) => (
        <li
          key={`${i.code}:${i.ref ?? n}`}
          className={cn(
            "flex items-start gap-2 rounded-lg px-3 py-2 text-sm ring-1 ring-inset",
            i.severity === "error" ? "bg-rose-50 text-rose-700 ring-rose-600/15" : "bg-amber-50 text-amber-800 ring-amber-600/20",
          )}
        >
          {i.severity === "error" ? <CircleAlert className="mt-0.5 size-4 shrink-0" /> : <TriangleAlert className="mt-0.5 size-4 shrink-0" />}
          {text(i)}
        </li>
      ))}
    </ul>
  );
}

// ─── 1. Basics ──────────────────────────────────────────────────────────

export function BasicsSection({ draft, patch, invalid }: { draft: TeamDraft; patch: Patch; invalid: Set<string> }) {
  const t = useTranslations("teams.editor.basics");
  const ts = useTranslations("teams.status");
  const fmt = useFormat();
  const count = (s: string, max: number) => <span className="ltr-data tabular">{t("count", { n: fmt.number(s.length), max: fmt.number(max) })}</span>;
  return (
    <div className="space-y-5 px-6 py-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("nameEn")} htmlFor="team-name-en" hint={count(draft.name.en, NAME_MAX)}>
          <TextInput
            id="team-name-en"
            dir="ltr"
            lang="en"
            maxLength={NAME_MAX}
            value={draft.name.en}
            invalid={invalid.has("name")}
            placeholder={t("namePlaceholder")}
            onChange={(e) => patch({ name: { ...draft.name, en: e.target.value } })}
          />
        </Field>
        <Field label={t("nameAr")} htmlFor="team-name-ar" hint={t("optional")}>
          <TextInput
            id="team-name-ar"
            dir="rtl"
            lang="ar"
            maxLength={NAME_MAX}
            value={draft.name.ar}
            invalid={invalid.has("nameAr")}
            placeholder={t("nameArPlaceholder")}
            onChange={(e) => patch({ name: { ...draft.name, ar: e.target.value } })}
          />
        </Field>
        <Field label={t("descriptionEn")} htmlFor="team-desc-en" hint={count(draft.description.en, DESCRIPTION_MAX)}>
          <TextArea
            id="team-desc-en"
            dir="ltr"
            lang="en"
            maxLength={DESCRIPTION_MAX}
            value={draft.description.en}
            placeholder={t("descriptionPlaceholder")}
            onChange={(e) => patch({ description: { ...draft.description, en: e.target.value } })}
          />
        </Field>
        <Field label={t("descriptionAr")} htmlFor="team-desc-ar" hint={count(draft.description.ar, DESCRIPTION_MAX)}>
          <TextArea
            id="team-desc-ar"
            dir="rtl"
            lang="ar"
            maxLength={DESCRIPTION_MAX}
            value={draft.description.ar}
            onChange={(e) => patch({ description: { ...draft.description, ar: e.target.value } })}
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-subtle px-4 py-3 ring-1 ring-line">
        <div>
          <p className="text-sm font-semibold text-ink">{t("status")}</p>
          <p className="text-xs text-ink-3">{draft.status === "active" ? t("statusActiveHint") : t("statusInactiveHint")}</p>
        </div>
        <Segmented<Team["status"]>
          label={t("status")}
          value={draft.status}
          onChange={(status) => patch({ status })}
          options={[
            { value: "active", label: ts("active"), icon: Power, selectedClass: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
            { value: "inactive", label: ts("inactive"), icon: PowerOff, selectedClass: "bg-surface text-ink-2 ring-line-strong" },
          ]}
        />
      </div>
    </div>
  );
}

// ─── 2. Members ─────────────────────────────────────────────────────────

export function AddMemberButton({ db, draft, patch }: { db: Database; draft: TeamDraft; patch: Patch }) {
  const t = useTranslations("teams.editor.members");
  const fmt = useFormat();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const taken = new Set(draft.members.map((m) => m.userId));
  const q = query.trim().toLowerCase();
  const people = Object.values(db.users)
    .filter((u) => u.active && !taken.has(u.id))
    .filter((u) => !q || `${u.name} ${u.email}`.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <Popover.Trigger asChild>
        <Button size="sm">
          <UserPlus className="size-3.5" />
          {t("add")}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} collisionPadding={8} className="anim-pop z-50 w-[22rem] overflow-hidden rounded-xl border border-line bg-surface shadow-pop">
          <div className="flex items-center gap-2 border-b border-line px-3">
            <Search className="size-3.5 shrink-0 text-ink-3" />
            <input
              autoFocus
              dir="auto"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("search")}
              className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-ink-3"
            />
          </div>
          <div className="max-h-80 overflow-y-auto p-1">
            {people.length === 0 && <p className="px-2.5 py-3 text-sm text-ink-3">{t("noPeople")}</p>}
            {people.map((u) => {
              const noAccess = !can(db, u.id, "queue.access");
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => patch({ members: [...draft.members, { userId: u.id, role: "reviewer" }] })}
                  className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-start outline-none hover:bg-hover focus-visible:bg-hover"
                >
                  <Avatar name={u.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{u.name}</span>
                    <span className="block truncate text-xs text-ink-3">
                      <span className="ltr-data">{u.email}</span> · {fmt.text(db.roles[u.roleId]?.name)}
                    </span>
                  </span>
                  {noAccess && <TriangleAlert className="size-3.5 shrink-0 text-amber-500" aria-label={t("noQueueAccess")} />}
                  <Plus className="size-4 shrink-0 text-ink-3" />
                </button>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function MembersSection({ db, draft, patch }: { db: Database; draft: TeamDraft; patch: Patch }) {
  const t = useTranslations("teams.editor.members");
  const tr = useTranslations("teams.role");
  const fmt = useFormat();
  const setRole = (userId: ID, role: TeamMember["role"]) =>
    patch({ members: draft.members.map((m) => (m.userId === userId ? { ...m, role } : m)) });
  const remove = (userId: ID) => patch({ members: draft.members.filter((m) => m.userId !== userId) });

  if (!draft.members.length) {
    return (
      <div className="px-6 py-5">
        <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-3">{t("empty")}</p>
      </div>
    );
  }
  return (
    <ul>
      {draft.members.map((m) => {
        const user = db.users[m.userId];
        const noAccess = !can(db, m.userId, "queue.access");
        return (
          <li key={m.userId} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-6 py-3 last:border-b-0">
            <Avatar name={user?.name ?? "?"} size="md" />
            <div className="min-w-44 flex-1">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                <span className="truncate">{user?.name}</span>
                {noAccess && (
                  <span className="inline-flex h-5 items-center gap-1 rounded-md bg-amber-50 px-1.5 text-2xs font-semibold text-amber-800 ring-1 ring-amber-600/20 ring-inset">
                    <TriangleAlert className="size-3" />
                    {t("noQueueAccessShort")}
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-ink-3">
                <span className="ltr-data">{user?.email}</span>
                <span className="mx-1.5">·</span>
                {fmt.text(db.roles[user?.roleId ?? ""]?.name)}
              </p>
            </div>
            <Segmented<TeamMember["role"]>
              size="sm"
              label={t("roleFor", { name: user?.name ?? "" })}
              value={m.role}
              onChange={(role) => setRole(m.userId, role)}
              options={[
                { value: "reviewer", label: tr("reviewer") },
                { value: "lead", label: tr("lead"), selectedClass: "bg-violet-50 text-violet-700 ring-violet-200" },
              ]}
            />
            <Button size="sm" variant="ghost" iconOnly aria-label={t("remove", { name: user?.name ?? "" })} onClick={() => remove(m.userId)}>
              <X className="size-4" />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

// ─── 3. Scope ───────────────────────────────────────────────────────────

function ToggleChip({ selected, onClick, children, className }: { selected: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 items-center gap-2 rounded-lg px-3 py-1.5 text-start text-sm ring-1 transition-colors outline-none ring-inset focus-visible:ring-2 focus-visible:ring-accent",
        selected ? cn("ring-indigo-300", className ?? "bg-accent-soft text-accent-text") : "bg-surface text-ink-2 ring-line hover:bg-subtle",
      )}
    >
      <span
        className={cn(
          "inline-flex size-4 shrink-0 items-center justify-center rounded-xs border",
          selected ? "border-accent bg-accent text-white" : "border-line-strong bg-surface",
        )}
      >
        {selected && <Check className="size-3" strokeWidth={3} />}
      </span>
      {children}
    </button>
  );
}

export function ScopeSection({ db, draft, patch, isEdit }: { db: Database; draft: TeamDraft; patch: Patch; isEdit: boolean }) {
  const t = useTranslations("teams.editor.scope");
  const fmt = useFormat();
  const toggle = (list: "all" | ID[], id: ID) => (list === "all" ? [id] : list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <div className="space-y-6 px-6 py-5">
      <div>
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ink">{t("events")}</p>
            <p className="text-xs text-ink-3">{draft.eventScope === "all" ? t("allEventsHint") : t("selectedHint")}</p>
          </div>
          <Segmented<"all" | "some">
            label={t("events")}
            value={draft.eventScope === "all" ? "all" : "some"}
            onChange={(v) => patch({ eventScope: v === "all" ? "all" : [] })}
            options={[
              { value: "all", label: t("allEvents") },
              { value: "some", label: t("selected") },
            ]}
          />
        </div>
        {draft.eventScope !== "all" && (
          <div className="flex flex-wrap gap-2">
            {Object.values(db.events).map((e) => (
              <ToggleChip key={e.id} selected={(draft.eventScope as ID[]).includes(e.id)} onClick={() => patch({ eventScope: toggle(draft.eventScope, e.id) })}>
                <span>
                  <span className="block font-medium">{fmt.text(e.name)}</span>
                  <span className="block text-xs opacity-75">
                    <span className="ltr-data font-mono">{e.code}</span> · {fmt.day(e.startsOn)}
                  </span>
                </span>
              </ToggleChip>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-line pt-5">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ink">{t("badgeTypes")}</p>
            <p className="text-xs text-ink-3">{draft.badgeScope === "all" ? t("allBadgesHint") : t("selectedHint")}</p>
          </div>
          <Segmented<"all" | "some">
            label={t("badgeTypes")}
            value={draft.badgeScope === "all" ? "all" : "some"}
            onChange={(v) => patch({ badgeScope: v === "all" ? "all" : [] })}
            options={[
              { value: "all", label: t("allBadges") },
              { value: "some", label: t("selected") },
            ]}
          />
        </div>
        {draft.badgeScope !== "all" && (
          <div className="flex flex-wrap gap-2">
            {Object.values(db.badgeTypes).map((b) => {
              const tone = TONE[BADGE_TYPE_TONE[b.id] ?? "slate"];
              return (
                <ToggleChip
                  key={b.id}
                  selected={(draft.badgeScope as ID[]).includes(b.id)}
                  onClick={() => patch({ badgeScope: toggle(draft.badgeScope, b.id) })}
                  className={cn(tone.chip, "font-semibold")}
                >
                  {fmt.text(b.name)}
                </ToggleChip>
              );
            })}
          </div>
        )}
      </div>

      {isEdit && (
        <p className="flex items-start gap-2 rounded-lg bg-sky-50 px-3.5 py-2.5 text-sm text-sky-800 ring-1 ring-sky-600/15 ring-inset">
          <Info className="mt-0.5 size-4 shrink-0" />
          {t("newRequestsOnly")}
        </p>
      )}
    </div>
  );
}

// ─── 4. Registration & field access ─────────────────────────────────────

export function AddRegistrationMenu({ db, draft, patch, onAdded }: { db: Database; draft: TeamDraft; patch: Patch; onAdded: (id: ID) => void }) {
  const t = useTranslations("teams.access");
  const fmt = useFormat();
  const added = new Set(draft.access.map((a) => a.registrationId));
  const available = registrationsInScope(db, draft).filter((r) => !added.has(r.id));
  const byEvent = Object.values(db.events)
    .map((e) => ({ event: e, regs: available.filter((r) => r.eventId === e.id) }))
    .filter((g) => g.regs.length);
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button size="sm" disabled={!available.length}>
          <Plus className="size-3.5" />
          {t("add")}
        </Button>
      </MenuTrigger>
      <MenuContent align="end" className="max-h-96 w-80 overflow-y-auto">
        {byEvent.map((g) => (
          <div key={g.event.id}>
            <MenuLabel>{fmt.text(g.event.name)}</MenuLabel>
            {g.regs.map((r) => (
              <MenuItem
                key={r.id}
                onSelect={() => {
                  patch({ access: [...draft.access, { registrationId: r.id, fields: fillAccess(r, () => "hidden") }] });
                  onAdded(r.id);
                }}
              >
                <span className="min-w-0 flex-1 truncate">{fmt.text(r.name)}</span>
                <span className="ltr-data font-mono text-2xs text-ink-3">{g.event.code}</span>
              </MenuItem>
            ))}
          </div>
        ))}
      </MenuContent>
    </Menu>
  );
}

export function AccessSection({
  db,
  draft,
  patch,
  teamId,
  open,
  setOpen,
  issues,
  showErrors,
}: {
  db: Database;
  draft: TeamDraft;
  patch: Patch;
  teamId: ID | null;
  open: ID | null;
  setOpen: (id: ID | null) => void;
  issues: TeamIssue[];
  showErrors: boolean;
}) {
  const t = useTranslations("teams.access");
  const fmt = useFormat();
  const outOfScope = new Set(issues.filter((i) => i.code === "accessOutOfScope").map((i) => i.ref));

  const setFields = (regId: ID, fields: Record<string, TeamDraft["access"][number]["fields"][string]>) =>
    patch({ access: draft.access.map((a) => (a.registrationId === regId ? { ...a, fields } : a)) });

  if (!draft.access.length) {
    return (
      <div className="px-6 py-5">
        <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-3">{t("empty")}</p>
      </div>
    );
  }

  return (
    <div>
      <p className="flex items-start gap-2 border-b border-line bg-subtle px-6 py-2.5 text-xs text-ink-2">
        <Info className="mt-px size-3.5 shrink-0 text-ink-3" />
        {t("newQuestionsHidden")}
      </p>
      <ul>
        {draft.access.map((a) => {
          const reg = db.registrations[a.registrationId];
          if (!reg) return null;
          const expanded = open === reg.id;
          const bad = outOfScope.has(reg.id);
          const copySources = Object.values(db.teams).filter((tm) => tm.id !== teamId && tm.access.some((x) => x.registrationId === reg.id));
          return (
            <li key={reg.id} className={cn("border-b border-line last:border-b-0", expanded && "bg-subtle/40")}>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3.5">
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? null : reg.id)}
                  className="flex min-w-56 flex-1 items-center gap-3 rounded-md text-start outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {expanded ? <ChevronDown className="size-4 shrink-0 text-ink-3" /> : <DirIcon icon={ChevronRight} className="size-4 shrink-0 text-ink-3" />}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">{fmt.text(reg.name)}</span>
                    <span className="block truncate text-xs text-ink-3">
                      <span className="ltr-data font-mono">{db.events[reg.eventId]?.code}</span> · {fmt.text(db.events[reg.eventId]?.name)}
                    </span>
                  </span>
                </button>
                {bad ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-700">
                    <CircleAlert className="size-3.5" />
                    {t("outOfScope")}
                  </span>
                ) : (
                  <AccessStrip reg={reg} fields={a.fields} />
                )}
              </div>

              {expanded && (
                <div className="px-6 pb-5">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <Button size="sm" onClick={() => setFields(reg.id, giveViewToAll(reg))}>
                      <Eye className="size-3.5" />
                      {t("giveViewToAll")}
                    </Button>
                    <Menu>
                      <MenuTrigger asChild>
                        <Button size="sm" disabled={!copySources.length} title={copySources.length ? undefined : t("copyNone")}>
                          <Copy className="size-3.5" />
                          {t("copyFrom")}
                          <ChevronDown className="size-3 text-ink-3" />
                        </Button>
                      </MenuTrigger>
                      <MenuContent>
                        {copySources.map((src) => (
                          <MenuItem
                            key={src.id}
                            onSelect={() => setFields(reg.id, { ...src.access.find((x) => x.registrationId === reg.id)!.fields })}
                          >
                            {fmt.text(src.name)}
                          </MenuItem>
                        ))}
                      </MenuContent>
                    </Menu>
                    {draft.access.length > 1 && (
                      <Button
                        size="sm"
                        onClick={() =>
                          patch({
                            access: draft.access.map((x) =>
                              x.registrationId === reg.id ? x : { ...x, fields: applyAccessTo(a.fields, reg, db.registrations[x.registrationId]) },
                            ),
                          })
                        }
                      >
                        {t("applyToAll", { count: draft.access.length - 1, n: fmt.number(draft.access.length - 1) })}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="danger"
                      className="ms-auto"
                      onClick={() => {
                        patch({ access: draft.access.filter((x) => x.registrationId !== reg.id) });
                        setOpen(null);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                      {t("remove")}
                    </Button>
                  </div>
                  <div className={cn("overflow-hidden rounded-xl bg-surface ring-1", showErrors && bad ? "ring-rose-200" : "ring-line")}>
                    <AccessMatrix reg={reg} fields={a.fields} onChange={(f) => setFields(reg.id, f)} />
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── 5. Conditions ──────────────────────────────────────────────────────

let conditionSeq = 0;
const newConditionId = () => `c_${Date.now().toString(36)}${(++conditionSeq).toString(36)}`;

export function useFieldOptions(db: Database, fields: ConditionField[]) {
  const t = useTranslations("teams.conditions");
  const tf = useTranslations("requestDetail.fields");
  const tp = useTranslations("payment");
  const tl = useTranslations("screening.level");
  const fmt = useFormat();
  return useMemo(() => {
    const label = (f: ConditionField) =>
      f.source === "profile"
        ? tf(f.profileField!)
        : f.source === "answer"
          ? fmt.text(f.question!.label)
          : f.source === "payment"
            ? t("fields.paymentStatus")
            : t("fields.watchlistLevel");
    const valueLabel = (f: ConditionField, v: string, l?: { en: string; ar: string }) =>
      f.field === "profile.nationality" ? fmt.country(v) : f.source === "payment" ? tp(v as "paid") : f.source === "screening" ? tl(v as "low") : fmt.text(l) || v;
    const fieldOptions: SelectOption[] = fields.map((f) => ({ value: f.field, label: label(f), group: t(`sources.${f.source}`) }));
    const valueOptions = (f: ConditionField): SelectOption[] | null =>
      f.options
        ? f.options
            .map((o) => ({ value: o.value, label: valueLabel(f, o.value, o.label) }))
            .sort((a, b) => (f.field === "profile.nationality" ? a.label.localeCompare(b.label, fmt.locale) : 0))
        : null;
    return { fieldOptions, valueOptions };
  }, [fields, t, tf, tp, tl, fmt, db]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function ConditionsSection({
  db,
  draft,
  patch,
  issues,
  showErrors,
  preview,
}: {
  db: Database;
  draft: TeamDraft;
  patch: Patch;
  issues: TeamIssue[];
  showErrors: boolean;
  preview: { inScope: number; matched: number };
}) {
  const t = useTranslations("teams.conditions");
  const fmt = useFormat();
  const fields = useMemo(() => conditionFields(db, draft.access.map((a) => a.registrationId)), [db, draft.access]);
  const { fieldOptions, valueOptions } = useFieldOptions(db, fields);
  const incomplete = new Set(issues.filter((i) => i.code === "conditionIncomplete").map((i) => i.ref));

  const update = (id: ID, next: Partial<Condition>) =>
    patch({ conditions: draft.conditions.map((c) => (c.id === id ? { ...c, ...next } : c)) });
  const add = () =>
    patch({ conditions: [...draft.conditions, { id: newConditionId(), field: "", operator: "is", value: [] }] });

  const share = preview.inScope ? preview.matched / preview.inScope : 0;

  return (
    <div className="space-y-4 px-6 py-5">
      {draft.conditions.length > 1 && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-ink-2">
          {t("matchLabel")}
          <Segmented<Team["conditionMatch"]>
            size="sm"
            label={t("matchLabel")}
            value={draft.conditionMatch}
            onChange={(conditionMatch) => patch({ conditionMatch })}
            options={[
              { value: "all", label: t("matchAll") },
              { value: "any", label: t("matchAny") },
            ]}
          />
        </div>
      )}

      {draft.conditions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong px-4 py-5 text-center text-sm text-ink-3">{t("empty")}</p>
      ) : (
        <ol className="space-y-2">
          {draft.conditions.map((c, i) => {
            const def = fields.find((f) => f.field === c.field);
            const values = def ? valueOptions(def) : null;
            const valueless = VALUELESS_OPERATORS.includes(c.operator);
            const multi = c.operator === "isAnyOf" || c.operator === "isNoneOf";
            const invalid = showErrors && incomplete.has(c.id);
            return (
              <li key={c.id} className="flex items-start gap-2">
                <span className="tabular mt-2 w-8 shrink-0 text-center text-2xs font-bold text-ink-3">
                  {i === 0 ? t("if") : draft.conditionMatch === "all" ? t("and") : t("or")}
                </span>
                <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,1.25fr)_minmax(0,0.85fr)_minmax(0,1.4fr)]">
                  <Select
                    label={t("field")}
                    placeholder={t("chooseField")}
                    searchable
                    options={fieldOptions}
                    value={c.field || null}
                    invalid={invalid && !c.field}
                    onChange={(field) => {
                      const nextDef = fields.find((f) => f.field === field);
                      update(c.id, { field, operator: nextDef?.operators[0] ?? "is", value: [] });
                    }}
                  />
                  <Select
                    label={t("operator")}
                    options={(def?.operators ?? ["is"]).map((op) => ({ value: op, label: t(`operators.${op}`) }))}
                    value={c.operator}
                    onChange={(op) => {
                      const operator = op as ConditionOperator;
                      const toSingle = operator === "is" || operator === "isNot" || operator === "contains";
                      update(c.id, { operator, value: VALUELESS_OPERATORS.includes(operator) ? [] : toSingle ? c.value.slice(0, 1) : c.value });
                    }}
                  />
                  {valueless ? (
                    <span className="flex h-9 items-center px-3 text-sm text-ink-3">—</span>
                  ) : values && multi ? (
                    <MultiSelect
                      label={t("value")}
                      placeholder={t("chooseValues")}
                      options={values}
                      value={c.value}
                      searchable={values.length > 8}
                      invalid={invalid}
                      summary={(labels) => (labels.length > 2 ? t("valuesSummary", { first: labels[0], n: fmt.number(labels.length - 1) }) : labels.join(", "))}
                      onChange={(value) => update(c.id, { value })}
                    />
                  ) : values ? (
                    <Select
                      label={t("value")}
                      placeholder={t("chooseValue")}
                      options={values}
                      value={c.value[0] ?? null}
                      searchable={values.length > 8}
                      invalid={invalid}
                      onChange={(v) => update(c.id, { value: [v] })}
                    />
                  ) : (
                    <TextInput
                      aria-label={t("value")}
                      placeholder={t("typeValue")}
                      value={c.value[0] ?? ""}
                      invalid={invalid}
                      onChange={(e) => update(c.id, { value: [e.target.value] })}
                    />
                  )}
                </div>
                <Button
                  size="md"
                  variant="ghost"
                  iconOnly
                  aria-label={t("remove")}
                  onClick={() => patch({ conditions: draft.conditions.filter((x) => x.id !== c.id) })}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            );
          })}
        </ol>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={add} disabled={draft.conditions.length >= CONDITIONS_MAX}>
          <Plus className="size-3.5" />
          {t("add")}
        </Button>
        <span className="tabular text-xs text-ink-3">{t("limit", { n: fmt.number(draft.conditions.length), max: fmt.number(CONDITIONS_MAX) })}</span>
      </div>

      <div className="rounded-lg bg-subtle px-4 py-3 ring-1 ring-line">
        {preview.inScope ? (
          <>
            <p className="text-sm text-ink">
              {t.rich("preview", {
                matched: fmt.number(preview.matched),
                inScope: fmt.number(preview.inScope),
                b: (chunks) => <span className="tabular font-bold">{chunks}</span>,
              })}
            </p>
            <span className="mt-2 flex h-2 overflow-hidden rounded-full bg-hover">
              <span className="h-full rounded-full bg-indigo-500 transition-[width]" style={{ width: `${share * 100}%` }} />
            </span>
            <p className="mt-1.5 text-xs text-ink-3">{t("previewHint")}</p>
          </>
        ) : (
          <p className="text-sm text-ink-3">{t("previewNone")}</p>
        )}
      </div>
    </div>
  );
}

// ─── 6. Assignment ──────────────────────────────────────────────────────

export function AssignmentSection({ draft, patch, invalid }: { draft: TeamDraft; patch: Patch; invalid: boolean }) {
  const t = useTranslations("teams.assignment");
  return (
    <div className="grid gap-6 px-6 py-5 md:grid-cols-[minmax(0,1fr)_17rem]">
      <ChoiceList
        label={t("label")}
        value={draft.assignmentMode}
        onChange={(v) => patch({ assignmentMode: v as Team["assignmentMode"] })}
        choices={(["selfClaim", "leadAssigns", "roundRobin"] as const).map((mode) => ({
          value: mode,
          label: t(`modes.${mode}.label`),
          hint: t(`modes.${mode}.hint`),
        }))}
      />
      <Field label={t("maxClaims")} htmlFor="team-max-claims">
        <TextInput
          id="team-max-claims"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_CLAIMS_LIMIT}
          dir="ltr"
          className="tabular w-28"
          invalid={invalid}
          value={Number.isNaN(draft.maxOpenClaims) ? "" : draft.maxOpenClaims}
          onChange={(e) => patch({ maxOpenClaims: e.target.value === "" ? Number.NaN : Number(e.target.value) })}
        />
        <p className="mt-2 text-xs text-ink-3">
          {t("maxClaimsDefault")}. {t("maxClaimsHint")}
        </p>
      </Field>
    </div>
  );
}
