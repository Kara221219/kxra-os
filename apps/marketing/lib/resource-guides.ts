export const resourceGuides = {
  "what-is-kxra": {
    title: "A shared place for people, context and work.",
    intro:
      "KXRA brings a team’s selected evidence, conversations, records and review decisions into a deliberate workspace.",
    sections: [
      [
        "Start with the work",
        "Choose one recurring workflow and the people responsible for it. A room gives that work a context; it is not a grant of access to every source in an organisation.",
      ],
      [
        "Keep the boundary visible",
        "People and agents should use only the information their task may access. A public demonstration is explicitly separate from private, persistent work.",
      ],
      [
        "Make the next step reviewable",
        "Keep the proposed action, evidence and version together. A responsible person can approve, reject or ask for a revision before an external effect.",
      ],
    ],
    links: [
      ["Explore the product", "/product"],
      ["Try a sample", "/apps"],
      ["Understand samples", "/blog/sample-is-not-connection"],
    ],
  },
  developers: {
    title: "Build against an explicit contract.",
    intro:
      "A useful developer interface defines identity, scope, permitted operations and the evidence of an actual result. It does not begin with ambient access to a machine or account.",
    sections: [
      [
        "Identify the caller",
        "An agent or device needs an authorised identity and a task-specific boundary. Repository text, a model response or a client-provided role cannot create operating authority.",
      ],
      [
        "Specify the operation",
        "Define the input, version, idempotency identity and the point where a human must review. Separate inspection from writes, publication and external execution.",
      ],
      [
        "Test the difficult cases",
        "Verify expiry, revocation, denied data, duplicate callbacks and uncertain outcomes. The public site offers no executable CLI or native app download; an operational bridge requires its own accepted implementation.",
      ],
    ],
    links: [
      ["External-agent approach", "/bring-your-own-agent"],
      ["Build and ship", "/product/build-and-ship"],
      ["Discuss a contract", "/contact"],
    ],
  },
  "implementation-readiness": {
    title: "Know what evidence is still missing.",
    intro:
      "A visually complete preview can explain the work. An operational release needs evidence that the right person can perform it safely and recover the result.",
    sections: [
      [
        "Identity and persistence",
        "Confirm the actual workspace and role. Test that the user can return in a new session and recover accepted work without broadening access.",
      ],
      [
        "Real providers and effects",
        "A synthetic protocol response is not a live connector. Verify the permitted result, errors, revocation, retry and reconciliation for each advertised path.",
      ],
      [
        "A deliberate release",
        "Review the exact candidate, environment, recovery and rollback. Publishing a page does not activate a subscription or authorise a charge, message or provider spend.",
      ],
    ],
    links: [
      ["Release review guide", "/blog/review-before-release"],
      ["Connection boundaries", "/integrations"],
      ["Plan an implementation", "/custom-projects"],
    ],
  },
} as const;
export type ResourceKey = keyof typeof resourceGuides;
