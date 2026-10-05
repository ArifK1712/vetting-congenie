import type {
  LocalizedText,
  StageAction,
  StageConfig,
  Workflow,
  WorkflowAllotment,
  WorkflowEdge,
  WorkflowGraph,
  WorkflowNode,
  WorkflowVersion,
} from "@/domain/types";

const t = (en: string, ar: string): LocalizedText => ({ en, ar });

const ALL_ACTIONS: StageAction[] = ["approve", "reject", "moreInfo", "escalate"];

function stage(
  id: string,
  x: number,
  y: number,
  cfg: Partial<StageConfig> & Pick<StageConfig, "name" | "teams" | "fallbackTeamId">,
): WorkflowNode {
  return {
    id,
    type: "stage",
    position: { x, y },
    stage: {
      instructions: t("", ""),
      allowedActions: ALL_ACTIONS,
      escalateTo: [],
      afterMoreInfoReturnTo: "same",
      rejectReasonRequired: true,
      timeLimitHours: null,
      mandatory: false,
      ...cfg,
    },
  };
}

const e = (source: string, handle: string, target: string): WorkflowEdge => ({
  id: `${source}:${handle}`,
  source,
  handle,
  target,
});

/** Linear workflow helper: start → stages… → final, every stage can reject. */
function linear(prefix: string, stages: WorkflowNode[], extraNodes: WorkflowNode[] = [], extraEdges: WorkflowEdge[] = []): WorkflowGraph {
  const start: WorkflowNode = { id: `${prefix}_start`, type: "start", position: { x: 0, y: 0 } };
  const final: WorkflowNode = { id: `${prefix}_final`, type: "final", position: { x: 0, y: 160 * (stages.length + 1) } };
  const rejected: WorkflowNode = { id: `${prefix}_rejected`, type: "rejected", position: { x: 360, y: 160 * (stages.length + 1) } };
  const edges: WorkflowEdge[] = [e(start.id, "next", stages[0].id)];
  stages.forEach((s, i) => {
    edges.push(e(s.id, "approve", stages[i + 1]?.id ?? final.id));
    edges.push(e(s.id, "reject", rejected.id));
  });
  for (const n of extraNodes) if (n.type === "stage") edges.push(e(n.id, "reject", rejected.id));
  return { nodes: [start, ...stages, ...extraNodes, final, rejected], edges: [...edges, ...extraEdges] };
}

// ─── VIP Security Vetting (v1 and v2) ───────────────────────────────────

const vipDocs = (limit: number) =>
  stage("vip_docs", 0, 160, {
    name: t("Document Check", "التحقق من المستندات"),
    instructions: t(
      "Confirm the ID copy is legible and matches the profile. Organisation letter must be on letterhead and signed.",
      "تأكد من وضوح صورة الهوية ومطابقتها للملف. يجب أن يكون خطاب الجهة على ورق رسمي وموقّعًا.",
    ),
    teams: ["t_docs"],
    fallbackTeamId: "t_secreview",
    timeLimitHours: limit,
    escalateTo: ["vip_senior"],
  });
const vipSec = stage("vip_sec", 0, 320, {
  name: t("Security Review", "المراجعة الأمنية"),
  instructions: t(
    "Review screening results and delegation details. Escalate any unresolved concern to Senior Security.",
    "راجع نتائج الفحص وتفاصيل الوفد. صعّد أي ملاحظة غير محسومة إلى الأمن الأول.",
  ),
  teams: ["t_vipsec"],
  fallbackTeamId: "t_secreview",
  timeLimitHours: 48,
  mandatory: true,
  escalateTo: ["vip_senior"],
});
const vipProtocol = stage("vip_protocol", 0, 480, {
  name: t("Protocol Approval", "موافقة المراسم"),
  teams: ["t_protocol"],
  fallbackTeamId: "t_secreview",
  timeLimitHours: 24,
  allowedActions: ["approve", "reject", "moreInfo"],
});
const vipSenior = stage("vip_senior", 360, 320, {
  name: t("Senior Security Review", "مراجعة الأمن الأول"),
  teams: ["t_senior"],
  fallbackTeamId: "t_secreview",
  timeLimitHours: 12,
  mandatory: true,
  allowedActions: ["approve", "reject", "moreInfo"],
});

const vipV1 = linear("vip", [vipDocs(48), vipSec], [vipSenior], [
  e("vip_docs", "escalate", "vip_senior"),
  e("vip_sec", "escalate", "vip_senior"),
  e("vip_senior", "approve", "vip_final"),
]);
const vipV2 = linear("vip", [vipDocs(24), vipSec, vipProtocol], [vipSenior], [
  e("vip_docs", "escalate", "vip_senior"),
  e("vip_sec", "escalate", "vip_senior"),
  e("vip_senior", "approve", "vip_protocol"),
]);

// ─── Speaker ─────────────────────────────────────────────────────────────

const speakerGraph = linear("spk", [
  stage("spk_docs", 0, 160, {
    name: t("Document Check", "التحقق من المستندات"),
    teams: ["t_docs"],
    fallbackTeamId: "t_secreview",
    timeLimitHours: 48,
    allowedActions: ["approve", "reject", "moreInfo"],
  }),
  stage("spk_sec", 0, 320, {
    name: t("Security Review", "المراجعة الأمنية"),
    teams: ["t_vipsec"],
    fallbackTeamId: "t_secreview",
    timeLimitHours: 48,
    mandatory: true,
    allowedActions: ["approve", "reject", "moreInfo"],
  }),
]);

// ─── Visitor (with a watchlist-level condition) ─────────────────────────

const visitorGraph: WorkflowGraph = (() => {
  const g = linear(
    "vis",
    [
      stage("vis_sec", 0, 320, {
        name: t("Security Screening", "الفحص الأمني"),
        teams: ["t_gensec"],
        fallbackTeamId: "t_secreview",
        timeLimitHours: 24,
        mandatory: true,
        escalateTo: ["vis_senior"],
      }),
    ],
    [
      stage("vis_senior", 360, 320, {
        name: t("Senior Security Review", "مراجعة الأمن الأول"),
        teams: ["t_senior"],
        fallbackTeamId: "t_secreview",
        timeLimitHours: 12,
        mandatory: true,
        allowedActions: ["approve", "reject", "moreInfo"],
      }),
    ],
  );
  const condition: WorkflowNode = {
    id: "vis_cond",
    type: "condition",
    position: { x: 0, y: 160 },
    condition: {
      label: t("Watchlist level", "مستوى قائمة المراقبة"),
      branches: [
        {
          id: "high",
          label: t("High", "مرتفع"),
          condition: { id: "c1", field: "screening.watchlistLevel", operator: "is", value: ["high"] },
        },
      ],
    },
  };
  g.nodes.splice(1, 0, condition);
  g.edges = g.edges.filter((x) => x.source !== "vis_start");
  g.edges.push(
    e("vis_start", "next", "vis_cond"),
    e("vis_cond", "high", "vis_senior"),
    e("vis_cond", "otherwise", "vis_sec"),
    e("vis_sec", "escalate", "vis_senior"),
    e("vis_senior", "approve", "vis_sec"),
  );
  return g;
})();

// ─── Media, Contractor, Exhibitor ───────────────────────────────────────

const mediaGraph = linear("med", [
  stage("med_cred", 0, 160, {
    name: t("Credential Check", "التحقق من الاعتماد"),
    teams: ["t_media"],
    fallbackTeamId: "t_secreview",
    timeLimitHours: 48,
    allowedActions: ["approve", "reject", "moreInfo"],
  }),
  stage("med_sec", 0, 320, {
    name: t("Security Review", "المراجعة الأمنية"),
    teams: ["t_gensec", "t_vipsec"],
    fallbackTeamId: "t_secreview",
    timeLimitHours: 24,
    mandatory: true,
    allowedActions: ["approve", "reject", "moreInfo"],
  }),
]);

const contractorGraph = linear("con", [
  stage("con_docs", 0, 160, {
    name: t("Document Check", "التحقق من المستندات"),
    teams: ["t_docs"],
    fallbackTeamId: "t_secreview",
    timeLimitHours: 24,
    allowedActions: ["approve", "reject", "moreInfo"],
  }),
  stage("con_site", 0, 320, {
    name: t("Site Security", "أمن الموقع"),
    teams: ["t_gensec"],
    fallbackTeamId: "t_secreview",
    timeLimitHours: 24,
    mandatory: true,
    allowedActions: ["approve", "reject", "moreInfo"],
  }),
]);

const exhibitorGraph = linear("exh", [
  stage("exh_docs", 0, 160, {
    name: t("Document Check", "التحقق من المستندات"),
    teams: ["t_docs"],
    fallbackTeamId: "t_secreview",
    timeLimitHours: 48,
    allowedActions: ["approve", "reject", "moreInfo"],
  }),
]);

// ─── Records ─────────────────────────────────────────────────────────────

const wf = (
  id: string,
  name: LocalizedText,
  label: LocalizedText,
  badgeTypeId: string,
  currentVersionId: string,
): Workflow => ({
  id,
  name,
  label,
  description: t("", ""),
  badgeTypeId,
  status: "active",
  currentVersionId,
  draft: null,
  createdAt: "2026-08-10T09:00:00.000Z",
});

export const workflows: Workflow[] = [
  wf("wf_vip", t("VIP Security Vetting", "تدقيق أمن كبار الشخصيات"), t("Enhanced VIP Vetting", "تدقيق كبار الشخصيات المعزز"), "bt_vip", "wfv_vip_2"),
  wf("wf_speaker", t("Speaker Vetting", "تدقيق المتحدثين"), t("Speaker Vetting", "تدقيق المتحدثين"), "bt_speaker", "wfv_speaker_1"),
  wf("wf_visitor", t("Visitor Security Vetting", "التدقيق الأمني للزوار"), t("Standard Security Vetting", "التدقيق الأمني القياسي"), "bt_visitor", "wfv_visitor_1"),
  wf("wf_media", t("Media Accreditation", "اعتماد الإعلاميين"), t("Media Accreditation", "اعتماد الإعلاميين"), "bt_media", "wfv_media_1"),
  wf("wf_contractor", t("Contractor Vetting", "تدقيق المقاولين"), t("Contractor Site Access", "دخول المقاولين للموقع"), "bt_contractor", "wfv_contractor_1"),
  wf("wf_exhibitor", t("Exhibitor Vetting", "تدقيق العارضين"), t("Exhibitor Document Check", "التحقق من مستندات العارضين"), "bt_exhibitor", "wfv_exhibitor_1"),
];

const ver = (id: string, workflowId: string, versionNo: number, graph: WorkflowGraph, publishedAt: string): WorkflowVersion => ({
  id,
  workflowId,
  versionNo,
  graph,
  publishedBy: "u_sara",
  publishedAt,
});

export const workflowVersions: WorkflowVersion[] = [
  ver("wfv_vip_1", "wf_vip", 1, vipV1, "2026-08-12T10:00:00.000Z"),
  ver("wfv_vip_2", "wf_vip", 2, vipV2, "2026-09-21T07:30:00.000Z"),
  ver("wfv_speaker_1", "wf_speaker", 1, speakerGraph, "2026-08-12T10:20:00.000Z"),
  ver("wfv_visitor_1", "wf_visitor", 1, visitorGraph, "2026-08-13T08:00:00.000Z"),
  ver("wfv_media_1", "wf_media", 1, mediaGraph, "2026-08-13T08:40:00.000Z"),
  ver("wfv_contractor_1", "wf_contractor", 1, contractorGraph, "2026-08-14T11:00:00.000Z"),
  ver("wfv_exhibitor_1", "wf_exhibitor", 1, exhibitorGraph, "2026-08-14T11:30:00.000Z"),
];

const allot = (workflowId: string, registrationId: string, badgeTypeId: string): WorkflowAllotment => ({
  id: `al_${registrationId}_${badgeTypeId}`,
  workflowId,
  registrationId,
  badgeTypeId,
  allottedBy: "u_sara",
  allottedAt: "2026-08-15T09:00:00.000Z",
});

export const allotments: WorkflowAllotment[] = [
  allot("wf_vip", "reg_gis_vip", "bt_vip"),
  allot("wf_vip", "reg_gis_speaker", "bt_vip"),
  allot("wf_vip", "reg_gis_visitor", "bt_vip"),
  allot("wf_vip", "reg_ref_vip", "bt_vip"),
  allot("wf_speaker", "reg_gis_speaker", "bt_speaker"),
  allot("wf_visitor", "reg_gis_visitor", "bt_visitor"),
  allot("wf_visitor", "reg_gis_exhibitor", "bt_visitor"),
  allot("wf_visitor", "reg_rdw_visitor", "bt_visitor"),
  allot("wf_visitor", "reg_ref_visitor", "bt_visitor"),
  allot("wf_media", "reg_gis_media", "bt_media"),
  allot("wf_media", "reg_rdw_media", "bt_media"),
  allot("wf_contractor", "reg_gis_contractor", "bt_contractor"),
  allot("wf_exhibitor", "reg_gis_exhibitor", "bt_exhibitor"),
];
