"use client";

import { ChevronRight, CircleAlert, CircleCheck, Download, FileSpreadsheet, FileUp, Loader2, Lock, RotateCcw, Sparkles, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";
import { PAGE } from "@/design/layout";
import { Button } from "@/components/ui/Button";
import { DirIcon } from "@/components/ui/DirIcon";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/Toast";
import type { ImportError } from "@/domain/blacklist";
import { readWatchImport, watchRowReady, watchTemplateCsv, WATCH_COLUMNS, type WatchImportRow } from "@/domain/watchlist";
import type { Database } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { useNow } from "@/lib/useNow";
import { watchlistService } from "@/services/watchlist";
import { useDb } from "@/store/app";
import { useViewer } from "@/store/useViewer";
import { useImportErrorText, useReasonLabel } from "@/features/blacklist/parts";
import { LevelPill, useOnMatchLabel, useWatchIssueText, useWatchlistError } from "./parts";

/** A demo file with good rows and typical mistakes. CSV values stay English, like the template. */
function sampleCsv(db: Database) {
  const existing = Object.values(db.watchlist).find((e) => e.status === "active" && e.identity.nationalId);
  const lines = [
    "person,Hassan Al-Qadi,حسن القاضي,1076543210,,SA,,,1981-09-14,,all,past_misconduct,Lent his badge to a colleague at the 2025 summit.,2026-10-05,,high,stage,Compare the photo with the ID carefully",
    "person,Lucy Grant,,,K8834512,GB,lucy.grant@pressmail.example,,1992-03-02,,GIS26,fake_registration,Press card could not be verified with the issuer.,2026-10-05,2027-01-31,medium,mark,Call the outlet's editor to confirm the assignment",
    "company,Northwind Events,Northwind Events LLC,,,,,,,Northwind Events,all,unpaid_dues,Balance from 2025 settled late.,2026-10-05,,low,mark,Confirm current standing with Finance",
    `person,${existing?.identity.fullName ?? "Known Person"},,${existing?.identity.nationalId ?? "1000000000"},,SA,,,,,all,other,Raised again by Protocol.,2026-10-05,,medium,mark,Second report from Protocol`,
    "person,Tamer Saeed,,1045556677,,SA,,,1987-11-20,,all,other,Raised by accreditation.,2026-10-05,,urgent,mark,",
    "person,Mira Haddad,,,,,mira@example.com,,,,all,other,Needs a check.,2026-10-05,,low,email,",
  ];
  return `${WATCH_COLUMNS.join(",")}\n${lines.join("\n")}\n`;
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Watchlist import problems; shared ones (bad type, unknown event…) come from the blacklist messages. */
function useWatchImportErrorText() {
  const t = useTranslations("watchlist.importError");
  const blacklistText = useImportErrorText();
  return (e: ImportError) => {
    const p = e.params ?? {};
    switch (e.code) {
      case "missingWatchColumns":
        return t("missingWatchColumns", { columns: p.columns ?? "" });
      case "badLevel":
        return t("badLevel", { value: p.value ?? "" });
      case "badOnMatch":
        return t("badOnMatch", { value: p.value ?? "" });
      case "emailNotImportable":
        return t("emailNotImportable");
      default:
        return blacklistText(e);
    }
  };
}

function RowState({ row }: { row: WatchImportRow }) {
  const t = useTranslations("watchlist.import");
  const importErrorText = useWatchImportErrorText();
  const issueText = useWatchIssueText();
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
          <span>
            {issueText(w.code)}{" "}
            {w.ref && (
              <Link href={`/screening/watchlist/${w.ref}`} className="font-mono whitespace-nowrap underline">
                {w.ref}
              </Link>
            )}
          </span>
        </p>
      ))}
    </div>
  );
}

export function WatchImportPage() {
  const t = useTranslations("watchlist");
  const ti = useTranslations("watchlist.import");
  const fmt = useFormat();
  const reasonLabel = useReasonLabel();
  const onMatchLabel = useOnMatchLabel();
  const errorText = useWatchlistError();
  const importErrorText = useWatchImportErrorText();
  const db = useDb();
  const viewer = useViewer();
  const router = useRouter();
  const now = useNow();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const result = useMemo(() => (text ? readWatchImport(db, text, now) : null), [db, text, now]);
  const ready = result?.rows.filter(watchRowReady) ?? [];

  if (!viewer.can("watchlist.manage")) {
    return <EmptyState icon={Lock} title={ti("noAccessTitle")} body={ti("noAccessBody")} />;
  }

  const load = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) return toast(ti("saveAsCsv"));
    setFileName(file.name);
    setText(await file.text());
  };

  const submit = async () => {
    setBusy(true);
    const r = await watchlistService.import({ drafts: ready.map((x) => x.draft), actorId: viewer.id });
    setBusy(false);
    if (!r.ok) return toast(errorText(r.error));
    const added = { count: r.ids.length, n: fmt.number(r.ids.length) };
    toast(r.marked ? ti("toastAddedMarked", { ...added, marked: r.marked, m: fmt.number(r.marked) }) : ti("toastAdded", added));
    router.push("/screening/watchlist");
  };

  return (
    <div className={cn(PAGE, "pb-16")}>
      <nav className="flex items-center gap-1.5 text-xs font-medium text-ink-3">
        <Link href="/screening/watchlist" className="hover:text-accent-text">
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
          <Button size="sm" className="mt-4" onClick={() => download("watchlist-template.csv", watchTemplateCsv())}>
            <Download className="size-3.5" />
            {ti("downloadTemplate")}
          </Button>
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
                  : ti("summary", { rows: fmt.number(result.rows.length), ready: fmt.number(ready.length), problems: fmt.number(result.rows.length - ready.length) })}
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
              {ti("save", { count: ready.length, n: fmt.number(ready.length) })}
            </Button>
          </header>
          {!result.headerError && (
            <div className="overflow-x-auto border-t border-line">
              <table className="w-full min-w-[60rem] text-sm">
                <thead className="bg-subtle">
                  <tr>
                    {[ti("colRow"), ti("colName"), ti("colIdentifiers"), ti("colLevel"), ti("colOnMatch"), ti("colReason"), ti("colCheck")].map((h) => (
                      <th key={h} className="eyebrow h-9 px-3 text-start first:ps-5 last:pe-5">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => {
                    const id = r.draft.identity;
                    return (
                      <tr key={r.line} className={cn("border-t border-line align-top", !watchRowReady(r) && "bg-rose-50/40")}>
                        <td className="tabular px-3 py-3 ps-5 text-xs text-ink-3">{fmt.number(r.line)}</td>
                        <td className="px-3 py-3">
                          <bdi className="block font-semibold text-ink">{id.fullName || "—"}</bdi>
                          {r.draft.reviewerNote && (
                            <span dir="auto" className="block text-xs text-ink-3">
                              {r.draft.reviewerNote}
                            </span>
                          )}
                        </td>
                        <td dir="auto" className="px-3 py-3 font-mono text-xs text-ink-2">
                          {[id.nationalId && ti("idValue", { value: id.nationalId }), id.passportNo && ti("passportValue", { value: `${id.passportNo} ${id.nationality ?? ""}` }), id.email, id.company].filter(Boolean).join(" · ") || "—"}
                        </td>
                        <td className="px-3 py-3">{r.draft.level ? <LevelPill level={r.draft.level} /> : <span className="text-xs text-ink-3">—</span>}</td>
                        <td className="px-3 py-3 text-xs text-ink-2">{onMatchLabel(r.draft.onMatch)}</td>
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
