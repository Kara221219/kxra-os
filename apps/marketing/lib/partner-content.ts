export const partnerPages = {
  business: {
    title: "Build a practice around useful outcomes.",
    eyebrow: "PARTNER BUSINESS",
    intro:
      "Choose the kind of problem you can responsibly help a client solve. A repeatable service starts with evidence, scope and delivery competence.",
    sections: [
      [
        "Choose a narrow starting point",
        "Select one workflow and a business audience you understand. Describe the current process, the cost of the problem and the person responsible for a decision.",
      ],
      [
        "Keep the offer specific",
        "Define deliverables, exclusions, assumptions and the review boundary. Separate platform access, provider usage and your implementation work.",
      ],
      [
        "Validate before scaling",
        "Use discovery and a small, agreed engagement. Record actual acceptance and costs rather than promising guaranteed revenue.",
      ],
    ],
    next: "learn",
  },
  learn: {
    title: "Learn the workflow before you lead it.",
    eyebrow: "PARTNER LEARNING PATH",
    intro:
      "Work through a sample, test the boundary and practise the handoff before using a workflow with a real client.",
    sections: [
      [
        "Explore the workspace",
        "Use the public samples to understand rooms, context and review. Sample state is not a persistent client project.",
      ],
      [
        "Practise the acceptance checks",
        "Test a useful outcome and its negative cases: missing evidence, stale scope, revoked access and uncertain external effects.",
      ],
      [
        "Review your readiness",
        "Identify the provider, data, recovery and delivery checks still missing. Agree who can accept the result.",
      ],
    ],
    next: "toolkit",
  },
  toolkit: {
    title: "A deliberate kit for the next engagement.",
    eyebrow: "PARTNER TOOLKIT",
    intro:
      "Use a scope worksheet to make discovery and delivery review concrete. Keep private client information out of this public planning aid.",
    sections: [
      [
        "Discovery outline",
        "Record the current workflow, the responsible people, the available evidence and the smallest useful outcome.",
      ],
      [
        "Acceptance plan",
        "Describe the expected result, test data, permission boundaries, error cases and the person who reviews the evidence.",
      ],
      [
        "Delivery handoff",
        "Keep the version, dependencies, rollback path, support boundary and unresolved items together.",
      ],
    ],
    next: "materials",
  },
  materials: {
    title: "Use evidence you can stand behind.",
    eyebrow: "PARTNER MATERIALS",
    intro:
      "Prepare a clear explanation and demonstration without implying unsupported customer results or provider readiness.",
    sections: [
      [
        "An honest demonstration",
        "Label sample data and local interactions. Show the review boundary and explain which connections are actually verified.",
      ],
      [
        "A specific proposal",
        "Include scope, exclusions, milestones and an exact agreed price. A demonstration does not create a contract or payment obligation.",
      ],
      [
        "A useful handover",
        "Provide the reviewed version, operating instructions, acceptance evidence and the outstanding limitations.",
      ],
    ],
    next: "workshop",
  },
  workshop: {
    title: "A workshop with a useful next decision.",
    eyebrow: "CLIENT WORKSHOP",
    intro:
      "Start with one process, the people who know it and a decision worth clarifying. End with a scoped next step.",
    sections: [
      [
        "Before the session",
        "Agree the question, participants and information boundary. Ask for a non-confidential process description before arranging private evidence access.",
      ],
      [
        "During the session",
        "Map the actual workflow, identify handoffs and failure cases, and compare a small number of practical options. Keep assumptions distinct from facts.",
      ],
      [
        "After the session",
        "Record the decision, responsible person, dependencies and next review. Implementation needs a separately agreed scope.",
      ],
    ],
    next: "fde",
  },
  fde: {
    title: "Deliver with the client, not around them.",
    eyebrow: "EMBEDDED DELIVERY",
    intro:
      "Translate an agreed workflow into a tested implementation with clear ownership and an explicit release decision.",
    sections: [
      [
        "Agree the boundary",
        "Confirm the client workspace, data model, permissions, provider terms and what is excluded. Do not borrow unrelated credentials or environments.",
      ],
      [
        "Build the evidence",
        "Use an isolated candidate and test both the intended workflow and denied-access paths. Show persistence, error recovery and the actual provider result where applicable.",
      ],
      [
        "Release deliberately",
        "Review the exact version, configuration, recovery and rollback before a release. Keep live billing and external actions separately authorised.",
      ],
    ],
    next: "apply",
  },
} as const;
export type PartnerKey = keyof typeof partnerPages;
