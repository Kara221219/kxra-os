import plans from "./approved-catalogue-v1.json";
export type ApprovedPlanKey =
  "KXRA_STARTER_V1" | "KXRA_TEAM_V1" | "KXRA_BUSINESS_V1";
export type ApprovedPlan = (typeof plans)[number];
export const approvedCatalogue: readonly Readonly<ApprovedPlan>[] =
  Object.freeze(plans.map((plan) => Object.freeze(plan)));
export function approvedPlan(key: string): Readonly<ApprovedPlan> {
  const plan = approvedCatalogue.find((plan) => plan.offer_key === key);
  if (!plan) throw Error("APPROVED_PLAN_REQUIRED");
  return plan;
}
