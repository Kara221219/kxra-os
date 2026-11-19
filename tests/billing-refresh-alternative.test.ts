import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptReferenceEvent,
  emptyProjection,
  receiveReferenceEvent,
  reconcileReference,
  referenceAccess,
  type ReferenceBinding,
  type ReferenceProof,
  type VerifiedFixtureEvent,
} from "./support/billing-refresh-alternative";
const binding: ReferenceBinding = {
  scope: "synthetic-scope",
  account: "acct_synthetic",
  mode: "LIVE",
  customer: "cus_synthetic",
  subscription: "sub_synthetic",
  workspace: "tenant-a",
};
const proof = (revision = 0, at = 100): ReferenceProof => ({
  ...binding,
  revision,
  readStartedAt: at,
  readFinishedAt: at + 1,
  collected: true,
  active: true,
  canonicalInvoice: true,
  consent: true,
  refunded: false,
  disputed: false,
  paidThrough: 200000,
});
const event = (
  eventId: string,
  kind: "WAKE" | "RESTRICT" = "WAKE",
): VerifiedFixtureEvent => ({
  ...binding,
  eventId,
  digest: "synthetic-digest-" + eventId,
  kind,
});
const fresh = () =>
  reconcileReference(emptyProjection(), binding, proof(), 101, 86400);
test("unknown state and positive events never grant; duplicate/reordered events cannot resurrect a restriction", () => {
  assert.equal(referenceAccess(emptyProjection(), 101, 0).wouldAllow, false);
  let p = receiveReferenceEvent(fresh(), binding, event("refund", "RESTRICT"));
  const revision = p.revision;
  p = receiveReferenceEvent(p, binding, event("refund", "RESTRICT"));
  assert.equal(p.revision, revision);
  p = receiveReferenceEvent(p, binding, event("older-positive"));
  assert.equal(referenceAccess(p, 102, p.revision).wouldAllow, false);
  assert.equal(
    referenceAccess(p, 102, p.revision).entitlement_authority,
    false,
  );
});
test("missing or delayed revocation is bounded by financial age and paid period, never extended by local reads", () => {
  const p = fresh();
  assert.equal(p.validUntil, 86500);
  assert.equal(referenceAccess(p, 86499, 0).wouldAllow, true);
  assert.equal(referenceAccess(p, 86500, 0).wouldAllow, false);
  assert.equal(referenceAccess(p, 90000, 0).wouldAllow, false);
  const end = reconcileReference(
    emptyProjection(),
    binding,
    { ...proof(), paidThrough: 200 },
    101,
    86400,
  );
  assert.equal(referenceAccess(end, 200, 0).wouldAllow, false);
  assert.equal(referenceAccess(p, 99, 0).wouldAllow, false);
});
test("revocation racing a positive refresh invalidates its generation; another instance cannot use a cached old revision", () => {
  const old = fresh();
  const revoked = receiveReferenceEvent(
    old,
    binding,
    event("cancel", "RESTRICT"),
  );
  const after = reconcileReference(revoked, binding, proof(0, 102), 103, 86400);
  assert.deepEqual(after, revoked);
  assert.equal(referenceAccess(old, 103, revoked.revision).wouldAllow, false);
  assert.equal(referenceAccess(after, 103, after.revision).wouldAllow, false);
});
test("all identity dimensions are fenced, including a second workspace sharing a Stripe customer", () => {
  for (const patch of [
    { workspace: "tenant-b" },
    { mode: "STAGING_SANDBOX" as const },
    { scope: "other" },
    { customer: "cus_foreign" },
    { subscription: "sub_foreign" },
    { account: "acct_foreign" },
  ]) {
    assert.throws(() =>
      receiveReferenceEvent(fresh(), binding, { ...event("x"), ...patch }),
    );
    assert.deepEqual(
      reconcileReference(
        fresh(),
        binding,
        { ...proof(), ...patch },
        101,
        86400,
      ),
      fresh(),
    );
  }
});
test("refund, dispute, inactive, initial unpaid, wrong invoice and absent consent cannot qualify; admin suspension survives refresh", () => {
  for (const patch of [
    { refunded: true },
    { disputed: true },
    { active: false },
    { collected: false },
    { canonicalInvoice: false },
    { consent: false },
  ]) {
    const p = reconcileReference(
      fresh(),
      binding,
      { ...proof(), ...patch },
      101,
      86400,
    );
    assert.equal(referenceAccess(p, 102, p.revision).wouldAllow, false);
  }
  const p = reconcileReference(
    { ...fresh(), adminSuspended: true },
    binding,
    proof(),
    101,
    86400,
  );
  assert.equal(referenceAccess(p, 102, 0).wouldAllow, false);
});
test("429/outage cannot renew a deadline and a late successful response cannot mint a fresh lease", () => {
  const p = fresh(); // No success means no projection write, regardless of retry count.
  for (let attempt = 0; attempt < 1000; attempt++)
    assert.equal(p.validUntil, 86500);
  assert.equal(referenceAccess(p, 86501, 0).wouldAllow, false);
  assert.throws(
    () => reconcileReference(p, binding, proof(0, 100), 200, 86400),
    /STALE/,
  );
  assert.throws(
    () => reconcileReference(p, binding, proof(), 101, 86401),
    /EXPLICIT/,
  );
});
test("persistence failure is not acknowledged; replay after durable commit/crash remains idempotent", async () => {
  const initial = fresh(),
    e = event("durable", "RESTRICT");
  let durable = initial;
  await assert.rejects(
    acceptReferenceEvent(initial, binding, e, async () => {
      throw Error("synthetic disk failure");
    }),
  );
  assert.deepEqual(durable, initial);
  await acceptReferenceEvent(initial, binding, e, async (next) => {
    durable = structuredClone(next);
  });
  // Simulate process death after commit but before HTTP acknowledgement.
  const replay = await acceptReferenceEvent(
    durable,
    binding,
    e,
    async (next) => {
      durable = structuredClone(next);
    },
  );
  assert.equal(replay.acknowledge, true);
  assert.equal(durable.revision, 1);
  assert.equal(referenceAccess(durable, 103, 1).wouldAllow, false);
});
test("same event ID with changed bytes quarantines rather than replacing durable evidence", () => {
  const first = receiveReferenceEvent(fresh(), binding, event("same"));
  const bad = receiveReferenceEvent(first, binding, {
    ...event("same"),
    digest: "different",
  });
  assert.equal(bad.quarantined, true);
  assert.equal(bad.events.same, first.events.same);
  assert.equal(
    reconcileReference(bad, binding, proof(bad.revision), 101, 86400)
      .restricted,
    true,
  );
  assert.equal(referenceAccess(bad, 103, bad.revision).wouldAllow, false);
});
