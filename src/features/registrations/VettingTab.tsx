"use client";

import { ArrowUpRight, Ban, CircleCheck, Hand, Info, Lock, Mail, PowerOff, ShieldAlert, ShieldCheck, TriangleAlert, Workflow, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { Select } from "@/components/ui/Select";
import { BadgeTypeChip } from "@/components/ui/Status";
import { Tooltip } from "@/components/ui/Tooltip";
import { badgeCoverage, type SettingsDraft, type SettingsIssue } from "@/domain/registrations";
import type { Registration, RegistrationVettingSettings } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { useDb } from "@/store/app";
import { useViewer } from "@/store/useViewer";
import { Card, ChoiceCards, Switch } from "./parts";
import type { DraftPatch } from "./RegistrationDetailPage";

const TEMPLATES = ["tpl_reject_default", "tpl_reject_brief"] as const;
type TemplateId = (typeof TEMPLATES)[number];

export function VettingTab({
  reg,
  draft,
  saved,
  patch,
  issues,
}: {
  reg: Registration;
  draft: SettingsDraft;
  saved: RegistrationVettingSettings;
  patch: DraftPatch;
  issues: SettingsIssue[];
}) {
  const t = useTranslations("registrations.vetting");
  const fmt = useFormat();
  const db = useDb();
  const viewer = useViewer();

  const mappingIssues = issues.filter((i) => i.code === "noFullName" || i.code === "noStrongId");
  const uncoveredIssues = new Set(issues.filter((i) => i.code === "uncoveredBadge").map((i) => i.badgeTypeId));
  const coverage = badgeCoverage(db, reg.id, draft.uncoveredBadgeBehaviour);
  const blacklistLocked = draft.blacklistScreening && saved.blacklistScreening && !viewer.can("blacklist.approve");
  const template: TemplateId = TEMPLATES.includes(draft.rejectionTemplateId as TemplateId) ? (draft.rejectionTemplateId as TemplateId) : "tpl_reject_default";
  const ev = db.events[reg.eventId];

  return (
    <div className="grid items-start gap-5 xl:grid-cols-2">
      <div className="space-y-5 xl:col-span-2">
      {/* ── Vetting on/off ── */}
      <Card id="vetting-status" icon={ShieldCheck} tone="bg-emerald-100 text-emerald-600" title={t("status.title")} subtitle={t("status.subtitle")} invalid={mappingIssues.length > 0}>
        <div className="space-y-4 px-5 py-5 sm:px-6">
          <div className={cn("rounded-xl px-4 py-3.5 ring-1 ring-inset", draft.enabled ? "bg-emerald-50 ring-emerald-600/20" : "bg-subtle ring-line")}>
            <Switch
              id="vetting-enabled"
              label={t("status.enabled")}
              hint={draft.enabled ? t("status.onHint") : t("status.offHint")}
              checked={draft.enabled}
              onChange={(enabled) => patch({ enabled })}
            />
          </div>
          <p className="flex items-start gap-2 rounded-lg bg-sky-50 px-3 py-2.5 text-sm text-sky-800 ring-1 ring-sky-600/20 ring-inset">
            <Info className="mt-0.5 size-4 shrink-0" />
            {t("status.note")}
          </p>
        </div>
      </Card>

      {/* ── Badge type coverage ── */}
      <Card id="coverage" icon={Workflow} tone="bg-violet-100 text-violet-600" title={t("coverage.title")} subtitle={t("coverage.subtitle")} invalid={uncoveredIssues.size > 0}>
        <div className="hidden grid-cols-[9rem_minmax(0,1fr)] gap-4 border-b border-line bg-subtle px-6 sm:grid">
          <span className="eyebrow flex h-9 items-center">{t("coverage.badgeType")}</span>
          <span className="eyebrow flex h-9 items-center">{t("coverage.workflow")}</span>
        </div>
        <ul className="divide-y divide-line">
          {coverage.map((row) => {
            const wf = row.workflowId ? db.workflows[row.workflowId] : null;
            const invalid = uncoveredIssues.has(row.badgeTypeId);
            const badgeName = fmt.text(db.badgeTypes[row.badgeTypeId]?.name);
            return (
              <li key={row.badgeTypeId} className={cn("grid gap-2.5 px-5 py-4 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4 sm:px-6", invalid && "bg-rose-50/60")}>
                <div className="pt-0.5">
                  <BadgeTypeChip id={row.badgeTypeId} label={badgeName} />
                </div>
                {wf ? (
                  <div className="flex min-w-0 items-center gap-2">
                    <CircleCheck className="size-4 shrink-0 text-emerald-500" />
                    <Link href={`/workflows/${wf.id}`} className="min-w-0 truncate text-sm font-medium text-ink hover:text-accent-text hover:underline">
                      {t("coverage.version", { name: fmt.text(wf.name), n: fmt.number(row.versionNo ?? 1) })}
                    </Link>
                  </div>
                ) : (
                  <div className="min-w-0 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-attention">
                        <TriangleAlert className="size-4" />
                        {t("coverage.none")}
                      </span>
                      <Link href="/workflows" className="inline-flex items-center gap-1 text-xs font-semibold text-accent-text hover:underline">
                        {t("coverage.allot")}
                        <ArrowUpRight className="size-3.5 rtl:-scale-x-100" />
                      </Link>
                    </div>
                    <p className="eyebrow">
                      {t("coverage.choice")} · <span className={invalid ? "text-rose-600" : undefined}>{t("coverage.required")}</span>
                    </p>
                    <ChoiceCards<"noVetting" | "block">
                      label={`${t("coverage.choice")}: ${badgeName}`}
                      value={row.behaviour}
                      invalid={invalid}
                      onChange={(v) => patch({ uncoveredBadgeBehaviour: { ...draft.uncoveredBadgeBehaviour, [row.badgeTypeId]: v } })}
                      options={[
                        { value: "noVetting", label: t("coverage.noVetting"), hint: t("coverage.noVettingHint"), icon: PowerOff, tone: "bg-sky-50 ring-sky-300" },
                        { value: "block", label: t("coverage.block"), hint: t("coverage.blockHint"), icon: Ban, tone: "bg-amber-50 ring-amber-300" },
                      ]}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      </div>

      {/* ── List screening ── */}
      <Card id="screening" icon={ShieldAlert} tone="bg-rose-100 text-rose-600" title={t("screening.title")} subtitle={t("screening.subtitle")}>
        <div className="divide-y divide-line">
          {!draft.enabled && (
            <p className="flex items-center gap-2 bg-subtle px-5 py-2.5 text-xs text-ink-3 sm:px-6">
              <Info className="size-3.5 shrink-0" />
              {t("screening.inactive")}
            </p>
          )}
          <div className="px-5 py-4 sm:px-6">
            <Tooltip content={blacklistLocked ? t("screening.blacklistLocked") : null}>
              <span className="block" tabIndex={blacklistLocked ? 0 : undefined}>
                <Switch
                  label={t("screening.blacklist")}
                  hint={
                    blacklistLocked ? (
                      <span className="inline-flex items-center gap-1">
                        <Lock className="size-3" />
                        {t("screening.blacklistLocked")}
                      </span>
                    ) : (
                      t("screening.blacklistHint")
                    )
                  }
                  checked={draft.blacklistScreening}
                  disabled={blacklistLocked}
                  onChange={(blacklistScreening) => patch({ blacklistScreening })}
                />
              </span>
            </Tooltip>
          </div>
          <div className={cn("space-y-2.5 px-5 py-4 sm:px-6", !draft.blacklistScreening && "opacity-60")}>
            <p className="text-sm font-semibold text-ink">{t("screening.matchAction")}</p>
            <ChoiceCards<RegistrationVettingSettings["blacklistMatchAction"]>
              label={t("screening.matchAction")}
              value={draft.blacklistMatchAction}
              disabled={!draft.blacklistScreening}
              onChange={(blacklistMatchAction) => patch({ blacklistMatchAction })}
              options={[
                { value: "hold", label: t("screening.hold"), hint: t("screening.holdHint"), icon: Hand, badge: t("screening.default") },
                { value: "autoRejectExact", label: t("screening.autoReject"), hint: t("screening.autoRejectHint"), icon: Zap, tone: "bg-rose-50 ring-rose-300" },
              ]}
            />
          </div>
          <div className="px-5 py-4 sm:px-6">
            <Switch
              label={t("screening.watchlist")}
              hint={t("screening.watchlistHint")}
              checked={draft.watchlistScreening}
              onChange={(watchlistScreening) => patch({ watchlistScreening })}
            />
          </div>
        </div>
      </Card>

      {/* ── Rejection message ── */}
      <Card id="message" icon={Mail} tone="bg-sky-100 text-sky-600" title={t("message.title")} subtitle={t("message.subtitle")}>
        <div className="space-y-4 px-5 py-5 sm:px-6">
          <div>
            <p className="mb-1.5 text-sm font-semibold text-ink">{t("message.template")}</p>
            <Select
              label={t("message.template")}
              value={template}
              onChange={(rejectionTemplateId) => patch({ rejectionTemplateId })}
              options={TEMPLATES.map((id) => ({ value: id, label: t(`message.templates.${id}`) }))}
              className="sm:max-w-80"
            />
          </div>
          <figure className="overflow-hidden rounded-xl ring-1 ring-line">
            <figcaption className="flex items-center gap-2 border-b border-line bg-subtle px-4 py-2 text-xs font-semibold text-ink-2">
              <Mail className="size-3.5 text-ink-3" />
              {t("message.preview")}
            </figcaption>
            <p dir="auto" className="bg-surface px-4 py-3.5 text-sm leading-relaxed whitespace-pre-line text-ink">
              {t(`message.bodies.${template}`, { name: t("message.sampleName"), event: fmt.text(ev?.name) })}
            </p>
          </figure>
          <p className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-600/20 ring-inset">
            <ShieldCheck className="mt-px size-4 shrink-0" />
            {t("message.safe")}
          </p>
        </div>
      </Card>
    </div>
  );
}
