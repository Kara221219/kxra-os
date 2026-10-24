import { z } from "zod";
import {
  assertModernModeTag,
  MODERN_PRODUCTION_PROJECT,
  MODERN_STAGING_PROJECT,
  type ModernExecutionMode,
} from "../integrations/modern-billing-scope";

type EntryScope = { mode: ModernExecutionMode; project: string };

/** Private server configuration only. Never accept a mode or function name from a request. */
export function modernEntrySql(
  action:
    "STATUS" | "PAID_STATUS" | "CUSTOMER" | "CHECKOUT" | "PORTAL" | "RECONCILE",
  mode: ModernExecutionMode,
) {
  z.enum(["LIVE", "STAGING_SANDBOX"]).parse(mode);
  z.enum([
    "STATUS",
    "PAID_STATUS",
    "CUSTOMER",
    "CHECKOUT",
    "PORTAL",
    "RECONCILE",
  ]).parse(action);
  if (action === "PAID_STATUS")
    return mode === "LIVE"
      ? "select kxra_private.live_paid_access_status() value"
      : "select kxra_private.staging_sandbox_live_paid_access_status() value";
  if (mode === "LIVE")
    return action === "STATUS"
      ? "select kxra_private.own_live_billing_status() value"
      : action === "CUSTOMER"
        ? "select kxra_private.request_live_customer_intent($1,$2) value"
        : "select kxra_private.request_live_billing_intent($1,$2,$3) value";
  return action === "STATUS"
    ? "select kxra_private.staging_sandbox_own_live_billing_status() value"
    : action === "CUSTOMER"
      ? "select kxra_private.staging_sandbox_request_live_customer_intent($1,$2) value"
      : "select kxra_private.staging_sandbox_request_live_billing_intent($1,$2,$3) value";
}

/** Validate the authenticated SQL wrapper's tag before the browser DTO is parsed.
 * The full scope/catalogue attestation remains private to worker execution.
 */
export function unwrapModernEntryReceipt(input: unknown, expected: EntryScope) {
  const value = z.record(z.string(), z.unknown()).parse(input);
  const tag = assertModernModeTag(value.execution_scope, expected.mode);
  const project =
    expected.mode === "LIVE"
      ? MODERN_PRODUCTION_PROJECT
      : MODERN_STAGING_PROJECT;
  if (expected.project !== project || tag.project_ref !== project)
    throw Error("MODERN_ENTRY_PROJECT_MISMATCH");
  const { execution_scope: _privateScope, ...receipt } = value;
  return receipt;
}
