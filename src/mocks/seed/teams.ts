import { PROFILE_FIELDS, fieldKey } from "@/domain/fieldAccess";
import type { FieldAccessLevel, LocalizedText, Registration, Team, TeamChange, TeamHistoryEvent, TeamMember } from "@/domain/types";
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
  documents: { profile: "edit", ids: "edit", answers: "view", documents: "download", payment: "hidden", moreInfo: "view" },
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
    revision: 1,
    createdAt: "2026-08-04T08:00:00.000Z",
    ...extra,
    updatedAt: extra.updatedAt ?? extra.createdAt ?? "2026-08-04T08:00:00.000Z",
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
  team(
    "t_intl",
    t("International Delegations Desk", "مكتب الوفود الدولية"),
    t("Second look at government delegations travelling from outside Saudi Arabia.", "مراجعة إضافية للوفود الحكومية القادمة من خارج المملكة."),
    [m("u_lina", "lead"), m("u_reem"), m("u_noura")],
    ["bt_vip"],
    ["ev_gis", "ev_ref"],
    PRESETS.protocol,
    {
      conditions: [
        { id: "c_intl_1", field: "profile.nationality", operator: "isNot", value: ["SA"] },
        { id: "c_intl_2", field: "answer.q_org_type", operator: "is", value: ["government"] },
      ],
      assignmentMode: "leadAssigns",
      maxOpenClaims: 6,
      createdAt: "2026-09-25T10:15:00.000Z",
    },
  ),
  team(
    "t_pilot",
    t("Exhibitor Pilot Team", "الفريق التجريبي للعارضين"),
    t("Trial team for exhibitor document checks. Paused after the pilot.", "فريق تجريبي لفحص مستندات العارضين. متوقف بعد انتهاء التجربة."),
    [m("u_hana", "lead"), m("u_faisal")],
    ["bt_exhibitor"],
    ["ev_gis"],
    PRESETS.documents,
    {
      status: "inactive",
      assignmentMode: "roundRobin",
      createdAt: "2026-08-18T09:00:00.000Z",
    },
  ),
];

// ─── Team history ───────────────────────────────────────────────────────

/** Later changes per team; members not listed here were there from the start. */
const LATER: { teamId: string; at: string; actorId: string; kind?: TeamHistoryEvent["kind"]; changes: TeamChange[] }[] = [
  { teamId: "t_docs", at: "2026-08-21T07:10:00.000Z", actorId: "u_sara", changes: [{ type: "maxClaims", value: 10 }] },
  { teamId: "t_vipsec", at: "2026-09-02T11:30:00.000Z", actorId: "u_sara", changes: [{ type: "memberAdded", userId: "u_maya", role: "reviewer" }] },
  { teamId: "t_vipsec", at: "2026-09-21T06:45:00.000Z", actorId: "u_sara", changes: [{ type: "accessChanged", registrationId: "reg_gis_vip", fields: 2 }] },
  { teamId: "t_media", at: "2026-09-10T09:05:00.000Z", actorId: "u_sara", changes: [{ type: "memberRole", userId: "u_priya", role: "lead" }] },
  { teamId: "t_senior", at: "2026-09-28T12:00:00.000Z", actorId: "u_sara", changes: [{ type: "memberAdded", userId: "u_arif", role: "reviewer" }] },
  { teamId: "t_gensec", at: "2026-09-30T08:20:00.000Z", actorId: "u_sara", changes: [{ type: "badgeTypes" }, { type: "memberAdded", userId: "u_reem", role: "reviewer" }] },
  { teamId: "t_intl", at: "2026-09-26T08:40:00.000Z", actorId: "u_sara", changes: [{ type: "conditions", count: 2 }, { type: "assignment", mode: "leadAssigns" }] },
  { teamId: "t_pilot", at: "2026-09-15T13:20:00.000Z", actorId: "u_sara", kind: "deactivated", changes: [] },
];

// Each later change bumped the team's revision and update time.
for (const tm of teams) {
  const later = LATER.filter((l) => l.teamId === tm.id);
  if (!later.length) continue;
  tm.revision = 1 + later.length;
  tm.updatedAt = later.map((l) => l.at).sort().at(-1)!;
}

export const teamHistory: TeamHistoryEvent[] = [
  ...teams.map((tm): TeamHistoryEvent => {
    const addedLater = new Set(
      LATER.filter((l) => l.teamId === tm.id).flatMap((l) => l.changes.flatMap((c) => (c.type === "memberAdded" ? [c.userId] : []))),
    );
    return {
      id: `th_${tm.id}_created`,
      teamId: tm.id,
      kind: "created",
      actorId: "u_sara",
      at: tm.createdAt,
      changes: tm.members
        .filter((mm) => !addedLater.has(mm.userId))
        .map((mm) => ({ type: "memberAdded", userId: mm.userId, role: mm.role === "lead" && tm.id === "t_media" ? "reviewer" : mm.role })),
    };
  }),
  ...LATER.map((l, i): TeamHistoryEvent => ({ id: `th_seed_${i}`, teamId: l.teamId, kind: l.kind ?? "updated", actorId: l.actorId, at: l.at, changes: l.changes })),
];
