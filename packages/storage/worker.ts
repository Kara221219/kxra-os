import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";
import {
  extractPrivateObject,
  inspectPrivateObject,
  privateObjectStore,
  sha256,
  storagePolicy,
  type ObjectDescriptor,
} from "./index";

type ClaimedJob = {
  job_id: string;
  org_id: string;
  project_id: string;
  file_id: string;
  file_version_id: string;
  object_key: string;
  filename: string;
  declared_mime: string;
  size_bytes: number;
  sha256: string;
  attempt: number;
};

type ExpectedObject = {
  org_id: string;
  project_id: string;
  file_id: string;
  file_version_id: string;
  object_key: string;
  sha256: string;
  size_bytes: number;
  lifecycle_state: string;
};

function assertTrustedProcessorAvailable() {
  if (
    process.env.KXRA_AUTH_MODE !== "fixture" ||
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL
  )
    throw Error(
      "Trusted file processing is not configured; the deterministic scanner is fixture-only",
    );
}

function databaseConfiguration() {
  if (process.env.KXRA_AUTH_MODE === "fixture") {
    const runtime = process.env.KXRA_RUNTIME;
    if (!runtime) throw Error("Worker runtime is unavailable");
    const config = JSON.parse(
      fs.readFileSync(path.join(runtime, "database.json"), "utf8"),
    );
    return { ...config, user: os.userInfo().username };
  }
  const connectionString = process.env.KXRA_WORKER_DATABASE_URL;
  if (!connectionString) throw Error("Worker database is not configured");
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
): Promise<T> {
  const database = new pg.Client(databaseConfiguration());
  await database.connect();
  try {
    await database.query("begin");
    await database.query("set local statement_timeout='30s'");
    const identity = await database.query("select current_user");
    if (identity.rows[0].current_user !== "kxra_worker")
      await database.query("set local role kxra_worker");
    const output = await work(database);
    await database.query("commit");
    return output;
  } catch (error) {
    await database.query("rollback");
    throw error;
  } finally {
    await database.end();
  }
}

async function claim(workerReference: string) {
  return workerTransaction(async (database) => {
    const result = await database.query<ClaimedJob>(
      "select * from kxra_private.claim_file_processing_job($1)",
      [workerReference],
    );
    return result.rows[0] || null;
  });
}

async function complete(
  job: ClaimedJob,
  workerReference: string,
  input: {
    scanOutcome: "CLEAN" | "REJECTED" | "FAILED";
    detectedMime: string | null;
    actualHash: string;
    scanReport: Record<string, string | number | boolean>;
    extractionOutcome: "SKIPPED" | "EXTRACTED" | "FAILED";
    extractedHash: string | null;
    chunks: unknown[];
    reasonCode: string | null;
    retryable: boolean;
  },
) {
  return workerTransaction(async (database) => {
    const result = await database.query<{ state: string }>(
      `select kxra_private.complete_file_processing(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15
       ) as state`,
      [
        job.job_id,
        workerReference,
        input.scanOutcome,
        input.detectedMime,
        input.actualHash,
        storagePolicy.scannerAdapter,
        storagePolicy.scannerVersion,
        JSON.stringify(input.scanReport),
        input.extractionOutcome,
        storagePolicy.extractorAdapter,
        storagePolicy.extractorVersion,
        input.extractedHash,
        JSON.stringify(input.chunks),
        input.reasonCode,
        input.retryable,
      ],
    );
    return result.rows[0].state;
  });
}

export async function processNextFileJob(
  workerReference = `local-file-worker-${process.pid}`,
) {
  assertTrustedProcessorAvailable();
  const job = await claim(workerReference);
  if (!job) return null;
  const store = privateObjectStore(process.env.KXRA_AUTH_MODE === "fixture");
  let bytes: Buffer;
  try {
    bytes = await store.get(job.object_key);
  } catch (error) {
    await complete(job, workerReference, {
      scanOutcome: "FAILED",
      detectedMime: null,
      actualHash: job.sha256,
      scanReport: { object_read: false },
      extractionOutcome: "SKIPPED",
      extractedHash: null,
      chunks: [],
      reasonCode:
        (error as NodeJS.ErrnoException).code === "ENOENT"
          ? "OBJECT_MISSING"
          : "OBJECT_READ_FAILED",
      retryable: true,
    });
    return { fileId: job.file_id, state: "FAILED" };
  }
  const actualHash = sha256(bytes);
  const scan = inspectPrivateObject(bytes, job.filename, job.declared_mime);
  if (scan.outcome === "REJECTED") {
    const state = await complete(job, workerReference, {
      scanOutcome: "REJECTED",
      detectedMime: scan.detectedMime,
      actualHash,
      scanReport: scan.report,
      extractionOutcome: "SKIPPED",
      extractedHash: null,
      chunks: [],
      reasonCode: scan.reasonCode,
      retryable: false,
    });
    return { fileId: job.file_id, state };
  }
  const extraction = extractPrivateObject(
    bytes,
    job.filename,
    scan.detectedMime,
  );
  if (extraction.outcome === "FAILED") {
    const state = await complete(job, workerReference, {
      scanOutcome: "CLEAN",
      detectedMime: scan.detectedMime,
      actualHash,
      scanReport: scan.report,
      extractionOutcome: "FAILED",
      extractedHash: null,
      chunks: [],
      reasonCode: extraction.reasonCode,
      retryable: false,
    });
    return { fileId: job.file_id, state };
  }
  const state = await complete(job, workerReference, {
    scanOutcome: "CLEAN",
    detectedMime: scan.detectedMime,
    actualHash,
    scanReport: scan.report,
    extractionOutcome: "EXTRACTED",
    extractedHash: extraction.extractedSha256,
    chunks: extraction.chunks,
    reasonCode: null,
    retryable: false,
  });
  return { fileId: job.file_id, state };
}

export async function processFileJobs(
  options: {
    maximum?: number;
    workerReference?: string;
  } = {},
) {
  const maximum = options.maximum ?? 100;
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 1000)
    throw Error("Invalid file job limit");
  const workerReference =
    options.workerReference || `local-file-worker-${process.pid}`;
  const results: { fileId: string; state: string }[] = [];
  while (results.length < maximum) {
    const result = await processNextFileJob(workerReference);
    if (!result) break;
    results.push(result);
  }
  return results;
}

async function reconciliationCall<T>(sql: string, values: unknown[] = []) {
  return workerTransaction(async (database) => {
    const result = await database.query<T & pg.QueryResultRow>(sql, values);
    return result.rows;
  });
}

function candidateFor(
  expected: ExpectedObject,
  extras: ObjectDescriptor[],
  used: Set<string>,
) {
  return extras.find(
    (item) =>
      !used.has(item.key) &&
      item.sha256 === expected.sha256 &&
      item.size === expected.size_bytes,
  );
}

export async function reconcilePrivateObjects(
  workerReference = `local-file-worker-${process.pid}`,
) {
  const store = privateObjectStore(process.env.KXRA_AUTH_MODE === "fixture");
  const run = (
    await reconciliationCall<{ id: string }>(
      "select kxra_private.begin_object_reconciliation($1,$2) as id",
      [store.adapter, workerReference],
    )
  )[0].id;
  try {
    const expected = await reconciliationCall<ExpectedObject>(
      "select * from kxra_private.expected_file_objects()",
    );
    const observed = await store.list();
    const byKey = new Map(observed.map((item) => [item.key, item]));
    const expectedKeys = new Set(expected.map((item) => item.object_key));
    const extras = observed.filter((item) => !expectedKeys.has(item.key));
    const used = new Set<string>();

    for (const item of expected) {
      const exact = byKey.get(item.object_key);
      if (
        exact &&
        exact.sha256 === item.sha256 &&
        exact.size === item.size_bytes
      ) {
        await reconciliationCall(
          "select kxra_private.record_object_reconciliation($1,$2,$3,$4,$5)",
          [
            run,
            item.file_version_id,
            item.object_key,
            exact.sha256,
            "VERIFIED",
          ],
        );
        continue;
      }
      const recovery = candidateFor(item, extras, used);
      if (recovery) {
        if (exact) {
          const displaced = `_reconciliation/${run}/${crypto.randomUUID()}`;
          await store.move(exact.key, displaced);
        }
        await store.move(recovery.key, item.object_key);
        used.add(recovery.key);
        await reconciliationCall(
          "select kxra_private.record_object_reconciliation($1,$2,$3,$4,$5)",
          [
            run,
            item.file_version_id,
            item.object_key,
            recovery.sha256,
            "RECOVERED_FROM_ORPHAN",
          ],
        );
        continue;
      }
      await reconciliationCall(
        "select kxra_private.record_object_reconciliation($1,$2,$3,$4,$5)",
        [
          run,
          item.file_version_id,
          item.object_key,
          exact?.sha256 || null,
          exact ? "HASH_MISMATCH" : "MISSING",
        ],
      );
    }

    for (const extra of extras) {
      if (used.has(extra.key)) continue;
      const destination = `_reconciliation/${run}/${crypto.randomUUID()}`;
      await store.move(extra.key, destination);
      await reconciliationCall(
        "select kxra_private.record_object_reconciliation($1,$2,$3,$4,$5)",
        [run, null, extra.key, extra.sha256, "QUARANTINED_ORPHAN"],
      );
    }
    await reconciliationCall(
      "select kxra_private.complete_object_reconciliation($1,$2)",
      [run, null],
    );
  } catch (error) {
    await reconciliationCall(
      "select kxra_private.complete_object_reconciliation($1,$2)",
      [run, "RECONCILIATION_FAILED"],
    ).catch(() => {});
    throw error;
  }
  return run;
}
