import type { BadgeStatus, RequestStatus } from "@/domain/types";

/**
 * Colour palette for statuses and categories — the one place colour meaning
 * is decided. Each tone is a soft tinted background, a readable foreground,
 * a hairline ring and a solid dot.
 */
export type Tone =
  | "slate" | "indigo" | "amber" | "orange" | "red" | "emerald"
  | "rose" | "sky" | "violet" | "teal" | "gold" | "gray";

export const TONE: Record<Tone, { pill: string; dot: string; chip: string; text: string }> = {
  slate:   { pill: "bg-slate-100 text-slate-700 ring-slate-500/15",       dot: "bg-slate-400",   chip: "bg-slate-100 text-slate-600",    text: "text-slate-600" },
  indigo:  { pill: "bg-indigo-50 text-indigo-700 ring-indigo-600/15",     dot: "bg-indigo-500",  chip: "bg-indigo-100 text-indigo-600",  text: "text-indigo-600" },
  amber:   { pill: "bg-amber-50 text-amber-800 ring-amber-600/20",        dot: "bg-amber-500",   chip: "bg-amber-100 text-amber-600",    text: "text-amber-700" },
  orange:  { pill: "bg-orange-50 text-orange-700 ring-orange-600/20",     dot: "bg-orange-500",  chip: "bg-orange-100 text-orange-600",  text: "text-orange-600" },
  red:     { pill: "bg-red-50 text-red-700 ring-red-600/20",              dot: "bg-red-500",     chip: "bg-red-100 text-red-600",        text: "text-red-600" },
  emerald: { pill: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",  dot: "bg-emerald-500", chip: "bg-emerald-100 text-emerald-600", text: "text-emerald-600" },
  rose:    { pill: "bg-rose-50 text-rose-700 ring-rose-600/15",           dot: "bg-rose-500",    chip: "bg-rose-100 text-rose-600",      text: "text-rose-600" },
  sky:     { pill: "bg-sky-50 text-sky-700 ring-sky-600/20",              dot: "bg-sky-500",     chip: "bg-sky-100 text-sky-600",        text: "text-sky-600" },
  violet:  { pill: "bg-violet-50 text-violet-700 ring-violet-600/15",     dot: "bg-violet-500",  chip: "bg-violet-100 text-violet-600",  text: "text-violet-600" },
  teal:    { pill: "bg-teal-50 text-teal-700 ring-teal-600/20",           dot: "bg-teal-500",    chip: "bg-teal-100 text-teal-600",      text: "text-teal-600" },
  gold:    { pill: "bg-yellow-50 text-yellow-800 ring-yellow-600/25",     dot: "bg-yellow-500",  chip: "bg-yellow-100 text-yellow-700",  text: "text-yellow-700" },
  gray:    { pill: "bg-gray-100 text-gray-600 ring-gray-500/15",          dot: "bg-gray-400",    chip: "bg-gray-100 text-gray-500",      text: "text-gray-500" },
};

export const STATUS_TONE: Record<RequestStatus, Tone> = {
  pending_review: "sky",
  under_review: "indigo",
  more_info_required: "amber",
  escalated: "orange",
  screening_hold: "red",
  approved: "emerald",
  rejected: "rose",
  withdrawn: "gray",
  configuration_error: "orange",
};

export const BADGE_STATUS_TONE: Record<BadgeStatus, Tone> = {
  not_issued: "gray",
  issued: "emerald",
  suspended: "red",
  revoked: "rose",
};

/** Badge types get a stable category colour so they can be scanned in a list. */
export const BADGE_TYPE_TONE: Record<string, Tone> = {
  bt_vip: "gold",
  bt_speaker: "violet",
  bt_media: "sky",
  bt_visitor: "teal",
  bt_exhibitor: "indigo",
  bt_contractor: "slate", // orange and gold (VIP) are both the brand Warning colour
};

export const AVATAR_TONES: Tone[] = ["indigo", "emerald", "amber", "rose", "sky", "violet", "teal", "orange"];
