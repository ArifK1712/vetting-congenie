import type { Attendee, Condition, VettingRequest } from "./types";

type ConditionContext = Pick<VettingRequest, "watchlistLevel" | "badgeTypeId" | "registrationId">;

/** Reads a condition field (e.g. "profile.nationality") from request data. */
export function readField(
  field: string,
  attendee: Attendee,
  request: ConditionContext,
): string | string[] | undefined {
  const [source, key] = field.split(".");
  switch (source) {
    case "profile":
      return (attendee.profile as unknown as Record<string, string | undefined>)[key];
    case "answer":
      return attendee.answers[key];
    case "payment":
      return key === "status" ? attendee.payment.status : undefined;
    case "screening":
      return key === "watchlistLevel" ? (request.watchlistLevel ?? undefined) : undefined;
    case "request":
      if (key === "badgeType") return request.badgeTypeId;
      if (key === "registration") return request.registrationId;
      return undefined;
    default:
      return undefined;
  }
}

/**
 * A missing field makes every comparison false, including "is none of"
 * (test case AC03): absent data must never route a request onward.
 */
export function evaluateCondition(c: Condition, value: string | string[] | undefined): boolean {
  const empty = value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
  if (c.operator === "isEmpty") return empty;
  if (c.operator === "isNotEmpty") return !empty;
  if (empty) return false;
  const values = (Array.isArray(value) ? value : [value]).map((v) => v.toLowerCase());
  const targets = c.value.map((v) => v.toLowerCase());
  switch (c.operator) {
    case "is":
      return values.some((v) => v === targets[0]);
    case "isNot":
      return values.every((v) => v !== targets[0]);
    case "isAnyOf":
      return values.some((v) => targets.includes(v));
    case "isNoneOf":
      return values.every((v) => !targets.includes(v));
    case "contains":
      return values.some((v) => v.includes(targets[0] ?? ""));
  }
}

export function evaluateAll(
  conditions: Condition[],
  match: "all" | "any",
  attendee: Attendee,
  request: ConditionContext,
): boolean {
  if (conditions.length === 0) return true;
  const results = conditions.map((c) => evaluateCondition(c, readField(c.field, attendee, request)));
  return match === "all" ? results.every(Boolean) : results.some(Boolean);
}
