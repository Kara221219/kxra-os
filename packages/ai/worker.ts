import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { localMode } from "../db";
import {
  CapabilityBroker,
  CapabilityBrokerError,
  FakeModelAdapter,
  ModelAdapterError,
  hashStructured,
  type FakeModelScenario,
  type ModelAdapter,
  type ModelEvidence,
  type ModelOutput,
  validateModelOutput,
} from "./index";

type ClaimedRun = {
  run_id: string;
  attempt_id: string;
  provider: "FAKE" | "OPENAI";
  model: string;
  allowed_tools: string[];
  input_sha256: string;
  evidence_envelope_id: string;
};

export type AskExecutionResult = {
  runId: string;
  attemptId: string;
  state: "COMPLETED" | "FAILED" | "RECONCILIATION_REQUIRED";
  provider: ModelAdapter["provider"];
  model: string;
  output: ModelOutput | null;
  failureCode: string | null;
};

function databaseConfiguration(localFixture: boolean) {
  if (localFixture) {
    const runtime = process.env.KXRA_RUNTIME;
    if (!runtime) throw Error("AI worker runtime is unavailable");
    const config = JSON.parse(
      fs.readFileSync(path.join(runtime, "database.json"), "utf8"),
    );
    return { ...config, user: os.userInfo().username };
  }
  const connectionString = process.env.KXRA_AI_WORKER_DATABASE_URL;
  if (!connectionString) throw Error("AI worker database is not configured");
  return {
    connectionString,
    ssl:
      process.env.NODE_ENV === "production"
        ? ({ rejectUnauthorized: true } as const)
        : undefined,
  };
}

async function workerTransaction<T>(
  work: (database: pg.Client) => Promise<T>,
  localFixture: boolean,
): Promise<T> {
  const database = new pg.Client(databaseConfiguration(localFixture));
  await database.connect();
  try {
    await database.query("begin");
    await database.query("set local statement_timeout='30s'");
    const identity = await database.query("select current_user");
    if (identity.rows[0].current_user !== "kxra_ai_worker")
      await database.query("set local role kxra_ai_worker");
    const result = await work(database);
    await database.query("commit");
    return result;
  } catch (error) {
    await database.query("rollback");
    throw error;
  } finally {
    await database.end();
  }
}

async function claim(
  runId: string,
  workerReference: string,
  localFixture: boolean,
) {
  return workerTransaction(async (database) => {
    const result = await database.query<ClaimedRun>(
      "select * from kxra_private.claim_agent_run($1,$2)",
      [runId, workerReference],
    );
    return result.rows[0] || null;
  }, localFixture);
}

async function recordToolCall(input: {
  runId: string;
  attemptId: string;
  tool: string;
  requestHash: string;
  resultHash: string | null;
  outcome: "COMPLETED" | "FAILED" | "DENIED";
  reasonCode: string | null;
  idempotencyKey: string;
  durationMs: number;
  localFixture: boolean;
}) {
  return workerTransaction(async (database) => {
    const result = await database.query<{ allowed: boolean }>(
      `select kxra_private.record_agent_tool_call(
        $1,$2,$3,$4,$5,$6,$7,$8,$9
       ) as allowed`,
      [
        input.runId,
        input.attemptId,
        input.tool,
        input.requestHash,
        input.resultHash,
        input.outcome,
        input.reasonCode,
        input.idempotencyKey,
        input.durationMs,
      ],
    );
    return result.rows[0]?.allowed === true;
  }, input.localFixture);
}

async function finishRun(input: {
  runId: string;
  attemptId: string;
  providerEventId: string;
  outputHash: string;
  inputTokens: number;
  outputTokens: number;
  costMinor: number;
  currency: string;
  usageHash: string;
  citationLinks: { evidence_item_id: string; claim_id: string }[];
  evaluation: {
    schema_valid: boolean;
    citations_valid: boolean;
    policy_valid: boolean;
    reason_codes: string[];
  };
  localFixture: boolean;
}) {
  return workerTransaction(async (database) => {
    const result = await database.query<{ state: AskExecutionResult["state"] }>(
      `select kxra_private.finish_agent_run(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
       ) as state`,
      [
        input.runId,
        input.attemptId,
        input.providerEventId,
        input.outputHash,
        input.inputTokens,
        input.outputTokens,
        input.costMinor,
        input.currency,
        input.usageHash,
        JSON.stringify(input.citationLinks),
        JSON.stringify(input.evaluation),
      ],
    );
    return result.rows[0].state;
  }, input.localFixture);
}

async function failRun(input: {
  runId: string;
  attemptId: string;
  stage: "BROKER" | "PROVIDER" | "VALIDATION";
  failureCode: string;
  retryable: boolean;
  detailHash: string | null;
  localFixture: boolean;
}) {
  return workerTransaction(async (database) => {
    const result = await database.query<{ state: "FAILED" }>(
      `select kxra_private.fail_agent_run($1,$2,$3,$4,$5,$6) as state`,
      [
        input.runId,
        input.attemptId,
        input.stage,
        input.failureCode,
        input.retryable,
        input.detailHash,
      ],
    );
    return result.rows[0].state;
  }, input.localFixture);
}

function failureCode(error: unknown) {
  if (error instanceof ModelAdapterError) return error.code;
  if (error instanceof CapabilityBrokerError) return error.code;
  return "MODEL_EXECUTION_FAILED";
}

export async function executeAskAgentRun(input: {
  runId: string;
  projectId: string;
  question: string;
  evidence: ModelEvidence[];
  workerReference?: string;
  scenario?: FakeModelScenario;
  adapter?: ModelAdapter;
  localFixture?: boolean;
}): Promise<AskExecutionResult> {
  const localFixture = localMode() || input.localFixture === true;
  if (
    input.localFixture &&
    (process.env.NODE_ENV === "production" ||
      Boolean(process.env.VERCEL) ||
      !process.env.KXRA_RUNTIME)
  )
    throw Error("Local AI fixture execution is unavailable");
  if (!localFixture && !input.adapter)
    throw Error("AI model provider is not configured for this environment");
  const workerReference =
    input.workerReference || `local-ai-worker-${process.pid}`;
  const run = await claim(input.runId, workerReference, localFixture);
  if (!run) throw Error("Agent run is unavailable for execution");
  const broker = new CapabilityBroker(run.allowed_tools);
  const adapter =
    input.adapter ||
    new FakeModelAdapter(run.model, input.scenario || "SUCCESS");
  const tool = "model.generate.structured";
  const idempotencyKey = crypto.randomUUID();
  const requestHash = hashStructured({
    run_id: run.run_id,
    attempt_id: run.attempt_id,
    question_sha256: hashStructured(input.question),
    evidence: input.evidence.map((item) => ({
      id: item.envelope_item_id,
      source_sha256: item.source_sha256,
    })),
  });
  const startedAt = performance.now();
  let toolRecorded = false;
  try {
    broker.authorize(tool);
    if (adapter.provider !== run.provider || adapter.model !== run.model)
      throw new ModelAdapterError(
        "MODEL_PROVIDER_FAILURE",
        "Stored model policy does not match the configured adapter",
      );
    const generation = await adapter.generate({
      runId: run.run_id,
      attemptId: run.attempt_id,
      model: run.model,
      question: input.question,
      projectId: input.projectId,
      evidence: input.evidence,
      responseSchemaVersion: 1,
    });
    const outputHash = hashStructured(generation.output);
    const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
    const recorded = await recordToolCall({
      runId: run.run_id,
      attemptId: run.attempt_id,
      tool,
      requestHash,
      resultHash: outputHash,
      outcome: "COMPLETED",
      reasonCode: null,
      idempotencyKey,
      durationMs,
      localFixture,
    });
    if (!recorded) throw new CapabilityBrokerError();
    toolRecorded = true;
    const validation = validateModelOutput(generation.output, input.evidence);
    const citationLinks = validation.output
      ? validation.output.claims.flatMap((claim) =>
          claim.citation_ids.map((evidenceItemId) => ({
            evidence_item_id: evidenceItemId,
            claim_id: claim.id,
          })),
        )
      : [];
    const usageHash = hashStructured({
      provider: generation.provider,
      model: run.model,
      provider_event_id: generation.providerEventId,
      ...generation.usage,
    });
    const state = await finishRun({
      runId: run.run_id,
      attemptId: run.attempt_id,
      providerEventId: generation.providerEventId,
      outputHash,
      inputTokens: generation.usage.inputTokens,
      outputTokens: generation.usage.outputTokens,
      costMinor: generation.usage.costMinor,
      currency: generation.usage.currency,
      usageHash,
      citationLinks,
      evaluation: {
        schema_valid: validation.schemaValid,
        citations_valid: validation.citationsValid,
        policy_valid: validation.policyValid,
        reason_codes: validation.reasonCodes,
      },
      localFixture,
    });
    return {
      runId: run.run_id,
      attemptId: run.attempt_id,
      state,
      provider: run.provider,
      model: run.model,
      output: state === "COMPLETED" ? validation.output : null,
      failureCode: state === "COMPLETED" ? null : "OUTPUT_VALIDATION_FAILED",
    };
  } catch (error) {
    const code = failureCode(error);
    const detailHash = hashStructured({
      code,
      name: error instanceof Error ? error.name : "UnknownError",
    });
    if (!toolRecorded)
      await recordToolCall({
        runId: run.run_id,
        attemptId: run.attempt_id,
        tool,
        requestHash,
        resultHash: detailHash,
        outcome: error instanceof CapabilityBrokerError ? "DENIED" : "FAILED",
        reasonCode: code,
        idempotencyKey,
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
        localFixture,
      }).catch(() => {});
    await failRun({
      runId: run.run_id,
      attemptId: run.attempt_id,
      stage: error instanceof CapabilityBrokerError ? "BROKER" : "PROVIDER",
      failureCode: code,
      retryable:
        error instanceof ModelAdapterError && error.code === "MODEL_TIMEOUT",
      detailHash,
      localFixture,
    });
    return {
      runId: run.run_id,
      attemptId: run.attempt_id,
      state: "FAILED",
      provider: run.provider,
      model: run.model,
      output: null,
      failureCode: code,
    };
  }
}
