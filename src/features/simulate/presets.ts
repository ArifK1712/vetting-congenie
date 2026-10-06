import { formOf } from "@/domain/registrations";
import { screenProfile } from "@/domain/screening";
import type { ApplicantProfile, BlacklistEntry, Database, FormQuestion, ID, ListIdentity, Registration, WatchlistEntry } from "@/domain/types";

/**
 * Quick fills for the Simulate registration form. Everything here is fake
 * applicant data (names, IDs, file names), not interface text.
 */

export type Answers = Record<ID, string | string[]>;
export type PresetKind = "clean" | "blacklisted" | "watchlist" | "missing" | "clear";

/** Where a preset's identity came from, shown under the presets row. */
export interface PresetNote {
  kind: PresetKind;
  entryId?: ID;
  entryName?: string;
  /** "missing": the required question left empty. */
  questionId?: ID;
}

const rand = (n: number) => Math.floor(Math.random() * n);
const pick = <T,>(xs: readonly T[]): T => xs[rand(xs.length)];
const digits = (n: number) => Array.from({ length: n }, () => rand(10)).join("");
const shuffle = <T,>(xs: readonly T[]) => [...xs].sort(() => Math.random() - 0.5);

export const newSubmissionKey = () => `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const SAUDI_FIRST = [
  ["Faisal", "فيصل"], ["Abdullah", "عبدالله"], ["Noura", "نورة"], ["Reem", "ريم"], ["Khalid", "خالد"],
  ["Sultan", "سلطان"], ["Lama", "لمى"], ["Hessa", "حصة"], ["Turki", "تركي"], ["Maha", "مها"],
] as const;
const SAUDI_LAST = [
  ["Al-Harbi", "الحربي"], ["Al-Qahtani", "القحطاني"], ["Al-Shehri", "الشهري"], ["Al-Dosari", "الدوسري"],
  ["Al-Ghamdi", "الغامدي"], ["Al-Mutairi", "المطيري"], ["Al-Zahrani", "الزهراني"], ["Al-Anazi", "العنزي"],
] as const;
const OTHERS: { nat: string; dial: string; first: string[]; last: string[] }[] = [
  { nat: "AE", dial: "+9715", first: ["Hamdan", "Mariam", "Saeed"], last: ["Al Nuaimi", "Al Mazrouei", "Al Ketbi"] },
  { nat: "EG", dial: "+2010", first: ["Karim", "Yasmin", "Tarek"], last: ["Mostafa", "El-Sayed", "Fawzy"] },
  { nat: "JO", dial: "+9627", first: ["Rami", "Dina", "Zaid"], last: ["Haddad", "Khoury", "Masri"] },
  { nat: "GB", dial: "+447", first: ["James", "Olivia", "Henry"], last: ["Whitfield", "Carter", "Ashworth"] },
  { nat: "DE", dial: "+4915", first: ["Lukas", "Hannah", "Felix"], last: ["Brandt", "Vogel", "Hartmann"] },
  { nat: "IN", dial: "+919", first: ["Arjun", "Priya", "Rohan"], last: ["Menon", "Iyer", "Kapoor"] },
  { nat: "FR", dial: "+336", first: ["Claire", "Hugo", "Camille"], last: ["Laurent", "Moreau", "Girard"] },
  { nat: "US", dial: "+1202", first: ["Ethan", "Grace", "Nathan"], last: ["Brooks", "Sullivan", "Hayes"] },
];
const COMPANIES = [
  "Najd Engineering Co.", "Red Sea Logistics", "Al Rawabi Consulting", "Gulf Smart Grid", "Tihama Holding",
  "Desert Rose Media", "Arabian Steel Works", "Horizon Urban Design", "Qimma Investments", "Sahara Data Labs",
];
const TITLES = ["Project Manager", "Senior Engineer", "Business Development Lead", "Director of Operations", "Analyst", "Head of Partnerships"];
const NOTES = [
  "Attending with two colleagues from the same team.",
  "Interested in the infrastructure financing sessions.",
  "First time at the event; meetings planned with exhibitors.",
];
const TEXT_BY_QUESTION: Record<ID, string[]> = {
  q_sponsor: ["Ministry of Investment", "Saudi Contractors Authority", "Riyadh Chamber"],
  q_delegation: ["Office of the Deputy Minister", "UAE Trade Delegation", "Embassy of Japan"],
  q_session: ["Financing Smart Cities", "Water Security in the Gulf", "Designing for Heat"],
  q_outlet: ["Arab News", "Gulf Business Daily", "Asharq Business"],
  q_stand: ["B-14", "A-07", "C-22"],
};
export const SAMPLE_FILES = ["passport-scan.pdf", "national-id.jpg", "company-letter.pdf", "press-card.jpg", "work-order.pdf"];
const FILE_BY_QUESTION: Record<ID, string> = {
  q_id_copy: "passport-scan.pdf",
  q_letter: "company-letter.pdf",
  q_press_card: "press-card.jpg",
  q_work_order: "work-order.pdf",
};

function randomDob() {
  const y = 1965 + rand(36);
  return `${y}-${String(1 + rand(12)).padStart(2, "0")}-${String(1 + rand(28)).padStart(2, "0")}`;
}

function customAnswer(q: FormQuestion): string | string[] {
  switch (q.type) {
    case "singleChoice":
      return q.options?.length ? pick(q.options).value : "";
    case "multiChoice":
      return q.options?.length ? shuffle(q.options).slice(0, 1 + rand(2)).map((o) => o.value) : [];
    case "number":
      return String(1 + rand(20));
    case "date":
      return `2026-11-${String(10 + rand(15)).padStart(2, "0")}`;
    case "upload":
      return FILE_BY_QUESTION[q.id] ?? pick(SAMPLE_FILES);
    case "longText":
      return pick(NOTES);
    default:
      return pick(TEXT_BY_QUESTION[q.id] ?? COMPANIES);
  }
}

/** A plausible random applicant: a Saudi with a National ID, or another nationality with a passport. */
function randomPerson(): Answers {
  const company = pick(COMPANIES);
  if (Math.random() < 0.5) {
    const [fe, fa] = pick(SAUDI_FIRST);
    const [le, la] = pick(SAUDI_LAST);
    const slug = `${fe}.${le.replace(/^Al-/, "")}`.toLowerCase();
    return {
      std_fullName: `${fe} ${le}`,
      std_fullNameAr: `${fa} ${la}`,
      std_email: `${slug}${digits(2)}@example.com`,
      std_mobile: `+9665${digits(8)}`,
      std_nationality: "SA",
      std_nationalId: `1${digits(9)}`,
      std_passportNo: "",
      std_dob: randomDob(),
      std_company: company,
      std_jobTitle: pick(TITLES),
    };
  }
  const c = pick(OTHERS);
  const first = pick(c.first);
  const last = pick(c.last);
  return {
    std_fullName: `${first} ${last}`,
    std_fullNameAr: "",
    std_email: `${first}.${last.replace(/[^A-Za-z]/g, "")}${digits(2)}@example.com`.toLowerCase(),
    std_mobile: `${c.dial}${digits(7)}`,
    std_nationality: c.nat,
    std_nationalId: "",
    std_passportNo: `${String.fromCharCode(65 + rand(26))}${digits(8)}`,
    std_dob: randomDob(),
    std_company: company,
    std_jobTitle: pick(TITLES),
  };
}

const str = (a: Answers, id: ID) => {
  const v = a[id];
  return typeof v === "string" ? v.trim() : "";
};

/** The profile the intake engine would build from the standard questions. */
function profileOf(a: Answers): ApplicantProfile {
  return {
    fullName: str(a, "std_fullName"),
    fullNameAr: str(a, "std_fullNameAr") || undefined,
    email: str(a, "std_email"),
    mobile: str(a, "std_mobile"),
    nationality: str(a, "std_nationality"),
    nationalId: str(a, "std_nationalId") || undefined,
    passportNo: str(a, "std_passportNo") || undefined,
    dob: str(a, "std_dob"),
    company: str(a, "std_company"),
    jobTitle: str(a, "std_jobTitle"),
  };
}

const hitsOf = (db: Database, eventId: ID, a: Answers) =>
  screenProfile(profileOf(a), eventId, Object.values(db.blacklist), Object.values(db.watchlist));

function cleanAnswers(db: Database, reg: Registration): Answers {
  let best: Answers = {};
  for (let i = 0; i < 12; i++) {
    best = randomPerson();
    const h = hitsOf(db, reg.eventId, best);
    if (!h.blacklist.length && !h.watchlist.length) break;
  }
  for (const q of reg.questions) best[q.id] = customAnswer(q);
  return best;
}

const inScope = (scope: "all" | ID[], eventId: ID) => scope === "all" || scope.includes(eventId);

/** A list entry usable as a person to register: name plus National ID, or passport + nationality. */
function usable(e: BlacklistEntry | WatchlistEntry, eventId: ID) {
  const i = e.identity;
  return (
    e.status === "active" &&
    i.subjectType === "person" &&
    inScope(e.eventScope, eventId) &&
    !!i.fullName &&
    (!!i.nationalId || (!!i.passportNo && !!i.nationality))
  );
}

function fromIdentity(base: Answers, i: ListIdentity): Answers {
  const a: Answers = { ...base, std_fullName: i.fullName, std_fullNameAr: "" };
  a.std_nationalId = i.nationalId ?? "";
  a.std_passportNo = i.passportNo ?? "";
  if (i.nationality) a.std_nationality = i.nationality;
  else if (i.nationalId) a.std_nationality = "SA";
  if (i.dob) a.std_dob = i.dob;
  a.std_email = i.email || `${i.fullName.toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "") || "applicant"}${digits(2)}@example.com`;
  if (i.mobile) a.std_mobile = i.mobile;
  if (i.company) a.std_company = i.company;
  return a;
}

function fromList(db: Database, reg: Registration, list: "blacklist" | "watchlist"): { answers: Answers; note: PresetNote } | null {
  const entries: (BlacklistEntry | WatchlistEntry)[] = Object.values(list === "blacklist" ? db.blacklist : db.watchlist);
  // Entries with a date of birth first, then the rest, each in random order.
  const candidates = [
    ...shuffle(entries.filter((e) => usable(e, reg.eventId) && e.identity.dob)),
    ...shuffle(entries.filter((e) => usable(e, reg.eventId) && !e.identity.dob)),
  ];
  for (const e of candidates) {
    const answers = fromIdentity(cleanAnswers(db, reg), e.identity);
    const h = hitsOf(db, reg.eventId, answers);
    const ok = list === "blacklist" ? h.blacklist.length > 0 : h.watchlist.length > 0 && h.blacklist.length === 0;
    if (ok) return { answers, note: { kind: list === "blacklist" ? "blacklisted" : "watchlist", entryId: e.id, entryName: e.identity.fullName } };
  }
  return null;
}

/** Builds the answers for a preset, or null when no list entry fits this event. */
export function presetAnswers(db: Database, reg: Registration, kind: PresetKind, current: Answers): { answers: Answers; note: PresetNote } | null {
  switch (kind) {
    case "clear":
      return { answers: {}, note: { kind } };
    case "clean":
      return { answers: cleanAnswers(db, reg), note: { kind } };
    case "blacklisted":
      return fromList(db, reg, "blacklist");
    case "watchlist":
      return fromList(db, reg, "watchlist");
    case "missing": {
      const form = formOf(reg);
      const filled = form.some((q) => {
        const v = current[q.id];
        return Array.isArray(v) ? v.length > 0 : !!v?.trim();
      });
      const answers = filled ? { ...current } : cleanAnswers(db, reg);
      const q = pick(form.filter((x) => x.required));
      answers[q.id] = q.type === "multiChoice" ? [] : "";
      return { answers, note: { kind, questionId: q.id } };
    }
  }
}

/** Nationality codes offered in the form: the usual ones plus any already used. */
export function nationalityCodes(db: Database, extra: string[]) {
  const codes = new Set(["SA", "AE", "BH", "KW", "OM", "QA", "EG", "JO", "LB", "IQ", "SY", "YE", "SD", "MA", "PK", "IN", "BD", "PH", "ID", "TR", "GB", "US", "FR", "DE", "CN", "JP"]);
  for (const a of Object.values(db.attendees)) if (a.profile.nationality) codes.add(a.profile.nationality);
  for (const e of [...Object.values(db.blacklist), ...Object.values(db.watchlist)]) if (e.identity.nationality) codes.add(e.identity.nationality);
  for (const c of extra) if (c) codes.add(c);
  return [...codes];
}
