export const useCases = {
  finance: {
    name: "Finance",
    title: "Review the next invoice action.",
    intro:
      "Keep the customer question, invoice evidence and proposed follow-up together without treating a sample as an accounting system.",
    scenario: "Finance",
    solution: "email-operations",
    review:
      "Confirm the record, recipient and exact draft before any external response. A person owns the financial judgement.",
  },
  hiring: {
    name: "Hiring",
    title: "Keep a considered shortlist.",
    intro:
      "Bring the role, application and permitted review evidence into one conversation. A responsible person decides the next stage.",
    scenario: "Hiring",
    solution: "hiring-review",
    review:
      "Keep confidential scorecards scoped to the right reviewers. No public sample makes an automated hiring decision.",
  },
  sales: {
    name: "Sales",
    title: "Know the next conversation.",
    intro:
      "Separate a new lead from a qualified opportunity, keep its source and name the person responsible for the next action.",
    scenario: "Sales",
    solution: "customer-pipeline",
    review:
      "A prospect record does not establish qualification, consent or expected revenue. Review before outreach.",
  },
  operations: {
    name: "Operations",
    title: "Make the input worth trusting.",
    intro:
      "Validate a record, identify the evidence and review the change before updating an external system.",
    scenario: "Operations",
    solution: "internal-apps",
    review:
      "A validated sample count changes no warehouse record. A real write needs an accepted connector and reconciliation path.",
  },
} as const;
export type UseCaseKey = keyof typeof useCases;
