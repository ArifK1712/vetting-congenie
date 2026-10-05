"use client";

import { CircleSlash, Eye, Trash2 } from "lucide-react";
import { useState } from "react";
import { ActionDialog, DialogIcon } from "@/components/ui/Dialog";
import { Field, TextArea } from "@/components/ui/Field";
import { Pill } from "@/components/ui/Status";
import { toast } from "@/components/ui/Toast";
import type { Tone } from "@/design/tones";
import { effectiveStatus, extraStageOptions, type WatchIssueCode } from "@/domain/watchlist";
import type { Database, ID, ScreeningMatch, WatchlistEntry, WatchlistLevel } from "@/domain/types";
import { WATCHLIST_REVIEW } from "@/domain/workflow";
import { cn } from "@/lib/cn";
import { WATCHLIST_ERRORS, watchlistService } from "@/services/watchlist";
import { useViewer } from "@/store/useViewer";
import { ISSUE_TEXT } from "@/features/blacklist/parts";

/** English copy for the Watchlist area (English-only by product decision). */

export const LEVEL_LABEL: Record<WatchlistLevel, string> = { low: "Low", medium: "Medium", high: "High" };
const LEVEL_TONE: Record<WatchlistLevel, Tone> = { low: "gold", medium: "amber", high: "orange" };

export function LevelPill({ level, size }: { level: WatchlistLevel; size?: "sm" | "md" }) {
  return (
    <Pill tone={LEVEL_TONE[level]} size={size}>
      {LEVEL_LABEL[level]}
    </Pill>
  );
}

/** Three bars, filled up to the level: readable without relying on colour. */
export function LevelMeter({ level }: { level: WatchlistLevel }) {
  const n = { low: 1, medium: 2, high: 3 }[level];
  return (
    <span aria-label={`${LEVEL_LABEL[level]} level`} className="inline-flex items-end gap-[2px]">
      {[1, 2, 3].map((i) => (
        <span key={i} className={cn("w-1 rounded-sm", i === 1 ? "h-2" : i === 2 ? "h-3" : "h-4", i <= n ? (level === "high" ? "bg-orange-500" : level === "medium" ? "bg-amber-500" : "bg-yellow-500") : "bg-line-strong")} />
      ))}
    </span>
  );
}

export const ON_MATCH_LABEL: Record<WatchlistEntry["onMatch"], string> = {
  mark: "Mark only",
  markEmail: "Mark and send email",
  markStage: "Mark and add a review stage",
};

export const ON_MATCH_HINT: Record<WatchlistEntry["onMatch"], string> = {
  mark: "The request shows the level and the reviewer note.",
  markEmail: "Also emails the chosen people and teams on every match.",
  markStage: "Also adds one extra review stage, just before final approval.",
};

export const STATUS_LABEL: Record<WatchlistEntry["status"], string> = { active: "Active", removed: "Removed", expired: "Expired" };
const STATUS_TONE: Record<WatchlistEntry["status"], Tone> = { active: "indigo", removed: "gray", expired: "slate" };

export function WatchStatus({ entry, now }: { entry: WatchlistEntry; now: number }) {
  const s = effectiveStatus(entry, now);
  return <Pill tone={STATUS_TONE[s]}>{STATUS_LABEL[s]}</Pill>;
}

export const WATCH_ISSUE_TEXT: Record<WatchIssueCode, string> = {
  ...ISSUE_TEXT,
  possibleDuplicate: "Another watchlist entry already has this ID number, email or company.",
  levelRequired: "Choose a level.",
  notifyRequired: "Choose at least one person or team to email.",
  stageRequired: "Choose the review stage to add.",
  noteTooLong: "Keep the reviewer note under 200 characters.",
};

export const HISTORY_LABEL: Record<string, string> = {
  created: "added the entry",
  edited: "edited the entry",
  removed: "removed the entry",
  match_cleared: "cleared a match: not the same person",
  moved_to_blacklist: "proposed it for the blacklist",
};

export function extraStageLabel(db: Database, value: string | null) {
  if (!value || value === WATCHLIST_REVIEW) return "Standard Watchlist Review";
  return extraStageOptions(db).find((o) => o.value === value)?.label ?? "Workflow stage";
}

export function notifyNames(db: Database, ids: ID[]) {
  return ids.map((id) => db.users[id]?.name ?? db.teams[id]?.name.en ?? id);
}

export function matchesOf(db: Database, entryId: ID): ScreeningMatch[] {
  return Object.values(db.matches).filter((m) => m.entryId === entryId && m.listType === "watchlist");
}

// ─── Dialogs ────────────────────────────────────────────────────────────

export function RemoveDialog({ entry, onClose }: { entry: WatchlistEntry; onClose: () => void }) {
  const viewer = useViewer();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <ActionDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Remove ${entry.id}?`}
      description="New registrations won't be marked by it, and the requests it marked lose its level. Past decisions stay. This is logged."
      icon={
        <DialogIcon className="bg-rose-50 text-rose-600">
          <Trash2 className="size-5" />
        </DialogIcon>
      }
      confirmLabel="Remove entry"
      confirmVariant="danger"
      confirmDisabled={!reason.trim()}
      busy={busy}
      error={error}
      onConfirm={async () => {
        setBusy(true);
        const r = await watchlistService.remove({ entryId: entry.id, expectedRevision: entry.revision, reason, actorId: viewer.id });
        setBusy(false);
        if (!r.ok) return setError(WATCHLIST_ERRORS[r.error]);
        toast(`${entry.id} removed`);
        onClose();
      }}
    >
      <Field label="Reason for removing" htmlFor="wl-remove" hint="Required">
        <TextArea id="wl-remove" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Concern resolved with the sponsoring organisation" />
      </Field>
    </ActionDialog>
  );
}

export function ClearMatchDialog({ db, match, onClose }: { db: Database; match: ScreeningMatch; onClose: () => void }) {
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
      title="Not the same person?"
      description={`${name} (${match.requestId}) loses this watchlist mark, and this pair won't match again. Logged on the request and the entry.`}
      icon={
        <DialogIcon className="bg-emerald-50 text-emerald-600">
          <CircleSlash className="size-5" />
        </DialogIcon>
      }
      confirmLabel="Clear the match"
      confirmVariant="success"
      confirmDisabled={!note.trim()}
      busy={busy}
      error={error}
      onConfirm={async () => {
        setBusy(true);
        const res = await watchlistService.clearMatch({ matchId: match.id, note, actorId: viewer.id });
        setBusy(false);
        if (!res.ok) return setError(WATCHLIST_ERRORS[res.error]);
        toast(`Match cleared for ${match.requestId}`);
        onClose();
      }}
    >
      <Field label="Why is it not the same person?" htmlFor="wl-clear" hint="Required">
        <TextArea id="wl-clear" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Different date of birth and nationality" />
      </Field>
    </ActionDialog>
  );
}

export const WatchIcon = Eye;
