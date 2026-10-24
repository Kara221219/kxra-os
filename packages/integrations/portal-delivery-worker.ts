import { customerDispatchConfiguration } from "./live-customer-dispatch-config";
import {
  liveCustomerDatabaseExecutor,
  type LiveCustomerExecute,
} from "./live-customer-worker";
import { validateModernBillingConfiguration } from "./modern-billing-scope";
import {
  claimLiveLedgerCommand,
  claimStagingSandboxLedgerCommand,
  currentLiveLedgerCommand,
  currentStagingSandboxLedgerCommand,
  finishLiveLedgerCommand,
  finishStagingSandboxLedgerCommand,
} from "./live-billing-ledger";
import {
  createLiveCatalogueSession,
  createStagingSandboxCatalogueSession,
} from "./live-catalogue-stripe";
import { boundedPortalTransport } from "./portal-delivery-transport";
import type { PortalWorkerPort } from "./synchronous-portal";
import type { PortalDeliveryConfiguration } from "../authz/portal-delivery";
import { z } from "zod";

/** Server only; invoked after authenticated reservation. Reuses only the existing
 * reviewed runner/key/TLS settings. Every execute port validates real DB identity.
 */
export async function portalWorker(
  config: PortalDeliveryConfiguration,
  ports: {
    environment?: Record<string, string | undefined>;
    execute?: LiveCustomerExecute;
    fetch?: typeof fetch;
    nowSeconds?: () => number;
  } = {},
): Promise<PortalWorkerPort> {
  const profile = customerDispatchConfiguration(ports.environment);
  if (
    !profile ||
    profile.executionMode !== config.mode ||
    profile.runtimeIdentity.project_ref !== config.project
  )
    throw Error("PORTAL_WORKER_DISABLED");
  const execute = ports.execute || liveCustomerDatabaseExecutor(profile);
  const execution = validateModernBillingConfiguration(
    await execute({
      text: "select kxra_private.modern_billing_scope_attestation() value",
      values: [],
    }),
    profile.runtimeIdentity,
    profile.runtime.secretKey,
    config.mode,
  );
  const ledger = { enabled: true, mode: profile.runtime.mode },
    live = config.mode === "LIVE";
  const claim = live
      ? claimLiveLedgerCommand
      : claimStagingSandboxLedgerCommand,
    current = live
      ? currentLiveLedgerCommand
      : currentStagingSandboxLedgerCommand,
    finish = live ? finishLiveLedgerCommand : finishStagingSandboxLedgerCommand,
    create = live
      ? createLiveCatalogueSession
      : createStagingSandboxCatalogueSession;
  return {
    scope: execution.execution_scope,
    claim: (id) => execute(claim({ intent_id: id }, ledger)),
    current: async (id) =>
      (await execute(current({ intent_id: id }, ledger))) === true,
    finish: (r) => execute(finish(r, ledger)),
    create: async (c, stillCurrent) => {
      const mapping = z
        .object({ price_id: z.string(), portal_configuration_id: z.string() })
        .passthrough()
        .parse(c.mapping);
      return create(
        {
          execution,
          runtimeIdentity: profile.runtimeIdentity,
          runtime: { ...profile.runtime, origin: config.origin },
          nowSeconds: ports.nowSeconds,
          resolveIntent: async (id, principal) =>
            id === c.intent.id &&
            principal.actor_id === c.intent.actor_id &&
            principal.org_id === c.intent.org_id
              ? c
              : null,
          stillCurrent: async () => stillCurrent(),
          transport: boundedPortalTransport(
            ports.fetch || globalThis.fetch,
            profile.runtime.secretKey,
            {
              customer_id: c.intent.customer_id,
              price_id: mapping.price_id,
              portal_configuration_id: mapping.portal_configuration_id,
              origin: config.origin,
            },
          ),
        },
        { intent_id: c.intent.id },
        { actor_id: c.intent.actor_id, org_id: c.intent.org_id },
      );
    },
  };
}
