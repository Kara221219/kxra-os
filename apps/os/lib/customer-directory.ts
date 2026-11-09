import "server-only";
import { query } from "../../../packages/db";
import { readCustomerDirectory } from "../../../packages/workspace/customer-admin-contract";
import { actor } from "./auth";

/** No alternate database, identity override, service role, fixture or grant path.
 * Each read resolves identity afresh; SQL must independently recheck current
 * original-session authority under its transaction fence before returning data.
 */
export function customerDirectory(input: unknown) {
  return readCustomerDirectory(input, { identity: actor, query });
}
