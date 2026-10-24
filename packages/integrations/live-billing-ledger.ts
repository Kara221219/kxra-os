import { z } from "zod";

/** SQL command contracts only: no connection, env reads, provider calls or entitlement writes.
 * Execute in an existing authenticated-server or billing-worker transaction as indicated.
 * A command's role label is documentation, not an authorization mechanism; SQL enforces grants.
 * Never expose worker builders directly to request bodies. Signature verification precedes receipts.
 */
const uuid = z.uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const providerId = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_[A-Za-z0-9]{6,}$`));
const offer = z.enum(["KXRA_STARTER_V1", "KXRA_TEAM_V1", "KXRA_BUSINESS_V1"]);
const requestSchema = z
  .object({
    intent_id: uuid,
    kind: z.enum(["CHECKOUT", "PORTAL", "RECONCILE"]),
    offer_key: offer,
  })
  .strict();
const receiptSchema = z
  .object({
    event_id: providerId("evt"),
    payload_sha256: hash,
    account_id: z.literal("acct_1Rv3KdC84VkhhIRz"),
    mode: z.literal("live"),
    customer_id: providerId("cus"),
    subscription_id: providerId("sub"),
    checkout_intent_id: uuid,
    offer_key: offer,
    mapping_revision: z.number().int().positive(),
  })
  .strict();
export type LiveLedgerReceipt = z.infer<typeof receiptSchema>;
export type LiveLedgerConfiguration = { enabled: boolean; mode: "live" };
export type LiveLedgerCommand = Readonly<{
  text: string;
  values: readonly unknown[];
  role: "AUTHENTICATED_SERVER" | "BILLING_WORKER";
  entitlement_authority: false;
}>;
function enabled(config?: LiveLedgerConfiguration) {
  if (config?.enabled !== true || config.mode !== "live")
    throw Error("LIVE_LEDGER_DISABLED");
}
function command(
  text: string,
  values: unknown[],
  role: LiveLedgerCommand["role"],
): LiveLedgerCommand {
  return Object.freeze({
    text,
    values: Object.freeze(values),
    role,
    entitlement_authority: false as const,
  });
}
export function requestLiveLedgerCommand(
  input: unknown,
  config?: LiveLedgerConfiguration,
) {
  enabled(config);
  const r = requestSchema.parse(input);
  return command(
    "select kxra_private.request_live_billing_intent($1::uuid,$2::text,$3::text) value",
    [r.intent_id, r.kind, r.offer_key],
    "AUTHENTICATED_SERVER",
  );
}
export function claimLiveLedgerCommand(
  input: unknown,
  config?: LiveLedgerConfiguration,
) {
  enabled(config);
  const r = z.object({ intent_id: uuid }).strict().parse(input);
  return command(
    "select kxra_private.claim_live_billing_intent($1::uuid) value",
    [r.intent_id],
    "BILLING_WORKER",
  );
}
export function finishLiveLedgerCommand(
  input: unknown,
  config?: LiveLedgerConfiguration,
) {
  enabled(config);
  const r = z
    .object({
      intent_id: uuid,
      outcome: z.enum(["CONSUMED", "UNCERTAIN"]),
      provider_session_id: z
        .union([
          z.string().regex(/^cs_live_[A-Za-z0-9_]{6,}$/),
          providerId("bps"),
        ])
        .nullable(),
      result_sha256: hash,
    })
    .strict()
    .parse(input);
  return command(
    "select kxra_private.finish_live_billing_intent($1::uuid,$2::text,$3::text,$4::text) value",
    [r.intent_id, r.outcome, r.provider_session_id, r.result_sha256],
    "BILLING_WORKER",
  );
}
export function recordLiveLedgerCommand(
  verifiedReceipt: unknown,
  config?: LiveLedgerConfiguration,
) {
  enabled(config);
  const r = receiptSchema.parse(verifiedReceipt);
  return command(
    "select kxra_private.record_live_billing_event($1::jsonb) value",
    [JSON.stringify(r)],
    "BILLING_WORKER",
  );
}
/** SQL response allowlist. It deliberately has no APPLIED/ACTIVE/ENTITLED success state. */
export function liveLedgerOutcome(input: unknown) {
  return z
    .enum([
      "REQUESTED",
      "INFLIGHT",
      "CONSUMED",
      "UNCERTAIN",
      "DUPLICATE",
      "CONFLICT",
      "RECONCILE_REQUIRED",
    ])
    .parse(input);
}
