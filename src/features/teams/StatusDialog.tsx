"use client";

import { Ban, Inbox, Workflow } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { ActionDialog, DialogIcon } from "@/components/ui/Dialog";
import { toast } from "@/components/ui/Toast";
import { deactivationBlockers } from "@/domain/teams";
import type { Team } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { Link } from "@/i18n/navigation";
import { teamService } from "@/services/teams";
import { useDb } from "@/store/app";
import { useViewer } from "@/store/useViewer";

/**
 * Deactivate confirmation (5.5). When the team still has open requests or a
 * live stage, the dialog lists what to fix first and cannot be confirmed.
 */
export function DeactivateDialog({ team, open, onOpenChange }: { team: Team; open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations("teams.deactivate");
  const te = useTranslations("teams.errors");
  const fmt = useFormat();
  const db = useDb();
  const viewer = useViewer();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blockers = deactivationBlockers(db, team.id);
  const name = fmt.text(team.name);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    const r = await teamService.setStatus({ teamId: team.id, status: "inactive", expectedRevision: team.revision, actorId: viewer.id });
    setBusy(false);
    if (r.ok) {
      toast(t("done", { name }));
      onOpenChange(false);
    } else setError(te(r.error));
  };

  return (
    <ActionDialog
      open={open}
      onOpenChange={(o) => {
        setError(null);
        onOpenChange(o);
      }}
      title={t("title", { name })}
      description={blockers.length ? t("blockedBody") : t("body")}
      icon={
        <DialogIcon className="bg-rose-50 text-rose-600">
          <Ban className="size-5" />
        </DialogIcon>
      }
      confirmLabel={t("confirm")}
      confirmVariant="danger"
      confirmDisabled={blockers.length > 0}
      busy={busy}
      error={error}
      onConfirm={confirm}
    >
      {blockers.length > 0 && (
        <ul className="divide-y divide-line rounded-xl ring-1 ring-line">
          {blockers.map((b, i) =>
            b.type === "openRequests" ? (
              <li key={i} className="flex items-center gap-3 px-3.5 py-2.5">
                <Inbox className="size-4 shrink-0 text-amber-600" />
                <span className="min-w-0 flex-1 text-sm text-ink">{t("openRequests", { count: b.count, n: fmt.number(b.count) })}</span>
                <Link href={`/queue?team=${team.id}`} className="shrink-0 text-xs font-semibold text-accent-text hover:underline">
                  {t("openQueue")}
                </Link>
              </li>
            ) : (
              <li key={i} className="flex items-center gap-3 px-3.5 py-2.5">
                <Workflow className="size-4 shrink-0 text-violet-600" />
                <span className="min-w-0 flex-1 text-sm text-ink">
                  {t("liveStage", { workflow: fmt.text(db.workflows[b.use.workflowId]?.name), stage: fmt.text(b.use.stageName) })}
                  <span className="block text-xs text-ink-3">{b.use.role === "fallback" ? t("asFallback") : t("asPriority", { n: fmt.number(b.use.position) })}</span>
                </span>
              </li>
            ),
          )}
        </ul>
      )}
    </ActionDialog>
  );
}

/** Reactivates a team straight away (no confirmation needed). */
export function useActivateTeam() {
  const t = useTranslations("teams.deactivate");
  const te = useTranslations("teams.errors");
  const fmt = useFormat();
  const viewer = useViewer();
  return useCallback(
    async (team: Team) => {
      const r = await teamService.setStatus({ teamId: team.id, status: "active", expectedRevision: team.revision, actorId: viewer.id });
      toast(r.ok ? t("activated", { name: fmt.text(team.name) }) : te(r.error));
    },
    [t, te, fmt, viewer.id],
  );
}
