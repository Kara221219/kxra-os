import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { databaseSsl } from "../db/ssl";
import {
  extractPublicSourceText,
  fetchPublicSnapshot,
  nodePinnedPublicTransport,
  systemPublicAddressResolver,
  type PinnedPublicTransport,
  type PublicAddressResolver,
} from "./public-web";

type ClaimedAcquisition = {
  acquisition_id: string;
  org_id: string;
  project_id: string;
  source_id: string;
  requested_source_version: number;
  requested_by: string;
  input_sha256: string;
  locator: string;
  attempt: number;
};

function databaseConfiguration() {
  if (process.env.KXRA_AUTH_MODE === "fixture") {
    const runtime = process.env.KXRA_RUNTIME;
    if (!runtime) throw Error("Brand source worker runtime is unavailable");
    return {
      ...JSON.parse(
        fs.readFileSync(path.join(runtime, "database.json"), "utf8"),
      ),
      user: os.userInfo().username,
    };
  }
  const connectionString = process.env.KXRA_BRAND_SOURCE_WORKER_DATABASE_URL;
  if (!connectionString)
    throw Error("Brand source worker database is not configured");
  return {
    connectionString,
    ssl: process.env.NODE_ENV === "production" ? databaseSsl() : undefined,
  };
}

function assertWorkerEnabled() {
  if (
    process.env.KXRA_AUTH_MODE !== "fixture" &&
    process.env.KXRA_PUBLIC_WEB_ENABLED !== "true"
  )
    throw Error("Public website acquisition is disabled");
}

async function workerTransaction<T>(work: (database: pg.Client) => Promise<T>) {
  const database = new pg.Client(databaseConfiguration());
  await database.connect();
  try {
    await database.query("begin");
    await database.query("set local statement_timeout='30s'");
    const identity = await database.query("select current_user");
    if (identity.rows[0].current_user !== "kxra_brand_source_worker")
      await database.query("set local role kxra_brand_source_worker");
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

async function claim(workerReference: string) {
  return workerTransaction(async (database) => {
    const result = await database.query<ClaimedAcquisition>(
      "select * from kxra_private.claim_brand_source_acquisition($1)",
      [workerReference],
    );
    return result.rows[0] || null;
  });
}

async function complete(
  acquisition: ClaimedAcquisition,
  workerReference: string,
  result:
    | {
        outcome: "SUCCEEDED";
        finalUrl: string;
        contentType: string;
        rawSha256: string;
        content: string;
        byteCount: number;
        redirectCount: number;
      }
    | { outcome: "FAILED"; failureCode: string; retryable: boolean },
) {
  return workerTransaction(async (database) => {
    const success = result.outcome === "SUCCEEDED";
    const values = success
      ? [
          acquisition.acquisition_id,
          workerReference,
          result.outcome,
          result.finalUrl,
          result.contentType,
          result.rawSha256,
          result.content,
          result.byteCount,
          result.redirectCount,
          null,
          false,
        ]
      : [
          acquisition.acquisition_id,
          workerReference,
          result.outcome,
          null,
          null,
          null,
          null,
          null,
          null,
          result.failureCode,
          result.retryable,
        ];
    const response = await database.query<{
      state: string;
      source_version_id: string | null;
      version: number | null;
    }>(
      "select * from kxra_private.complete_brand_source_acquisition($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
      values,
    );
    return response.rows[0];
  });
}

function failure(error: unknown) {
  const code = error instanceof Error ? error.message : "PUBLIC_WEB_UNKNOWN";
  const allowlisted = new Set([
    "PUBLIC_WEB_ADDRESS_INVALID",
    "PUBLIC_WEB_ADDRESS_NOT_GLOBAL",
    "PUBLIC_WEB_BODY_EMPTY",
    "PUBLIC_WEB_CONTENT_ENCODING_REJECTED",
    "PUBLIC_WEB_CONTENT_TOO_LARGE",
    "PUBLIC_WEB_CONTENT_TYPE_REJECTED",
    "PUBLIC_WEB_DNS_EMPTY",
    "PUBLIC_WEB_REDIRECT_INVALID",
    "PUBLIC_WEB_REDIRECT_LIMIT",
    "PUBLIC_WEB_TEXT_EMPTY",
    "PUBLIC_WEB_TEXT_TOO_LARGE",
    "PUBLIC_WEB_UPSTREAM_UNAVAILABLE",
  ]);
  const failureCode = allowlisted.has(code)
    ? code
    : code === "The operation was aborted"
      ? "PUBLIC_WEB_TIMEOUT"
      : "PUBLIC_WEB_TRANSPORT_FAILED";
  return {
    failureCode,
    retryable: [
      "PUBLIC_WEB_DNS_EMPTY",
      "PUBLIC_WEB_TIMEOUT",
      "PUBLIC_WEB_TRANSPORT_FAILED",
      "PUBLIC_WEB_UPSTREAM_UNAVAILABLE",
    ].includes(failureCode),
  };
}

export async function processNextBrandSourceAcquisition(
  options: {
    workerReference?: string;
    resolve?: PublicAddressResolver;
    transport?: PinnedPublicTransport;
  } = {},
) {
  assertWorkerEnabled();
  const workerReference =
    options.workerReference || `brand-source-worker-${process.pid}`;
  const acquisition = await claim(workerReference);
  if (!acquisition) return null;
  try {
    const snapshot = await fetchPublicSnapshot({
      inputUrl: acquisition.locator,
      resolve: options.resolve || systemPublicAddressResolver,
      transport: options.transport || nodePinnedPublicTransport,
      maximumBytes: 1_000_000,
      maximumRedirects: 3,
      timeoutMs: 10_000,
    });
    const content = extractPublicSourceText(
      snapshot.body,
      snapshot.content_type,
    );
    return await complete(acquisition, workerReference, {
      outcome: "SUCCEEDED",
      finalUrl: snapshot.final_url,
      contentType: snapshot.content_type,
      rawSha256: snapshot.sha256,
      content,
      byteCount: snapshot.body.length,
      redirectCount: snapshot.redirects,
    });
  } catch (error) {
    return complete(acquisition, workerReference, {
      outcome: "FAILED",
      ...failure(error),
    });
  }
}

export async function processBrandSourceAcquisitions(
  options: {
    workerReference?: string;
    maximumJobs?: number;
    resolve?: PublicAddressResolver;
    transport?: PinnedPublicTransport;
  } = {},
) {
  const maximumJobs = options.maximumJobs ?? 25;
  if (!Number.isInteger(maximumJobs) || maximumJobs < 1 || maximumJobs > 100)
    throw Error("Brand source worker job limit is invalid");
  const results = [];
  for (let index = 0; index < maximumJobs; index += 1) {
    const result = await processNextBrandSourceAcquisition(options);
    if (!result) break;
    results.push(result);
  }
  return results;
}
