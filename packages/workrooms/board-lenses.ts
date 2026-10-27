/** Shared display/scoring definitions; server schemas remain in index.ts. */
export const boardLenses = [
  {
    key: "customer",
    name: "Customer advocate",
    weight: 25,
    question:
      "What customer evidence supports this problem and willingness to pay?",
  },
  {
    key: "commercial",
    name: "Commercial analyst",
    weight: 25,
    question:
      "What are the price, costs, cash exposure and break-even assumptions? Flag missing inputs; do not invent numbers.",
  },
  {
    key: "delivery",
    name: "Delivery operator",
    weight: 20,
    question:
      "Can we deliver this with current capacity, skills and connections? What is the smallest useful test?",
  },
  {
    key: "risk",
    name: "Risk challenger",
    weight: 20,
    question:
      "What could invalidate this decision? What permissions, dependencies and stop conditions matter?",
  },
  {
    key: "freedom",
    name: "Owner time steward",
    weight: 10,
    question:
      "Does this improve recurring value and reduce owner workload? What maintenance does it create?",
  },
] as const;
