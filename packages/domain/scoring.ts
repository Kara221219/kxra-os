import { z } from "zod";
export const weights = {
  customer_problem: 15,
  willingness_to_pay: 15,
  distribution: 10,
  economics: 15,
  market: 8,
  differentiation: 10,
  feasibility: 10,
  risk_capital: 7,
  team_partner: 5,
  scale_reuse: 5,
} as const;
const confidence = z
  .object({
    quality: z.number().min(0).max(1),
    independence: z.number().min(0).max(1),
    recency: z.number().min(0).max(1),
    directness: z.number().min(0).max(1),
  })
  .strict();
const factor = z
  .object({
    rating: z.number().min(0).max(5).nullable(),
    evidence_ids: z.array(z.string().uuid()),
    rationale: z.string().min(1),
    confidence: confidence.nullable(),
  })
  .strict()
  .refine(
    (v) => v.rating === null || v.evidence_ids.length > 0,
    "Assessed ratings require evidence",
  );
export type Assessment = Partial<
  Record<keyof typeof weights, z.infer<typeof factor>>
>;
export function scoreVenture(input: Assessment, assessed = false) {
  let lower = 0,
    missing = 0,
    certainty = 0;
  for (const key of Object.keys(input))
    if (!(key in weights)) throw Error("Unknown score factor");
  for (const [key, weight] of Object.entries(weights)) {
    const raw = input[key as keyof typeof weights];
    const f = raw ? factor.parse(raw) : undefined;
    if (!f || f.rating === null) missing += weight;
    else lower += (weight * f.rating) / 5;
    if (f?.confidence && f.evidence_ids.length) {
      const c = f.confidence;
      certainty +=
        weight * c.quality * c.independence * c.recency * c.directness;
    }
  }
  return {
    formula_version: "genesis-1",
    score: missing ? null : lower,
    lower_bound: lower,
    upper_bound: lower + missing,
    coverage: (100 - missing) / 100,
    confidence_score: assessed ? certainty : null,
  };
}
