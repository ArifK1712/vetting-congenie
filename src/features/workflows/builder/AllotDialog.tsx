"use client";

import { Share2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ActionDialog, DialogIcon } from "@/components/ui/Dialog";
import { toast } from "@/components/ui/Toast";
import { allotmentOptions } from "@/domain/workflowAdmin";
import type { Database, ID, Workflow } from "@/domain/types";
import { cn } from "@/lib/cn";
import { WORKFLOW_ERRORS, workflowService } from "@/services/workflows";
import { useViewer } from "@/store/useViewer";

/**
 * 6.6 allotment. Only registrations with the workflow's badge type are
 * offered. Ticking one that already uses another workflow shows the clash
 * with Replace or Cancel.
 */
export function AllotDialog({ db, wf, onClose }: { db: Database; wf: Workflow; onClose: () => void }) {
  const viewer = useViewer();
  const options = allotmentOptions(db, wf);
  const [chosen, setChosen] = useState<ID[]>(options.filter((o) => o.mine).map((o) => o.registration.id));
  const [replace, setReplace] = useState<ID[]>([]);
  const [asking, setAsking] = useState<ID | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const badge = db.badgeTypes[wf.badgeTypeId]?.name.en ?? "";

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
    if (!r.ok) return setError(WORKFLOW_ERRORS[r.error]);
    toast(`Allotment saved for ${wf.name.en}`);
    onClose();
  };

  return (
    <ActionDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Allot to registrations"
      description={`Registrations that have the ${badge} badge type. Each registration uses one workflow per badge type.`}
      icon={
        <DialogIcon className="bg-violet-50 text-violet-600">
          <Share2 className="size-5" />
        </DialogIcon>
      }
      confirmLabel="Save allotment"
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
                    {o.registration.name.en} <span className="font-mono text-xs text-ink-3">· {db.events[o.registration.eventId]?.code}</span>
                  </span>
                  <span className="block truncate text-xs text-ink-3">
                    {o.mine ? "Uses this workflow" : other ? (replace.includes(id) ? `Will replace ${other.name.en}` : `Uses ${other.name.en}`) : "No workflow yet"}
                  </span>
                </span>
              </label>
              {asking === id && other && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2 ps-7">
                  <p className="flex min-w-0 flex-1 items-start gap-1.5 text-xs text-amber-900">
                    <TriangleAlert className="mt-px size-3.5 shrink-0" />
                    {o.registration.name.en} already uses {other.name.en} for {badge}. Replace it?
                  </p>
                  <Button size="sm" variant="ghost" onClick={() => setAsking(null)}>
                    Cancel
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
                    Replace
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-ink-3">Removing or replacing an allotment affects new requests only. Requests already submitted keep their workflow.</p>
    </ActionDialog>
  );
}
