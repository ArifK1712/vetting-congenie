"use client";

import { CircleSlash, Eye, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ActionDialog, DialogIcon } from "@/components/ui/Dialog";
import { Field, TextArea } from "@/components/ui/Field";
import { Pill } from "@/components/ui/Status";
import { toast } from "@/components/ui/Toast";
import type { Tone } from "@/design/tones";
import { effectiveStatus, extraStageOptions, type WatchError, type WatchIssueCode } from "@/domain/watchlist";
import type { Database, ID, ScreeningMatch, WatchlistEntry, WatchlistHistoryEvent, WatchlistLevel } from "@/domain/types";
import { WATCHLIST_REVIEW } from "@/domain/workflow";
import { useFormat } from "@/i18n/format";
import { cn } from "@/lib/cn";
import { watchlistService } from "@/services/watchlist";
import { useViewer } from "@/store/useViewer";
import { useIssueText } from "@/features/blacklist/parts";

/** Level label, e.g. "High". */
export function useLevelLabel() {
  const t = useTranslations("watchlist.level");
  return (level: WatchlistLevel) => t(level);
}

const LEVEL_TONE: Record<WatchlistLevel, Tone> = { low: "gold", medium: "amber", high: "orange" };

export function LevelPill({ level, size }: { level: WatchlistLevel; size?: "sm" | "md" }) {
  const levelLabel = useLevelLabel();
  return (
    <Pill tone={LEVEL_TONE[level]} size={size}>
      {levelLabel(level)}
    </Pill>
  );
}

/** Three bars, filled up to the level: readable without relying on colour. */
export function LevelMeter({ level }: { level: WatchlistLevel }) {
  const t = useTranslations("watchlist");
  const levelLabel = useLevelLabel();
  const n = { low: 1, medium: 2, high: 3 }[level];
  return (
    <span aria-label={t("levelAria", { level: levelLabel(level) })} className="inline-flex items-end gap-[2px]">
      {[1, 2, 3].map((i) => (
        <span key={i} className={cn("w-1 rounded-sm", i === 1 ? "h-2" : i === 2 ? "h-3" : "h-4", i <= n ? (level === "high" ? "bg-orange-500" : level === "medium" ? "bg-amber-500" : "bg-yellow-500") : "bg-line-strong")} />
      ))}
    </span>
  );
}

/** All "on match" choices, in display order. */
export const ON_MATCH: WatchlistEntry["onMatch"][] = ["mark", "markEmail", "markStage"];

/** What happens on a match, e.g. "Mark and send email". */
export function useOnMatchLabel() {
  const t = useTranslations("watchlist.onMatch");
  return (onMatch: WatchlistEntry["onMatch"]) => t(onMatch);
}

/** One-line explanation of an "on match" choice. */
export function useOnMatchHint() {
  const t = useTranslations("watchlist.onMatchHint");
  return (onMatch: WatchlistEntry["onMatch"]) => t(onMatch);
}

const STATUS_TONE: Record<WatchlistEntry["status"], Tone> = { active: "indigo", removed: "gray", expired: "slate" };

/** All entry statuses, in display order (for filters). */
export const WATCH_STATUSES = Object.keys(STATUS_TONE) as WatchlistEntry["status"][];

/** Entry status label, e.g. "Expired". */
export function useWatchStatusLabel() {
  const t = useTranslations("watchlist.status");
  return (status: WatchlistEntry["status"]) => t(status);
}

export function WatchStatus({ entry, now }: { entry: WatchlistEntry; now: number }) {
  const statusLabel = useWatchStatusLabel();
  const s = effectiveStatus(entry, now);
  return <Pill tone={STATUS_TONE[s]}>{statusLabel(s)}</Pill>;
}

/** Issue codes worded for the watchlist; the rest share the blacklist wording. */
const WATCH_ONLY_ISSUES = ["possibleDuplicate", "levelRequired", "notifyRequired", "stageRequired", "noteTooLong"] as const;
type WatchOnlyIssue = (typeof WATCH_ONLY_ISSUES)[number];
const isWatchOnly = (code: WatchIssueCode): code is WatchOnlyIssue => (WATCH_ONLY_ISSUES as readonly string[]).includes(code);

/** Validation message for a watchlist issue code. */
export function useWatchIssueText() {
  const t = useTranslations("watchlist.issue");
  const shared = useIssueText();
  return (code: WatchIssueCode) => (isWatchOnly(code) ? t(code) : shared(code));
}

/** History line after the actor's name, e.g. "removed the entry". */
export function useWatchHistoryLabel() {
  const t = useTranslations("watchlist.history");
  return (action: WatchlistHistoryEvent["action"]) => t(action);
}

/** Service error code to a message. */
export function useWatchlistError() {
  const t = useTranslations("watchlist.errors");
  return (error: WatchError) => t(error);
}

/** The extra review stages an entry can add, worded for the current locale. */
export function useExtraStageOptions(db: Database) {
  const t = useTranslations("watchlist.stage");
  const fmt = useFormat();
  return extraStageOptions(db).map((o) =>
    o.workflow && o.stage
      ? { value: o.value, label: t("option", { workflow: fmt.text(o.workflow), stage: fmt.text(o.stage) }), hint: t("optionHint") }
      : { value: o.value, label: t("standard"), hint: t("standardHint") },
  );
}

/** Label for an entry's extra stage. */
export function useExtraStageLabel(db: Database) {
  const t = useTranslations("watchlist.stage");
  const options = useExtraStageOptions(db);
  return (value: string | null) => {
    if (!value || value === WATCHLIST_REVIEW) return t("standard");
    return options.find((o) => o.value === value)?.label ?? t("fallback");
  };
}

/** Names of the people and teams an entry emails. */
export function useNotifyNames(db: Database) {
  const fmt = useFormat();
  return (ids: ID[]) => ids.map((id) => db.users[id]?.name ?? (db.teams[id] ? fmt.text(db.teams[id].name) : id));
}

export function matchesOf(db: Database, entryId: ID): ScreeningMatch[] {
  return Object.values(db.matches).filter((m) => m.entryId === entryId && m.listType === "watchlist");
}

// ─── Dialogs ────────────────────────────────────────────────────────────

export function RemoveDialog({ entry, onClose }: { entry: WatchlistEntry; onClose: () => void }) {
  const t = useTranslations("watchlist.remove");
  const errorText = useWatchlistError();
  const viewer = useViewer();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <ActionDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("title", { id: entry.id })}
      description={t("description")}
      icon={
        <DialogIcon className="bg-rose-50 text-rose-600">
          <Trash2 className="size-5" />
        </DialogIcon>
      }
      confirmLabel={t("confirm")}
      confirmVariant="danger"
      confirmDisabled={!reason.trim()}
      busy={busy}
      error={error}
      onConfirm={async () => {
        setBusy(true);
        const r = await watchlistService.remove({ entryId: entry.id, expectedRevision: entry.revision, reason, actorId: viewer.id });
        setBusy(false);
        if (!r.ok) return setError(errorText(r.error));
        toast(t("toast", { id: entry.id }));
        onClose();
      }}
    >
      <Field label={t("reason")} htmlFor="wl-remove" hint={t("required")}>
        <TextArea id="wl-remove" dir="auto" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("placeholder")} />
      </Field>
    </ActionDialog>
  );
}

export function ClearMatchDialog({ db, match, onClose }: { db: Database; match: ScreeningMatch; onClose: () => void }) {
  const t = useTranslations("watchlist.clear");
  const errorText = useWatchlistError();
  const viewer = useViewer();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const r = db.requests[match.requestId];
  const name = r ? db.attendees[r.attendeeId].profile.fullName : match.requestId;
  return (
    <ActionDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("title")}
      description={t("description", { name, id: match.requestId })}
      icon={
        <DialogIcon className="bg-emerald-50 text-emerald-600">
          <CircleSlash className="size-5" />
        </DialogIcon>
      }
      confirmLabel={t("confirm")}
      confirmVariant="success"
      confirmDisabled={!note.trim()}
      busy={busy}
      error={error}
      onConfirm={async () => {
        setBusy(true);
        const res = await watchlistService.clearMatch({ matchId: match.id, note, actorId: viewer.id });
        setBusy(false);
        if (!res.ok) return setError(errorText(res.error));
        toast(t("toast", { id: match.requestId }));
        onClose();
      }}
    >
      <Field label={t("reason")} htmlFor="wl-clear" hint={t("required")}>
        <TextArea id="wl-clear" dir="auto" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("placeholder")} />
      </Field>
    </ActionDialog>
  );
}

export const WatchIcon = Eye;
