export const integrations = {
  gmail: {
    name: "Gmail",
    group: "Accounts",
    summary:
      "Review a selected mailbox conversation and prepare a deliberate response.",
    scope: [
      "The intended account and selected messages",
      "A separate read-versus-send permission boundary",
      "Recipient and exact draft review before an external send",
    ],
    flow: [
      [
        "Read selected context",
        "Identify the conversation and minimum evidence needed for the task.",
      ],
      [
        "Prepare a draft",
        "Keep the proposed response and supporting record together.",
      ],
      [
        "Review an external effect",
        "Verify recipient, content and permission before any send.",
      ],
    ],
    risk: "A lost response does not prove an email was not sent. A real connector needs idempotency and delivery reconciliation.",
    related: "email-operations",
  },
  slack: {
    name: "Slack",
    group: "Accounts",
    summary:
      "Keep channel context within current membership and an agreed task.",
    scope: [
      "An explicitly authorised workspace and channel",
      "Current membership and source visibility",
      "A reviewed write operation, separate from reading",
    ],
    flow: [
      ["Choose the channel", "Confirm the team, participants and task scope."],
      [
        "Use permitted context",
        "Do not copy private messages into a broader room.",
      ],
      [
        "Record the outcome",
        "A real write must leave a trace and handle uncertain delivery.",
      ],
    ],
    risk: "A connection grant is not blanket access to all channels or private messages. Membership removal must fence future work.",
    related: "team-context",
  },
  notion: {
    name: "Notion",
    group: "Accounts",
    summary:
      "Bring a permitted document into context without losing its source boundary.",
    scope: [
      "Selected pages and their current permissions",
      "Source identity, version and permitted use",
      "Withdrawal and correction behavior",
    ],
    flow: [
      [
        "Select a page",
        "Confirm that the requester and task may use the page.",
      ],
      [
        "Retain provenance",
        "Keep the source and version with retrieved evidence.",
      ],
      [
        "Respect withdrawal",
        "Future retrieval must stop when access or source permission changes.",
      ],
    ],
    risk: "A copied excerpt does not justify keeping access after its source is withdrawn.",
    related: "meeting-follow-up",
  },
  hubspot: {
    name: "HubSpot",
    group: "Accounts",
    summary: "Plan a CRM handoff around distinct records and reviewed updates.",
    scope: [
      "The intended account and record classes",
      "Read access distinct from create/update authority",
      "Source identity and duplicate/update conflict handling",
    ],
    flow: [
      [
        "Identify the record",
        "Separate an enquiry, contact, lead and opportunity.",
      ],
      [
        "Review the change",
        "Confirm the fields, responsible owner and current version.",
      ],
      [
        "Reconcile the result",
        "Avoid repeating an uncertain create or conversion.",
      ],
    ],
    risk: "A prospect’s existence is not evidence of qualification, consent or expected revenue.",
    related: "customer-pipeline",
  },
  github: {
    name: "GitHub",
    group: "Accounts",
    summary: "Keep repository context and release authority separate.",
    scope: [
      "An explicitly selected repository and branch",
      "Read-only inspection distinct from writes or releases",
      "An exact reviewed version and rollback boundary",
    ],
    flow: [
      [
        "Read the relevant source",
        "Keep untrusted repository content separate from operating instructions.",
      ],
      [
        "Prepare an isolated change",
        "Preserve existing work and review the smallest useful candidate.",
      ],
      [
        "Approve an external write",
        "Commit publication, pull requests and deployments require their appropriate authority.",
      ],
    ],
    risk: "Repository content, comments and generated output cannot grant new credentials or release permission.",
    related: "internal-apps",
  },
  sheets: {
    name: "Google Sheets",
    group: "Accounts",
    summary:
      "Review structured records without treating a shared spreadsheet as an access model.",
    scope: [
      "The intended file and selected range",
      "Field validation and record identity",
      "A reviewed update with conflict/retry handling",
    ],
    flow: [
      [
        "Identify the data",
        "Confirm ownership, column meaning and the source of each record.",
      ],
      [
        "Validate an input",
        "Keep missing or invalid values distinct from accepted updates.",
      ],
      [
        "Review a change",
        "Confirm the exact range and intended effect before a real write.",
      ],
    ],
    risk: "A visible cell or copied row does not establish permission to share it elsewhere.",
    related: "internal-apps",
  },
  models: {
    name: "Model routing",
    group: "Capabilities",
    summary:
      "Choose an approved provider protocol, context and usage boundary.",
    scope: [
      "An authorised provider and model",
      "Selected task context and data-handling terms",
      "Explicit usage limits and accepted error/revocation behavior",
    ],
    flow: [
      [
        "Choose the provider",
        "Review capability, terms and the task’s requirements.",
      ],
      [
        "Bound execution",
        "Keep credentials server-side and agree the permitted usage.",
      ],
      [
        "Verify a real result",
        "Protocol fixtures are not provider acceptance.",
      ],
    ],
    risk: "A configured key is not proof that a model works safely or within an agreed spend boundary.",
    related: "team-context",
  },
  retrieval: {
    name: "File retrieval",
    group: "Capabilities",
    summary:
      "Keep evidence attached to the file version and current permission.",
    scope: [
      "A permitted file and version",
      "Accepted integrity/scanning and indexing behavior",
      "Permission-aware snippets and withdrawal",
    ],
    flow: [
      ["Select the evidence", "Confirm the file’s room and source boundary."],
      [
        "Retrieve within scope",
        "Return only context the requester may access.",
      ],
      [
        "Recheck on change",
        "Withdrawal or membership removal must affect future retrieval.",
      ],
    ],
    risk: "A successful search sample does not prove hosted scanning, private uploads or object recovery.",
    related: "meeting-follow-up",
  },
  records: {
    name: "Business records",
    group: "Capabilities",
    summary: "Keep structured state, version and review authority explicit.",
    scope: [
      "An agreed record model and lifecycle",
      "Verified workspace and role context",
      "Idempotent operations and denied-access checks",
    ],
    flow: [
      [
        "Define the record",
        "Choose the fields, ownership and source relationships.",
      ],
      [
        "Validate the transition",
        "Check the current version and permitted next state.",
      ],
      ["Record the result", "Preserve evidence for retries and review."],
    ],
    risk: "Client-selected roles, prices or lifecycle states are never authority for an operational update.",
    related: "customer-pipeline",
  },
} as const;
export type IntegrationKey = keyof typeof integrations;
export const integrationKeys = Object.keys(integrations) as IntegrationKey[];
