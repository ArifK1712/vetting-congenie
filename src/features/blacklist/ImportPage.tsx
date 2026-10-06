"use client";

import { ChevronRight, CircleAlert, CircleCheck, Download, FileSpreadsheet, FileUp, Loader2, Lock, RotateCcw, Sparkles, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";
import { PAGE } from "@/design/layout";
import { Button } from "@/components/ui/Button";
import { DirIcon } from "@/components/ui/DirIcon";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/Toast";
import { readImport, REASON_TYPES, rowReady, templateCsv, type ImportRow } from "@/domain/blacklist";
import type { Database } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { useNow } from "@/lib/useNow";
import { blacklistService } from "@/services/blacklist";
import { useDb } from "@/store/app";
import { useViewer } from "@/store/useViewer";
import { useBlacklistError, useImportErrorText, useIssueText, useReasonLabel } from "./parts";

/** A demo file with good rows and typical mistakes, so the check can be tried without preparing a CSV. */
function sampleCsv(db: Database) {
  const existing = Object.values(db.blacklist).find((e) => e.status === "active" && e.identity.nationalId);
  const lines = [
    "person,Rashid Al-Mutairi,راشد المطيري|Rashed Almutairi,1087654321,,SA,,+966551234567,1979-02-11,,all,security_threat,Reported by venue security at the 2025 summit (incident ref. VS-2025-044).,2026-10-05,",
    "person,Elena Petrova,,,P7712093,RU,e.petrova@mailbox.example,,1988-07-30,,GIS26|REF26,fake_registration,Submitted altered press credentials for two events.,2026-10-05,2027-10-05",
    "company,Blue Dune Logistics,Blue Dune Logistics LLC,,,,,,,Blue Dune Logistics,all,unpaid_dues,Exhibitor balance from 2025 unpaid after three notices.,2026-10-05,2027-03-31",
    `person,${existing?.identity.fullName ?? "Known Person"},,${existing?.identity.nationalId ?? "1000000000"},,SA,,,,,all,past_misconduct,Second report from the protocol office.,2026-10-05,`,
    "person,Omar Khalil,,,,,,,1990-05-05,,RDW26,other,Name only; ID still to be confirmed.,2026-10-05,",
    "person,Samir Haddad,,1099887766,,SA,,,1984-12-01,,EXPO27,security_threat,Instruction from authority ref. SEC-2026-140.,2026-10-05,",
  ];
  return `${templateCsv().split("\n")[0]}\n${lines.join("\n")}\n`;
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function RowState({ row }: { row: ImportRow }) {
  const t = useTranslations("blacklist.import");
  const issueText = useIssueText();
  const importErrorText = useImportErrorText();
  const errors = [...row.readErrors.map(importErrorText), ...row.issues.filter((i) => i.severity === "error").map((i) => issueText(i.code))];
  const warnings = row.issues.filter((i) => i.severity === "warning");
  if (errors.length)
    return (
      <div className="space-y-0.5 text-xs text-rose-700">
        {errors.map((e) => (
          <p key={e} className="flex items-start gap-1.5">
            <CircleAlert className="mt-px size-3.5 shrink-0" />
            <span dir="auto">{e}</span>
          </p>
        ))}
      </div>
    );
  return (
    <div className="space-y-0.5 text-xs">
      <p className="flex items-center gap-1.5 font-semibold text-emerald-700">
        <CircleCheck className="size-3.5" />
        {t("ready")}
      </p>
      {warnings.map((w) => (
        <p key={w.code} className="flex items-start gap-1.5 text-amber-800">
          <TriangleAlert className="mt-px size-3.5 shrink-0" />
          {issueText(w.code)}{" "}
          {w.ref && (
            <Link href={`/screening/blacklist/${w.ref}`} className="font-mono whitespace-nowrap underline">
              {w.ref}
            </Link>
          )}
        </p>
      ))}
    </div>
  );
}

export function ImportPage() {
  const t = useTranslations("blacklist");
  const ti = useTranslations("blacklist.import");
  const fmt = useFormat();
  const reasonLabel = useReasonLabel();
  const errorText = useBlacklistError();
  const importErrorText = useImportErrorText();
  const db = useDb();
  const viewer = useViewer();
  const router = useRouter();
  const now = useNow();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const result = useMemo(() => (text ? readImport(db, text, now) : null), [db, text, now]);
  const ready = result?.rows.filter(rowReady) ?? [];

  if (!viewer.can("blacklist.propose")) {
    return <EmptyState icon={Lock} title={ti("noAccessTitle")} body={ti("noAccessBody")} />;
  }

  const load = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) {
      toast(ti("saveAsCsv"));
      return;
    }
    setFileName(file.name);
    setText(await file.text());
  };

  const submit = async () => {
    setBusy(true);
    const r = await blacklistService.import({ drafts: ready.map((x) => x.draft), actorId: viewer.id });
    setBusy(false);
    if (!r.ok) return toast(errorText(r.error));
    toast(ti("toastSent", { count: r.ids.length, n: fmt.number(r.ids.length) }));
    router.push("/screening/blacklist?tab=approvals");
  };

  return (
    <div className={cn(PAGE, "pb-16")}>
      <nav className="flex items-center gap-1.5 text-xs font-medium text-ink-3">
        <Link href="/screening/blacklist" className="hover:text-accent-text">
          {t("breadcrumb")}
        </Link>
        <DirIcon icon={ChevronRight} className="size-3.5" />
        <span className="text-ink-2">{ti("crumb")}</span>
      </nav>
      <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink">{ti("title")}</h1>
      <p className="mt-1 text-sm text-ink-2">{ti("subtitle")}</p>

      <ol className="mt-6 grid gap-4 md:grid-cols-2">
        <li className="rounded-xl bg-surface p-5 shadow-card ring-1 ring-line">
          <p className="flex items-center gap-2 text-sm font-bold text-ink">
            <span className="inline-flex size-6 items-center justify-center rounded-lg bg-accent-soft text-xs text-accent-text">{fmt.number(1)}</span>
            {ti("step1")}
          </p>
          <p className="mt-1.5 text-sm text-ink-2">{ti("step1Body")}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => download("blacklist-template.csv", templateCsv())}>
              <Download className="size-3.5" />
              {ti("downloadTemplate")}
            </Button>
          </div>
          <p className="mt-3 text-xs text-ink-3">
            {ti("codes", { events: Object.values(db.events).map((e) => e.code).join(", "), reasons: REASON_TYPES.join(", ") })}
          </p>
        </li>
        <li className="rounded-xl bg-surface p-5 shadow-card ring-1 ring-line">
          <p className="flex items-center gap-2 text-sm font-bold text-ink">
            <span className="inline-flex size-6 items-center justify-center rounded-lg bg-accent-soft text-xs text-accent-text">{fmt.number(2)}</span>
            {ti("step2")}
          </p>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void load(e.dataTransfer.files[0]);
            }}
            className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-line-strong bg-subtle px-4 py-4"
          >
            <FileSpreadsheet className="size-6 text-ink-3" />
            <span className="min-w-0 flex-1 text-sm text-ink-2">{fileName ? <bdi>{fileName}</bdi> : ti("dropCsv")}</span>
            <Button size="sm" onClick={() => fileRef.current?.click()}>
              <FileUp className="size-3.5" />
              {ti("chooseFile")}
            </Button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void load(e.target.files?.[0])} />
          </div>
          <button
            type="button"
            onClick={() => {
              setFileName(ti("sampleName"));
              setText(sampleCsv(db));
            }}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-accent-text hover:underline"
          >
            <Sparkles className="size-3.5" />
            {ti("useSample")}
          </button>
        </li>
      </ol>

      {result && (
        <section className="mt-6 overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-line">
          <header className="flex flex-wrap items-center gap-3 px-5 py-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold text-ink">{ti("step3")}</h2>
              <p className="mt-0.5 text-xs text-ink-3">
                {result.headerError
                  ? importErrorText(result.headerError)
                  : ti("summary", { count: result.rows.length, rows: fmt.number(result.rows.length), ready: fmt.number(ready.length), problems: fmt.number(result.rows.length - ready.length) })}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setText(null);
                setFileName(null);
              }}
            >
              <RotateCcw className="size-3.5" />
              {ti("startOver")}
            </Button>
            <Button size="sm" variant="primary" disabled={!ready.length || busy} onClick={() => void submit()}>
              {busy && <Loader2 className="size-3.5 animate-spin" />}
              {ti("send", { n: fmt.number(ready.length) })}
            </Button>
          </header>
          {!result.headerError && (
            <div className="overflow-x-auto border-t border-line">
              <table className="w-full min-w-[56rem] text-sm">
                <thead className="bg-subtle">
                  <tr>
                    {[ti("colRow"), ti("colName"), ti("colType"), ti("colIdentifiers"), ti("colEvents"), ti("colReason"), ti("colCheck")].map((h) => (
                      <th key={h} className="eyebrow h-9 px-3 text-start first:ps-5 last:pe-5">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => {
                    const id = r.draft.identity;
                    const ok = rowReady(r);
                    return (
                      <tr key={r.line} className={cn("border-t border-line align-top", !ok && "bg-rose-50/40")}>
                        <td className="tabular px-3 py-3 ps-5 text-xs text-ink-3">{fmt.number(r.line)}</td>
                        <td className="px-3 py-3">
                          <bdi className="block font-semibold text-ink">{id.fullName || "—"}</bdi>
                          {id.aliases.length > 0 && <bdi className="block text-xs text-ink-3">{id.aliases.join(" · ")}</bdi>}
                        </td>
                        <td className="px-3 py-3 text-xs text-ink-2">{t(id.subjectType === "company" ? "type.company" : "type.person")}</td>
                        <td dir="auto" className="px-3 py-3 font-mono text-xs text-ink-2">
                          {[id.nationalId && ti("idValue", { value: id.nationalId }), id.passportNo && ti("passportValue", { value: `${id.passportNo} ${id.nationality ?? ""}` }), id.email, id.company].filter(Boolean).join(" · ") || "—"}
                        </td>
                        <td className="px-3 py-3 text-xs text-ink-2">{r.draft.eventScope === "all" ? t("allEvents") : <bdi>{r.draft.eventScope.map((e) => db.events[e]?.code).join(", ")}</bdi>}</td>
                        <td className="px-3 py-3 text-xs text-ink-2">{r.draft.reasonType ? reasonLabel(r.draft.reasonType) : "—"}</td>
                        <td className="w-80 px-3 py-3 pe-5">
                          <RowState row={r} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
