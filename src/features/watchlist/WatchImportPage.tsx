"use client";

import { ChevronRight, CircleAlert, CircleCheck, Download, FileSpreadsheet, FileUp, Loader2, Lock, RotateCcw, Sparkles, TriangleAlert } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/Toast";
import { readWatchImport, watchRowReady, watchTemplateCsv, WATCH_COLUMNS, type WatchImportRow } from "@/domain/watchlist";
import type { Database } from "@/domain/types";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { useNow } from "@/lib/useNow";
import { WATCHLIST_ERRORS, watchlistService } from "@/services/watchlist";
import { useDb } from "@/store/app";
import { useViewer } from "@/store/useViewer";
import { REASON_LABEL } from "@/features/blacklist/parts";
import { LevelPill, ON_MATCH_LABEL, WATCH_ISSUE_TEXT } from "./parts";

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

function RowState({ row }: { row: WatchImportRow }) {
  const errors = [...row.readErrors, ...row.issues.filter((i) => i.severity === "error").map((i) => WATCH_ISSUE_TEXT[i.code])];
  const warnings = row.issues.filter((i) => i.severity === "warning");
  if (errors.length)
    return (
      <div className="space-y-0.5 text-xs text-rose-700">
        {errors.map((e) => (
          <p key={e} className="flex items-start gap-1.5">
            <CircleAlert className="mt-px size-3.5 shrink-0" />
            {e}
          </p>
        ))}
      </div>
    );
  return (
    <div className="space-y-0.5 text-xs">
      <p className="flex items-center gap-1.5 font-semibold text-emerald-700">
        <CircleCheck className="size-3.5" />
        Ready
      </p>
      {warnings.map((w) => (
        <p key={w.code} className="flex items-start gap-1.5 text-amber-800">
          <TriangleAlert className="mt-px size-3.5 shrink-0" />
          <span>
            {WATCH_ISSUE_TEXT[w.code]}{" "}
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
    return <EmptyState icon={Lock} title="You can't import watchlist entries" body="This needs the Watchlist Manage permission." />;
  }

  const load = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) return toast("Save the Excel sheet as CSV (UTF-8) and upload that file.");
    setFileName(file.name);
    setText(await file.text());
  };

  const submit = async () => {
    setBusy(true);
    const r = await watchlistService.import({ drafts: ready.map((x) => x.draft), actorId: viewer.id });
    setBusy(false);
    if (!r.ok) return toast(WATCHLIST_ERRORS[r.error]);
    toast(`${r.ids.length} entr${r.ids.length === 1 ? "y" : "ies"} added${r.marked ? `, ${r.marked} request${r.marked === 1 ? "" : "s"} marked` : ""}`);
    router.push("/screening/watchlist");
  };

  return (
    <div className="mx-auto max-w-[88rem] px-7 pt-6 pb-16">
      <nav className="flex items-center gap-1.5 text-xs font-medium text-ink-3">
        <Link href="/screening/watchlist" className="hover:text-accent-text">
          Watchlist
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="text-ink-2">Import file</span>
      </nav>
      <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink">Import watchlist entries</h1>
      <p className="mt-1 text-sm text-ink-2">Rows are checked first. Ready rows are saved straight away (no second approval) and matching requests are marked.</p>

      <ol className="mt-6 grid gap-4 md:grid-cols-2">
        <li className="rounded-xl bg-surface p-5 shadow-card ring-1 ring-line">
          <p className="flex items-center gap-2 text-sm font-bold text-ink">
            <span className="inline-flex size-6 items-center justify-center rounded-lg bg-accent-soft text-xs text-accent-text">1</span>
            Get the template
          </p>
          <p className="mt-1.5 text-sm text-ink-2">The blacklist columns plus level (low, medium, high), on_match (mark or stage) and reviewer_note. Email alerts are set in the form, because they need people chosen.</p>
          <Button size="sm" className="mt-4" onClick={() => download("watchlist-template.csv", watchTemplateCsv())}>
            <Download className="size-3.5" />
            Download template (CSV)
          </Button>
        </li>
        <li className="rounded-xl bg-surface p-5 shadow-card ring-1 ring-line">
          <p className="flex items-center gap-2 text-sm font-bold text-ink">
            <span className="inline-flex size-6 items-center justify-center rounded-lg bg-accent-soft text-xs text-accent-text">2</span>
            Upload the filled file
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
            <span className="min-w-0 flex-1 text-sm text-ink-2">{fileName ?? "Drop a CSV file here"}</span>
            <Button size="sm" onClick={() => fileRef.current?.click()}>
              <FileUp className="size-3.5" />
              Choose file
            </Button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void load(e.target.files?.[0])} />
          </div>
          <button
            type="button"
            onClick={() => {
              setFileName("sample-watchlist.csv (demo)");
              setText(sampleCsv(db));
            }}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-accent-text hover:underline"
          >
            <Sparkles className="size-3.5" />
            No file handy? Use a sample file with a few mistakes
          </button>
        </li>
      </ol>

      {result && (
        <section className="mt-6 overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-line">
          <header className="flex flex-wrap items-center gap-3 px-5 py-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold text-ink">3. Check the rows</h2>
              <p className="mt-0.5 text-xs text-ink-3">{result.headerError ?? `${result.rows.length} rows · ${ready.length} ready · ${result.rows.length - ready.length} with problems (skipped)`}</p>
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
              Start over
            </Button>
            <Button size="sm" variant="primary" disabled={!ready.length || busy} onClick={() => void submit()}>
              {busy && <Loader2 className="size-3.5 animate-spin" />}
              Save {ready.length} entr{ready.length === 1 ? "y" : "ies"}
            </Button>
          </header>
          {!result.headerError && (
            <div className="overflow-x-auto border-t border-line">
              <table className="w-full min-w-[60rem] text-sm">
                <thead className="bg-subtle">
                  <tr>
                    {["Row", "Name", "Identifiers", "Level", "On match", "Reason", "Check"].map((h) => (
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
                        <td className="tabular px-3 py-3 ps-5 text-xs text-ink-3">{r.line}</td>
                        <td className="px-3 py-3">
                          <bdi className="block font-semibold text-ink">{id.fullName || "—"}</bdi>
                          {r.draft.reviewerNote && <span className="block text-xs text-ink-3">{r.draft.reviewerNote}</span>}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs text-ink-2">{[id.nationalId && `ID ${id.nationalId}`, id.passportNo && `Passport ${id.passportNo} ${id.nationality ?? ""}`, id.email, id.company].filter(Boolean).join(" · ") || "—"}</td>
                        <td className="px-3 py-3">{r.draft.level ? <LevelPill level={r.draft.level} /> : <span className="text-xs text-ink-3">—</span>}</td>
                        <td className="px-3 py-3 text-xs text-ink-2">{ON_MATCH_LABEL[r.draft.onMatch]}</td>
                        <td className="px-3 py-3 text-xs text-ink-2">{r.draft.reasonType ? REASON_LABEL[r.draft.reasonType] : "—"}</td>
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
