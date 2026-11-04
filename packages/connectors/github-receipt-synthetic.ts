import crypto from "node:crypto";
import { z } from "zod";
import { githubWrite } from "./github-contracts";
import { requireGithubFixture, type ScopeCall } from "./github";

export type AtomicReceiptClaim = (
  input: Record<string, unknown>,
  tokenHash: string,
) => Promise<unknown>;
export type ReceiptPublisher = (
  token: string,
  attempt: string,
  digest: string,
  outcome: string,
  evidence: Record<string, unknown>,
) => Promise<unknown>;
const receiptInput = z
  .object({
    connection_id: z.string().uuid(),
    write_id: z.string().uuid(),
    attempt_id: z.string().uuid(),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    outcome: z.enum(["ACCEPTED", "REJECTED", "NOT_EXECUTED", "UNCERTAIN"]),
    evidence: z.record(z.string(), z.unknown()),
  })
  .strict();
/** Opt-in fixture transport scope. No API route imports this module.
 * Tokens stay in this worker's memory. Losing one never authorizes a second send;
 * ordinary human-authorized read reconciliation remains the recovery path.
 */
export function syntheticReceiptScope(
  scope: ScopeCall,
  claim: AtomicReceiptClaim,
  publish: ReceiptPublisher,
): ScopeCall {
  requireGithubFixture();
  const permits = new Map<
    string,
    { token: string; attempt: string; digest: string; connection: string }
  >();
  return async (kind, action, input) => {
    requireGithubFixture();
    if (kind === "worker" && action === "claim") {
      if (permits.size >= 100) throw Error("RECEIPT_WORKER_CAPACITY");
      const token = crypto.randomBytes(32).toString("base64url");
      const result = z
        .object({ write: githubWrite, claimed: z.boolean() })
        .strict()
        .parse(
          await claim(
            input,
            crypto.createHash("sha256").update(token).digest("hex"),
          ),
        );
      if (result.claimed) {
        if (!result.write.attempt_id || result.write.state !== "DISPATCHING")
          throw Error("RECEIPT_CLAIM_INVALID");
        permits.set(result.write.id, {
          token,
          attempt: result.write.attempt_id,
          digest: result.write.digest,
          connection: result.write.connection_id,
        });
      }
      return result;
    }
    if (kind === "worker" && action === "record_outcome") {
      const permit = permits.get(String(input.write_id));
      // Reconciliation still needs ordinary, current human authority. A receipt
      // token cannot be reused as a provider read or reconciliation grant.
      if (
        input.outcome === "RECONCILED_ACCEPTED" ||
        input.outcome === "INCONCLUSIVE"
      )
        return scope(kind, action, input);
      if (!permit) throw Error("RECEIPT_PERMIT_UNAVAILABLE");
      const value = receiptInput.parse(input);
      if (
        value.attempt_id !== permit.attempt ||
        value.digest !== permit.digest ||
        value.connection_id !== permit.connection
      )
        throw Error("RECEIPT_ATTEMPT_MISMATCH");
      const ack = z
        .object({ recorded: z.literal(true), state: githubWrite.shape.state })
        .strict()
        .parse(
          await publish(
            permit.token,
            permit.attempt,
            permit.digest,
            value.outcome,
            value.evidence,
          ),
        );
      permits.delete(value.write_id);
      return ack;
    }
    return scope(kind, action, input);
  };
}
