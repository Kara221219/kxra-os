/** Form/display definitions; PostgreSQL independently enforces every workflow. */
export type CaseKind = "REMODEL" | "ROLE" | "APPLICATION" | "TRAVEL";
export const caseDefinitions = {
  REMODEL: {
    prefix: "remodel",
    title: "Remodeling CRM",
    add: "Add remodeling brief",
    titleLabel: "Project name",
    boundary:
      "Recorded scope and GBP estimate only. No binding quote, contract, deposit or accounting entry is issued.",
    fields: [
      ["property", "Property or project", "text"],
      ["scope", "Scope of work", "long"],
      ["exclusions", "Scope exclusions", "long"],
      ["estimate_amount", "Recorded estimate (GBP)", "money"],
      ["milestone", "Next milestone", "text"],
    ],
  },
  ROLE: {
    prefix: "role",
    title: "Role requirements",
    add: "Define role",
    titleLabel: "Role name",
    boundary:
      "Private-room role requirements only. No job advert, invitation or automated candidate selection.",
    fields: [
      ["role_brief", "Role brief", "long"],
      ["criteria", "Review criteria", "long"],
    ],
  },
  APPLICATION: {
    prefix: "application",
    title: "Recruiting Workspace",
    add: "Record application",
    titleLabel: "Application label",
    boundary:
      "Private-room application and human review record only. No applicant ranking, hiring decision, offer or message is made by this workflow.",
    fields: [
      ["application_reference", "Application reference", "text"],
      ["evidence", "Recorded application evidence", "long"],
      ["review_note", "Human review note", "long"],
    ],
  },
  TRAVEL: {
    prefix: "travel",
    title: "Travel Desk",
    add: "Add travel enquiry",
    titleLabel: "Enquiry name",
    boundary:
      "Versioned enquiry and proposal record only. No booking, payment, supplier message or passport/visa/transit verification.",
    fields: [
      ["traveller_reference", "Traveller or party reference", "text"],
      ["destination", "Destination", "text"],
      ["starts_on", "Start date", "date"],
      ["ends_on", "End date", "date"],
      ["proposal", "Recorded itinerary proposal", "long"],
      ["exclusions", "Proposal exclusions", "long"],
    ],
  },
} as const;
export const caseStages = {
  REMODEL: [
    "BRIEF",
    "ESTIMATE_DRAFT",
    "SCOPE_REVIEWED",
    "MILESTONE_PLANNED",
    "HANDOFF",
    "ARCHIVED",
  ],
  ROLE: ["DRAFT", "OPEN", "CLOSED"],
  APPLICATION: [
    "APPLIED",
    "REVIEW",
    "INTERVIEW",
    "DECISION_RECORDED",
    "ARCHIVED",
  ],
  TRAVEL: [
    "ENQUIRY",
    "PROPOSAL_DRAFT",
    "REVIEWED",
    "NEXT_STEP_AGREED",
    "ARCHIVED",
    "CANCELLED",
  ],
} as const;
const transitions: Record<CaseKind, Record<string, readonly string[]>> = {
  REMODEL: {
    BRIEF: ["ESTIMATE_DRAFT", "ARCHIVED"],
    ESTIMATE_DRAFT: ["SCOPE_REVIEWED", "ARCHIVED"],
    SCOPE_REVIEWED: ["MILESTONE_PLANNED", "ARCHIVED"],
    MILESTONE_PLANNED: ["HANDOFF", "ARCHIVED"],
    HANDOFF: ["ARCHIVED"],
  },
  ROLE: { DRAFT: ["OPEN"], OPEN: ["CLOSED"], CLOSED: ["OPEN"] },
  APPLICATION: {
    APPLIED: ["REVIEW", "ARCHIVED"],
    REVIEW: ["INTERVIEW", "ARCHIVED"],
    INTERVIEW: ["DECISION_RECORDED", "ARCHIVED"],
    DECISION_RECORDED: ["ARCHIVED"],
  },
  TRAVEL: {
    ENQUIRY: ["PROPOSAL_DRAFT", "CANCELLED"],
    PROPOSAL_DRAFT: ["REVIEWED", "CANCELLED"],
    REVIEWED: ["NEXT_STEP_AGREED", "CANCELLED"],
    NEXT_STEP_AGREED: ["ARCHIVED"],
  },
};
export const nextCaseStages = (kind: CaseKind, stage: string) =>
  transitions[kind][stage] || [];
export type CaseDetails = Record<string, string | number>;
export type CaseRecord = {
  id: string;
  kind: CaseKind;
  title: string;
  body: string;
  responsible: string;
  next_step: string;
  due_on: string | null;
  parent_id: string | null;
  parent_title: string | null;
  stage: string;
  version: number;
  details: CaseDetails;
};
export type CaseAction = {
  id: string;
  kind: CaseKind;
  source_id: string;
  source_version: number;
  target_stage: string;
  note: string;
  state: string;
  version: number;
  expires_at: string;
  source_snapshot: {
    title: string;
    body: string;
    responsible: string;
    next_step: string;
    due_on: string | null;
    stage: string;
    version: number;
    details: CaseDetails;
    parent_title: string | null;
    parent_version: number | null;
  };
  result: {
    record_id: string;
    version: number;
    stage: string;
    action_id: string;
    replayed: boolean;
  } | null;
};
