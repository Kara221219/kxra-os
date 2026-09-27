import pg from "pg";
import type { NormalizedStripeSubscriptionEvent } from "./billing";
import type { StripeHostedSession } from "./stripe-hosted";

function databaseConfiguration() {
  const connectionString = process.env.KXRA_BILLING_WORKER_DATABASE_URL;
  if (!connectionString)
    throw Error("Billing worker database is not configured");
  return {
    connectionString,
    ssl:
      process.env.NODE_ENV === "production"
        ? ({ rejectUnauthorized: true } as const)
        : undefined,
  };
}

function assertBillingEnabled() {
  if (process.env.KXRA_BILLING_ENABLED !== "true")
    throw Error("Billing is disabled");
}

async function billingTransaction<T>(
  work: (database: pg.Client) => Promise<T>,
  configuration?: pg.ClientConfig,
) {
  const database = new pg.Client(configuration || databaseConfiguration());
  await database.connect();
  try {
    await database.query("begin");
    await database.query("set local statement_timeout='15s'");
    const identity = await database.query("select current_user");
    if (identity.rows[0].current_user !== "kxra_billing_worker")
      await database.query("set local role kxra_billing_worker");
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

export async function recordStripeSubscriptionEvent(
  event: NormalizedStripeSubscriptionEvent,
  configuration?: pg.ClientConfig,
) {
  assertBillingEnabled();
  if (event.livemode) throw Error("Live billing is prohibited");
  return billingTransaction(async (database) => {
    const result = await database.query<{ state: string }>(
      `select kxra_private.record_stripe_subscription_event(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
       ) state`,
      [
        event.eventId,
        event.eventType,
        event.createdAt,
        event.livemode,
        event.customerId,
        event.subscriptionId,
        event.status,
        event.periodStart,
        event.periodEnd,
        event.cancelAtPeriodEnd,
        event.priceId,
        event.itemId,
        event.quantity,
        event.rawSha256,
      ],
    );
    return result.rows[0]?.state;
  }, configuration);
}

export async function recordStripeHostedSession(
  session: StripeHostedSession,
  configuration?: pg.ClientConfig,
) {
  assertBillingEnabled();
  if (session.livemode) throw Error("Live billing is prohibited");
  return billingTransaction(async (database) => {
    const result = await database.query<{ state: string }>(
      `select kxra_private.record_stripe_billing_session(
        $1,$2,$3,$4,$5,$6,$7
       ) state`,
      [
        session.intentId,
        session.sessionKind,
        session.providerSessionId,
        session.customerId,
        session.redirectUrl,
        session.expiresAt,
        session.livemode,
      ],
    );
    return result.rows[0]?.state;
  }, configuration);
}
