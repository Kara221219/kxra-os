import { z } from "zod";

const claimSchema = z
  .object({
    intent: z
      .object({
        id: z.uuid(),
        org_id: z.uuid(),
        actor_id: z.uuid(),
        version: z.number().int().positive(),
      })
      .passthrough(),
    mapping: z.unknown(),
    execution_scope: z.unknown(),
    entitlement_authority: z.literal(false),
  })
  .strict();
export type ClaimedLiveCustomer = z.infer<typeof claimSchema>;
export type CustomerDispatchReceipt = {
  intent_id: string;
  outcome: "BOUND" | "UNCERTAIN" | "QUARANTINED";
  entitlement_authority: false;
};
export type LiveCustomerOncePorts = {
  enabled?: boolean;
  claim: (id: string) => Promise<unknown>;
  create: (canonical: ClaimedLiveCustomer) => Promise<CustomerDispatchReceipt>;
  finish: (receipt: CustomerDispatchReceipt) => Promise<unknown>;
};

/** Pure orchestration. Each DB port must COMMIT its short transaction before
 * resolving. create performs provider HTTP; it must never run inside those txs.
 * No claim retry, replacement UUID, automatic POST retry or implicit discovery.
 */
export async function dispatchLiveCustomerOnce(
  intentId: unknown,
  ports: LiveCustomerOncePorts,
) {
  const id = z.uuid().parse(intentId);
  if (ports.enabled !== true)
    return {
      state: "DISABLED" as const,
      intent_id: id,
      entitlement_authority: false as const,
    };
  let raw: unknown;
  try {
    raw = await ports.claim(id);
  } catch {
    throw Error("LIVE_CUSTOMER_DISPATCH_CLAIM_UNAVAILABLE");
  }
  const canonical = claimSchema.parse(raw);
  if (
    canonical.intent.id !== id ||
    !Object.hasOwn(canonical, "execution_scope")
  )
    throw Error("LIVE_CUSTOMER_DISPATCH_CANONICAL_INVALID");
  let receipt: CustomerDispatchReceipt;
  try {
    receipt = await ports.create(canonical);
  } catch {
    // A claimed request is already a permanent hold. Never guess whether a POST
    // happened, nor recreate it after an unclassified adapter/process failure.
    throw Error("LIVE_CUSTOMER_DISPATCH_RECONCILIATION_REQUIRED");
  }
  const checked = z
    .object({
      intent_id: z.uuid(),
      outcome: z.enum(["BOUND", "UNCERTAIN", "QUARANTINED"]),
      entitlement_authority: z.literal(false),
    })
    .passthrough()
    .parse(receipt);
  if (checked.intent_id !== id)
    throw Error("LIVE_CUSTOMER_DISPATCH_RECEIPT_INVALID");
  let outcome: unknown;
  try {
    outcome = await ports.finish(receipt);
  } catch {
    // SQL COMMIT might already have succeeded. Inspect the original intent; do
    // not automatically retry dispatch or fabricate a replacement customer.
    throw Error("LIVE_CUSTOMER_DISPATCH_COMPLETION_UNCERTAIN");
  }
  if (![receipt.outcome, "QUARANTINED"].includes(String(outcome)))
    throw Error("LIVE_CUSTOMER_DISPATCH_COMPLETION_INVALID");
  return {
    state: "RECORDED" as const,
    intent_id: id,
    outcome: outcome as CustomerDispatchReceipt["outcome"],
    entitlement_authority: false as const,
  };
}
