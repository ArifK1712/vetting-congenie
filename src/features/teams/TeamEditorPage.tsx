"use client";

import { ChevronRight, CircleAlert, CircleCheck, Loader2, Lock, RefreshCw, SearchX, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DirIcon } from "@/components/ui/DirIcon";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/Toast";
import { blocking, draftOf, emptyDraft, routingPreview, validateTeam, type TeamDraft, type TeamIssue, type TeamSection } from "@/domain/teams";
import type { ID } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { teamService, teamWroteLocally } from "@/services/teams";
import { useAppStore, useDb } from "@/store/app";
import { useViewer } from "@/store/useViewer";
import {
  AccessSection,
  AddMemberButton,
  AddRegistrationMenu,
  AssignmentSection,
  BasicsSection,
  ConditionsSection,
  IssueList,
  MembersSection,
  ScopeSection,
  Section,
  type Patch,
} from "./EditorSections";
import { TeamMark } from "./parts";

const SECTIONS: TeamSection[] = ["basics", "members", "scope", "access", "conditions", "assignment"];

function useIssueText() {
  const t = useTranslations("teams.editor.issues");
  const db = useDb();
  const fmt = useFormat();
  return (i: TeamIssue) => {
    const name = i.ref ? (db.users[i.ref]?.name ?? "") : "";
    const reg = i.ref ? db.registrations[i.ref] : null;
    return t(i.code, {
      name,
      registration: reg ? `${fmt.text(reg.name)} (${db.events[reg.eventId]?.code ?? ""})` : "",
    });
  };
}

export function TeamEditorPage({ id }: { id: ID | null }) {
  const t = useTranslations("teams.editor");
  const tt = useTranslations("teams");
  const te = useTranslations("teams.errors");
  const fmt = useFormat();
  const db = useDb();
  const viewer = useViewer();
  const router = useRouter();
  const existing = id ? db.teams[id] : null;

  const [initial, setInitial] = useState<TeamDraft>(() => (existing ? draftOf(existing) : emptyDraft()));
  const [draft, setDraft] = useState<TeamDraft>(initial);
  const [loadedRevision, setLoadedRevision] = useState(existing?.revision ?? 0);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [openReg, setOpenReg] = useState<ID | null>(initial.access[0]?.registrationId ?? null);

  // Deep links such as /edit#members scroll once the form has rendered.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) document.getElementById(hash)?.scrollIntoView({ block: "start" });
  }, []);

  const patch: Patch = (p) => {
    setDraft((d) => ({ ...d, ...p }));
    setServerError(null);
  };

  const issues = useMemo(() => validateTeam(db, draft, id), [db, draft, id]);
  const errors = blocking(issues);
  const preview = useMemo(() => routingPreview(db, draft), [db, draft]);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(initial), [draft, initial]);
  const issueText = useIssueText();

  const currentRevision = existing?.revision ?? 0;
  const stale = !!existing && currentRevision !== loadedRevision && !teamWroteLocally(existing.id, currentRevision);

  if (!viewer.can("teams.edit")) {
    return <EmptyState icon={Lock} title={t("noAccessTitle")} body={t("noAccessBody")} />;
  }
  if (id && !existing) {
    return (
      <EmptyState
        icon={SearchX}
        title={tt("detail.notFound")}
        action={
          <Link href="/teams" className="text-sm text-accent-text hover:underline">
            {tt("detail.backToTeams")}
          </Link>
        }
      />
    );
  }

  const bySection = (s: TeamSection) => issues.filter((i) => i.section === s);
  const invalidBasics = new Set(showErrors ? bySection("basics").filter((i) => i.severity === "error").map((i) => (i.code === "nameTooLong" || i.code === "nameRequired" || i.code === "nameTaken" ? "name" : i.code)) : []);

  const reloadLatest = () => {
    const latest = useAppStore.getState().db?.teams[id!];
    if (!latest) return;
    const next = draftOf(latest);
    setInitial(next);
    setDraft(next);
    setLoadedRevision(latest.revision);
    setServerError(null);
  };

  const save = async () => {
    setShowErrors(true);
    if (errors.length) {
      document.getElementById(errors[0].section)?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setSaving(true);
    setServerError(null);
    const r = await teamService.save({ teamId: id, draft, expectedRevision: loadedRevision, actorId: viewer.id });
    setSaving(false);
    if (r.ok) {
      toast(id ? t("toasts.saved") : t("toasts.created", { name: draft.name.en || draft.name.ar }));
      router.push(`/teams/${r.teamId}`);
    } else if (r.error === "noChanges") {
      toast(te("noChanges"));
      router.push(`/teams/${id}`);
    } else {
      setServerError(te(r.error));
    }
  };

  const title = existing ? fmt.text(existing.name) : t("createTitle");
  const sectionText = {
    basics: { title: t("basics.title"), subtitle: t("basics.subtitle") },
    members: { title: t("members.title"), subtitle: t("members.subtitle") },
    scope: { title: t("scope.title"), subtitle: t("scope.subtitle") },
    access: { title: t("access.title"), subtitle: t("access.subtitle") },
    conditions: { title: t("conditions.title"), subtitle: t("conditions.subtitle") },
    assignment: { title: t("assignment.title"), subtitle: t("assignment.subtitle") },
  } satisfies Record<TeamSection, { title: string; subtitle: string }>;

  const sectionProps = (s: TeamSection, index: number) => ({
    id: s,
    index,
    title: sectionText[s].title,
    subtitle: sectionText[s].subtitle,
    issues: bySection(s),
    showErrors,
  });

  const list = (s: TeamSection) => {
    const own = bySection(s);
    return own.some((i) => i.severity === "warning" || showErrors) ? (
      <div className="border-t border-line px-6 py-4">
        <IssueList issues={own} showErrors={showErrors} text={issueText} />
      </div>
    ) : null;
  };

  return (
    <div className="mx-auto max-w-[88rem] px-4 pt-5 sm:px-6 lg:px-7 lg:pt-6 pb-16">
      <nav className="flex items-center gap-1.5 text-xs font-medium text-ink-3">
        <Link href="/teams" className="hover:text-accent-text">
          {tt("detail.backToTeams")}
        </Link>
        <DirIcon icon={ChevronRight} className="size-3.5" />
        {existing && (
          <>
            <Link href={`/teams/${existing.id}`} className="hover:text-accent-text">
              {fmt.text(existing.name)}
            </Link>
            <DirIcon icon={ChevronRight} className="size-3.5" />
          </>
        )}
        <span className="text-ink-2">{existing ? t("editCrumb") : t("createTitle")}</span>
      </nav>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        {existing && <TeamMark team={{ ...existing, status: draft.status }} size="md" />}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-ink">{existing ? t("editTitle", { name: title }) : title}</h1>
          <p className="mt-1 text-sm text-ink-2">{existing ? t("editSubtitle") : t("createSubtitle")}</p>
        </div>
      </div>

      {stale && (
        <div role="alert" className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-attention/20 bg-attention-soft px-4 py-3 text-sm text-attention">
          <RefreshCw className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">{t("stale")}</span>
          <Button size="sm" onClick={reloadLatest}>
            {t("loadLatest")}
          </Button>
        </div>
      )}

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <form
          className="min-w-0 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Section {...sectionProps("basics", 1)}>
            <BasicsSection draft={draft} patch={patch} invalid={invalidBasics} />
            {list("basics")}
          </Section>

          <Section {...sectionProps("members", 2)} action={<AddMemberButton db={db} draft={draft} patch={patch} />}>
            <MembersSection db={db} draft={draft} patch={patch} />
            {list("members")}
          </Section>

          <Section {...sectionProps("scope", 3)}>
            <ScopeSection db={db} draft={draft} patch={patch} isEdit={!!existing} />
            {list("scope")}
          </Section>

          <Section {...sectionProps("access", 4)} action={<AddRegistrationMenu db={db} draft={draft} patch={patch} onAdded={setOpenReg} />}>
            <AccessSection db={db} draft={draft} patch={patch} teamId={id} open={openReg} setOpen={setOpenReg} issues={bySection("access")} showErrors={showErrors} />
            {list("access")}
          </Section>

          <Section {...sectionProps("conditions", 5)}>
            <ConditionsSection db={db} draft={draft} patch={patch} issues={bySection("conditions")} showErrors={showErrors} preview={preview} />
            {list("conditions")}
          </Section>

          <Section {...sectionProps("assignment", 6)}>
            <AssignmentSection draft={draft} patch={patch} invalid={showErrors && bySection("assignment").some((i) => i.code === "maxClaimsInvalid")} />
            {list("assignment")}
          </Section>
        </form>

        <aside className="space-y-4 lg:sticky lg:top-6">
          <div className="overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-line">
            <div className="px-5 pt-4 pb-3">
              <h2 className="text-sm font-bold text-ink">{t("checklist.title")}</h2>
              <p className="mt-0.5 text-xs text-ink-3">
                {errors.length ? t("checklist.toFix", { count: errors.length, n: fmt.number(errors.length) }) : t("checklist.ready")}
              </p>
            </div>
            <ol className="border-t border-line py-1.5">
              {SECTIONS.map((s, i) => {
                const own = bySection(s);
                const err = own.filter((x) => x.severity === "error").length;
                const warn = own.length - err;
                return (
                  <li key={s}>
                    <a
                      href={`#${s}`}
                      onClick={(e) => {
                        e.preventDefault();
                        document.getElementById(s)?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                      className="flex items-center gap-3 px-5 py-2 text-sm transition-colors hover:bg-subtle"
                    >
                      <span className="tabular w-4 text-center text-xs font-semibold text-ink-3">{fmt.number(i + 1)}</span>
                      <span className="min-w-0 flex-1 truncate text-ink">{sectionText[s].title}</span>
                      {err > 0 ? (
                        <span className={cn("tabular inline-flex items-center gap-1 text-xs font-semibold", showErrors ? "text-rose-600" : "text-ink-3")}>
                          <CircleAlert className="size-3.5" />
                          {fmt.number(err)}
                        </span>
                      ) : warn > 0 ? (
                        <span className="tabular inline-flex items-center gap-1 text-xs font-semibold text-amber-600">
                          <TriangleAlert className="size-3.5" />
                          {fmt.number(warn)}
                        </span>
                      ) : (
                        <CircleCheck className="size-4 text-emerald-500" aria-label={t("checklist.done")} />
                      )}
                    </a>
                  </li>
                );
              })}
            </ol>
            <div className="space-y-3 border-t border-line bg-subtle px-5 py-4">
              {serverError && (
                <p role="alert" className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-600/15 ring-inset">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" />
                  {serverError}
                </p>
              )}
              <div className="flex items-center gap-2">
                <Button variant="primary" className="flex-1" disabled={saving || stale || (!dirty && !!existing)} onClick={() => void save()}>
                  {saving && <Loader2 className="size-4 animate-spin" />}
                  {saving ? t("saving") : existing ? t("save") : t("create")}
                </Button>
                <Link href={existing ? `/teams/${existing.id}` : "/teams"}>
                  <Button disabled={saving}>{t("cancel")}</Button>
                </Link>
              </div>
              <p className="text-center text-xs text-ink-3">{dirty ? t("unsaved") : t("noChanges")}</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
