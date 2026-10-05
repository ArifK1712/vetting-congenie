"use client";

import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { toast } from "@/components/ui/Toast";
import type { ActionResult } from "@/domain/actions";

/**
 * Runs one request action with a busy flag and a translated error. On
 * success it shows `successMessage(result)` as a toast and calls `onDone`.
 */
export function useRequestAction() {
  const te = useTranslations("actions.errors");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (
      call: () => Promise<ActionResult>,
      successMessage: (r: Extract<ActionResult, { ok: true }>) => string,
      onDone?: () => void,
    ) => {
      setBusy(true);
      setError(null);
      try {
        const result = await call();
        if (result.ok) {
          toast(successMessage(result));
          onDone?.();
          return true;
        }
        setError(te(result.error));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [te],
  );

  return { busy, error, setError, run };
}

/** Fire-and-forget variant for one-click actions (Claim) where errors go to a toast. */
export function useQuickAction() {
  const te = useTranslations("actions.errors");
  const [busyId, setBusyId] = useState<string | null>(null);
  const run = useCallback(
    async (key: string, call: () => Promise<ActionResult>, successMessage: string) => {
      setBusyId(key);
      try {
        const result = await call();
        toast(result.ok ? successMessage : te(result.error));
        return result.ok;
      } finally {
        setBusyId(null);
      }
    },
    [te],
  );
  return { busyId, run };
}
