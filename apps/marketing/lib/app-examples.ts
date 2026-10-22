export const appExamples = {
  "general-crm": {
    name: "General CRM",
    category: "Sales",
    intro:
      "Keep new leads separate from qualified opportunities. Carry the source and the next action through the handoff.",
    question: "Which conversations deserve a place in the pipeline?",
    steps: [
      "Capture a lead",
      "Qualify the need",
      "Convert once",
      "Review the next action",
    ],
    features: [
      [
        "Lead qualification",
        "A new enquiry stays a lead until its need and next step are reviewed.",
      ],
      [
        "Deliberate conversion",
        "The sample conversion moves a lead into the opportunity view once, without counting it twice.",
      ],
      [
        "Owned next action",
        "Keep the proposed follow-up beside the customer context.",
      ],
    ],
    records: [
      ["Alder Works", "New lead", "Review fit"],
      ["North Studio", "New lead", "Clarify need"],
      ["Field & Form", "New lead", "Arrange discovery"],
    ],
    boundary:
      "This sample does not send outreach, calculate a forecast or connect a CRM account.",
  },
  "creator-management": {
    name: "Creator Management",
    category: "Marketing",
    intro:
      "Keep creator research, content plans and outreach review together without presenting stale metrics as current.",
    question: "Who fits the brief, and what do we actually know?",
    steps: [
      "Define the brief",
      "Review the roster",
      "Plan a collaboration",
      "Review outreach",
    ],
    features: [
      [
        "A considered roster",
        "Separate the recorded fit from unverified audience or performance claims.",
      ],
      [
        "Content planning",
        "Choose a proposed collaboration stage and keep the brief attached.",
      ],
      [
        "Review before outreach",
        "A draft can be prepared without pretending a message was sent.",
      ],
    ],
    records: [
      ["Maya Ellis", "Research", "Design & interiors"],
      ["Theo Lane", "Shortlist", "Practical business"],
      ["Nora Reed", "Brief review", "Travel & hospitality"],
    ],
    boundary:
      "All names are fictional. No social metrics are live and no creator is contacted.",
  },
  "sampling-desk": {
    name: "Sampling Desk",
    category: "Operations",
    intro:
      "Follow a sample from a reviewed request to a recorded delivery and the next content check.",
    question: "What needs a follow-up, and who owns it?",
    steps: [
      "Review a request",
      "Prepare a sample",
      "Record delivery",
      "Review the post window",
    ],
    features: [
      [
        "Visible sample stages",
        "Keep requested, prepared, delivered and review states distinct.",
      ],
      [
        "Transparent priority",
        "Show the next responsible action instead of implying a live carrier lookup.",
      ],
      [
        "Recorded follow-up",
        "Track a local sample state without sending a reminder.",
      ],
    ],
    records: [
      ["Ceramic set / Maya", "Prepared", "Confirm delivery"],
      ["Desk kit / Theo", "Requested", "Review request"],
      ["Travel pouch / Nora", "Delivered", "Review post window"],
    ],
    boundary:
      "Carrier tracking, addresses and external reminders are not connected in this public sample.",
  },
  "remodeling-crm": {
    name: "Remodeling CRM",
    category: "Projects",
    intro:
      "Bring the property brief, scoped estimate and review history into one considered project conversation.",
    question: "What changed in the scope before anyone agrees?",
    steps: [
      "Qualify the brief",
      "Prepare an estimate",
      "Review a version",
      "Plan the milestone",
    ],
    features: [
      [
        "A property-specific brief",
        "Keep the household need, property and responsible project owner together.",
      ],
      [
        "Versioned scope",
        "Changing a sample estimate creates a new review version. Approval applies to that version only.",
      ],
      [
        "Milestone handoff",
        "Keep a next review step explicit; no deposit or accounting integration is inferred.",
      ],
    ],
    records: [
      ["Garden room", "Survey review", "Confirm constraints"],
      ["Kitchen renewal", "Estimate draft", "Review exclusions"],
      ["Entryway update", "Brief review", "Agree the next visit"],
    ],
    boundary:
      "Estimates are sample scope records, not binding quotes, design-fee receipts or payment evidence.",
  },
  "recruiting-workspace": {
    name: "Recruiting Workspace",
    category: "Hiring",
    intro:
      "Keep a role, candidate application and confidential review distinct. The person responsible makes the hiring decision.",
    question: "What evidence does the next reviewer need?",
    steps: [
      "Define the role",
      "Review an application",
      "Move the stage",
      "Record a human decision",
    ],
    features: [
      [
        "Application stages",
        "A stage belongs to a specific application, rather than labelling a person across all roles.",
      ],
      [
        "Considered review",
        "Use structured evidence and keep sensitive notes inside the appropriate permission boundary.",
      ],
      [
        "Human decisions",
        "The sample moves stages only when you choose. It never ranks or rejects a person automatically.",
      ],
    ],
    records: [
      ["Jordan / Operations", "Review", "Check evidence"],
      ["Riley / Design", "Interview", "Arrange review"],
      ["Alex / Customer work", "Review", "Clarify experience"],
    ],
    boundary:
      "Fictional applications only. No real applicant, scorecard, offer, automated hiring decision or invitation.",
  },
  "travel-desk": {
    name: "Travel Desk",
    category: "Operations",
    intro:
      "Keep the enquiry, proposal version and review decision together before any booking commitment.",
    question: "Which version did the traveller actually review?",
    steps: [
      "Understand the enquiry",
      "Prepare a proposal",
      "Review a version",
      "Agree the next step",
    ],
    features: [
      [
        "One enquiry record",
        "Keep the travellers, requirements and responsible consultant distinct from booking status.",
      ],
      [
        "Proposal versions",
        "Changing a sample proposal requires a fresh local review of that exact version.",
      ],
      [
        "Verified requirements",
        "Passport, visa and transit advice needs verified destination and traveller details, not a universal rule.",
      ],
    ],
    records: [
      ["Coastal weekend", "Enquiry", "Confirm dates"],
      ["City discovery", "Proposal draft", "Review itinerary"],
      ["Mountain retreat", "Review", "Agree next step"],
    ],
    boundary:
      "No booking, payment, travel-document check or supplier connection is performed by this sample.",
  },
} as const;
export type AppKey = keyof typeof appExamples;
export const appKeys = Object.keys(appExamples) as AppKey[];
