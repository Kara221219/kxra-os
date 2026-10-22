/** Presentation contract only. Database transactions validate every transition. */
export type CollaborationKind = "CREATOR" | "SAMPLE";
export const collaborationStages = {
  CREATOR: [
    "RESEARCH",
    "SHORTLIST",
    "BRIEF_REVIEW",
    "COLLABORATING",
    "COMPLETE",
    "ARCHIVED",
  ],
  SAMPLE: [
    "REQUESTED",
    "PREPARED",
    "DELIVERED",
    "POST_REVIEW",
    "COMPLETE",
    "CANCELLED",
  ],
} as const;
const transitions: Record<
  CollaborationKind,
  Record<string, readonly string[]>
> = {
  CREATOR: {
    RESEARCH: ["SHORTLIST", "ARCHIVED"],
    SHORTLIST: ["BRIEF_REVIEW", "ARCHIVED"],
    BRIEF_REVIEW: ["COLLABORATING", "SHORTLIST", "ARCHIVED"],
    COLLABORATING: ["COMPLETE", "ARCHIVED"],
    COMPLETE: ["ARCHIVED"],
  },
  SAMPLE: {
    REQUESTED: ["PREPARED", "CANCELLED"],
    PREPARED: ["DELIVERED", "CANCELLED"],
    DELIVERED: ["POST_REVIEW"],
    POST_REVIEW: ["COMPLETE"],
  },
};
export const nextCollaborationStages = (
  kind: CollaborationKind,
  stage: string,
) => transitions[kind][stage] || [];
export type CollaborationRecord = {
  id: string;
  kind: CollaborationKind;
  title: string;
  body: string;
  responsible: string;
  next_step: string;
  due_on: string | null;
  creator_id: string | null;
  creator_title: string | null;
  stage: string;
  version: number;
};
export type CollaborationAction = {
  id: string;
  kind: CollaborationKind;
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
    creator_title: string | null;
    creator_version: number | null;
  };
  result: {
    record_id: string;
    version: number;
    stage: string;
    action_id: string;
    replayed: boolean;
  } | null;
};
