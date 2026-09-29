import pg from "pg";
import { databaseSsl } from "../db/ssl";
import {
  openEmailDeliverySecret,
  renderEmail,
  ResendEmailTransport,
  type EmailTemplateKey,
  type EmailTransportResult,
} from "./email";

type ClaimedEmail = {
  outbox_id: string;
  template_key: EmailTemplateKey;
  template_version: number;
  recipient: string;
  recipient_hint: string;
  payload: Record<string, unknown>;
  operation_key: string;
  ciphertext: string | null;
  nonce: string | null;
  auth_tag: string | null;
  secret_sha256: string | null;
  project_names: string[];
};

function databaseConfiguration() {
  const connectionString = process.env.KXRA_EMAIL_WORKER_DATABASE_URL;
  if (!connectionString) throw Error("EMAIL_WORKER_DATABASE_NOT_CONFIGURED");
  return {
    connectionString,
    ssl: process.env.NODE_ENV === "production" ? databaseSsl() : undefined,
  };
}

function assertWorkerEnabled() {
  if (process.env.KXRA_EMAIL_ENABLED !== "true")
    throw Error("EMAIL_WORKER_DISABLED");
}

function safeWorkerFailure(error: unknown, fallback: string) {
  if (error instanceof Error && /^[A-Z][A-Z0-9_]{2,80}$/.test(error.message))
    return error;
  return new Error(fallback, { cause: error });
}

async function workerTransaction<T>(
  work: (database: pg.Client) => Promise<T>,
  configuration?: pg.ClientConfig,
) {
  let resolvedConfiguration: pg.ClientConfig;
  try {
    resolvedConfiguration = configuration || databaseConfiguration();
  } catch (error) {
    throw safeWorkerFailure(error, "EMAIL_WORKER_DATABASE_CONFIG_FAILED");
  }
  const database = new pg.Client(resolvedConfiguration);
  try {
    await database.connect();
  } catch (error) {
    throw safeWorkerFailure(error, "EMAIL_WORKER_DATABASE_CONNECT_FAILED");
  }
  let transactionStarted = false;
  try {
    await database.query("begin");
    transactionStarted = true;
    await database.query("set local statement_timeout='30s'");
    const identity = await database.query("select current_user");
    if (identity.rows[0].current_user !== "kxra_email_worker")
      await database.query("set local role kxra_email_worker");
    const result = await work(database);
    await database.query("commit");
    transactionStarted = false;
    return result;
  } catch (error) {
    if (transactionStarted) {
      try {
        await database.query("rollback");
      } catch {
        // Preserve the original bounded failure code.
      }
    }
    throw safeWorkerFailure(error, "EMAIL_WORKER_DATABASE_TRANSACTION_FAILED");
  } finally {
    try {
      await database.end();
    } catch {
      // Connection cleanup cannot change the recorded operation outcome.
    }
  }
}

async function claim(workerReference: string, configuration?: pg.ClientConfig) {
  try {
    return await workerTransaction(async (database) => {
      const result = await database.query<ClaimedEmail>(
        "select * from kxra_private.claim_transactional_email($1)",
        [workerReference],
      );
      return result.rows[0] || null;
    }, configuration);
  } catch (error) {
    throw safeWorkerFailure(error, "EMAIL_WORKER_CLAIM_FAILED");
  }
}

async function authorize(
  outboxId: string,
  workerReference: string,
  configuration?: pg.ClientConfig,
) {
  return workerTransaction(async (database) => {
    const result = await database.query<{ allowed: boolean }>(
      "select kxra_private.authorize_transactional_email($1,$2) as allowed",
      [outboxId, workerReference],
    );
    return result.rows[0]?.allowed === true;
  }, configuration);
}

async function complete(
  outboxId: string,
  workerReference: string,
  result: EmailTransportResult,
  configuration?: pg.ClientConfig,
) {
  return workerTransaction(async (database) => {
    const accepted = result.outcome === "ACCEPTED";
    const response = await database.query<{ state: string }>(
      "select kxra_private.complete_transactional_email($1,$2,$3,$4,$5,$6) as state",
      [
        outboxId,
        workerReference,
        result.outcome,
        accepted ? result.providerMessageId : null,
        accepted ? null : result.errorCode,
        accepted ? null : result.retryAfterSeconds || null,
      ],
    );
    return response.rows[0]?.state;
  }, configuration);
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

export async function processNextTransactionalEmail(
  options: {
    workerReference?: string;
    transport?: Pick<ResendEmailTransport, "deliver">;
    databaseConfiguration?: pg.ClientConfig;
  } = {},
) {
  assertWorkerEnabled();
  const workerReference =
    options.workerReference || `email-worker-${process.pid}`;
  const mail = await claim(workerReference, options.databaseConfiguration);
  if (!mail) return null;
  let actionUrl: string | undefined;
  if (mail.ciphertext && mail.nonce && mail.auth_tag && mail.secret_sha256) {
    const token = openEmailDeliverySecret({
      ciphertext: mail.ciphertext,
      nonce: mail.nonce,
      authTag: mail.auth_tag,
      secretSha256: mail.secret_sha256,
    });
    actionUrl = `${process.env.KXRA_ORIGIN}/join#token=${encodeURIComponent(token)}`;
  } else if (
    ["APPROVAL_REQUIRED", "PROJECT_ASSIGNMENT", "SECURITY_ALERT"].includes(
      mail.template_key,
    )
  ) {
    actionUrl = `${process.env.KXRA_ORIGIN}/login`;
  }
  const rendered = renderEmail({
    template: mail.template_key,
    recipientHint: mail.recipient_hint,
    expiresAt: optionalString(mail.payload.expires_at),
    projectCount:
      typeof mail.payload.project_count === "number"
        ? mail.payload.project_count
        : undefined,
    projectNames: mail.project_names,
    accountState: optionalString(mail.payload.account_state),
    actionUrl,
  });
  if (
    !(await authorize(
      mail.outbox_id,
      workerReference,
      options.databaseConfiguration,
    ))
  )
    return { outboxId: mail.outbox_id, state: "CANCELLED" };
  const transport =
    options.transport ||
    new ResendEmailTransport({
      apiKey: process.env.RESEND_API_KEY || "",
      from: process.env.KXRA_EMAIL_FROM || "",
    });
  const result = await transport.deliver({
    operationKey: mail.operation_key,
    recipient: mail.recipient,
    rendered,
  });
  return {
    outboxId: mail.outbox_id,
    state: await complete(
      mail.outbox_id,
      workerReference,
      result,
      options.databaseConfiguration,
    ),
  };
}

export async function processTransactionalEmails(
  options: {
    workerReference?: string;
    maximumJobs?: number;
    transport?: Pick<ResendEmailTransport, "deliver">;
    databaseConfiguration?: pg.ClientConfig;
  } = {},
) {
  const maximumJobs = options.maximumJobs ?? 25;
  if (!Number.isInteger(maximumJobs) || maximumJobs < 1 || maximumJobs > 100)
    throw Error("Email worker job limit is invalid");
  const results = [];
  for (let index = 0; index < maximumJobs; index += 1) {
    const result = await processNextTransactionalEmail(options);
    if (!result) break;
    results.push(result);
  }
  return results;
}

export async function recordTransactionalEmailProviderEvent(
  input: {
    eventId: string;
    messageId: string;
    eventType:
      | "DELIVERED"
      | "DELAYED"
      | "BOUNCED"
      | "COMPLAINED"
      | "FAILED"
      | "SUPPRESSED";
    occurredAt: string;
  },
  configuration?: pg.ClientConfig,
) {
  assertWorkerEnabled();
  return workerTransaction(async (database) => {
    const result = await database.query<{ state: string }>(
      "select kxra_private.record_transactional_email_provider_event($1,$2,$3,$4) state",
      [input.eventId, input.messageId, input.eventType, input.occurredAt],
    );
    return result.rows[0]?.state;
  }, configuration);
}
