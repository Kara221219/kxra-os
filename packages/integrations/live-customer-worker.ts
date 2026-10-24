import { z } from "zod";
import {
  customerDispatchConfiguration,
  liveCustomerDispatchConfiguration,
  type LiveCustomerDispatchConfiguration,
} from "./live-customer-dispatch-config";
import { dispatchLiveCustomerOnce } from "./live-customer-dispatch";
import { boundedLiveCustomerTransport } from "./live-customer-dispatch-transport";
import { requireLiveBillingWorkerIdentity } from "./live-worker-identity";
import { validateModernBillingConfiguration } from "./modern-billing-scope";
import {
  claimLiveCustomerCommand,
  currentLiveCustomerCommand,
  finishLiveCustomerCommand,
  createLiveStripeCustomer,
  createStagingSandboxStripeCustomer,
  claimStagingSandboxCustomerCommand,
  currentStagingSandboxCustomerCommand,
  finishStagingSandboxCustomerCommand,
  type LiveCustomerCommand,
} from "./live-stripe-customer";

type WorkerQuery = Pick<LiveCustomerCommand, "text" | "values">;
export type LiveCustomerExecute = (query: WorkerQuery) => Promise<unknown>;
export type LiveCustomerDatabaseClient = {
  connect: () => Promise<void>;
  query: (
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: Record<string, unknown>[] }>;
  end: () => Promise<void>;
};

/** Real DB adapter. No provider request is made by/inside this transaction.
 * Credentials/TLS targets were validated before construction; genuine session
 * identity must still match the existing LOGIN runner -> NOLOGIN capability.
 */
export function liveCustomerDatabaseExecutor(
  config: LiveCustomerDispatchConfiguration,
  clientFactory?: () => Promise<LiveCustomerDatabaseClient>,
): LiveCustomerExecute {
  return async (command) => {
    const db = clientFactory
      ? await clientFactory()
      : await (async () => {
          const { default: pg } = await import("pg");
          return new pg.Client({ ...config.database, query_timeout: 5000 });
        })();
    let begun = false;
    try {
      await db.connect();
      await db.query("begin");
      begun = true;
      await db.query("set local statement_timeout='5s'");
      await db.query("set local lock_timeout='2s'");
      await db.query("set local role kxra_billing_worker");
      requireLiveBillingWorkerIdentity(
        (await db.query("select session_user,current_user")).rows[0],
      );
      const result = await db.query(command.text, [...command.values]);
      await db.query("commit");
      begun = false;
      return result.rows[0]?.value;
    } catch {
      if (begun) await db.query("rollback").catch(() => {});
      throw Error("LIVE_CUSTOMER_DISPATCH_DATABASE_UNAVAILABLE");
    } finally {
      await db.end().catch(() => {});
    }
  };
}

/** Server/CLI only. Injection is for deterministic private tests, never HTTP input.
 * The LIVE public customer adapter itself validates107 attestation and canonical
 * tags; no sandbox IDs/modes are converted or inferred here.
 */
export async function runCustomerWorkerOnce(
  intentId: unknown,
  ports: {
    environment?: Record<string, string | undefined>;
    execute?: LiveCustomerExecute;
    fetch?: typeof fetch;
    nowSeconds?: () => number;
  } = {},
) {
  const id = z.uuid().parse(intentId);
  const config = customerDispatchConfiguration(ports.environment);
  if (!config)
    return {
      state: "DISABLED" as const,
      intent_id: id,
      entitlement_authority: false as const,
    };
  const execute = ports.execute ?? liveCustomerDatabaseExecutor(config);
  let execution: ReturnType<typeof validateModernBillingConfiguration>;
  try {
    const attestation = await execute({
      text: "select kxra_private.modern_billing_scope_attestation() value",
      values: [],
    });
    execution = validateModernBillingConfiguration(
      attestation,
      config.runtimeIdentity,
      config.runtime.secretKey,
      config.executionMode,
    );
  } catch {
    throw Error("LIVE_CUSTOMER_DISPATCH_SCOPE_UNAVAILABLE");
  }
  const claim = (input: unknown) =>
    config.executionMode === "LIVE"
      ? claimLiveCustomerCommand(input, { enabled: true, mode: "live" })
      : claimStagingSandboxCustomerCommand(input, {
          enabled: true,
          mode: "staging_sandbox",
        });
  const current = (input: unknown) =>
    config.executionMode === "LIVE"
      ? currentLiveCustomerCommand(input, { enabled: true, mode: "live" })
      : currentStagingSandboxCustomerCommand(input, {
          enabled: true,
          mode: "staging_sandbox",
        });
  const finish = (input: unknown) =>
    config.executionMode === "LIVE"
      ? finishLiveCustomerCommand(input, { enabled: true, mode: "live" })
      : finishStagingSandboxCustomerCommand(input, {
          enabled: true,
          mode: "staging_sandbox",
        });
  const create =
    config.executionMode === "LIVE"
      ? createLiveStripeCustomer
      : createStagingSandboxStripeCustomer;
  const transport = boundedLiveCustomerTransport(
    ports.fetch ?? globalThis.fetch,
    config.runtime.secretKey,
    execution.catalogue.map((row) => row.price_id),
  );
  return dispatchLiveCustomerOnce(id, {
    enabled: true,
    claim: (request) => execute(claim({ intent_id: request })),
    create: (canonical) =>
      create(
        {
          execution,
          runtimeIdentity: config.runtimeIdentity,
          runtime: config.runtime,
          transport,
          nowSeconds: ports.nowSeconds,
          resolveIntent: async (request, principal) =>
            request === canonical.intent.id &&
            principal.actor_id === canonical.intent.actor_id &&
            principal.org_id === canonical.intent.org_id
              ? canonical
              : null,
          stillCurrent: async (intent) =>
            (await execute(
              current({ intent_id: intent.id, intent_version: intent.version }),
            )) === true,
        },
        { intent_id: id },
        {
          actor_id: canonical.intent.actor_id,
          org_id: canonical.intent.org_id,
        },
      ),
    finish: (receipt) => execute(finish(receipt)),
  });
}

/** Preserved LIVE-only public facade; never routes staging sandbox through LIVE. */
export async function runLiveCustomerWorkerOnce(
  intentId: unknown,
  ports: Parameters<typeof runCustomerWorkerOnce>[1] = {},
) {
  liveCustomerDispatchConfiguration(ports.environment);
  return runCustomerWorkerOnce(intentId, ports);
}
