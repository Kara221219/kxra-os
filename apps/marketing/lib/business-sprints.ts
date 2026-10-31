import { sprintOptions } from "../../../packages/business-sprints/options";

/** Public starting prices are indicative. Only an issued database proposal is payable. */
export const sprintPackages = [
  {
    ...sprintOptions[0],
    priceMinor: 25000,
    turnaround: "3 working days",
    summary: "Make one business decision with clearer evidence and trade-offs.",
    scope:
      "Assess one business decision. Compare up to three practical options, identify evidence gaps, recommend the next step and provide a 30-minute walkthrough.",
    milestones: [
      "Confirm the decision and evidence",
      "Compare options and costs",
      "Deliver recommendation and walkthrough",
    ],
  },
  {
    ...sprintOptions[1],
    priceMinor: 75000,
    turnaround: "7 working days",
    summary:
      "Turn one operational problem into a costed, practical 30-day action plan.",
    scope:
      "Assess one agreed business process. Map the current workflow, compare up to three improvement options, provide a costed 30-day action plan, one reusable working template, a handover session and one clarification round.",
    milestones: [
      "Confirm scope and map the current process",
      "Review evidence and compare options",
      "Deliver action plan and working template",
      "Handover and clarification",
    ],
  },
  {
    ...sprintOptions[2],
    priceMinor: null,
    turnaround: "Agreed in your proposal",
    summary:
      "Build, configure or connect the solution with agreed acceptance tests.",
    scope:
      "Define one implementation project after assessment. Agree exact deliverables, dependencies, access, acceptance tests, support boundary and rollback before work starts.",
    milestones: [
      "Agree implementation specification",
      "Build and test the scoped solution",
      "Review acceptance evidence and hand over",
    ],
  },
] as const;
export type SprintKey = (typeof sprintPackages)[number]["key"];
export function sprintPackage(key: string) {
  return sprintPackages.find((item) => item.key === key);
}
