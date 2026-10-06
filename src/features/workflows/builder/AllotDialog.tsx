"use client";

import { Share2, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ActionDialog, DialogIcon } from "@/components/ui/Dialog";
import { toast } from "@/components/ui/Toast";
import { allotmentOptions } from "@/domain/workflowAdmin";
import type { Database, ID, Workflow } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { cn } from "@/lib/cn";
import { workflowService } from "@/services/workflows";
import { useViewer } from "@/store/useViewer";

/**
 * 6.6 allotment. Only registrations with the workflow's badge type are
 * offered. Ticking one that already uses another workflow shows the clash
 * with Replace or Cancel.
 */
export function AllotDialog({ db, wf, onClose }: { db: Database; wf: Workflow; onClose: () => void }) {
  const viewer = useViewer();
  const t = useTranslations("workflows");
  const fmt = useFormat();
  const options = allotmentOptions(db, wf);
  const [chosen, setChosen] = useState<ID[]>(options.filter((o) => o.mine).map((o) => o.registration.id));
  const [replace, setReplace] = useState<ID[]>([]);
  const [asking, setAsking] = useState<ID | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const badge = fmt.text(db.badgeTypes[wf.badgeTypeId]?.name);

  const toggle = (id: ID) => {
    const o = options.find((x) => x.registration.id === id)!;
    if (chosen.includes(id)) {
      setChosen(chosen.filter((x) => x !== id));
      setReplace(replace.filter((x) => x !== id));
      return;
    }
    if (o.current && !o.mine) return setAsking(id);
    setChosen([...chosen, id]);
  };

  const save = async () => {
    setBusy(true);
    const r = await workflowService.allot({ workflowId: wf.id, registrationIds: chosen, replace, actorId: viewer.id });
    setBusy(false);
    if (!r.ok) return setError(t(`errors.${r.error}`));
    toast(t("allot.saved", { name: fmt.text(wf.name) }));
    onClose();
  };

  return (
    <ActionDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("allot.title")}
      description={t("allot.description", { badge })}
      icon={
        <DialogIcon className="bg-violet-50 text-violet-600">
          <Share2 className="size-5" />
        </DialogIcon>
      }
      confirmLabel={t("allot.confirm")}
      busy={busy}
      error={error}
      confirmDisabled={asking !== null}
      onConfirm={save}
    >
      <ul className="divide-y divide-line rounded-xl ring-1 ring-line">
        {options.map((o) => {
          const id = o.registration.id;
          const on = chosen.includes(id);
          const other = o.current && !o.mine ? db.workflows[o.current.workflowId] : null;
          return (
            <li key={id} className={cn("px-3.5 py-2.5", asking === id && "bg-amber-50")}>
              <label className="flex cursor-pointer items-center gap-3">
                <input type="checkbox" className="size-4 accent-indigo-600" checked={on} onChange={() => toggle(id)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">
                    {fmt.text(o.registration.name)} <span className="font-mono text-xs text-ink-3">· {db.events[o.registration.eventId]?.code}</span>
                  </span>
                  <span className="block truncate text-xs text-ink-3">
                    {o.mine
                      ? t("allot.usesThis")
                      : other
                        ? replace.includes(id)
                          ? t("allot.willReplace", { name: fmt.text(other.name) })
                          : t("allot.uses", { name: fmt.text(other.name) })
                        : t("allot.none")}
                  </span>
                </span>
              </label>
              {asking === id && other && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2 ps-7">
                  <p className="flex min-w-0 flex-1 items-start gap-1.5 text-xs text-amber-900">
                    <TriangleAlert className="mt-px size-3.5 shrink-0" />
                    {t("allot.clash", { registration: fmt.text(o.registration.name), workflow: fmt.text(other.name), badge })}
                  </p>
                  <Button size="sm" variant="ghost" onClick={() => setAsking(null)}>
                    {t("allot.cancel")}
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      setChosen([...chosen, id]);
                      setReplace([...replace, id]);
                      setAsking(null);
                    }}
                  >
                    {t("allot.replace")}
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-ink-3">{t("allot.note")}</p>
    </ActionDialog>
  );
}
