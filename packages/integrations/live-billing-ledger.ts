import { z } from "zod";
import {
  modernScopeTagSchema,
  assertModernModeTag,
  type ModernExecutionMode,
} from "./modern-billing-scope";
/** Parameterized server/worker SQL only. Scope/mode is fixed by exported entrypoint and DB
 * wrappers, never an HTTP body switch. No connection, provider call or entitlement write. */
const uuid = z.uuid(),
  hash = z.string().regex(/^[a-f0-9]{64}$/),
  id = (p: string) => z.string().regex(new RegExp(`^${p}_[A-Za-z0-9]{6,}$`));
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
    event_id: id("evt"),
    payload_sha256: hash,
    account_id: id("acct"),
    mode: z.enum(["live", "staging_sandbox"]),
    execution_scope: modernScopeTagSchema,
    customer_id: id("cus"),
    subscription_id: id("sub"),
    checkout_intent_id: uuid,
    offer_key: offer,
    mapping_revision: z.number().int().positive(),
  })
  .strict();
export type LiveLedgerReceipt = z.infer<typeof receiptSchema>;
export type LiveLedgerConfiguration = {
  enabled: boolean;
  mode: "live" | "staging_sandbox";
};
export type LiveLedgerCommand = Readonly<{
  text: string;
  values: readonly unknown[];
  role: "AUTHENTICATED_SERVER" | "BILLING_WORKER";
  entitlement_authority: false;
}>;
function enabled(
  config: LiveLedgerConfiguration | undefined,
  expected: ModernExecutionMode,
) {
  if (
    config?.enabled !== true ||
    config.mode !== (expected === "LIVE" ? "live" : "staging_sandbox")
  )
    throw Error("LIVE_LEDGER_DISABLED");
}
function command(
  name: string,
  args: string,
  values: unknown[],
  role: LiveLedgerCommand["role"],
  expected: ModernExecutionMode,
): LiveLedgerCommand {
  return Object.freeze({
    text: `select kxra_private.${expected === "LIVE" ? "" : "staging_sandbox_"}${name}(${args}) value`,
    values: Object.freeze(values),
    role,
    entitlement_authority: false,
  });
}
function requestCore(
  input: unknown,
  config: LiveLedgerConfiguration | undefined,
  expected: ModernExecutionMode,
) {
  enabled(config, expected);
  const r = requestSchema.parse(input);
  return command(
    "request_live_billing_intent",
    "$1::uuid,$2::text,$3::text",
    [r.intent_id, r.kind, r.offer_key],
    "AUTHENTICATED_SERVER",
    expected,
  );
}
function claimCore(
  input: unknown,
  config: LiveLedgerConfiguration | undefined,
  expected: ModernExecutionMode,
) {
  enabled(config, expected);
  const r = z.object({ intent_id: uuid }).strict().parse(input);
  return command(
    "claim_live_billing_intent",
    "$1::uuid",
    [r.intent_id],
    "BILLING_WORKER",
    expected,
  );
}
function finishCore(
  input: unknown,
  config: LiveLedgerConfiguration | undefined,
  expected: ModernExecutionMode,
) {
  enabled(config, expected);
  const r = z
    .object({
      intent_id: uuid,
      outcome: z.enum(["CONSUMED", "UNCERTAIN"]),
      provider_session_id: z
        .union([
          z
            .string()
            .regex(
              expected === "LIVE"
                ? /^cs_live_[A-Za-z0-9_]{6,}$/
                : /^cs_test_[A-Za-z0-9_]{6,}$/,
            ),
          id("bps"),
        ])
        .nullable(),
      result_sha256: hash,
    })
    .strict()
    .parse(input);
  return command(
    "finish_live_billing_intent",
    "$1::uuid,$2::text,$3::text,$4::text",
    [r.intent_id, r.outcome, r.provider_session_id, r.result_sha256],
    "BILLING_WORKER",
    expected,
  );
}
function recordCore(
  input: unknown,
  config: LiveLedgerConfiguration | undefined,
  expected: ModernExecutionMode,
) {
  enabled(config, expected);
  const r = receiptSchema.parse(input),
    s = assertModernModeTag(r.execution_scope, expected);
  if (
    r.account_id !== s.account_id ||
    r.mode !== (s.livemode ? "live" : "staging_sandbox")
  )
    throw Error("MODERN_LEDGER_RECEIPT_SCOPE_MISMATCH");
  return command(
    "record_live_billing_event",
    "$1::jsonb",
    [JSON.stringify(r)],
    "BILLING_WORKER",
    expected,
  );
}
function currentCore(
  input: unknown,
  config: LiveLedgerConfiguration | undefined,
  expected: ModernExecutionMode,
) {
  enabled(config, expected);
  const r = z.object({ intent_id: uuid }).strict().parse(input);
  return command(
    "current_live_billing_intent",
    "$1::uuid",
    [r.intent_id],
    "BILLING_WORKER",
    expected,
  );
}
export function requestLiveLedgerCommand(
  input: unknown,
  config?: LiveLedgerConfiguration,
) {
  return requestCore(input, config, "LIVE");
}
export function claimLiveLedgerCommand(
  input: unknown,
  config?: LiveLedgerConfiguration,
) {
  return claimCore(input, config, "LIVE");
}
export function finishLiveLedgerCommand(
  input: unknown,
  config?: LiveLedgerConfiguration,
) {
  return finishCore(input, config, "LIVE");
}
export function recordLiveLedgerCommand(
  input: unknown,
  config?: LiveLedgerConfiguration,
) {
  return recordCore(input, config, "LIVE");
}
export function currentLiveLedgerCommand(
  input: unknown,
  config?: LiveLedgerConfiguration,
) {
  return currentCore(input, config, "LIVE");
}
export function requestStagingSandboxLedgerCommand(
  input: unknown,
  config?: LiveLedgerConfiguration,
) {
  return requestCore(input, config, "STAGING_SANDBOX");
}
export function claimStagingSandboxLedgerCommand(
  input: unknown,
  config?: LiveLedgerConfiguration,
) {
  return claimCore(input, config, "STAGING_SANDBOX");
}
export function finishStagingSandboxLedgerCommand(
  input: unknown,
  config?: LiveLedgerConfiguration,
) {
  return finishCore(input, config, "STAGING_SANDBOX");
}
export function recordStagingSandboxLedgerCommand(
  input: unknown,
  config?: LiveLedgerConfiguration,
) {
  return recordCore(input, config, "STAGING_SANDBOX");
}
export function currentStagingSandboxLedgerCommand(
  input: unknown,
  config?: LiveLedgerConfiguration,
) {
  return currentCore(input, config, "STAGING_SANDBOX");
}
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
