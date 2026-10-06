"use client";

import { createTranslator, useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import { editText, englishText, type WorkflowIssue } from "@/domain/workflowAdmin";
import type { Database, LocalizedText, StageAction, Workflow, WorkflowGraph, WorkflowNode } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import workflowsEn from "../../../messages/modules/workflows/en.json";

/** English copy of default block names, stored as the data's English text. */
const enDefaults = createTranslator({ locale: "en", messages: workflowsEn, namespace: "workflows.defaults" });
type DefaultKey = "newStage" | "condition" | "branch" | "path";

const ACTIONS: string[] = ["approve", "reject", "moreInfo", "escalate"] satisfies StageAction[];

/** Localized labels and sentences for the Workflows area. */
export function useWorkflowText() {
  const t = useTranslations("workflows");
  const locale = useLocale();
  const fmt = useFormat();

  return useMemo(() => {
    const actionLabel = (a: StageAction) => t(`actions.${a}`);
    const nodeLabel = (type: WorkflowNode["type"]) => t(`nodes.${type}`);
    const statusLabel = (s: Workflow["status"]) => t(`status.${s}`);

    const handleLabel = (node: WorkflowNode | undefined, handle: string) => {
      if (handle === "next") return t("handles.next");
      if (handle === "otherwise") return t("handles.otherwise");
      if (node?.type === "condition") return fmt.text(node.condition.branches.find((b) => b.id === handle)?.label) || t("handles.branch");
      return ACTIONS.includes(handle) ? actionLabel(handle as StageAction) : handle;
    };

    const nodeName = (node: WorkflowNode | undefined) => {
      if (!node) return t("names.block");
      if (node.type === "stage") return fmt.text(node.stage.name) || t("names.untitledStage");
      if (node.type === "condition") return fmt.text(node.condition.label) || t("names.condition");
      return nodeLabel(node.type);
    };

    /** One sentence per issue, naming the block it is about. */
    const issueText = (db: Database, graph: WorkflowGraph, i: WorkflowIssue) => {
      const node = graph.nodes.find((n) => n.id === i.nodeId);
      const name = nodeName(node);
      const teamName = (id: string, fallback: string) => (db.teams[id] ? fmt.text(db.teams[id].name) : fallback);
      switch (i.code) {
        case "nameRequired":
        case "nameTaken":
        case "labelRequired":
        case "badgeTypeRequired":
        case "noStart":
        case "multipleStart":
        case "noFinal":
        case "stageNameRequired":
          return t(`issues.${i.code}`);
        case "notConnected":
        case "conditionIncomplete":
          return t(`issues.${i.code}`, { name, handle: handleLabel(node, i.detail ?? "") });
        case "unreachable":
        case "noPathToEnd":
        case "endlessLoop":
        case "noTeam":
        case "noFallback":
        case "conditionNoBranches":
        case "onlyFallbackCovers":
          return t(`issues.${i.code}`, { name });
        case "teamInactive":
        case "teamNoReviewer":
          return t(`issues.${i.code}`, { name, team: i.detail ? teamName(i.detail, t("names.aTeam")) : "" });
        case "teamsShareBadgeType": {
          const [a, b] = (i.detail ?? "").split(",").map((id) => teamName(id, ""));
          return t("issues.teamsShareBadgeType", { name, a, b });
        }
      }
    };

    /**
     * Default text for a new block or path. In English it is English-only
     * data, as before; in Arabic the translation is stored alongside it.
     */
    const defaultText = (key: DefaultKey, n = 1): LocalizedText => {
      const en = enDefaults(key, { n });
      return locale === "en" ? englishText(en) : { en, ar: t(`defaults.${key}`, { n }) };
    };

    /**
     * Props for a text box that edits one language of a LocalizedText: it
     * shows this locale's copy (the other language as placeholder when empty)
     * and saves into this locale's field, keeping the other.
     */
    const textField = (value: LocalizedText, onChange: (next: LocalizedText) => void) => {
      const lang = locale === "ar" ? "ar" : "en";
      return {
        value: value[lang],
        placeholder: lang !== "en" && !value[lang] ? value.en || undefined : undefined,
        onChange: (e: { target: { value: string } }) => onChange(editText(value, lang, e.target.value)),
      };
    };
    /** A new name typed into a plain text box (create dialog). */
    const newText = (typed: string) => editText({ en: "", ar: "" }, locale === "ar" ? "ar" : "en", typed);

    return { t, actionLabel, nodeLabel, statusLabel, handleLabel, nodeName, issueText, defaultText, textField, newText };
  }, [t, fmt, locale]);
}

export type WorkflowText = ReturnType<typeof useWorkflowText>;
