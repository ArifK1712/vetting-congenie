import type { RequestStatus } from "./types";

/** Allowed transitions, from section 17 of the specification. */
export const TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  pending_review: ["under_review", "screening_hold", "withdrawn"],
  under_review: [
    "pending_review",
    "more_info_required",
    "escalated",
    "approved",
    "rejected",
    "screening_hold",
  ],
  more_info_required: ["pending_review", "withdrawn", "rejected"],
  escalated: ["under_review"],
  screening_hold: ["pending_review", "rejected"],
  approved: [],
  rejected: ["pending_review"],
  withdrawn: [],
  configuration_error: ["pending_review"],
};

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export const OPEN_STATUSES: RequestStatus[] = [
  "pending_review",
  "under_review",
  "more_info_required",
  "escalated",
];

export const FINAL_STATUSES: RequestStatus[] = ["approved", "rejected", "withdrawn"];

/** Order used for count tiles and filters. */
export const STATUS_ORDER: RequestStatus[] = [
  "pending_review",
  "under_review",
  "more_info_required",
  "escalated",
  "screening_hold",
  "approved",
  "rejected",
  "withdrawn",
  "configuration_error",
];

/**
 * Screening Hold must never reveal a list match to someone without
 * Blacklist View: it is shown to them as Under Review (13.2).
 */
export function visibleStatus(status: RequestStatus, canSeeBlacklist: boolean): RequestStatus {
  if (status === "screening_hold" && !canSeeBlacklist) return "under_review";
  return status;
}
