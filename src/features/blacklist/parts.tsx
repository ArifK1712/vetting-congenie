"use client";

import { Building2, CheckCircle2, ShieldBan, Trash2, UserRound, XCircle } from "lucide-react";
import { useState } from "react";
import { ActionDialog, DialogIcon } from "@/components/ui/Dialog";
import { Field, TextArea } from "@/components/ui/Field";
import { Pill } from "@/components/ui/Status";
import { toast } from "@/components/ui/Toast";
import type { Tone } from "@/design/tones";
import { effectiveStatus, retroMatches, type EntryIssue } from "@/domain/blacklist";
import { maskId } from "@/domain/screening";
import type { BlacklistEntry, BlacklistReason, Database, ListIdentity } from "@/domain/types";
import { Link } from "@/i18n/navigation";
import { BLACKLIST_ERRORS, blacklistService } from "@/services/blacklist";
import { useViewer } from "@/store/useViewer";

/** English copy for the Blacklist area (English-only by product decision). */

export const REASON_LABEL: Record<BlacklistReason, string> = {
  security_threat: "Security threat",
  past_misconduct: "Past misconduct",
  fake_registration: "Fake registration",
  authority_instruction: "Instruction from authority",
  unpaid_dues: "Unpaid dues",
  other: "Other",
};

export const STATUS_LABEL: Record<BlacklistEntry["status"], string> = {
  pending_approval: "Waiting for approval",
  active: "Active",
  removed: "Removed",
  expired: "Expired",
  not_approved: "Not approved",
};

const STATUS_TONE: Record<BlacklistEntry["status"], Tone> = {
  pending_approval: "amber",
  active: "rose",
  removed: "gray",
  expired: "slate",
  not_approved: "gray",
};

export const SOURCE_LABEL: Record<BlacklistEntry["source"], string> = {
  manual: "Added on the list",
  request: "Added from a request",
  import: "Imported from a file",
};

export const ISSUE_TEXT: Record<EntryIssue["code"], string> = {
  nameRequired: "Enter the name.",
  tooManyAliases: "Up to 5 other spellings.",
  idRequired: "Enter a National ID / Iqama, or a passport number with nationality.",
  nationalityRequired: "Choose the passport's nationality.",
  companyRequired: "Enter the company name. Everyone registering under it will be matched.",
  emailInvalid: "Enter a valid email address.",
  dobInvalid: "Date of birth must be a past date.",
  eventsRequired: "Choose at least one event, or All events.",
  reasonTypeRequired: "Choose a reason type.",
  reasonDetailRequired: "Describe the reason. It is never shown to the attendee.",
  reasonDetailTooLong: "Reason details can be up to 1000 characters.",
  tooManyFiles: "Up to 5 evidence files.",
  fileTooLarge: "Files can be up to 10 MB.",
  fileType: "Evidence must be PDF, JPG or PNG.",
  startRequired: "Choose a start date.",
  endBeforeStart: "The end date is before the start date.",
  possibleDuplicate: "Another entry already has this ID number or company.",
};

export const HISTORY_LABEL: Record<string, string> = {
  proposed: "proposed the entry",
  edited: "edited the entry (waiting again)",
  approved: "approved the entry",
  not_approved: "did not approve the entry",
  change_proposed: "proposed a change",
  change_approved: "approved the change",
  change_rejected: "did not approve the change",
  removed: "removed the entry",
};

export function EntryStatus({ entry, now }: { entry: BlacklistEntry; now: number }) {
  const status = effectiveStatus(entry, now);
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Pill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Pill>
      {entry.pendingChange && (
        <Pill tone="amber" dot={false}>
          Change waiting
        </Pill>
      )}
    </span>
  );
}

export function TypeChip({ type }: { type: ListIdentity["subjectType"] }) {
  const Icon = type === "company" ? Building2 : UserRound;
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-md bg-hover px-2 text-xs font-medium text-ink-2">
      <Icon className="size-3.5" />
      {type === "company" ? "Company" : "Person"}
    </span>
  );
}

/** ID numbers in the list are partly hidden (9.1). */
export function MaskedIds({ identity }: { identity: ListIdentity }) {
  const parts = [
    identity.nationalId ? { label: "ID", value: maskId(identity.nationalId) } : null,
    identity.passportNo ? { label: identity.nationality ? `Passport ${identity.nationality}` : "Passport", value: maskId(identity.passportNo) } : null,
  ].filter(Boolean) as { label: string; value: string }[];
  if (!parts.length) return <span className="text-xs text-ink-3">—</span>;
  return (
    <span className="block space-y-0.5">
      {parts.map((p) => (
        <span key={p.label} className="flex items-center gap-1.5 text-xs">
          <span className="text-ink-3">{p.label}</span>
          <span className="font-mono text-ink-2">{p.value}</span>
        </span>
      ))}
    </span>
  );
}

export function displayName(e: Pick<BlacklistEntry, "identity">) {
  return e.identity.subjectType === "company" ? e.identity.company || e.identity.fullName : e.identity.fullName;
}

// ─── Decisions ──────────────────────────────────────────────────────────

/** What approving would do right now (9.5), shown before the approver confirms. */
export function ApprovalImpact({ db, entry }: { db: Database; entry: BlacklistEntry }) {
  const c = entry.pendingChange ?? entry;
  const hits = retroMatches(db, c.identity, c.eventScope, entry.id);
  const held = hits.filter((h) => !h.approved);
  const suspended = hits.filter((h) => h.approved);
  if (!hits.length) return <p className="text-sm text-ink-2">No current request matches. Future registrations will be checked against it.</p>;
  return (
    <div className="space-y-2 text-sm text-ink-2">
      {held.length > 0 && (
        <p>
          <span className="font-semibold text-ink">{held.length}</span> request{held.length === 1 ? "" : "s"} in progress will go to Screening Hold:{" "}
          {held.slice(0, 6).map((h, i) => (
            <span key={h.requestId}>
              {i > 0 && ", "}
              <Link href={`/requests/${h.requestId}`} className="font-mono text-accent-text hover:underline">
                {h.requestId}
              </Link>
              {h.strength === "possible" && <span className="text-ink-3"> (possible)</span>}
            </span>
          ))}
          {held.length > 6 && ` and ${held.length - 6} more`}
        </p>
      )}
      {suspended.length > 0 && (
        <p>
          <span className="font-semibold text-ink">{suspended.length}</span> approved badge{suspended.length === 1 ? "" : "s"} will be suspended until someone decides:{" "}
          {suspended.map((h, i) => (
            <span key={h.requestId}>
              {i > 0 && ", "}
              <Link href={`/requests/${h.requestId}`} className="font-mono text-accent-text hover:underline">
                {h.requestId}
              </Link>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

type Decision = "approve" | "reject" | "remove";

export function DecisionDialog({ db, entry, kind, onClose }: { db: Database; entry: BlacklistEntry; kind: Decision; onClose: () => void }) {
  const viewer = useViewer();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isChange = !!entry.pendingChange;
  const name = displayName(entry);

  const confirm = async () => {
    setBusy(true);
    const ref = { entryId: entry.id, expectedRevision: entry.revision, actorId: viewer.id };
    const r = kind === "approve" ? await blacklistService.approve(ref) : kind === "reject" ? await blacklistService.reject({ ...ref, note }) : await blacklistService.remove({ ...ref, reason: note });
    setBusy(false);
    if (!r.ok) return setError(BLACKLIST_ERRORS[r.error]);
    if (kind === "approve") {
      const extra = r.matched ? ` ${r.matched} request${r.matched === 1 ? "" : "s"} matched${r.suspended ? `, ${r.suspended} badge${r.suspended === 1 ? "" : "s"} suspended` : ""}.` : "";
      toast(`${isChange ? "Change approved" : `${entry.id} is now active`}.${extra}`);
    } else toast(kind === "reject" ? `${isChange ? "Change" : entry.id} not approved` : `${entry.id} removed`);
    onClose();
  };

  const copy = {
    approve: {
      title: isChange ? `Approve the change to ${entry.id}?` : `Approve ${entry.id}?`,
      description: isChange ? `${name}'s entry will be updated.` : `${name} will be blocked from getting a badge.`,
      icon: <CheckCircle2 className="size-5" />,
      tone: "bg-emerald-50 text-emerald-600",
      confirm: isChange ? "Approve change" : "Approve entry",
      variant: "success" as const,
    },
    reject: {
      title: isChange ? "Don’t approve this change?" : `Don’t approve ${entry.id}?`,
      description: isChange ? "The entry stays as it is. The proposer sees your note." : "The entry closes. Any request held because of it goes back to its stage.",
      icon: <XCircle className="size-5" />,
      tone: "bg-rose-50 text-rose-600",
      confirm: "Don’t approve",
      variant: "danger" as const,
    },
    remove: {
      title: `Remove ${entry.id}?`,
      description: `${name} will no longer be matched. Past decisions stay as they are. This is logged.`,
      icon: <Trash2 className="size-5" />,
      tone: "bg-rose-50 text-rose-600",
      confirm: "Remove entry",
      variant: "danger" as const,
    },
  }[kind];

  return (
    <ActionDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={copy.title}
      description={copy.description}
      icon={<DialogIcon className={copy.tone}>{copy.icon}</DialogIcon>}
      confirmLabel={copy.confirm}
      confirmVariant={copy.variant}
      confirmDisabled={kind !== "approve" && !note.trim()}
      busy={busy}
      error={error}
      onConfirm={confirm}
    >
      {kind === "approve" ? (
        <div className="rounded-xl bg-subtle px-4 py-3 ring-1 ring-line">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-ink">
            <ShieldBan className="size-3.5 text-rose-500" />
            What happens now
          </p>
          <ApprovalImpact db={db} entry={entry} />
        </div>
      ) : (
        <Field label={kind === "remove" ? "Reason for removing" : "Note to the proposer"} htmlFor="decision-note" hint="Required">
          <TextArea id="decision-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === "remove" ? "e.g. Restriction lifted by the security authority" : "e.g. Not enough evidence; attach the incident report"} />
        </Field>
      )}
    </ActionDialog>
  );
}
