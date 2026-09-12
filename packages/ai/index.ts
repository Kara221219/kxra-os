// Retrieval is performed under the current principal before this envelope exists.
export type Evidence = {
  id: string;
  title: string;
  body: string;
  classification: string;
  version: number;
};
export function evidenceAnswer(question: string, evidence: Evidence[]) {
  return {
    mode: "evidence-only",
    model: null,
    question,
    answer: evidence.length
      ? "Relevant authorised evidence is shown below. Model synthesis is not enabled."
      : "Insufficient KXRA evidence.",
    citations: evidence.map((e) => ({
      record_id: e.id,
      title: e.title,
      excerpt: e.body.slice(0, 700),
      classification: e.classification,
      version: e.version,
    })),
  };
}
export const modelPolicy = {
  partner: "gpt-5.6-sol",
  research: "gpt-6-astra",
  enabled: false,
  financial_calculations: "deterministic",
  permissions: "database",
} as const;
