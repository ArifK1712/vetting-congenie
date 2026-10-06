"use client";

import * as RD from "@radix-ui/react-dialog";
import { Ban, BadgeCheck, Braces, CircleCheck, CircleX, DoorOpen, Gauge, Printer, ScanLine, ShieldX, Undo2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { ActionDialog, DialogIcon } from "@/components/ui/Dialog";
import { Field, TextArea, TextInput } from "@/components/ui/Field";
import { toast } from "@/components/ui/Toast";
import { usePortalContainer } from "@/components/ui/portal";
import { capacityOf, type BadgeBlock, type CapacityError } from "@/domain/attendees";
import type { Database, ID, Registration } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { cn } from "@/lib/cn";
import { attendeeService } from "@/services/attendees";
import { apiResponse, lookupAttendee, type AttendeeRow } from "./model";

// ─── Shared ─────────────────────────────────────────────────────────────

/** A dialog that shows a result (no confirm step): title, body and a close button. */
export function InfoDialog({
  open,
  onOpenChange,
  title,
  description,
  icon,
  children,
  closeLabel,
  wide,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
  closeLabel: string;
  wide?: boolean;
}) {
  const container = usePortalContainer();
  const tc = useTranslations("common");
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal container={container}>
        <RD.Overlay className="anim-fade fixed inset-0 z-50 bg-slate-900/20 backdrop-blur-[2px]" />
        <RD.Content
          className={cn(
            "anim-pop fixed top-[8vh] left-1/2 z-50 flex max-h-[84vh] w-[calc(100vw-2rem)] -translate-x-1/2 flex-col rounded-2xl bg-surface shadow-pop ring-1 ring-line outline-none",
            wide ? "max-w-xl" : "max-w-lg",
          )}
        >
          <div className="flex items-start gap-3.5 px-6 pt-6">
            {icon}
            <div className="min-w-0 flex-1">
              <RD.Title className="text-lg font-bold text-ink">{title}</RD.Title>
              {description ? <RD.Description className="mt-1 text-sm text-ink-2">{description}</RD.Description> : <RD.Description className="sr-only">{title}</RD.Description>}
            </div>
            <RD.Close aria-label={tc("close")} className="-me-2 -mt-1 inline-flex size-8 items-center justify-center rounded-lg text-ink-3 hover:bg-hover hover:text-ink">
              <X className="size-4" />
            </RD.Close>
          </div>
          {children && <div className="min-h-0 space-y-4 overflow-y-auto px-6 pt-5">{children}</div>}
          <div className="mt-6 flex justify-end rounded-b-2xl border-t border-line bg-subtle px-6 py-4">
            <Button onClick={() => onOpenChange(false)}>{closeLabel}</Button>
          </div>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}

/** Runs a capacity action (free place, withdraw, change limit) with a busy flag and translated error. */
function useCapacityAction() {
  const te = useTranslations("attendees.errors");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async (call: () => Promise<{ ok: true; waiting: number } | { ok: false; error: CapacityError }>, success: (waiting: number) => string, onDone: () => void) => {
      setBusy(true);
      setError(null);
      try {
        const r = await call();
        if (r.ok) {
          toast(success(r.waiting));
          onDone();
        } else setError(te(r.error));
      } finally {
        setBusy(false);
      }
    },
    [te],
  );
  return { busy, error, run };
}

// ─── Badge refusal (11.2) ───────────────────────────────────────────────

export interface Refusal {
  name: string;
  requestId?: ID;
  reason: BadgeBlock;
}

export function RefusalDialog({ refusal, onClose }: { refusal: Refusal | null; onClose: () => void }) {
  const t = useTranslations("attendees.refusal");
  return (
    <InfoDialog
      open={!!refusal}
      onOpenChange={(o) => !o && onClose()}
      title={t("title")}
      icon={
        <DialogIcon className="bg-rose-50 text-rose-600">
          <ShieldX className="size-5" />
        </DialogIcon>
      }
      closeLabel={t("ok")}
    >
      {refusal && (
        <>
          <div className="rounded-xl bg-rose-50 px-4 py-3.5 ring-1 ring-rose-600/15 ring-inset">
            <p className="text-sm font-semibold text-rose-800" data-refusal>
              {t(refusal.reason)}
            </p>
            <p className="mt-1 text-xs text-rose-700">
              <bdi>{refusal.name}</bdi>
              {refusal.requestId && (
                <>
                  {" · "}
                  <span className="ltr-data font-mono">{refusal.requestId}</span>
                </>
              )}
            </p>
          </div>
          {refusal.requestId && <p className="text-xs text-ink-3">{t("logged")}</p>}
        </>
      )}
    </InfoDialog>
  );
}

// ─── Bulk print result (AC17) ───────────────────────────────────────────

export interface BulkResult {
  printed: number;
  refused: { row: AttendeeRow; reason: BadgeBlock }[];
}

export function BulkResultDialog({ result, onClose }: { result: BulkResult | null; onClose: () => void }) {
  const t = useTranslations("attendees.bulk");
  const tr = useTranslations("attendees.refusal");
  const fmt = useFormat();
  return (
    <InfoDialog
      open={!!result}
      onOpenChange={(o) => !o && onClose()}
      title={t("resultTitle")}
      wide
      icon={
        <DialogIcon className="bg-indigo-50 text-indigo-600">
          <Printer className="size-5" />
        </DialogIcon>
      }
      closeLabel={t("done")}
    >
      {result && (
        <>
          <div className="grid grid-cols-2 gap-3" data-bulk-summary>
            <div className="rounded-xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-600/15 ring-inset">
              <CircleCheck className="size-4 text-emerald-600" />
              <p className="tabular mt-1.5 text-lg font-bold text-emerald-800">{t("printed", { n: fmt.number(result.printed) })}</p>
            </div>
            <div className={cn("rounded-xl px-4 py-3 ring-1 ring-inset", result.refused.length ? "bg-rose-50 ring-rose-600/15" : "bg-subtle ring-line")}>
              <CircleX className={cn("size-4", result.refused.length ? "text-rose-600" : "text-ink-3")} />
              <p className={cn("tabular mt-1.5 text-lg font-bold", result.refused.length ? "text-rose-800" : "text-ink-2")}>{t("refused", { n: fmt.number(result.refused.length) })}</p>
            </div>
          </div>
          {result.refused.length ? (
            <div>
              <p className="eyebrow mb-2">{t("refusedList")}</p>
              <ul className="divide-y divide-line overflow-hidden rounded-xl ring-1 ring-line">
                {result.refused.map(({ row, reason }) => (
                  <li key={row.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3.5 py-2.5">
                    <span className="min-w-0">
                      <bdi className="block truncate text-sm font-medium text-ink">{row.name}</bdi>
                      {row.request && <span className="ltr-data block font-mono text-2xs text-ink-3">{row.request.id}</span>}
                    </span>
                    <span className="text-xs font-medium text-rose-700">{tr(reason)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-ink-2">{t("allPrinted")}</p>
          )}
        </>
      )}
    </InfoDialog>
  );
}

// ─── Check-in kiosk ─────────────────────────────────────────────────────

type ScanResult = { kind: "welcome"; name: string } | { kind: "refused"; reason: BadgeBlock; name: string } | { kind: "notFound" };

export function KioskDialog({ db, viewerId, samples, onClose }: { db: Database; viewerId: ID; samples: AttendeeRow[]; onClose: () => void }) {
  const t = useTranslations("attendees.kiosk");
  const te = useTranslations("attendees.errors");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);

  const scan = async (value = code) => {
    const attendee = lookupAttendee(db, value);
    if (!attendee) return setResult({ kind: "notFound" });
    setResult(null);
    setBusy(true);
    try {
      const r = await attendeeService.produceBadges({ attendeeIds: [attendee.id], channel: "kiosk", actorId: viewerId });
      if (!r.ok) return toast(te(r.error));
      const name = attendee.profile.fullName;
      setResult(r.printed.length ? { kind: "welcome", name } : { kind: "refused", reason: r.blocked[0]?.reason ?? "notApproved", name });
    } finally {
      setBusy(false);
    }
  };

  return (
    <InfoDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("title")}
      description={t("description")}
      icon={
        <DialogIcon className="bg-teal-50 text-teal-600">
          <ScanLine className="size-5" />
        </DialogIcon>
      }
      closeLabel={t("close")}
    >
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) void scan();
        }}
      >
        <div className="min-w-0 flex-1">
          <Field label={t("code")} htmlFor="kiosk-code">
            <TextInput id="kiosk-code" className="ltr-data" value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("placeholder")} autoComplete="off" />
          </Field>
        </div>
        <Button type="submit" variant="primary" disabled={busy || !code.trim()}>
          <ScanLine className="size-4" />
          {t("scan")}
        </Button>
      </form>
      {samples.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="me-1 text-xs text-ink-3">{t("samples")}</span>
          {samples.map((s) => (
            <button
              key={s.id}
              type="button"
              disabled={busy}
              onClick={() => {
                const v = s.request?.id ?? s.email;
                setCode(v);
                void scan(v);
              }}
              className="ltr-data inline-flex h-7 items-center rounded-md bg-subtle px-2 font-mono text-xs text-ink-2 ring-1 ring-line ring-inset hover:bg-hover hover:text-ink"
            >
              {s.request?.id ?? s.email}
            </button>
          ))}
        </div>
      )}

      <div aria-live="polite" data-kiosk-result={result?.kind ?? ""}>
        {busy ? (
          <div className="flex h-36 items-center justify-center rounded-2xl bg-subtle ring-1 ring-line ring-inset">
            <ScanLine className="size-8 animate-pulse text-ink-3" />
          </div>
        ) : result?.kind === "welcome" ? (
          <div className="flex flex-col items-center rounded-2xl bg-emerald-50 px-6 py-7 text-center ring-1 ring-emerald-600/20 ring-inset">
            <span className="inline-flex size-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm">
              <BadgeCheck className="size-7" />
            </span>
            <p className="mt-3 text-2xl font-bold tracking-tight text-emerald-800">
              {t("welcome", { name: result.name })}
            </p>
            <p className="mt-1 text-sm text-emerald-700">{t("welcomeHint")}</p>
          </div>
        ) : result?.kind === "refused" ? (
          <div className="flex flex-col items-center rounded-2xl bg-rose-50 px-6 py-7 text-center ring-1 ring-rose-600/20 ring-inset">
            <span className="inline-flex size-14 items-center justify-center rounded-full bg-rose-500 text-white shadow-sm">
              <Ban className="size-7" />
            </span>
            <p className="mt-3 text-xl font-bold tracking-tight text-rose-800">{t(result.reason)}</p>
            <bdi className="mt-1 text-sm text-rose-700">{result.name}</bdi>
          </div>
        ) : result?.kind === "notFound" ? (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 ring-1 ring-amber-600/20 ring-inset">{t("notFound")}</p>
        ) : null}
      </div>
    </InfoDialog>
  );
}

// ─── Read-only API (13.4) ───────────────────────────────────────────────

export function ApiDialog({ db, samples, onClose }: { db: Database; samples: AttendeeRow[]; onClose: () => void }) {
  const t = useTranslations("attendees.api");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  // Re-read live: the response reflects the current state, like a real GET.
  const found = sent ? lookupAttendee(db, sent) : undefined;
  const body = found ? apiResponse(db, found) : null;

  return (
    <InfoDialog
      open
      wide
      onOpenChange={(o) => !o && onClose()}
      title={t("title")}
      description={t("description")}
      icon={
        <DialogIcon className="bg-violet-50 text-violet-600">
          <Braces className="size-5" />
        </DialogIcon>
      }
      closeLabel={t("close")}
    >
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSent(code);
        }}
      >
        <div className="min-w-0 flex-1">
          <Field label={t("code")} htmlFor="api-code">
            <TextInput id="api-code" className="ltr-data" value={code} onChange={(e) => setCode(e.target.value)} placeholder="VR-1001" autoComplete="off" />
          </Field>
        </div>
        <Button type="submit" variant="primary" disabled={!code.trim()}>
          {t("send")}
        </Button>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {samples.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              const v = s.request?.id ?? s.id;
              setCode(v);
              setSent(v);
            }}
            className="ltr-data inline-flex h-7 items-center rounded-md bg-subtle px-2 font-mono text-xs text-ink-2 ring-1 ring-line ring-inset hover:bg-hover hover:text-ink"
          >
            {s.request?.id ?? s.id}
          </button>
        ))}
      </div>
      {sent !== null && (
        <div>
          <p className="eyebrow mb-2">{t("response")}</p>
          <div dir="ltr" className="overflow-hidden rounded-xl bg-subtle ring-1 ring-line ring-inset">
            <p className="flex items-center gap-2 border-b border-line px-4 py-2 font-mono text-2xs text-ink-3">
              <span className={cn("rounded px-1.5 py-0.5 font-semibold", body ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800")}>{body ? "200 OK" : "404"}</span>
              GET /api/v1/attendees/{found?.id ?? encodeURIComponent(sent.trim())}/vetting
            </p>
            <pre data-api-response className="overflow-x-auto px-4 py-3 font-mono text-xs leading-relaxed text-ink">
              {body ? JSON.stringify(body, null, 2) : JSON.stringify({ error: "not_found" }, null, 2)}
            </pre>
          </div>
          {!body && <p className="mt-2 text-xs text-ink-3">{t("notFound")}</p>}
        </div>
      )}
    </InfoDialog>
  );
}

// ─── Free place / withdraw (11.3) ───────────────────────────────────────

export function FreePlaceDialog({ row, db, viewerId, onClose }: { row: AttendeeRow; db: Database; viewerId: ID; onClose: () => void }) {
  const t = useTranslations("attendees.freePlace");
  const tt = useTranslations("attendees.toasts");
  const fmt = useFormat();
  const [reason, setReason] = useState("");
  const { busy, error, run } = useCapacityAction();
  const request = row.request!;
  const registration = fmt.text(db.registrations[row.registrationId]?.name);

  return (
    <ActionDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("title", { name: row.name })}
      description={t("description", { registration })}
      icon={
        <DialogIcon className="bg-amber-50 text-amber-600">
          <DoorOpen className="size-5 rtl:-scale-x-100" />
        </DialogIcon>
      }
      confirmLabel={t("confirm")}
      confirmVariant="danger"
      busy={busy}
      error={error}
      confirmDisabled={!reason.trim()}
      onConfirm={() =>
        run(
          () => attendeeService.releasePlace({ requestId: request.id, reason, actorId: viewerId, expectedRevision: request.revision }),
          (waiting) => (waiting ? tt("placeFreedWaiting", { name: row.name, count: waiting, n: fmt.number(waiting) }) : tt("placeFreed", { name: row.name })),
          onClose,
        )
      }
    >
      <div className="rounded-xl bg-amber-50/70 p-3.5 ring-1 ring-amber-600/15 ring-inset">
        <p className="text-sm font-semibold text-amber-900">{t("effects")}</p>
        <ul className="mt-1.5 list-disc space-y-0.5 ps-5 text-sm text-amber-900/90">
          <li>{t("revoke")}</li>
          <li>{t("cancel")}</li>
          <li>{t("keep")}</li>
          <li>{t("log")}</li>
        </ul>
      </div>
      <Field label={t("reason")} htmlFor="free-reason">
        <TextArea id="free-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("reasonPlaceholder")} />
      </Field>
    </ActionDialog>
  );
}

export function WithdrawDialog({ row, viewerId, onClose }: { row: AttendeeRow; viewerId: ID; onClose: () => void }) {
  const t = useTranslations("attendees.withdraw");
  const tt = useTranslations("attendees.toasts");
  const [reason, setReason] = useState("");
  const { busy, error, run } = useCapacityAction();
  const request = row.request!;
  return (
    <ActionDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("title", { id: request.id })}
      description={t("description", { name: row.name })}
      icon={
        <DialogIcon className="bg-slate-100 text-slate-600">
          <Undo2 className="size-5 rtl:-scale-x-100" />
        </DialogIcon>
      }
      confirmLabel={t("confirm")}
      confirmVariant="danger"
      busy={busy}
      error={error}
      confirmDisabled={!reason.trim()}
      onConfirm={() =>
        run(
          () => attendeeService.withdraw({ requestId: request.id, reason, actorId: viewerId, expectedRevision: request.revision }),
          () => tt("withdrawn", { id: request.id }),
          onClose,
        )
      }
    >
      <Field label={t("reason")} htmlFor="withdraw-reason">
        <TextArea id="withdraw-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("reasonPlaceholder")} />
      </Field>
    </ActionDialog>
  );
}

// ─── Registration limit (11.3) ──────────────────────────────────────────

export function ChangeLimitDialog({ registration, db, viewerId, onClose }: { registration: Registration; db: Database; viewerId: ID; onClose: () => void }) {
  const t = useTranslations("attendees.limitDialog");
  const tt = useTranslations("attendees.toasts");
  const fmt = useFormat();
  const cap = useMemo(() => capacityOf(db, registration.id), [db, registration.id]);
  const [limit, setLimit] = useState(String(cap.limit));
  const [reason, setReason] = useState("");
  const { busy, error, run } = useCapacityAction();
  const name = fmt.text(registration.name);

  return (
    <ActionDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("title")}
      description={t("description", { registration: name, used: fmt.number(cap.used) })}
      icon={
        <DialogIcon className="bg-indigo-50 text-indigo-600">
          <Gauge className="size-5" />
        </DialogIcon>
      }
      confirmLabel={t("confirm")}
      busy={busy}
      error={error}
      confirmDisabled={!limit.trim() || !reason.trim()}
      onConfirm={() => {
        const n = Number(limit);
        run(
          () => attendeeService.setLimit({ registrationId: registration.id, limit: n, reason, actorId: viewerId }),
          (waiting) => {
            const freeNow = n - cap.used;
            return waiting && freeNow > 0
              ? tt("limitSavedWaiting", { registration: name, limit: fmt.number(n), count: Math.min(waiting, freeNow), n: fmt.number(Math.min(waiting, freeNow)) })
              : tt("limitSaved", { registration: name, limit: fmt.number(n) });
          },
          onClose,
        );
      }}
    >
      <Field label={t("limit")} hint={t("limitHint", { limit: fmt.number(cap.limit) })} htmlFor="limit-value">
        <TextInput id="limit-value" type="number" inputMode="numeric" min={1} step={1} className="tabular max-w-40" value={limit} onChange={(e) => setLimit(e.target.value)} />
      </Field>
      {cap.waiting > 0 && (
        <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800 ring-1 ring-amber-600/20 ring-inset">
          {t("waitingNote", { count: cap.waiting, n: fmt.number(cap.waiting) })}
        </p>
      )}
      <Field label={t("reason")} htmlFor="limit-reason">
        <TextArea id="limit-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("reasonPlaceholder")} />
      </Field>
    </ActionDialog>
  );
}
