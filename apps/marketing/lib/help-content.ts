export const helpCategories = [
  "Getting started",
  "Rooms & threads",
  "Account & members",
  "Agents",
  "Automations",
  "Apps",
  "Connections",
  "Privacy & data",
] as const;
export const helpArticles = [
  {
    slug: "request-workspace-access",
    category: "Getting started",
    title: "Request workspace access",
    summary: "Start with the team and workflow you want to verify.",
    sections: [
      [
        "Before you start",
        "Identify the organisation, the responsible person and the first workflow. A public request is not an automatic membership or subscription.",
      ],
      [
        "Send the right context",
        "Use the access request or contact form. Describe the business need without passwords, customer files or confidential evidence. The form reports success only when the server supplies a receipt.",
      ],
      [
        "After the request",
        "Wait for an agreed onboarding path. Confirm the workspace you are joining before entering private information.",
      ],
    ],
    related: ["choose-your-workspace", "invitations-and-membership"],
  },
  {
    slug: "choose-your-workspace",
    category: "Getting started",
    title: "Choose the right workspace",
    summary: "Keep your work inside the organisation and room you intend.",
    sections: [
      [
        "Check the current context",
        "After signing in, confirm the current organisation and membership. Do not infer membership from a link or a payment-return page.",
      ],
      [
        "Choose before you act",
        "A request must carry the verified workspace context. Switch intentionally before reading private records or preparing work for another team.",
      ],
      [
        "If access is missing",
        "Ask the workspace owner to review the invitation and membership. Repeatedly changing a URL does not grant access.",
      ],
    ],
    related: ["room-visibility", "invitations-and-membership"],
  },
  {
    slug: "room-visibility",
    category: "Rooms & threads",
    title: "Understand room visibility",
    summary: "A room is a permission boundary, not just a folder name.",
    sections: [
      [
        "Know who participates",
        "Review the room’s participants and purpose before sharing a file or adding context. A workspace role does not imply access to every private room.",
      ],
      [
        "Keep context scoped",
        "Agents and retrieval should use the same permitted context as the task. Source withdrawal and membership removal need to invalidate subsequent access.",
      ],
      [
        "When a boundary changes",
        "Stop the affected workflow and ask the responsible owner to confirm the new scope. Do not copy private context into another room to work around access.",
      ],
    ],
    related: ["agent-context", "source-withdrawal"],
  },
  {
    slug: "threads-and-next-actions",
    category: "Rooms & threads",
    title: "Keep a thread and next action together",
    summary: "Turn a conversation into a specific, owned follow-up.",
    sections: [
      [
        "Keep the source",
        "Link the proposed action to the conversation or evidence that prompted it. A useful handoff includes the responsible person, version and expected outcome.",
      ],
      [
        "Review the action",
        "Decide whether the next step is a draft, an internal update or an external effect. Those require different approval and access boundaries.",
      ],
      [
        "Close the loop",
        "Record the actual result or error. A sample preview or a queued request is not evidence that an external action completed.",
      ],
    ],
    related: ["review-agent-output", "workflow-failures"],
  },
  {
    slug: "invitations-and-membership",
    category: "Account & members",
    title: "Invitations and membership",
    summary:
      "An invitation, an identity and an active membership are distinct.",
    sections: [
      [
        "Use your own identity",
        "Open the intended invitation and complete the authorised account-verification flow yourself. Do not share sign-in links or account passwords.",
      ],
      [
        "Confirm membership",
        "The invitation must resolve to the intended organisation and role. Expired, revoked or mismatched invitations should be reviewed by the owner.",
      ],
      [
        "When someone leaves",
        "Remove the membership or room grant deliberately. Subsequent requests and retrieval must respect that removal.",
      ],
    ],
    related: ["choose-your-workspace", "account-security"],
  },
  {
    slug: "account-security",
    category: "Account & members",
    title: "Protect your account",
    summary: "Keep passwords, second factors and recovery details private.",
    sections: [
      [
        "Sign in through the expected origin",
        "Use the configured KXRA sign-in route and verify the domain. Never paste a password, QR enrollment code or recovery secret into chat or an enquiry form.",
      ],
      [
        "Complete MFA personally",
        "Use the supported account-security flow when offered. Privileged owner operations require a verified account and the appropriate MFA assurance.",
      ],
      [
        "Ask for recovery safely",
        "If you cannot sign in, use the supported recovery flow or contact support with a description of the failure. Do not send credentials or authentication screenshots.",
      ],
    ],
    related: ["invitations-and-membership", "privacy-and-support"],
  },
  {
    slug: "agent-context",
    category: "Agents",
    title: "Choose an agent’s context",
    summary: "A useful role starts with a bounded task and selected evidence.",
    sections: [
      [
        "Define the job",
        "Describe the outcome, permitted operations and the point where a human must review. A broad role name is not permission to use every source.",
      ],
      [
        "Select the evidence",
        "Choose only sources the requester and task may access. Keep source provenance and permission checks attached to retrieval.",
      ],
      [
        "Review before execution",
        "The public samples do not execute an agent. Real provider output requires a configured model, reviewed credentials and accepted usage boundaries.",
      ],
    ],
    related: ["review-agent-output", "source-withdrawal"],
  },
  {
    slug: "review-agent-output",
    category: "Agents",
    title: "Review a draft before action",
    summary: "Approve the specific version, rather than a general intention.",
    sections: [
      [
        "Read the evidence",
        "Check the proposed result against its sources. Identify assumptions, unknown costs and material gaps instead of accepting fluent output as proof.",
      ],
      [
        "Inspect the boundary",
        "Confirm the requester, workspace, operation, version and external consequences. A stale review must not authorise changed work.",
      ],
      [
        "Record a decision",
        "Approve, reject or ask for a revision. Do not report a sent message, payment or provider action until the actual outcome is known.",
      ],
    ],
    related: ["threads-and-next-actions", "workflow-failures"],
  },
  {
    slug: "workflow-failures",
    category: "Automations",
    title: "Handle an uncertain workflow result",
    summary:
      "Retry deliberately when an external action may already have happened.",
    sections: [
      [
        "Find the last known state",
        "Inspect the request, run history and available provider evidence. Distinguish a validation failure from a queued, dispatched or uncertain action.",
      ],
      [
        "Avoid duplicate effects",
        "Use the existing request identity and reconciliation path. Blindly replaying a send or charge can duplicate an action even when the original response was lost.",
      ],
      [
        "Keep limits explicit",
        "Hosted scheduling and workers need their own acceptance. A local sample step or planned schedule is not proof that unattended work is running.",
      ],
    ],
    related: ["review-agent-output", "connection-revocation"],
  },
  {
    slug: "sample-versus-live-app",
    category: "Apps",
    title: "Understand a sample app",
    summary:
      "Public examples are interactive explanations, not your operational database.",
    sections: [
      [
        "Try the sample",
        "Sort a record, move a stage or review a sample version. The app pages label fictional records and changes that remain in the page.",
      ],
      [
        "Reset without consequences",
        "Reset restores the sample records. There is no connected customer account, external message, booking or payment behind those controls.",
      ],
      [
        "Plan a real application",
        "A persistent app requires an agreed data model, permissions, validation, migration/recovery evidence and a reviewed release. Ask for a workflow-specific implementation.",
      ],
    ],
    related: ["choose-your-workspace", "review-agent-output"],
  },
  {
    slug: "connection-revocation",
    category: "Connections",
    title: "Review or revoke a connection",
    summary: "Keep the provider’s access and the task’s grant distinct.",
    sections: [
      [
        "Review the scope",
        "Confirm the provider, account, permitted data and operation. Directory presence or a configured environment variable does not prove the connection works.",
      ],
      [
        "Use the secure flow",
        "Enter or rotate credentials only through an authorised secure handoff. Credentials do not belong in prompts, source control or public forms.",
      ],
      [
        "Stop future use",
        "Revoke the appropriate connection or task grant and verify subsequent work is denied. Resolve any already-dispatched or uncertain action through reconciliation.",
      ],
    ],
    related: ["agent-context", "workflow-failures"],
  },
  {
    slug: "source-withdrawal",
    category: "Privacy & data",
    title: "Withdraw or correct a source",
    summary: "Retrieval should follow the current evidence and permissions.",
    sections: [
      [
        "Identify the source",
        "Use the recorded source identity and version. Explain whether it is inaccurate, out of scope or no longer permitted.",
      ],
      [
        "Stop future retrieval",
        "Withdrawal and permission changes must affect future snippets, derived context and agent use. Do not retain a copied source merely to evade removal.",
      ],
      [
        "Keep appropriate evidence",
        "Record the decision and required retention boundary. Follow the reviewed customer documents rather than inventing a new deletion promise.",
      ],
    ],
    related: ["room-visibility", "privacy-and-support"],
  },
  {
    slug: "privacy-and-support",
    category: "Privacy & data",
    title: "Ask a privacy or support question",
    summary: "Use the reviewed contact path and share only what is necessary.",
    sections: [
      [
        "Describe the issue",
        "Include the affected workflow, time and a non-secret error message. Do not attach credentials, authentication codes or private customer records to a public request.",
      ],
      [
        "Use the published route",
        "Contact info@kxra-group.com or use the contact form. A successful form receipt means a request was recorded, not that the issue is resolved or a time slot is booked.",
      ],
      [
        "Read the current terms",
        "The privacy notice and customer documents define the current policies. Old subscription terms are preserved as historical documents while new subscriptions remain paused.",
      ],
    ],
    related: ["account-security", "request-workspace-access"],
  },
] as const;
export const helpBySlug = (slug: string) =>
  helpArticles.find((a) => a.slug === slug);
