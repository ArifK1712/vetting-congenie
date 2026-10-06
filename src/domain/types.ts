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
  /** Standard attendee details (name, ID, email…) that fill the attendee profile. */
  profileField?: keyof ApplicantProfile;
  required?: boolean;
  /** Added after the registration opened (AC29): hidden from every team until granted. */
  addedAt?: ISODate;
  addedBy?: ID;
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
  /** 15.1 "ID field for list check": which question holds each identifier. */
  idFields: Partial<Record<ScreeningField, ID>>;
  /** 15.1 "Use in vetting": questions usable in team/workflow conditions. */
  vettingQuestions: ID[];
  revision: number;
  updatedAt: ISODate | null;
  updatedBy: ID | null;
}

/** Who changed a registration's vetting settings or form, and what (spec 16 history). */
export interface RegistrationHistoryEvent {
  id: ID;
  registrationId: ID;
  action: "settings_saved" | "vetting_enabled" | "vetting_disabled" | "question_added" | "limit_changed";
  actorId: ID;
  at: ISODate;
  /** Setting keys that changed, or the new question id. */
  changes: string[];
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
  /** Bumped on every save; an edit based on an older revision is refused. */
  revision: number;
  createdAt: ISODate;
  updatedAt: ISODate;
}

/** One line in a team's history (5.5: every change to members, scope or access is kept). */
export type TeamChange =
  | { type: "name" }
  | { type: "description" }
  | { type: "memberAdded"; userId: ID; role: TeamMember["role"] }
  | { type: "memberRemoved"; userId: ID }
  | { type: "memberRole"; userId: ID; role: TeamMember["role"] }
  | { type: "events" }
  | { type: "badgeTypes" }
  | { type: "accessAdded"; registrationId: ID }
  | { type: "accessRemoved"; registrationId: ID }
  | { type: "accessChanged"; registrationId: ID; fields: number }
  | { type: "conditions"; count: number }
  | { type: "assignment"; mode: Team["assignmentMode"] }
  | { type: "maxClaims"; value: number }
  | { type: "claimsReleased"; userId: ID; count: number };

export interface TeamHistoryEvent {
  id: ID;
  teamId: ID;
  kind: "created" | "updated" | "activated" | "deactivated";
  actorId: ID;
  at: ISODate;
  changes: TeamChange[];
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
  /** When the saved draft was last changed (null without a draft). */
  draftSavedAt: ISODate | null;
  /** Bumped on every change; an edit based on an older revision is refused. */
  revision: number;
  createdAt: ISODate;
  updatedAt: ISODate;
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
  /** Idempotency key of the form submission (AC05: a double submit creates one request). */
  submissionKey?: string;
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
  | "withdrawn"
  | "watchlist_marked"
  | "field_corrected"
  | "reopened"
  | "configuration_error"
  | "badge_printed"
  | "badge_blocked"
  | "place_released";

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
  /** 15.2: the answer updates this registration field (profile key), and the change is logged. */
  mapsTo?: string | null;
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
  /** One-time link token; replaced (old one invalid) when the link is resent. */
  token: string;
  /** Stage the request goes back to when the attendee answers. */
  returnToNodeId: ID;
  /** When the 24-hours-left reminder was emailed. */
  remindedAt: ISODate | null;
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
  /** Where the entry came from (9.2): the list, a request, or a file upload. */
  source: "manual" | "request" | "import";
  sourceRequestId: ID | null;
  /** A change to an active entry; the active version applies until a second person approves it (9.3). */
  pendingChange: BlacklistChange | null;
  /** Note from the approver when an entry or change was not approved. */
  decisionNote: string | null;
  removedBy: ID | null;
  removedAt: ISODate | null;
  removalReason: string | null;
  revision: number;
  updatedAt: ISODate;
}

export type BlacklistContent = Pick<BlacklistEntry, "identity" | "eventScope" | "reasonType" | "reasonDetail" | "evidence" | "startsOn" | "endsOn">;

export interface BlacklistChange extends BlacklistContent {
  proposedBy: ID;
  proposedAt: ISODate;
}

export interface BlacklistHistoryEvent {
  id: ID;
  entryId: ID;
  action: "proposed" | "edited" | "approved" | "not_approved" | "change_proposed" | "change_approved" | "change_rejected" | "removed";
  actorId: ID;
  at: ISODate;
  note?: string;
  /** Retro-screening result when an entry or change became active. */
  matched?: number;
  suspended?: number;
}

export interface WatchlistEntry {
  id: ID;
  identity: ListIdentity;
  eventScope: "all" | ID[];
  level: WatchlistLevel;
  onMatch: "mark" | "markEmail" | "markStage";
  /**
   * For "markStage": "watchlist_review" (the standard stage) or
   * "<workflowId>:<nodeId>" (a stage copied from that workflow).
   */
  extraStage: string | null;
  /** User ids and team ids to email on a match. */
  notify: ID[];
  reviewerNote: string;
  reasonType: BlacklistReason;
  reason: string;
  evidence: { id: ID; fileName: string; sizeKb: number }[];
  startsOn: ISODate;
  endsOn: ISODate | null;
  status: "active" | "removed" | "expired";
  createdBy: ID;
  createdAt: ISODate;
  source: "manual" | "request" | "import";
  sourceRequestId: ID | null;
  removedBy: ID | null;
  removedAt: ISODate | null;
  removalReason: string | null;
  revision: number;
  updatedAt: ISODate;
  updatedBy: ID;
}

export interface WatchlistHistoryEvent {
  id: ID;
  entryId: ID;
  action: "created" | "edited" | "removed" | "match_cleared" | "moved_to_blacklist";
  actorId: ID;
  at: ISODate;
  note?: string;
  /** Requests newly marked when the entry was saved. */
  marked?: number;
  /** Request (cleared match) or blacklist entry (moved). */
  ref?: ID;
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

// ─── Reports (14.2) ─────────────────────────────────────────────────────

export type ReportKey =
  | "vettingStatus"
  | "timePerStage"
  | "lateRequests"
  | "reviewerActivity"
  | "automation"
  | "listMatches"
  | "listEntries"
  | "activityLog";

export type ReportFormat = "csv" | "xlsx" | "pdf";

/** The filters every report shares. Dates are YYYY-MM-DD in the event time zone. */
export interface ReportFilters {
  from: string;
  to: string;
  registrationIds: ID[];
  badgeTypeIds: ID[];
  workflowIds: ID[];
  teamIds: ID[];
  /** Activity log only: one request's full history. */
  requestId?: string;
}

export interface ReportDownload {
  id: ID;
  report: ReportKey;
  format: ReportFormat;
  filters: ReportFilters;
  eventScope: ID | "all";
  rows: number;
  /** IDs were masked because the user lacks Blacklist View (AC25). */
  masked: boolean;
  actorId: ID;
  at: ISODate;
}

export interface ReportSchedule {
  id: ID;
  report: ReportKey;
  format: ReportFormat;
  filters: ReportFilters;
  eventScope: ID | "all";
  frequency: "daily" | "weekly";
  /** Hour of day (event time zone) it is sent. */
  hour: number;
  /** Weekly only: 0 = Sunday … 6 = Saturday. */
  weekday: number;
  /** Runs with this user's access, and is emailed to them. */
  ownerId: ID;
  active: boolean;
  createdAt: ISODate;
  lastRunAt: ISODate | null;
  nextRunAt: ISODate;
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
  /** Inactive reasons stay on past decisions but can't be chosen. */
  active: boolean;
  order: number;
  /** Used by the system itself (Blacklisted): can be renamed, never removed. */
  system?: boolean;
}

/** Company-wide vetting settings (Settings page). */
export interface VettingConfig {
  /** 9.4 name matching: Name + DOB is strong at nameWithDob %, Name only is possible at nameOnly %. */
  matching: { nameWithDob: number; nameOnly: number };
  /** 8.5 More Information: link lifetime and the reminder before it ends. */
  moreInfo: { linkDays: number; reminderHours: number };
  /** 16: the sender address emails go from. */
  senderAddress: string;
  revision: number;
  updatedAt: ISODate | null;
  updatedBy: ID | null;
}

/** An edited email template; templates without one use the built-in text. */
export interface EmailTemplateOverride {
  key: string;
  subject: LocalizedText;
  body: LocalizedText;
  updatedAt: ISODate;
  updatedBy: ID;
}

export interface SettingsHistoryEvent {
  id: ID;
  area: "matching" | "moreInfo" | "sender" | "rejectReasons" | "emailTemplates";
  action: "changed" | "added" | "deactivated" | "reactivated" | "reordered" | "reset";
  /** What changed, e.g. "nameOnly: 85 → 88", a reason or template key. */
  changes: string[];
  actorId: ID;
  at: ISODate;
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
  registrationHistory: Record<ID, RegistrationHistoryEvent>;
  teams: Record<ID, Team>;
  teamHistory: Record<ID, TeamHistoryEvent>;
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
  blacklistHistory: Record<ID, BlacklistHistoryEvent>;
  watchlist: Record<ID, WatchlistEntry>;
  watchlistHistory: Record<ID, WatchlistHistoryEvent>;
  matches: Record<ID, ScreeningMatch>;
  allocations: Record<ID, CapacityAllocation>;
  rejectReasons: Record<ID, RejectReason>;
  config: VettingConfig;
  emailTemplates: Record<string, EmailTemplateOverride>;
  settingsHistory: Record<ID, SettingsHistoryEvent>;
  outbox: Record<ID, EmailOutboxItem>;
  /** Every report download (14.2: "Every download is logged"). */
  reportDownloads: Record<ID, ReportDownload>;
  /** Reports emailed daily or weekly (Reports Export). */
  reportSchedules: Record<ID, ReportSchedule>;
  /** When each user last opened their alerts; newer alerts count as unread. */
  notificationReads: Record<ID, ISODate>;
}
