/** TEST-ONLY REFERENCE MODEL. No imports from production and no entitlement
 * authority. Shows the policy change needed by a webhook-led financial lease.
 * Signature verification, durable SQL transactions/locks, event classification,
 * provider proof parsing and job authorization remain real integration gates.
 */
export type ReferenceProjection = {
  revision: number;
  restricted: boolean;
  adminSuspended: boolean;
  quarantined: boolean;
  verifiedAt: number | null;
  validUntil: number;
  paidThrough: number;
  events: Record<string, string>;
};
export const emptyProjection = (): ReferenceProjection => ({
  revision: 0,
  restricted: true,
  adminSuspended: false,
  quarantined: false,
  verifiedAt: null,
  validUntil: 0,
  paidThrough: 0,
  events: {},
});
export type ReferenceBinding = {
  scope: string;
  account: string;
  mode: "LIVE" | "STAGING_SANDBOX";
  customer: string;
  subscription: string;
  workspace: string;
};
export type VerifiedFixtureEvent = ReferenceBinding & {
  eventId: string;
  digest: string;
  kind: "WAKE" | "RESTRICT";
};
function bound(a: ReferenceBinding, b: ReferenceBinding) {
  return (
    [
      "scope",
      "account",
      "mode",
      "customer",
      "subscription",
      "workspace",
    ] as const
  ).every((key) => a[key] === b[key]);
}
/** Real implementation must resolve workspace/resource association server-side;
 * no actor or HTTP-supplied workspace/decision is admissible. */
export function receiveReferenceEvent(
  p: ReferenceProjection,
  binding: ReferenceBinding,
  event: VerifiedFixtureEvent,
) {
  if (!bound(binding, event)) throw Error("REFERENCE_BINDING_MISMATCH");
  const prior = Object.hasOwn(p.events, event.eventId)
    ? p.events[event.eventId]
    : undefined;
  if (prior === event.digest) return structuredClone(p);
  // Different bytes for the same ID quarantine, never replace the old digest.
  const conflict = prior !== undefined;
  return {
    ...structuredClone(p),
    revision: p.revision + 1,
    restricted: true,
    validUntil: 0,
    events: { ...p.events, [event.eventId]: prior ?? event.digest },
    // Both positive wakeups and restrictions require current-state verification.
    // A delayed old positive event therefore cannot resurrect access.
    quarantined: p.quarantined || conflict,
  };
}
export type ReferenceProof = ReferenceBinding & {
  revision: number;
  readStartedAt: number;
  readFinishedAt: number;
  collected: boolean;
  active: boolean;
  canonicalInvoice: boolean;
  consent: boolean;
  refunded: boolean;
  disputed: boolean;
  paidThrough: number;
};
export function reconcileReference(
  p: ReferenceProjection,
  binding: ReferenceBinding,
  proof: ReferenceProof,
  now: number,
  maxFinancialAge: number,
): ReferenceProjection {
  if (
    !Number.isSafeInteger(maxFinancialAge) ||
    maxFinancialAge < 1 ||
    maxFinancialAge > 86400
  )
    throw Error("REFERENCE_EXPLICIT_AGE_POLICY_REQUIRED");
  if (!bound(binding, proof) || proof.revision !== p.revision)
    return structuredClone(p);
  if (
    proof.readStartedAt > proof.readFinishedAt ||
    proof.readFinishedAt > now ||
    now - proof.readStartedAt > 55 ||
    ![now, proof.readStartedAt, proof.readFinishedAt, proof.paidThrough].every(
      Number.isSafeInteger,
    )
  )
    throw Error("REFERENCE_STALE_OR_INVALID_OBSERVATION");
  const good =
    !p.quarantined &&
    proof.collected &&
    proof.active &&
    proof.canonicalInvoice &&
    proof.consent &&
    !proof.refunded &&
    !proof.disputed &&
    proof.paidThrough > now;
  return {
    ...structuredClone(p),
    restricted: !good,
    verifiedAt: good ? proof.readStartedAt : null,
    // A successful cache read/local proof never slides this deadline.
    validUntil: good
      ? Math.min(proof.readStartedAt + maxFinancialAge, proof.paidThrough)
      : 0,
    paidThrough: good ? proof.paidThrough : 0,
  };
}
export function referenceAccess(
  p: ReferenceProjection,
  now: number,
  expectedRevision: number,
) {
  return {
    entitlement_authority: false as const,
    wouldAllow:
      !p.restricted &&
      !p.adminSuspended &&
      !p.quarantined &&
      p.revision === expectedRevision &&
      p.verifiedAt !== null &&
      now >= p.verifiedAt &&
      now < p.validUntil &&
      now < p.paidThrough,
  };
}
/** The supplied persist callback models ONE atomic inbox+revision+projection
 * commit. Never return 2xx before that succeeds. A real durable outbox and retry
 * consumer must survive process death; this model is not their implementation. */
export async function acceptReferenceEvent(
  p: ReferenceProjection,
  binding: ReferenceBinding,
  event: VerifiedFixtureEvent,
  persist: (next: ReferenceProjection) => Promise<void>,
) {
  const next = receiveReferenceEvent(p, binding, event);
  await persist(next);
  return { acknowledge: true, projection: next };
}
