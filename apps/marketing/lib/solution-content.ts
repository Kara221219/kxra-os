export const solutions = {
  "team-context": {
    title: "Keep a team’s work in one shared context.",
    audience: "Business teams",
    intro:
      "Bring a recurring customer or operations question into a room with the people, evidence and decision it needs.",
    problem:
      "The same question arrives in chat, a document and a meeting. Each handoff loses the reason behind the last decision.",
    outcome:
      "A shared conversation with selected evidence, a responsible reviewer and a recorded next step.",
    steps: [
      [
        "Choose one room",
        "Name the team, purpose and participants before adding private information.",
      ],
      [
        "Bring the evidence",
        "Attach only material the participants may use, with its source and current version.",
      ],
      [
        "Make the handoff",
        "Record the proposed action, responsible person and point of review.",
      ],
    ],
    example:
      "A customer operations team reviews one recurring enquiry, agrees the next action and keeps the supporting brief beside the discussion.",
    boundary:
      "A public room sample does not establish live membership, file permissions or agent execution. Hosted acceptance must prove those boundaries with real users.",
    app: "general-crm",
    links: ["workspace", "data-scoping", "approvals"],
  },
  "email-operations": {
    title: "Turn an email question into reviewed work.",
    audience: "Operations teams",
    intro:
      "Keep the relevant message, the business record and a deliberate response decision together.",
    problem:
      "An invoice or customer question is copied between mailboxes and spreadsheets, with no clear owner for the next response.",
    outcome:
      "A bounded review workflow that separates reading, preparing a draft and authorising an external send.",
    steps: [
      [
        "Select the source",
        "Choose the mailbox, conversation and minimum information required.",
      ],
      [
        "Prepare the next action",
        "Link the question to a record and draft the response with a source.",
      ],
      [
        "Review before sending",
        "Confirm the recipient, content, version and permitted operation before any send.",
      ],
    ],
    example:
      "A finance reviewer uses selected invoice context to prepare a follow-up draft. The public tracker illustrates record review; it never sends email.",
    boundary:
      "Mailbox OAuth and a real send/reconciliation path are not enabled by this page. Provider access, external effects and delivery acceptance remain separate gates.",
    app: "general-crm",
    links: ["credentials", "approvals", "run-history"],
  },
  "meeting-follow-up": {
    title: "Give a meeting a clear next step.",
    audience: "Project teams",
    intro:
      "Move from agreed notes to owned actions without treating an unverified transcript as a decision.",
    problem:
      "People leave with different interpretations, while the action list loses its connection to the discussion.",
    outcome:
      "Reviewed notes, explicit decisions and a specific owner for the next action.",
    steps: [
      [
        "Confirm the evidence",
        "Check the notes, participants and information boundary. Identify uncertain or missing statements.",
      ],
      [
        "Separate decision from suggestion",
        "Keep a proposal distinct from what the responsible people actually agreed.",
      ],
      [
        "Assign the handoff",
        "Record the owner, expected outcome and review point alongside the source.",
      ],
    ],
    example:
      "A project team reviews a workshop summary, corrects an assumption and agrees one scoped implementation task.",
    boundary:
      "No meeting recorder or transcription account is connected here. Consent, source rights and actual provider acceptance must be reviewed first.",
    app: "remodeling-crm",
    links: ["workspace", "memory", "approvals"],
  },
  "customer-pipeline": {
    title: "Keep leads separate from real opportunities.",
    audience: "Sales teams",
    intro:
      "Give the next conversation a responsible owner and a qualification decision before it enters the pipeline.",
    problem:
      "Unqualified enquiries inflate a pipeline and leave follow-ups scattered across personal notes.",
    outcome:
      "A deliberate lead-to-opportunity handoff with source context and a visible next action.",
    steps: [
      [
        "Capture the enquiry",
        "Keep what the person actually asked separate from assumptions about budget or intent.",
      ],
      [
        "Qualify deliberately",
        "Review the need, responsible decision-maker and useful next conversation.",
      ],
      [
        "Convert once",
        "Carry the record forward without duplicating it or losing the source.",
      ],
    ],
    example:
      "The CRM sample converts a lead once and moves it into the opportunity view. It does not create a forecast or contact the prospect.",
    boundary:
      "A persistent CRM requires a reviewed record model, membership checks and tested update/conversion transactions. A public sample is not that database.",
    app: "general-crm",
    links: ["build-and-ship", "data-scoping", "run-history"],
  },
  "hiring-review": {
    title: "Keep hiring decisions with people.",
    audience: "People teams",
    intro:
      "Organise the role, application and review evidence without handing consequential decisions to a model.",
    problem:
      "Candidate notes, role criteria and stage changes become mixed together, making the next review difficult to reconstruct.",
    outcome:
      "A specific application stage with scoped review evidence and an accountable human decision.",
    steps: [
      [
        "Define the role",
        "Agree the criteria, reviewers and confidentiality boundary.",
      ],
      [
        "Review an application",
        "Keep the evidence attached to the role-specific application rather than a broad judgement about a person.",
      ],
      [
        "Record the decision",
        "A responsible reviewer chooses the next stage and confirms any external communication.",
      ],
    ],
    example:
      "The recruiting sample moves a fictional application between review stages only when the user chooses.",
    boundary:
      "No applicant is ranked, rejected, invited or offered a job here. Real scorecards and candidate data require private permissions and appropriate human review.",
    app: "recruiting-workspace",
    links: ["access", "data-scoping", "approvals"],
  },
  "internal-apps": {
    title: "Build the smallest useful internal tool.",
    audience: "Technical teams",
    intro:
      "Start with a reviewed record model and workflow, then prove permissions and persistence before release.",
    problem:
      "A useful spreadsheet or manual process grows into an application without a clear data owner or release boundary.",
    outcome:
      "A narrowly scoped app with explicit records, validation, access rules and a reversible release decision.",
    steps: [
      [
        "Map the records",
        "Separate the entities, lifecycle states, responsible people and source relationships.",
      ],
      [
        "Test in isolation",
        "Use fictional test records and verify failure, duplicate and denied-access cases.",
      ],
      [
        "Release a reviewed version",
        "Confirm actual persistence, recovery, configuration and the responsible release decision.",
      ],
    ],
    example:
      "Choose one of six public app samples to discuss a workflow. Each is a local explanation, not a live app-builder or deployment service.",
    boundary:
      "The public catalog does not build, publish or connect an operational app. Those require a separately accepted implementation.",
    app: "sampling-desk",
    links: ["sandbox", "build-and-ship", "run-history"],
  },
} as const;
export type SolutionKey = keyof typeof solutions;
export const solutionKeys = Object.keys(solutions) as SolutionKey[];
