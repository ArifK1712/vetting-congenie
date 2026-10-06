import type {
  ApplicantProfile,
  BlacklistEntry,
  Database,
  ID,
  ListIdentity,
  MatchType,
  ScreeningField,
  WatchlistEntry,
} from "./types";

/**
 * Section 9.4 matching. Before comparing: ignore case, accents, punctuation
 * and extra spaces; convert Arabic script to Latin letters.
 */

const ARABIC_TO_LATIN: Record<string, string> = {
  "ا": "a", "أ": "a", "إ": "i", "آ": "a", "ء": "", "ؤ": "u", "ئ": "i",
  "ب": "b", "ت": "t", "ث": "th", "ج": "j", "ح": "h", "خ": "kh",
  "د": "d", "ذ": "dh", "ر": "r", "ز": "z", "س": "s", "ش": "sh",
  "ص": "s", "ض": "d", "ط": "t", "ظ": "z", "ع": "a", "غ": "gh",
  "ف": "f", "ق": "q", "ك": "k", "ل": "l", "م": "m", "ن": "n",
  "ه": "h", "ة": "a", "و": "w", "ي": "y", "ى": "a",
};

/** Common romanisation variants collapsed to one spelling. */
const LATIN_VARIANTS: [RegExp, string][] = [
  [/\b(al|el)[\s-]?/g, "al"],
  [/\b(abdul|abdel|abd al|abd el)\s?/g, "abdal"],
  [/\bmohamm?ed\b|\bmuhamm?ad\b|\bmohamm?ad\b/g, "mhmd"],
  [/\bahmed\b/g, "ahmad"],
  [/ou/g, "u"],
  [/ee/g, "i"],
  [/oo/g, "u"],
];

export function transliterate(input: string): string {
  return Array.from(input)
    .map((ch) => ARABIC_TO_LATIN[ch] ?? ch)
    .join("");
}

// Screening compares every applicant with every entry; list names repeat
// constantly, so normalised forms are cached (bounded).
const normalizedCache = new Map<string, string>();

export function normalizeName(input: string): string {
  const cached = normalizedCache.get(input);
  if (cached !== undefined) return cached;
  const result = computeNormalizedName(input);
  if (normalizedCache.size > 20_000) normalizedCache.clear();
  normalizedCache.set(input, result);
  return result;
}

function computeNormalizedName(input: string): string {
  let s = transliterate(input)
    .normalize("NFD")
    .replace(/[̀-ًͯ-ٟ]/g, "") // Latin accents, Arabic diacritics
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const [pattern, replacement] of LATIN_VARIANTS) s = s.replace(pattern, replacement);
  return s.replace(/\s+/g, " ").trim();
}

export function normalizeId(input: string | undefined): string {
  return (input ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
}

/** Jaro–Winkler similarity, 0–100. */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 100;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aFlags = new Array(a.length).fill(false);
  const bFlags = new Array(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const lo = Math.max(0, i - range);
    const hi = Math.min(i + range + 1, b.length);
    for (let j = lo; j < hi; j++) {
      if (!bFlags[j] && a[i] === b[j]) {
        aFlags[i] = bFlags[j] = true;
        matches++;
        break;
      }
    }
  }
  if (!matches) return 0;
  let k = 0;
  let transpositions = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aFlags[i]) continue;
    while (!bFlags[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  const m = matches;
  const jaro = (m / a.length + m / b.length + (m - transpositions / 2) / m) / 3;
  let prefix = 0;
  while (prefix < 4 && a[prefix] === b[prefix]) prefix++;
  return Math.round((jaro + prefix * 0.1 * (1 - jaro)) * 100);
}

const tokenCache = new Map<string, string[]>();
function tokensOf(name: string): string[] {
  let tokens = tokenCache.get(name);
  if (!tokens) {
    tokens = normalizeName(name).split(" ").filter(Boolean);
    if (tokenCache.size > 20_000) tokenCache.clear();
    tokenCache.set(name, tokens);
  }
  return tokens;
}

/**
 * Token-based, order-insensitive name score. Every token of the shorter name
 * must find a close token in the longer one; the weakest token decides the
 * score, so "Fahad Al-Harbi" does not match "Fahad Al-Shehri". Each extra
 * token in the longer name (a middle name) costs 4 points.
 */
export function nameScore(a: string, b: string, floor = 0): number {
  const ta = tokensOf(a);
  const tb = tokensOf(b);
  if (!ta.length || !tb.length) return 0;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const penalty = (long.length - short.length) * 4;
  let weakest = 100;
  for (const token of short) {
    let best = 0;
    for (const other of long) best = Math.max(best, similarity(token, other));
    weakest = Math.min(weakest, best);
    // Early exit: this pair can no longer reach the caller's threshold.
    if (weakest - penalty < floor) return 0;
  }
  return Math.max(0, weakest - penalty);
}

export interface MatchThresholds {
  nameWithDob: number;
  nameOnly: number;
}
export const DEFAULT_THRESHOLDS: MatchThresholds = { nameWithDob: 90, nameOnly: 85 };

/** The thresholds set on the Settings page (spec defaults if none). */
export const thresholdsOf = (db: Pick<Database, "config">): MatchThresholds => db.config?.matching ?? DEFAULT_THRESHOLDS;

export interface MatchCandidate {
  entryId: ID;
  matchType: MatchType;
  matchedField: ScreeningField;
  score: number;
  strength: "strong" | "possible";
}

/** Returns the strongest match between an applicant and one list identity, if any. */
export function matchIdentity(
  profile: ApplicantProfile,
  identity: ListIdentity,
  thresholds: MatchThresholds = DEFAULT_THRESHOLDS,
): Omit<MatchCandidate, "entryId"> | null {
  if (identity.subjectType === "company") {
    if (identity.company && normalizeName(identity.company) === normalizeName(profile.company)) {
      return { matchType: "company", matchedField: "company", score: 100, strength: "strong" };
    }
    return null;
  }

  if (identity.nationalId && normalizeId(identity.nationalId) === normalizeId(profile.nationalId)) {
    return { matchType: "id", matchedField: "nationalId", score: 100, strength: "strong" };
  }
  if (
    identity.passportNo &&
    normalizeId(identity.passportNo) === normalizeId(profile.passportNo) &&
    (!identity.nationality || identity.nationality === profile.nationality)
  ) {
    return { matchType: "id", matchedField: "passportNo", score: 100, strength: "strong" };
  }
  if (identity.email && identity.email.toLowerCase() === profile.email.toLowerCase()) {
    return { matchType: "id", matchedField: "email", score: 100, strength: "strong" };
  }
  if (identity.mobile && normalizeId(identity.mobile) === normalizeId(profile.mobile)) {
    return { matchType: "id", matchedField: "mobile", score: 100, strength: "strong" };
  }

  const names = [identity.fullName, ...identity.aliases];
  const applicantNames = [profile.fullName, profile.fullNameAr].filter(Boolean) as string[];
  let best = 0;
  for (const n of names) for (const p of applicantNames) best = Math.max(best, nameScore(n, p, thresholds.nameOnly));

  if (identity.dob && identity.dob === profile.dob && best >= thresholds.nameWithDob) {
    return { matchType: "nameDob", matchedField: "fullName", score: best, strength: "strong" };
  }
  if (best >= thresholds.nameOnly) {
    return { matchType: "name", matchedField: "fullName", score: best, strength: "possible" };
  }
  return null;
}

function inScope(scope: "all" | ID[], eventId: ID) {
  return scope === "all" || scope.includes(eventId);
}

export function screenProfile(
  profile: ApplicantProfile,
  eventId: ID,
  blacklist: BlacklistEntry[],
  watchlist: WatchlistEntry[],
  suppressed: Set<string> = new Set(),
  thresholds: MatchThresholds = DEFAULT_THRESHOLDS,
): { blacklist: MatchCandidate[]; watchlist: MatchCandidate[] } {
  const run = (entries: (BlacklistEntry | WatchlistEntry)[]) =>
    entries
      .filter((e) => e.status === "active" && inScope(e.eventScope, eventId) && !suppressed.has(e.id))
      .flatMap((e) => {
        const m = matchIdentity(profile, e.identity, thresholds);
        return m ? [{ ...m, entryId: e.id }] : [];
      });
  return { blacklist: run(blacklist), watchlist: run(watchlist) };
}

/** Masks an identifier for display without Blacklist View: "•••• 6789". */
export function maskId(value: string | undefined): string {
  if (!value) return "";
  return `•••• ${value.slice(-4)}`;
}
