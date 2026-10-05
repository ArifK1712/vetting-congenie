/**
 * Domain model for the Vetting prototype (Phase 1).
 * Mirrors section 18 of the functional specification, minus Phase 2
 * tables (rules, pre-approved list). IDs are strings; times are ISO-8601 UTC.
 */

export type ID = string;
export type ISODate = string;

/** Admin-entered configuration text that exists in both languages. */
export type LocalizedText = { en: string; ar: string };

// ─── Access ──────────────────────────────────────────────────────────────

export const PERMISSIONS = [
  "teams.view",
  "teams.edit",
  "workflows.view",
  "workflows.edit",
  "workflows.publish",
  "queue.access",
  "queue.assign",
  "queue.reviewAll",
  "blacklist.view",
  "blacklist.propose",
  "blacklist.approve",
  "watchlist.view",
  "watchlist.manage",
  "reports.view",
  "reports.export",
  "registration.vettingSettings",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export interface Role {
  id: ID;
  name: LocalizedText;
  permissions: Permission[];
}

export interface User {
  id: ID;
  name: string;
  email: string;
  roleId: ID;
  title: LocalizedText;
  active: boolean;
}

// ─── Events, registrations, badge types ─────────────────────────────────

export interface Event {
  id: ID;
  name: LocalizedText;
  code: string;
  startsOn: ISODate;
  venue: LocalizedText;
}

export interface BadgeType {
  id: ID;
  name: LocalizedText;
}

export type QuestionType =
  | "text"
  | "longText"
  | "number"
  | "date"
  | "singleChoice"
  | "multiChoice"
  | "upload";

export interface FormQuestion {
  id: ID;
  label: LocalizedText;
  type: QuestionType;
  options?: { value: string; label: LocalizedText }[];
}

export interface Registration {
  id: ID;
  eventId: ID;
  name: LocalizedText;
  badgeTypeIds: ID[];
  capacityLimit: number;
  questions: FormQuestion[];
}

/** Which profile field a form question feeds for list screening (15.1). */
export type ScreeningField =
  | "fullName"
  | "nationalId"
  | "passportNo"
  | "nationality"
  | "dob"
  | "email"
  | "mobile"
  | "company";

export interface RegistrationVettingSettings {
  registrationId: ID;
  enabled: boolean;
  /** Per uncovered badge type: no vetting, or block submissions. */
  uncoveredBadgeBehaviour: Record<ID, "noVetting" | "block">;
  blacklistScreening: boolean;
  blacklistMatchAction: "hold" | "autoRejectExact";
  watchlistScreening: boolean;
  rejectionTemplateId: ID;
}

// ─── Teams ───────────────────────────────────────────────────────────────

export type ConditionOperator =
  | "is"
  | "isNot"
  | "isAnyOf"
  | "isNoneOf"
  | "contains"
  | "isEmpty"
  | "isNotEmpty";

export interface Condition {
  id: ID;
  /** e.g. "profile.nationality", "answer.q_purpose", "payment.status", "screening.watchlistLevel" */
  field: string;
  operator: ConditionOperator;
  value: string[];
}

export type FieldAccessLevel = "hidden" | "view" | "edit" | "download";

export type FieldGroup = "profile" | "answers" | "documents" | "payment" | "moreInfo";

export interface TeamRegistrationAccess {
  registrationId: ID;
  /** fieldKey → level. Missing keys are hidden. */
  fields: Record<string, FieldAccessLevel>;
}

export interface TeamMember {
  userId: ID;
  role: "reviewer" | "lead";
}

export interface Team {
  id: ID;
  name: LocalizedText;
  description: LocalizedText;
  status: "active" | "inactive";
  members: TeamMember[];
  eventScope: "all" | ID[];
  badgeScope: "all" | ID[];
  access: TeamRegistrationAccess[];
  conditions: Condition[];
  conditionMatch: "all" | "any";
  assignmentMode: "selfClaim" | "leadAssigns" | "roundRobin";
  maxOpenClaims: number;
  createdAt: ISODate;
}

// ─── Workflows ───────────────────────────────────────────────────────────

export type StageAction = "approve" | "reject" | "moreInfo" | "escalate";

export interface StageConfig {
  name: LocalizedText;
  instructions: LocalizedText;
  teams: ID[]; // in priority order
  fallbackTeamId: ID | null;
  allowedActions: StageAction[];
  escalateTo: ID[]; // node ids
  afterMoreInfoReturnTo: ID | "same";
  rejectReasonRequired: boolean;
  timeLimitHours: number | null;
  mandatory: boolean;
}

export type WorkflowNode =
  | { id: ID; type: "start"; position: { x: number; y: number } }
  | { id: ID; type: "stage"; position: { x: number; y: number }; stage: StageConfig }
  | {
      id: ID;
      type: "condition";
      position: { x: number; y: number };
      condition: { label: LocalizedText; branches: { id: ID; label: LocalizedText; condition: Condition }[] };
    }
  | { id: ID; type: "final"; position: { x: number; y: number } }
  | { id: ID; type: "rejected"; position: { x: number; y: number }; defaultReasonId?: ID };

export interface WorkflowEdge {
  id: ID;
  source: ID;
  /** "next" for start, an action for stages, a branch id or "otherwise" for conditions */
  handle: string;
  target: ID;
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface Workflow {
  id: ID;
  name: LocalizedText;
  label: LocalizedText;
  description: LocalizedText;
  badgeTypeId: ID;
  status: "draft" | "active" | "inactive";
  currentVersionId: ID | null;
  draft: WorkflowGraph | null;
  createdAt: ISODate;
}

export interface WorkflowVersion {
  id: ID;
  workflowId: ID;
  versionNo: number;
  graph: WorkflowGraph;
  publishedBy: ID;
  publishedAt: ISODate;
}

export interface WorkflowAllotment {
  id: ID;
  workflowId: ID;
  registrationId: ID;
  badgeTypeId: ID;
  allottedBy: ID;
  allottedAt: ISODate;
}

// ─── Applicants & requests ──────────────────────────────────────────────

export interface ApplicantProfile {
  fullName: string;
  fullNameAr?: string;
  email: string;
  mobile: string;
  nationality: string; // ISO 3166-1 alpha-2
  nationalId?: string; // National ID / Iqama
  passportNo?: string;
  dob: string; // YYYY-MM-DD
  company: string;
  jobTitle: string;
}

export interface UploadedDocument {
  id: ID;
  questionId: ID;
  fileName: string;
  mime: "application/pdf" | "image/jpeg" | "image/png";
  sizeKb: number;
  uploadedAt: ISODate;
  infoRound?: number;
}

export interface Payment {
  status: "paid" | "pending" | "free";
  amount: number; // SAR
  invoiceNo?: string;
}

export interface Attendee {
  id: ID;
  eventId: ID;
  registrationId: ID;
  badgeTypeId: ID;
  profile: ApplicantProfile;
  answers: Record<ID, string | string[]>;
  documents: UploadedDocument[];
  payment: Payment;
  registrationStatus: "submitted" | "confirmed" | "cancelled";
  submittedAt: ISODate;
}

export type RequestStatus =
  | "pending_review"
  | "under_review"
  | "more_info_required"
  | "escalated"
  | "screening_hold"
  | "approved"
  | "rejected"
  | "withdrawn"
  | "configuration_error";

export type BadgeStatus = "not_issued" | "issued" | "suspended" | "revoked";

export type WatchlistLevel = "low" | "medium" | "high";

export interface VettingRequest {
  id: ID; // e.g. VR-1024
  attendeeId: ID;
  eventId: ID;
  registrationId: ID;
  badgeTypeId: ID;
  workflowId: ID | null;
  workflowVersionId: ID | null;
  status: RequestStatus;
  currentStageNodeId: ID | null;
  /** Team currently responsible (resolved by routing). */
  currentTeamId: ID | null;
  claimedBy: ID | null;
  screening: "clear" | "blacklist_hit" | "watchlist_hit";
  watchlistLevel: WatchlistLevel | null;
  responseReceived: boolean;
  /** All stages approved but registration limit full (11.3). */
  awaitingCapacity: boolean;
  badgeStatus: BadgeStatus;
  rejectReasonId: ID | null;
  revision: number;
  submittedAt: ISODate;
  /** When the request entered its current stage / status. */
  stageEnteredAt: ISODate;
  decidedAt: ISODate | null;
}

export interface StageExecution {
  id: ID;
  requestId: ID;
  stageNodeId: ID;
  stageName: LocalizedText;
  teamId: ID;
  assignedUserId: ID | null;
  status: "open" | "claimed" | "completed";
  enteredAt: ISODate;
  claimedAt: ISODate | null;
  completedAt: ISODate | null;
  outcome: StageAction | "returned" | null;
}

export type HistoryAction =
  | "submitted"
  | "screened"
  | "routed"
  | "claimed"
  | "released"
  | "approved_stage"
  | "rejected"
  | "more_info_requested"
  | "more_info_received"
  | "escalated"
  | "reassigned"
  | "commented"
  | "screening_hold"
  | "match_cleared"
  | "match_confirmed"
  | "final_approved"
  | "limit_reached"
  | "badge_issued"
  | "badge_suspended"
  | "document_downloaded"
  | "withdrawn";

export interface HistoryEvent {
  id: ID;
  requestId: ID;
  action: HistoryAction;
  actorId: ID | "system" | "attendee";
  at: ISODate;
  fromStatus?: RequestStatus;
  toStatus?: RequestStatus;
  stageNodeId?: ID;
  teamId?: ID;
  remarks?: string;
  meta?: Record<string, string | number | boolean | null>;
}

export interface InfoQuestion {
  id: ID;
  label: string;
  type: Exclude<QuestionType, never>;
  required: boolean;
  options?: string[];
}

export interface InfoRequest {
  id: ID;
  requestId: ID;
  round: number;
  stageNodeId: ID;
  requestedBy: ID;
  instructions: string;
  questions: InfoQuestion[];
  answers: Record<ID, string | string[]> | null;
  status: "sent" | "answered" | "expired";
  tokenExpiresAt: ISODate;
  sentAt: ISODate;
  answeredAt: ISODate | null;
}

export interface Comment {
  id: ID;
  requestId: ID;
  authorId: ID;
  body: string;
  at: ISODate;
}

// ─── Lists & screening ──────────────────────────────────────────────────

export interface ListIdentity {
  subjectType: "person" | "company";
  fullName: string;
  aliases: string[];
  nationalId?: string;
  passportNo?: string;
  nationality?: string;
  email?: string;
  mobile?: string;
  dob?: string;
  company?: string;
}

export type BlacklistReason =
  | "security_threat"
  | "past_misconduct"
  | "fake_registration"
  | "authority_instruction"
  | "unpaid_dues"
  | "other";

export interface BlacklistEntry {
  id: ID;
  identity: ListIdentity;
  eventScope: "all" | ID[];
  reasonType: BlacklistReason;
  reasonDetail: string;
  evidence: { id: ID; fileName: string; sizeKb: number }[];
  startsOn: ISODate;
  endsOn: ISODate | null;
  status: "pending_approval" | "active" | "removed" | "expired" | "not_approved";
  proposedBy: ID;
  proposedAt: ISODate;
  approvedBy: ID | null;
  approvedAt: ISODate | null;
}

export interface WatchlistEntry {
  id: ID;
  identity: ListIdentity;
  eventScope: "all" | ID[];
  level: WatchlistLevel;
  onMatch: "mark" | "markEmail" | "markStage";
  extraStage: string | null;
  notify: ID[];
  reviewerNote: string;
  reason: string;
  startsOn: ISODate;
  endsOn: ISODate | null;
  status: "active" | "removed" | "expired";
  createdBy: ID;
  createdAt: ISODate;
}

export type MatchType = "id" | "company" | "nameDob" | "name";

export interface ScreeningMatch {
  id: ID;
  requestId: ID;
  listType: "blacklist" | "watchlist";
  entryId: ID;
  matchType: MatchType;
  matchedField: ScreeningField;
  score: number; // 0–100
  strength: "strong" | "possible";
  stagePoint: "submission" | "resubmission" | "final" | "retro";
  status: "open" | "confirmed" | "cleared";
  foundAt: ISODate;
  decidedBy: ID | null;
  decidedAt: ISODate | null;
  decisionNote: string | null;
}

// ─── Capacity, reasons, outbox ──────────────────────────────────────────

export interface CapacityAllocation {
  id: ID;
  requestId: ID; // unique
  registrationId: ID;
  state: "held" | "released";
  createdAt: ISODate;
}

export interface RejectReason {
  id: ID;
  label: LocalizedText;
}

export interface EmailOutboxItem {
  id: ID;
  to: string;
  template: string;
  requestId: ID | null;
  sentAt: ISODate;
  params: Record<string, string>;
}

// ─── Whole prototype database ───────────────────────────────────────────

export interface Database {
  schemaVersion: number;
  seededAt: ISODate;
  roles: Record<ID, Role>;
  users: Record<ID, User>;
  events: Record<ID, Event>;
  badgeTypes: Record<ID, BadgeType>;
  registrations: Record<ID, Registration>;
  vettingSettings: Record<ID, RegistrationVettingSettings>;
  teams: Record<ID, Team>;
  workflows: Record<ID, Workflow>;
  workflowVersions: Record<ID, WorkflowVersion>;
  allotments: Record<ID, WorkflowAllotment>;
  attendees: Record<ID, Attendee>;
  requests: Record<ID, VettingRequest>;
  stageExecutions: Record<ID, StageExecution>;
  history: Record<ID, HistoryEvent>;
  infoRequests: Record<ID, InfoRequest>;
  comments: Record<ID, Comment>;
  blacklist: Record<ID, BlacklistEntry>;
  watchlist: Record<ID, WatchlistEntry>;
  matches: Record<ID, ScreeningMatch>;
  allocations: Record<ID, CapacityAllocation>;
  rejectReasons: Record<ID, RejectReason>;
  outbox: Record<ID, EmailOutboxItem>;
}
