import type { Rng } from "./rng";

/** Fictional applicant name pools. Arabic-script names exist where the person would have one. */

type Named = [latin: string, arabic: string];

const SAUDI_MALE: Named[] = [
  ["Mohammed", "محمد"], ["Abdullah", "عبدالله"], ["Fahad", "فهد"], ["Sultan", "سلطان"],
  ["Saud", "سعود"], ["Turki", "تركي"], ["Nasser", "ناصر"], ["Majed", "ماجد"],
  ["Bandar", "بندر"], ["Ibrahim", "إبراهيم"], ["Abdulaziz", "عبدالعزيز"], ["Hamad", "حمد"],
  ["Waleed", "وليد"], ["Rayan", "ريان"], ["Ziyad", "زياد"], ["Meshal", "مشعل"],
];
const SAUDI_FEMALE: Named[] = [
  ["Nora", "نورة"], ["Sara", "سارة"], ["Lama", "لمى"], ["Reem", "ريم"], ["Hessa", "حصة"],
  ["Abeer", "عبير"], ["Dana", "دانة"], ["Maha", "مها"], ["Jawaher", "جواهر"], ["Lulwa", "لولوة"],
  ["Ghada", "غادة"], ["Shahad", "شهد"],
];
const SAUDI_FAMILY: Named[] = [
  ["Al-Otaibi", "العتيبي"], ["Al-Qahtani", "القحطاني"], ["Al-Ghamdi", "الغامدي"],
  ["Al-Zahrani", "الزهراني"], ["Al-Shammari", "الشمري"], ["Al-Mutairi", "المطيري"],
  ["Al-Dosari", "الدوسري"], ["Al-Harbi", "الحربي"], ["Al-Subaie", "السبيعي"],
  ["Al-Anazi", "العنزي"], ["Al-Shehri", "الشهري"], ["Al-Rashid", "الراشد"],
  ["Al-Malki", "المالكي"], ["Al-Juhani", "الجهني"], ["Al-Omari", "العمري"],
];

const ARAB_FIRST: Named[] = [
  ["Ahmed", "أحمد"], ["Omar", "عمر"], ["Youssef", "يوسف"], ["Karim", "كريم"], ["Tamer", "تامر"],
  ["Hala", "هالة"], ["Rania", "رانيا"], ["Layla", "ليلى"], ["Mariam", "مريم"], ["Khaled", "خالد"],
  ["Samir", "سمير"], ["Nadia", "نادية"],
];
const ARAB_FAMILY: Named[] = [
  ["Hassan", "حسن"], ["Mansour", "منصور"], ["Haddad", "حداد"], ["Nasr", "نصر"], ["Khoury", "خوري"],
  ["Saleh", "صالح"], ["Darwish", "درويش"], ["Abdelrahman", "عبدالرحمن"], ["Fawzi", "فوزي"],
  ["Barakat", "بركات"],
];
const ARAB_NATIONALITIES = ["EG", "JO", "AE", "KW", "LB", "BH", "OM"];

const INTERNATIONAL: { first: string[]; last: string[]; nationality: string }[] = [
  { nationality: "GB", first: ["James", "Emma", "Oliver", "Charlotte", "Harry"], last: ["Whitfield", "Collins", "Hughes", "Barker", "Ellison"] },
  { nationality: "US", first: ["Michael", "Sarah", "Ethan", "Megan", "Ryan"], last: ["Turner", "Mitchell", "Brooks", "Caldwell", "Hayes"] },
  { nationality: "FR", first: ["Lucas", "Claire", "Julien", "Camille"], last: ["Moreau", "Dubois", "Lefèvre", "Girard"] },
  { nationality: "DE", first: ["Felix", "Anna", "Lukas", "Lena"], last: ["Wagner", "Schmidt", "Becker", "Hoffmann"] },
  { nationality: "IN", first: ["Arjun", "Priya", "Rohan", "Ananya", "Vikram"], last: ["Mehta", "Sharma", "Iyer", "Reddy", "Kapoor"] },
  { nationality: "PK", first: ["Bilal", "Fatima", "Usman", "Ayesha"], last: ["Ahmed", "Qureshi", "Malik", "Siddiqui"] },
  { nationality: "JP", first: ["Hiroshi", "Yuki", "Kenji", "Aiko"], last: ["Tanaka", "Sato", "Nakamura", "Kobayashi"] },
  { nationality: "KR", first: ["Min-jun", "Seo-yeon", "Ji-ho"], last: ["Park", "Kim", "Choi"] },
  { nationality: "CN", first: ["Wei", "Jing", "Hao", "Mei"], last: ["Zhang", "Chen", "Liu", "Wang"] },
  { nationality: "TR", first: ["Mehmet", "Ayşe", "Emre", "Zeynep"], last: ["Yılmaz", "Demir", "Şahin", "Kaya"] },
  { nationality: "IT", first: ["Marco", "Sofia", "Luca", "Giulia"], last: ["Rossi", "Bianchi", "Ferrari", "Romano"] },
  { nationality: "ES", first: ["Javier", "Lucía", "Pablo"], last: ["Morales", "Navarro", "Ortiz"] },
  { nationality: "BR", first: ["João", "Ana", "Rafael"], last: ["Silva", "Costa", "Almeida"] },
];

export const COMPANIES = [
  "Nakheel Ridge Holdings", "Al Waha Engineering", "Desert Line Logistics", "Sadeem Consulting",
  "Qimma Capital", "Northgate Infrastructure", "Meridian Advisory", "Atlas Grid Systems",
  "Bayan Media Group", "Falcon Events Services", "Sahara Steel Works", "Oasis Digital",
  "Harbor & Crane Partners", "Tamkeen Ventures", "Lumen Architecture Studio", "Coastal Energy Partners",
  "Rawabi Facilities Management", "Vantage Press", "Granite & Glass Contracting", "Helix Water Technologies",
  "Najd Urban Development", "Sumo Engineering Japan", "Kestrel Analytics", "Orbit Broadcast Network",
  "Ministry Liaison Office", "Ardent Security Services", "Silverline Transport", "Cedar Advisory Group",
];

export const MEDIA_OUTLETS = [
  "Gulf Business Review", "Al Bayan Daily", "Infrastructure Weekly", "Orbit Broadcast Network",
  "Design Quarterly Middle East", "Riyadh Evening Post", "Energy Insight Monthly", "Arab Tech Wire",
];

const TITLES = [
  "Chief Executive Officer", "Managing Director", "Head of Partnerships", "Senior Engineer",
  "Project Director", "Procurement Manager", "Investment Analyst", "Journalist", "Photographer",
  "Site Supervisor", "Policy Advisor", "Head of Communications", "Architect", "Operations Manager",
  "Undersecretary", "Research Fellow", "Sales Director", "Electrical Technician",
];

export interface GeneratedPerson {
  fullName: string;
  fullNameAr?: string;
  nationality: string;
  nationalId?: string;
  passportNo?: string;
  email: string;
  mobile: string;
  dob: string;
  company: string;
  jobTitle: string;
}

function slug(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .toLowerCase()
    .replace(/[^a-z]+/g, "");
}

export function generatePerson(rng: Rng, opts: { company?: string; jobTitle?: string } = {}): GeneratedPerson {
  const group = rng.weighted({ saudi: 46, arab: 18, intl: 36 });
  let fullName: string;
  let fullNameAr: string | undefined;
  let nationality: string;
  let nationalId: string | undefined;
  let passportNo: string | undefined;
  let mobile: string;

  if (group === "saudi") {
    const [f, fa] = rng.chance(0.6) ? rng.pick(SAUDI_MALE) : rng.pick(SAUDI_FEMALE);
    const [mid, mida] = rng.pick(SAUDI_MALE);
    const [l, la] = rng.pick(SAUDI_FAMILY);
    const withMiddle = rng.chance(0.35);
    fullName = withMiddle ? `${f} ${mid} ${l}` : `${f} ${l}`;
    fullNameAr = withMiddle ? `${fa} ${mida} ${la}` : `${fa} ${la}`;
    nationality = "SA";
    nationalId = `1${rng.digits(9)}`;
    mobile = `+9665${rng.digits(8)}`;
  } else if (group === "arab") {
    const [f, fa] = rng.pick(ARAB_FIRST);
    const [l, la] = rng.pick(ARAB_FAMILY);
    fullName = `${f} ${l}`;
    fullNameAr = `${fa} ${la}`;
    nationality = rng.pick(ARAB_NATIONALITIES);
    // Residents carry an Iqama; visitors only a passport.
    if (rng.chance(0.55)) {
      nationalId = `2${rng.digits(9)}`;
      mobile = `+9665${rng.digits(8)}`;
    } else {
      mobile = `+${rng.pick(["20", "962", "971", "965", "961"])}${rng.digits(9)}`;
    }
    passportNo = `${String.fromCharCode(65 + rng.int(0, 25))}${rng.digits(8)}`;
  } else {
    const g = rng.pick(INTERNATIONAL);
    fullName = `${rng.pick(g.first)} ${rng.pick(g.last)}`;
    nationality = g.nationality;
    passportNo = `${String.fromCharCode(65 + rng.int(0, 25))}${String.fromCharCode(65 + rng.int(0, 25))}${rng.digits(7)}`;
    if (rng.chance(0.25)) nationalId = `2${rng.digits(9)}`;
    mobile = nationalId ? `+9665${rng.digits(8)}` : `+${rng.pick(["44", "1", "33", "49", "91", "81"])}${rng.digits(10)}`;
  }

  const company = opts.company ?? rng.pick(COMPANIES);
  const [first, ...rest] = fullName.split(" ");
  const domain = `${slug(company).slice(0, 14)}.com`;
  const email = `${slug(first)}.${slug(rest[rest.length - 1] ?? "")}@${rng.chance(0.15) ? "gmail.com" : domain}`;
  const year = rng.int(1962, 2001);
  const dob = `${year}-${String(rng.int(1, 12)).padStart(2, "0")}-${String(rng.int(1, 28)).padStart(2, "0")}`;

  return {
    fullName,
    fullNameAr,
    nationality,
    nationalId,
    passportNo,
    email,
    mobile,
    dob,
    company,
    jobTitle: opts.jobTitle ?? rng.pick(TITLES),
  };
}
