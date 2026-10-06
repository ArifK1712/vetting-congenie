"use client";

import { ArrowDown, ArrowUp, EyeOff, ListChecks, Pencil, Plus, ShieldAlert, Tag } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ActionDialog, DialogIcon } from "@/components/ui/Dialog";
import { Field, TextInput } from "@/components/ui/Field";
import { toast } from "@/components/ui/Toast";
import { Tooltip } from "@/components/ui/Tooltip";
import { orderedReasons, type SettingsError } from "@/domain/settings";
import type { RejectReason } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { cn } from "@/lib/cn";
import { settingsService } from "@/services/settings";
import { useDb } from "@/store/app";
import { useViewer } from "@/store/useViewer";
import { Card, MiniSwitch } from "@/features/registrations/parts";

type DialogState = { mode: "add" } | { mode: "rename"; reason: RejectReason } | null;

export function ReasonsTab() {
  const t = useTranslations("settings.reasons");
  const fmt = useFormat();
  const db = useDb();
  const viewer = useViewer();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reasons = useMemo(() => orderedReasons(db), [db]);
  const usage = useMemo(() => {
    const out: Record<string, number> = {};
    for (const r of Object.values(db.requests)) if (r.rejectReasonId) out[r.rejectReasonId] = (out[r.rejectReasonId] ?? 0) + 1;
    return out;
  }, [db]);
  const active = reasons.filter((r) => r.active).length;

  const errorText = (e: SettingsError | "notFound", lastActive = false) => (e === "invalid" && lastActive ? t("errors.lastActive") : t(`errors.${e}`));

  const toggle = async (r: RejectReason) => {
    if (r.system) {
      toast(t("errors.system"));
      return;
    }
    setBusyId(r.id);
    const res = await settingsService.setReasonActive({ id: r.id, active: !r.active, actorId: viewer.id });
    setBusyId(null);
    const name = fmt.text(r.label);
    toast(res.ok ? (r.active ? t("deactivated", { name }) : t("activated", { name })) : errorText(res.error, true));
  };

  const move = async (r: RejectReason, direction: -1 | 1) => {
    setBusyId(r.id);
    const res = await settingsService.moveReason({ id: r.id, direction, actorId: viewer.id });
    setBusyId(null);
    if (!res.ok) toast(errorText(res.error));
  };

  return (
    <>
      <Card
        id="reasons"
        icon={ListChecks}
        tone="bg-rose-100 text-rose-600"
        title={t("title")}
        subtitle={t("subtitle")}
        action={
          <Button variant="primary" size="sm" onClick={() => setDialog({ mode: "add" })}>
            <Plus className="size-3.5" />
            {t("add")}
          </Button>
        }
      >
        <p className="tabular border-b border-line bg-subtle px-5 py-2 text-xs font-medium text-ink-3 sm:px-6">
          {t("count", { count: reasons.length, n: fmt.number(reasons.length), active: fmt.number(active) })}
        </p>
        <ol className="divide-y divide-line" aria-label={t("title")}>
          {reasons.map((r, i) => {
            const name = fmt.text(r.label);
            const other = fmt.locale === "ar" ? r.label.en : r.label.ar;
            const used = usage[r.id] ?? 0;
            const busy = busyId === r.id;
            return (
              <li
                key={r.id}
                data-reason={r.id}
                data-active={r.active || undefined}
                className={cn("flex flex-wrap items-center gap-x-4 gap-y-2.5 px-5 py-3.5 sm:flex-nowrap sm:px-6", !r.active && "bg-subtle")}
              >
                <span
                  className={cn(
                    "tabular inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
                    r.system ? "bg-rose-100 text-rose-700" : r.active ? "bg-indigo-50 text-indigo-700" : "bg-hover text-ink-3",
                  )}
                >
                  {fmt.number(i + 1)}
                </span>
                <div className={cn("min-w-0 flex-1 basis-48", !r.active && "opacity-60")}>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span dir="auto" className="text-sm font-semibold text-ink" data-reason-label>
                      {name}
                    </span>
                    {r.system && (
                      <Tooltip content={t("systemHint")}>
                        <span tabIndex={0} data-system-badge className="inline-flex h-5 items-center gap-1 rounded-md bg-rose-50 px-1.5 text-2xs font-semibold text-rose-700 ring-1 ring-rose-600/15 ring-inset outline-none focus-visible:ring-2 focus-visible:ring-accent">
                          <ShieldAlert className="size-3" />
                          {t("system")}
                        </span>
                      </Tooltip>
                    )}
                  </p>
                  {other && other !== name && (
                    <p className="mt-0.5 truncate text-xs text-ink-3">
                      <span dir="auto">{other}</span>
                    </p>
                  )}
                  {!r.active && (
                    <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-ink-3" data-inactive-note>
                      <EyeOff className="size-3" />
                      {t("inactive")}
                    </p>
                  )}
                </div>
                <span className={cn("tabular inline-flex shrink-0 items-center gap-1 text-xs", used ? "text-ink-2" : "text-ink-3")} data-usage={used}>
                  <Tag className="size-3" />
                  {t("used", { count: used, n: fmt.number(used) })}
                </span>
                <div className="ms-auto flex shrink-0 items-center gap-1">
                  <Tooltip content={r.system ? t("systemHint") : null}>
                    <span className="inline-flex px-1.5">
                      <MiniSwitch label={t("activeLabel", { name })} checked={r.active} disabled={r.system || busy} onChange={() => void toggle(r)} />
                    </span>
                  </Tooltip>
                  <Button size="sm" variant="ghost" iconOnly aria-label={t("renameLabel", { name })} title={t("rename")} onClick={() => setDialog({ mode: "rename", reason: r })}>
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" iconOnly aria-label={t("moveUp", { name })} disabled={i === 0 || busy} onClick={() => void move(r, -1)}>
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" iconOnly aria-label={t("moveDown", { name })} disabled={i === reasons.length - 1 || busy} onClick={() => void move(r, 1)}>
                    <ArrowDown className="size-3.5" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      </Card>
      {dialog && <ReasonDialog key={dialog.mode === "rename" ? dialog.reason.id : "add"} state={dialog} onClose={() => setDialog(null)} />}
    </>
  );
}

function ReasonDialog({ state, onClose }: { state: NonNullable<DialogState>; onClose: () => void }) {
  const t = useTranslations("settings.reasons");
  const viewer = useViewer();
  const existing = state.mode === "rename" ? state.reason : null;
  const [en, setEn] = useState(existing?.label.en ?? "");
  const [ar, setAr] = useState(existing?.label.ar ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const label = { en, ar };
    const res = existing ? await settingsService.renameReason({ id: existing.id, label, actorId: viewer.id }) : await settingsService.addReason({ label, actorId: viewer.id });
    setBusy(false);
    if (!res.ok) {
      setError(t(`errors.${res.error}`));
      return;
    }
    toast(existing ? t("renamed") : t("added", { name: en.trim() }));
    onClose();
  };

  return (
    <ActionDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={existing ? t("renameTitle") : t("addTitle")}
      description={existing ? t("renameDescription") : t("addDescription")}
      icon={
        <DialogIcon className="bg-rose-50 text-rose-600">
          <ListChecks className="size-5" />
        </DialogIcon>
      }
      confirmLabel={existing ? t("confirmRename") : t("confirmAdd")}
      busy={busy}
      error={error}
      confirmDisabled={!en.trim()}
      onConfirm={() => void submit()}
    >
      <Field label={t("labelEn")} htmlFor="reason-en">
        <TextInput
          id="reason-en"
          dir="ltr"
          lang="en"
          value={en}
          placeholder={t("placeholderEn")}
          onChange={(e) => {
            setEn(e.target.value);
            setError(null);
          }}
        />
      </Field>
      <Field label={t("labelAr")} hint={t("labelArHint")} htmlFor="reason-ar">
        <TextInput id="reason-ar" dir="rtl" lang="ar" value={ar} placeholder={t("placeholderAr")} onChange={(e) => setAr(e.target.value)} />
      </Field>
    </ActionDialog>
  );
}
