// Retrieval is performed under the current principal before this envelope exists.
export type Evidence = {
  id: string;
  source_type?: "RECORD" | "CHUNK";
  record_id?: string;
  chunk_id?: string | null;
  file_id?: string | null;
  title: string;
  body: string;
  classification: string;
  version: number;
};

export const INSUFFICIENT_EVIDENCE = "INSUFFICIENT KXRA EVIDENCE.";

export function evidenceAnswer(question: string, evidence: Evidence[]) {
  return {
    mode: "evidence-only",
    model: null,
    question,
    answer: evidence.length
      ? "Relevant authorised evidence is shown below. Model synthesis is not enabled."
      : INSUFFICIENT_EVIDENCE,
    citations: evidence.map((e) => ({
      citation_type: e.source_type || "RECORD",
      record_id: e.record_id || e.id,
      chunk_id: e.chunk_id || null,
      file_id: e.file_id || null,
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
