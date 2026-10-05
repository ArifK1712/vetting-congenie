import { PERMISSIONS } from "@/domain/types";
import type {
  BadgeType,
  Event,
  FormQuestion,
  LocalizedText,
  Permission,
  Registration,
  RejectReason,
  Role,
  User,
} from "@/domain/types";

const t = (en: string, ar: string): LocalizedText => ({ en, ar });

export const roles: Role[] = [
  { id: "role_admin", name: t("Vetting Administrator", "مسؤول التدقيق"), permissions: [...PERMISSIONS] },
  { id: "role_reviewer", name: t("Reviewer", "مراجع"), permissions: ["queue.access"] },
  {
    id: "role_lead",
    name: t("Team Lead", "قائد فريق"),
    permissions: ["queue.access", "queue.assign", "watchlist.view", "teams.view", "reports.view"],
  },
  {
    id: "role_compliance",
    name: t("Compliance Officer", "مسؤول الامتثال"),
    permissions: [
      "queue.access",
      "blacklist.view",
      "blacklist.propose",
      "blacklist.approve",
      "watchlist.view",
      "watchlist.manage",
      "reports.view",
    ],
  },
  {
    id: "role_coordinator",
    name: t("Event Coordinator", "منسق فعاليات"),
    permissions: ["reports.view"],
  },
  {
    id: "role_ops",
    name: t("Operations Manager", "مدير العمليات"),
    permissions: [
      "queue.access",
      "queue.reviewAll",
      "teams.view",
      "workflows.view",
      "reports.view",
      "reports.export",
    ] satisfies Permission[],
  },
];

const u = (id: string, name: string, email: string, roleId: string, title: LocalizedText): User => ({
  id,
  name,
  email,
  roleId,
  title,
  active: true,
});

export const users: User[] = [
  u("u_sara", "Sara Al-Otaibi", "sara.alotaibi@vetting.app", "role_admin", t("Head of Accreditation", "رئيسة الاعتماد")),
  u("u_omar", "Omar Haddad", "omar.haddad@vetting.app", "role_reviewer", t("Accreditation Reviewer", "مراجع اعتماد")),
  u("u_lina", "Lina Farouk", "lina.farouk@vetting.app", "role_lead", t("VIP Security Lead", "قائدة أمن كبار الشخصيات")),
  u("u_arif", "Arif Khan", "arif.khan@vetting.app", "role_compliance", t("Compliance Officer", "مسؤول الامتثال")),
  u("u_daniel", "Daniel Mercer", "daniel.mercer@vetting.app", "role_ops", t("Event Operations Manager", "مدير عمليات الفعاليات")),
  u("u_noura", "Noura Al-Qahtani", "noura.alqahtani@vetting.app", "role_lead", t("Protocol Lead", "قائدة المراسم")),
  u("u_faisal", "Faisal Al-Harbi", "faisal.alharbi@vetting.app", "role_reviewer", t("Security Reviewer", "مراجع أمني")),
  u("u_priya", "Priya Nair", "priya.nair@vetting.app", "role_lead", t("Media Accreditation Lead", "قائدة اعتماد الإعلام")),
  u("u_yousef", "Yousef Mansour", "yousef.mansour@vetting.app", "role_lead", t("Security Operations Lead", "قائد العمليات الأمنية")),
  u("u_hana", "Hana Saleh", "hana.saleh@vetting.app", "role_reviewer", t("Accreditation Reviewer", "مراجعة اعتماد")),
  u("u_khalid", "Khalid Al-Shehri", "khalid.alshehri@vetting.app", "role_lead", t("Senior Security Analyst", "محلل أمني أول")),
  u("u_maya", "Maya Rahman", "maya.rahman@vetting.app", "role_reviewer", t("Security Reviewer", "مراجعة أمنية")),
  u("u_tariq", "Tariq Aziz", "tariq.aziz@vetting.app", "role_compliance", t("Compliance Manager", "مدير الامتثال")),
  u("u_reem", "Reem Al-Dosari", "reem.aldosari@vetting.app", "role_reviewer", t("Protocol Officer", "مسؤولة مراسم")),
  u("u_salma", "Salma Idris", "salma.idris@vetting.app", "role_coordinator", t("Event Coordinator", "منسقة فعاليات")),
];

/** Personas offered in the prototype switcher. */
export const PERSONA_IDS = ["u_sara", "u_omar", "u_maya", "u_lina", "u_arif", "u_daniel"] as const;

export const events: Event[] = [
  {
    id: "ev_gis",
    name: t("Gulf Infrastructure Summit 2026", "قمة البنية التحتية الخليجية 2026"),
    code: "GIS26",
    startsOn: "2026-11-17",
    venue: t("Riyadh Exhibition Centre", "مركز الرياض للمعارض"),
  },
  {
    id: "ev_rdw",
    name: t("Riyadh Design Week 2026", "أسبوع الرياض للتصميم 2026"),
    code: "RDW26",
    startsOn: "2026-12-02",
    venue: t("King Abdullah Financial District", "مركز الملك عبدالله المالي"),
  },
  {
    id: "ev_ref",
    name: t("Red Sea Energy Forum 2026", "منتدى البحر الأحمر للطاقة 2026"),
    code: "REF26",
    startsOn: "2027-01-20",
    venue: t("Jeddah Superdome", "جدة سوبردوم"),
  },
];

export const badgeTypes: BadgeType[] = [
  { id: "bt_vip", name: t("VIP", "كبار الشخصيات") },
  { id: "bt_speaker", name: t("Speaker", "متحدث") },
  { id: "bt_media", name: t("Media", "إعلام") },
  { id: "bt_visitor", name: t("Visitor", "زائر") },
  { id: "bt_exhibitor", name: t("Exhibitor", "عارض") },
  { id: "bt_contractor", name: t("Contractor", "مقاول") },
];

const opt = (value: string, en: string, ar: string) => ({ value, label: t(en, ar) });

const Q = {
  purpose: {
    id: "q_purpose",
    label: t("Purpose of visit", "الغرض من الزيارة"),
    type: "singleChoice",
    options: [
      opt("business", "Business meetings", "اجتماعات عمل"),
      opt("investment", "Investment", "استثمار"),
      opt("government", "Government delegation", "وفد حكومي"),
      opt("academic", "Academic or research", "أكاديمي أو بحثي"),
      opt("networking", "Networking", "التواصل المهني"),
    ],
  },
  orgType: {
    id: "q_org_type",
    label: t("Organisation type", "نوع الجهة"),
    type: "singleChoice",
    options: [
      opt("government", "Government", "حكومية"),
      opt("private", "Private sector", "قطاع خاص"),
      opt("nonprofit", "Non-profit", "غير ربحية"),
      opt("academia", "Academia", "أكاديمية"),
    ],
  },
  attended: {
    id: "q_attended",
    label: t("Attended a previous edition", "حضر نسخة سابقة"),
    type: "singleChoice",
    options: [opt("yes", "Yes", "نعم"), opt("no", "No", "لا")],
  },
  sponsor: { id: "q_sponsor", label: t("Host or sponsoring organisation", "الجهة المضيفة أو الراعية"), type: "text" },
  delegation: { id: "q_delegation", label: t("Delegation or office", "الوفد أو المكتب"), type: "text" },
  session: { id: "q_session", label: t("Session title", "عنوان الجلسة"), type: "text" },
  outlet: { id: "q_outlet", label: t("Media outlet", "الوسيلة الإعلامية"), type: "text" },
  coverage: {
    id: "q_coverage",
    label: t("Coverage type", "نوع التغطية"),
    type: "multiChoice",
    options: [
      opt("print", "Print", "مطبوعة"),
      opt("tv", "Television", "تلفزيون"),
      opt("online", "Online", "رقمية"),
      opt("photo", "Photography", "تصوير"),
    ],
  },
  stand: { id: "q_stand", label: t("Stand number", "رقم الجناح"), type: "text" },
  workArea: {
    id: "q_work_area",
    label: t("Work area", "منطقة العمل"),
    type: "singleChoice",
    options: [
      opt("hall_a", "Hall A", "القاعة أ"),
      opt("hall_b", "Hall B", "القاعة ب"),
      opt("outdoor", "Outdoor zone", "المنطقة الخارجية"),
      opt("boh", "Back of house", "المناطق الخلفية"),
    ],
  },
  notes: { id: "q_notes", label: t("Additional information", "معلومات إضافية"), type: "longText" },
  idCopy: { id: "q_id_copy", label: t("Passport or National ID copy", "صورة جواز السفر أو الهوية"), type: "upload" },
  letter: { id: "q_letter", label: t("Organisation letter", "خطاب جهة العمل"), type: "upload" },
  pressCard: { id: "q_press_card", label: t("Press card", "البطاقة الصحفية"), type: "upload" },
  workOrder: { id: "q_work_order", label: t("Work order", "أمر العمل"), type: "upload" },
} satisfies Record<string, FormQuestion>;

export const QUESTIONS = Q;

const reg = (
  id: string,
  eventId: string,
  name: LocalizedText,
  badgeTypeIds: string[],
  capacityLimit: number,
  questions: FormQuestion[],
): Registration => ({ id, eventId, name, badgeTypeIds, capacityLimit, questions });

export const registrations: Registration[] = [
  reg("reg_gis_vip", "ev_gis", t("VIP Registration", "تسجيل كبار الشخصيات"), ["bt_vip"], 150, [Q.delegation, Q.purpose, Q.orgType, Q.notes, Q.idCopy, Q.letter]),
  reg("reg_gis_speaker", "ev_gis", t("Speaker Registration", "تسجيل المتحدثين"), ["bt_speaker", "bt_vip"], 120, [Q.session, Q.orgType, Q.attended, Q.idCopy, Q.letter]),
  reg("reg_gis_visitor", "ev_gis", t("Visitor Registration", "تسجيل الزوار"), ["bt_visitor", "bt_vip"], 2000, [Q.purpose, Q.orgType, Q.attended, Q.sponsor, Q.idCopy]),
  reg("reg_gis_media", "ev_gis", t("Media Registration", "تسجيل الإعلاميين"), ["bt_media"], 200, [Q.outlet, Q.coverage, Q.idCopy, Q.pressCard, Q.letter]),
  reg("reg_gis_exhibitor", "ev_gis", t("Exhibitor Registration", "تسجيل العارضين"), ["bt_exhibitor", "bt_visitor"], 600, [Q.stand, Q.orgType, Q.idCopy, Q.letter]),
  reg("reg_gis_contractor", "ev_gis", t("Contractor Registration", "تسجيل المقاولين"), ["bt_contractor"], 300, [Q.workArea, Q.sponsor, Q.idCopy, Q.workOrder]),
  reg("reg_rdw_visitor", "ev_rdw", t("Visitor Registration", "تسجيل الزوار"), ["bt_visitor"], 1500, [Q.purpose, Q.attended, Q.idCopy]),
  reg("reg_rdw_media", "ev_rdw", t("Media Registration", "تسجيل الإعلاميين"), ["bt_media"], 17, [Q.outlet, Q.coverage, Q.idCopy, Q.pressCard]),
  reg("reg_ref_vip", "ev_ref", t("VIP Registration", "تسجيل كبار الشخصيات"), ["bt_vip"], 40, [Q.delegation, Q.purpose, Q.notes, Q.idCopy, Q.letter]),
  reg("reg_ref_visitor", "ev_ref", t("Visitor Registration", "تسجيل الزوار"), ["bt_visitor"], 800, [Q.purpose, Q.orgType, Q.idCopy]),
];

export const rejectReasons: RejectReason[] = [
  { id: "rr_docs", label: t("Documents missing or wrong", "مستندات ناقصة أو غير صحيحة") },
  { id: "rr_identity", label: t("Identity not confirmed", "تعذّر التحقق من الهوية") },
  { id: "rr_security", label: t("Security concern", "مخاوف أمنية") },
  { id: "rr_eligibility", label: t("Not eligible for this badge", "غير مؤهل لهذه الشارة") },
  { id: "rr_duplicate", label: t("Duplicate registration", "تسجيل مكرر") },
  { id: "rr_blacklisted", label: t("Blacklisted", "مدرج في القائمة السوداء") },
  { id: "rr_other", label: t("Other", "أخرى") },
];
