/** Client-safe display values; authoritative record validation remains in index.ts. */
export const classifications = [
  "FACT",
  "USER-SUPPLIED INFORMATION",
  "EXTERNAL RESEARCH",
  "ASSUMPTION",
  "HYPOTHESIS",
  "ESTIMATE",
  "AI INFERENCE",
  "DECISION",
  "UNRESOLVED QUESTION",
] as const;
