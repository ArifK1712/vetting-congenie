"use client";

import { Building2, CheckCircle2, ShieldBan, Trash2, UserRound, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { ActionDialog, DialogIcon } from "@/components/ui/Dialog";
import { Field, TextArea } from "@/components/ui/Field";
import { Pill } from "@/components/ui/Status";
import { toast } from "@/components/ui/Toast";
import type { Tone } from "@/design/tones";
import { effectiveStatus, retroMatches, type BlacklistError, type EntryIssueCode, type ImportError } from "@/domain/blacklist";
import { maskId } from "@/domain/screening";
import type { BlacklistEntry, BlacklistHistoryEvent, BlacklistReason, Database, ListIdentity } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { Link } from "@/i18n/navigation";
import { blacklistService } from "@/services/blacklist";
import { useViewer } from "@/store/useViewer";

/** Reason type label, e.g. "Security threat". */
export function useReasonLabel() {
  const t = useTranslations("blacklist.reason");
  return (reason: BlacklistReason) => t(reason);
}

/** Entry status label, e.g. "Waiting for approval". */
export function useStatusLabel() {
  const t = useTranslations("blacklist.status");
  return (status: BlacklistEntry["status"]) => t(status);
}

const STATUS_TONE: Record<BlacklistEntry["status"], Tone> = {
  pending_approval: "amber",
  active: "rose",
  removed: "gray",
  expired: "slate",
  not_approved: "gray",
};

/** All entry statuses, in display order (for filters). */
export const ENTRY_STATUSES = Object.keys(STATUS_TONE) as BlacklistEntry["status"][];

/** How the entry was added, e.g. "Imported from a file". */
export function useSourceLabel() {
  const t = useTranslations("blacklist.source");
  return (source: BlacklistEntry["source"]) => t(source);
}

/** Validation message for an entry issue code. */
export function useIssueText() {
  const t = useTranslations("blacklist.issue");
  return (code: EntryIssueCode) => t(code);
}

/** History line after the actor's name, e.g. "approved the entry". */
export function useHistoryLabel() {
  const t = useTranslations("blacklist.history");
  return (action: BlacklistHistoryEvent["action"]) => t(action);
}

/** Service error code to a message. */
export function useBlacklistError() {
  const t = useTranslations("blacklist.errors");
  return (error: BlacklistError) => t(error);
}

/** Blacklist import problem (header or row) to a message. Codes it doesn't know are returned as is. */
export function useImportErrorText() {
  const t = useTranslations("blacklist.importError");
  return (e: ImportError) => {
    const p = e.params ?? {};
    switch (e.code) {
      case "empty":
        return t("empty");
      case "missingColumns":
        return t("missingColumns", { columns: p.columns ?? "" });
      case "badType":
        return t("badType", { value: p.value || t("emptyValue") });
      case "unknownEvent":
        return t("unknownEvent", { code: p.code ?? "" });
      case "unknownReason":
        return t("unknownReason", { value: p.value ?? "" });
      case "duplicateRow":
        return t("duplicateRow");
      default:
        return e.code;
    }
  };
}

export function EntryStatus({ entry, now }: { entry: BlacklistEntry; now: number }) {
  const t = useTranslations("blacklist");
  const statusLabel = useStatusLabel();
  const status = effectiveStatus(entry, now);
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Pill tone={STATUS_TONE[status]}>{statusLabel(status)}</Pill>
      {entry.pendingChange && (
        <Pill tone="amber" dot={false}>
          {t("changeWaiting")}
        </Pill>
      )}
    </span>
  );
}

export function TypeChip({ type }: { type: ListIdentity["subjectType"] }) {
  const t = useTranslations("blacklist.type");
  const Icon = type === "company" ? Building2 : UserRound;
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-md bg-hover px-2 text-xs font-medium text-ink-2">
      <Icon className="size-3.5" />
      {t(type === "company" ? "company" : "person")}
    </span>
  );
}

/** ID numbers in the list are partly hidden (9.1). */
export function MaskedIds({ identity }: { identity: ListIdentity }) {
  const t = useTranslations("blacklist.ids");
  const parts = [
    identity.nationalId ? { key: "id", label: t("id"), value: maskId(identity.nationalId) } : null,
    identity.passportNo
      ? { key: "passport", label: identity.nationality ? t("passportOf", { country: identity.nationality }) : t("passport"), value: maskId(identity.passportNo) }
      : null,
  ].filter(Boolean) as { key: string; label: string; value: string }[];
  if (!parts.length) return <span className="text-xs text-ink-3">—</span>;
  return (
    <span className="block space-y-0.5">
      {parts.map((p) => (
        <span key={p.key} className="flex items-center gap-1.5 text-xs">
          <span className="text-ink-3">{p.label}</span>
          <span dir="ltr" className="font-mono text-ink-2">
            {p.value}
          </span>
        </span>
      ))}
    </span>
  );
}

/** The name an entry is shown under: the company for companies, otherwise the full name. */
export function displayName(e: Pick<BlacklistEntry, "identity">) {
  return e.identity.subjectType === "company" ? e.identity.company || e.identity.fullName : e.identity.fullName;
}

// ─── Decisions ──────────────────────────────────────────────────────────

const bold = (chunks: ReactNode) => <span className="font-semibold text-ink">{chunks}</span>;

/** What approving would do right now (9.5), shown before the approver confirms. */
export function ApprovalImpact({ db, entry }: { db: Database; entry: BlacklistEntry }) {
  const t = useTranslations("blacklist.impact");
  const fmt = useFormat();
  const c = entry.pendingChange ?? entry;
  const hits = retroMatches(db, c.identity, c.eventScope, entry.id);
  const held = hits.filter((h) => !h.approved);
  const suspended = hits.filter((h) => h.approved);
  const sep = fmt.locale === "ar" ? "، " : ", ";
  if (!hits.length) return <p className="text-sm text-ink-2">{t("none")}</p>;
  return (
    <div className="space-y-2 text-sm text-ink-2">
      {held.length > 0 && (
        <p>
          {t.rich("held", { count: held.length, n: fmt.number(held.length), b: bold })}{" "}
          {held.slice(0, 6).map((h, i) => (
            <span key={h.requestId}>
              {i > 0 && sep}
              <Link href={`/requests/${h.requestId}`} className="font-mono text-accent-text hover:underline">
                {h.requestId}
              </Link>
              {h.strength === "possible" && <span className="text-ink-3"> {t("possible")}</span>}
            </span>
          ))}
          {held.length > 6 && ` ${t("andMore", { n: fmt.number(held.length - 6) })}`}
        </p>
      )}
      {suspended.length > 0 && (
        <p>
          {t.rich("suspended", { count: suspended.length, n: fmt.number(suspended.length), b: bold })}{" "}
          {suspended.map((h, i) => (
            <span key={h.requestId}>
              {i > 0 && sep}
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
  const t = useTranslations("blacklist.decision");
  const tb = useTranslations("blacklist");
  const fmt = useFormat();
  const errorText = useBlacklistError();
  const viewer = useViewer();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isChange = !!entry.pendingChange;
  const name = displayName(entry);
  const id = entry.id;

  const confirm = async () => {
    setBusy(true);
    const ref = { entryId: entry.id, expectedRevision: entry.revision, actorId: viewer.id };
    const r = kind === "approve" ? await blacklistService.approve(ref) : kind === "reject" ? await blacklistService.reject({ ...ref, note }) : await blacklistService.remove({ ...ref, reason: note });
    setBusy(false);
    if (!r.ok) return setError(errorText(r.error));
    if (kind === "approve") {
      const extra = r.matched
        ? r.suspended
          ? t("toastMatchedSuspended", { count: r.matched, n: fmt.number(r.matched), suspended: r.suspended, s: fmt.number(r.suspended) })
          : t("toastMatched", { count: r.matched, n: fmt.number(r.matched) })
        : "";
      const base = isChange ? t("toastChangeApproved") : t("toastActive", { id });
      toast(extra ? `${base} ${extra}` : base);
    } else toast(kind === "reject" ? (isChange ? t("toastChangeRejected") : t("toastRejected", { id })) : t("toastRemoved", { id }));
    onClose();
  };

  const copy = {
    approve: {
      title: isChange ? t("approveChangeTitle", { id }) : t("approveTitle", { id }),
      description: isChange ? t("approveChangeDescription", { name }) : t("approveDescription", { name }),
      icon: <CheckCircle2 className="size-5" />,
      tone: "bg-emerald-50 text-emerald-600",
      confirm: isChange ? t("approveChange") : t("approveEntry"),
      variant: "success" as const,
    },
    reject: {
      title: isChange ? t("rejectChangeTitle") : t("rejectTitle", { id }),
      description: isChange ? t("rejectChangeDescription") : t("rejectDescription"),
      icon: <XCircle className="size-5" />,
      tone: "bg-rose-50 text-rose-600",
      confirm: tb("dontApprove"),
      variant: "danger" as const,
    },
    remove: {
      title: t("removeTitle", { id }),
      description: t("removeDescription", { name }),
      icon: <Trash2 className="size-5" />,
      tone: "bg-rose-50 text-rose-600",
      confirm: t("removeEntry"),
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
            {t("whatHappens")}
          </p>
          <ApprovalImpact db={db} entry={entry} />
        </div>
      ) : (
        <Field label={kind === "remove" ? t("removeReason") : t("rejectNote")} htmlFor="decision-note" hint={t("required")}>
          <TextArea id="decision-note" dir="auto" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === "remove" ? t("removePlaceholder") : t("rejectPlaceholder")} />
        </Field>
      )}
    </ActionDialog>
  );
}
