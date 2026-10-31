import { sprintPackage } from "../../apps/marketing/lib/business-sprints";
export {
  sprintPackages,
  sprintPackage,
  type SprintKey,
} from "../../apps/marketing/lib/business-sprints";
export const sprintExclusions =
  "Implementation, advertising spend, software subscriptions, third-party fees, additional business processes and ongoing support are excluded unless expressly included in this proposal. No guaranteed revenue or business outcome.";
export const sprintAssumptions =
  "Delivery timing starts after the agreed inputs and access are supplied. Recommendations depend on the accuracy of customer information. Unverified claims and estimates must be identified. One clarification round is included; new scope requires a separate change agreement.";
export function sprintConstraints(key: string, context: string) {
  const selected = sprintPackage(key);
  if (!selected) throw Error("SPRINT_PACKAGE_INVALID");
  return `Requested package: ${selected.name}\n${context.trim()}`;
}
export function sprintDraft(
  key: string,
  problem: string,
  outcome: string,
  constraints: string,
) {
  const selected = sprintPackage(key);
  if (!selected) throw Error("SPRINT_PACKAGE_INVALID");
  return {
    package_key: selected.key,
    scope: `${selected.scope}\n\nCustomer problem: ${problem}\nDesired outcome: ${outcome}`,
    exclusions: sprintExclusions,
    assumptions: `${sprintAssumptions}\n\nCustomer constraints: ${constraints || "Not supplied; confirm before quoting."}`,
    milestones: selected.milestones.map((title, i) => ({
      key: `milestone-${i + 1}`,
      title,
    })),
    price_minor: selected.priceMinor,
    currency: "GBP",
    payment_gate: "PAID_IN_FULL",
    tax_treatment: "Not VAT registered; no VAT charged.",
    review_required: true,
    checks: [
      "Confirm customer, decision-maker and scope",
      "Check evidence and delivery competence",
      "Confirm dependencies, effort and exact price",
      "Select current approved project terms",
      "Issue only after owner review",
    ],
  };
}
