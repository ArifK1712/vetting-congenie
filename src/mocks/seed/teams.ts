import { PROFILE_FIELDS, fieldKey } from "@/domain/fieldAccess";
import type { FieldAccessLevel, LocalizedText, Registration, Team, TeamMember } from "@/domain/types";
import { registrations } from "./reference";

const t = (en: string, ar: string): LocalizedText => ({ en, ar });

type AccessPreset = {
  profile: FieldAccessLevel;
  ids: FieldAccessLevel;
  answers: FieldAccessLevel;
  documents: FieldAccessLevel;
  payment: FieldAccessLevel;
  moreInfo: FieldAccessLevel;
};

function accessFor(reg: Registration, p: AccessPreset): Record<string, FieldAccessLevel> {
  const fields: Record<string, FieldAccessLevel> = {};
  for (const f of PROFILE_FIELDS) {
    fields[fieldKey.profile(f)] = f === "nationalId" || f === "passportNo" ? p.ids : p.profile;
  }
  for (const q of reg.questions) {
    fields[q.type === "upload" ? fieldKey.document(q.id) : fieldKey.answer(q.id)] =
      q.type === "upload" ? p.documents : p.answers;
  }
  fields[fieldKey.payment] = p.payment;
  fields[fieldKey.moreInfo] = p.moreInfo;
  return fields;
}

const PRESETS = {
  documents: { profile: "view", ids: "view", answers: "view", documents: "download", payment: "hidden", moreInfo: "view" },
  security: { profile: "view", ids: "view", answers: "view", documents: "view", payment: "hidden", moreInfo: "view" },
  senior: { profile: "edit", ids: "edit", answers: "view", documents: "download", payment: "view", moreInfo: "view" },
  protocol: { profile: "view", ids: "hidden", answers: "view", documents: "hidden", payment: "view", moreInfo: "view" },
  media: { profile: "view", ids: "view", answers: "edit", documents: "download", payment: "hidden", moreInfo: "view" },
} satisfies Record<string, AccessPreset>;

const m = (userId: string, role: TeamMember["role"] = "reviewer"): TeamMember => ({ userId, role });

function team(
  id: string,
  name: LocalizedText,
  description: LocalizedText,
  members: TeamMember[],
  badgeScope: "all" | string[],
  eventScope: "all" | string[],
  preset: AccessPreset,
  extra: Partial<Team> = {},
): Team {
  const regs = registrations.filter(
    (r) =>
      (eventScope === "all" || eventScope.includes(r.eventId)) &&
      (badgeScope === "all" || r.badgeTypeIds.some((b) => badgeScope.includes(b))),
  );
  return {
    id,
    name,
    description,
    status: "active",
    members,
    eventScope,
    badgeScope,
    access: regs.map((r) => ({ registrationId: r.id, fields: accessFor(r, preset) })),
    conditions: [],
    conditionMatch: "all",
    assignmentMode: "selfClaim",
    maxOpenClaims: 10,
    createdAt: "2026-08-04T08:00:00.000Z",
    ...extra,
  };
}

export const teams: Team[] = [
  team(
    "t_docs",
    t("Document Check Team", "فريق التحقق من المستندات"),
    t("Checks identity documents and organisation letters for completeness.", "يتحقق من اكتمال وثائق الهوية وخطابات الجهات."),
    [m("u_yousef", "lead"), m("u_omar"), m("u_noura"), m("u_reem"), m("u_hana")],
    "all",
    "all",
    PRESETS.documents,
  ),
  team(
    "t_vipsec",
    t("VIP Security Team", "فريق أمن كبار الشخصيات"),
    t("Security review for VIP and speaker badges.", "المراجعة الأمنية لشارات كبار الشخصيات والمتحدثين."),
    [m("u_lina", "lead"), m("u_faisal"), m("u_khalid"), m("u_maya")],
    ["bt_vip", "bt_speaker"],
    ["ev_gis", "ev_ref"],
    PRESETS.security,
  ),
  team(
    "t_media",
    t("Media Accreditation Team", "فريق اعتماد الإعلاميين"),
    t("Verifies media outlets, press cards and coverage plans.", "يتحقق من الوسائل الإعلامية والبطاقات الصحفية وخطط التغطية."),
    [m("u_priya", "lead"), m("u_hana"), m("u_omar")],
    ["bt_media"],
    "all",
    PRESETS.media,
  ),
  team(
    "t_gensec",
    t("General Security Team", "فريق الأمن العام"),
    t("Security screening for visitors, exhibitors and contractors.", "الفحص الأمني للزوار والعارضين والمقاولين."),
    [m("u_yousef", "lead"), m("u_omar"), m("u_maya"), m("u_faisal"), m("u_reem")],
    ["bt_visitor", "bt_exhibitor", "bt_contractor"],
    "all",
    PRESETS.security,
  ),
  team(
    "t_protocol",
    t("Protocol Office", "مكتب المراسم"),
    t("Final protocol approval for VIP delegations.", "الموافقة النهائية للمراسم على وفود كبار الشخصيات."),
    [m("u_noura", "lead"), m("u_reem")],
    ["bt_vip"],
    "all",
    PRESETS.protocol,
  ),
  team(
    "t_senior",
    t("Senior Security", "الأمن الأول"),
    t("Handles escalations and high-level watchlist matches.", "يتولى الحالات المصعّدة ومطابقات قائمة المراقبة عالية المستوى."),
    [m("u_khalid", "lead"), m("u_arif"), m("u_tariq")],
    "all",
    "all",
    PRESETS.senior,
  ),
  team(
    "t_secreview",
    t("Security Review Team", "فريق المراجعة الأمنية"),
    t("Fallback team for any request no other team covers.", "الفريق الاحتياطي لأي طلب لا يغطيه فريق آخر."),
    [m("u_khalid", "lead"), m("u_hana"), m("u_maya"), m("u_faisal")],
    "all",
    "all",
    PRESETS.security,
  ),
];
