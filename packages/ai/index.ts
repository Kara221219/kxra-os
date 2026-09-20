import crypto from "node:crypto";
import { z } from "zod";

// Retrieval is performed under the current principal before an envelope exists.
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

export type ModelEvidence = Evidence & {
  envelope_item_id: string;
  source_sha256: string;
};

export const INSUFFICIENT_EVIDENCE = "INSUFFICIENT KXRA EVIDENCE.";
export const ASK_AGENT_CODE = "AGT-ASK";
export const ASK_SKILL_CODE = "SKL-ASK-001";
export const LOCAL_SOL_POLICY_CODE = "LOCAL-FAKE-SOL";
export const LOCAL_ZERO_COST_BUDGET_CODE = "LOCAL-FAKE-ZERO-COST";

export function sha256(value: string | Buffer) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export function hashStructured(value: unknown) {
  return sha256(stableJson(value));
}

export function estimateTokens(value: string) {
  return Math.max(1, Math.ceil(Buffer.byteLength(value, "utf8") / 4));
}

export function prepareModelEvidence(
  evidence: ModelEvidence[],
): ModelEvidence[] {
  return evidence.slice(0, 20).map((item) => ({
    ...item,
    title: item.title.slice(0, 240),
    body: item.body.slice(0, 4000),
  })) as ModelEvidence[];
}

export function estimateModelInputTokens(
  question: string,
  projectId: string,
  evidence: ModelEvidence[],
) {
  return estimateTokens(
    stableJson({
      question,
      project_id: projectId,
      evidence: evidence.map((item) => ({
        id: item.envelope_item_id,
        source_sha256: item.source_sha256,
        content: item.body,
      })),
    }),
  );
}

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

const claimSchema = z
  .object({
    id: z.string().regex(/^claim-[1-9][0-9]{0,3}$/),
    text: z.string().trim().min(1).max(2000),
    citation_ids: z.array(z.string().uuid()).min(1).max(20),
  })
  .strict();

const citationSchema = z
  .object({ evidence_item_id: z.string().uuid() })
  .strict();

export const modelOutputSchema = z
  .object({
    status: z.enum(["ANSWER", "INSUFFICIENT"]),
    answer: z.string().trim().min(1).max(8000),
    claims: z.array(claimSchema).max(50),
    citations: z.array(citationSchema).max(50),
  })
  .strict();

export type ModelOutput = z.infer<typeof modelOutputSchema>;

export type ModelRequest = {
  runId: string;
  attemptId: string;
  model: string;
  question: string;
  projectId: string;
  evidence: ModelEvidence[];
  responseSchemaVersion: 1;
};

export type ModelUsage = {
  inputTokens: number;
  outputTokens: number;
  costMinor: number;
  currency: "GBP";
};

export type ProviderGeneration = {
  provider: "FAKE" | "OPENAI";
  providerEventId: string;
  output: unknown;
  usage: ModelUsage;
};

export interface ModelAdapter {
  readonly provider: "FAKE" | "OPENAI";
  readonly model: string;
  generate(request: ModelRequest): Promise<ProviderGeneration>;
}

export type FakeModelScenario =
  "SUCCESS" | "INVALID_OUTPUT" | "TIMEOUT" | "FAILURE";

export class ModelAdapterError extends Error {
  constructor(
    public readonly code: "MODEL_TIMEOUT" | "MODEL_PROVIDER_FAILURE",
    message: string,
  ) {
    super(message);
  }
}

function boundedEvidenceText(value: string) {
  return value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
}

export class FakeModelAdapter implements ModelAdapter {
  readonly provider = "FAKE" as const;

  constructor(
    readonly model = "gpt-5.6-sol",
    private readonly scenario: FakeModelScenario = "SUCCESS",
  ) {}

  async generate(request: ModelRequest): Promise<ProviderGeneration> {
    if (request.model !== this.model)
      throw new ModelAdapterError(
        "MODEL_PROVIDER_FAILURE",
        "Requested model is unavailable",
      );
    if (this.scenario === "TIMEOUT")
      throw new ModelAdapterError("MODEL_TIMEOUT", "Fake model timed out");
    if (this.scenario === "FAILURE")
      throw new ModelAdapterError(
        "MODEL_PROVIDER_FAILURE",
        "Fake model failed",
      );
    const eventSeed = {
      run_id: request.runId,
      attempt_id: request.attemptId,
      model: request.model,
      scenario: this.scenario,
    };
    const output =
      this.scenario === "INVALID_OUTPUT"
        ? {
            status: "ANSWER",
            answer: "Invalid fixture output",
            claims: [],
            citations: [],
            requested_tools: ["deploy.production"],
          }
        : request.evidence.length === 0
          ? {
              status: "INSUFFICIENT",
              answer: INSUFFICIENT_EVIDENCE,
              claims: [],
              citations: [],
            }
          : (() => {
              const source = request.evidence[0];
              const statement = boundedEvidenceText(source.body);
              return {
                status: "ANSWER",
                answer: `According to the cited KXRA evidence: ${statement}`,
                claims: [
                  {
                    id: "claim-1",
                    text: statement,
                    citation_ids: [source.envelope_item_id],
                  },
                ],
                citations: [{ evidence_item_id: source.envelope_item_id }],
              };
            })();
    return {
      provider: this.provider,
      providerEventId: `fake-${hashStructured(eventSeed)}`,
      output,
      usage: {
        inputTokens: estimateModelInputTokens(
          request.question,
          request.projectId,
          request.evidence,
        ),
        outputTokens: estimateTokens(stableJson(output)),
        costMinor: 0,
        currency: "GBP",
      },
    };
  }
}

export class CapabilityBrokerError extends Error {
  readonly code = "TOOL_NOT_ALLOWED";
}

export class CapabilityBroker {
  private readonly allowed: Set<string>;

  constructor(allowedTools: string[]) {
    this.allowed = new Set(allowedTools);
  }

  authorize(tool: string) {
    if (!this.allowed.has(tool))
      throw new CapabilityBrokerError(
        `Tool ${tool} is outside the stored run capability set`,
      );
    return { tool, authorization: "RUN_SCOPED" as const };
  }
}

export type OutputValidation = {
  schemaValid: boolean;
  citationsValid: boolean;
  policyValid: boolean;
  reasonCodes: string[];
  output: ModelOutput | null;
};

export function validateModelOutput(
  raw: unknown,
  evidence: ModelEvidence[],
): OutputValidation {
  const parsed = modelOutputSchema.safeParse(raw);
  if (!parsed.success)
    return {
      schemaValid: false,
      citationsValid: false,
      policyValid: false,
      reasonCodes: ["INVALID_OUTPUT_SCHEMA"],
      output: null,
    };
  const output = parsed.data;
  const evidenceIds = new Set(evidence.map((item) => item.envelope_item_id));
  const citationIds = new Set(
    output.citations.map((item) => item.evidence_item_id),
  );
  const claimIds = new Set<string>();
  const reasons: string[] = [];
  let citationsValid = true;
  if (citationIds.size !== output.citations.length) citationsValid = false;
  for (const citation of citationIds)
    if (!evidenceIds.has(citation)) citationsValid = false;
  for (const claim of output.claims) {
    if (claimIds.has(claim.id)) citationsValid = false;
    claimIds.add(claim.id);
    for (const citation of claim.citation_ids)
      if (!evidenceIds.has(citation) || !citationIds.has(citation))
        citationsValid = false;
  }
  for (const citation of citationIds)
    if (!output.claims.some((claim) => claim.citation_ids.includes(citation)))
      citationsValid = false;
  if (!citationsValid) reasons.push("INVALID_OR_STALE_CITATION");
  let policyValid = true;
  if (output.status === "INSUFFICIENT") {
    policyValid =
      output.answer === INSUFFICIENT_EVIDENCE &&
      output.claims.length === 0 &&
      output.citations.length === 0 &&
      evidence.length === 0;
  } else {
    policyValid =
      evidence.length > 0 &&
      output.answer !== INSUFFICIENT_EVIDENCE &&
      output.claims.length > 0 &&
      output.citations.length > 0;
  }
  if (!policyValid) reasons.push("MODEL_POLICY_OUTPUT_MISMATCH");
  return {
    schemaValid: true,
    citationsValid,
    policyValid,
    reasonCodes: reasons,
    output,
  };
}

export function modelAnswer(
  question: string,
  provider: ModelAdapter["provider"],
  model: string,
  runId: string,
  output: ModelOutput,
  evidence: ModelEvidence[],
) {
  const byId = new Map(evidence.map((item) => [item.envelope_item_id, item]));
  return {
    mode: "model",
    provider: provider.toLowerCase(),
    model,
    run_id: runId,
    question,
    answer: output.answer,
    claims: output.claims,
    citations: output.citations.map((citation) => {
      const source = byId.get(citation.evidence_item_id);
      if (!source) throw Error("Validated citation is unavailable");
      return {
        evidence_item_id: citation.evidence_item_id,
        citation_type: source.source_type || "RECORD",
        record_id: source.record_id || source.id,
        chunk_id: source.chunk_id || null,
        file_id: source.file_id || null,
        title: source.title,
        excerpt: source.body.slice(0, 700),
        classification: source.classification,
        version: source.version,
      };
    }),
  };
}

export const modelPolicy = {
  partner: "gpt-5.6-sol",
  research: "gpt-6-astra",
  enabled: false,
  financial_calculations: "deterministic",
  permissions: "database",
} as const;
