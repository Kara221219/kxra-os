import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  verifiedHostedSessionAttestation,
  resolveVerifiedSupabasePrincipal,
} from "../packages/authz/hosted-session-attestation";
import {
  syntheticSessionClaims,
  syntheticVerifiedSession,
} from "./support/synthetic-session-attestation";
test("Verified session extraction requires both original version and provider session ID; metadata is ignored", () => {
  const session = crypto.randomUUID();
  assert.deepEqual(
    verifiedHostedSessionAttestation({
      session_id: session,
      kxra_session_version: 2,
    }),
    { provider_session_id: session, provider_session_version: 2 },
  );
  for (const session_id of [undefined, "", {}, "process.env", 2])
    assert.deepEqual(
      verifiedHostedSessionAttestation({ session_id, kxra_session_version: 2 }),
      {},
    );
  assert.deepEqual(
    verifiedHostedSessionAttestation({
      session_id: session,
      user_metadata: { kxra_session_version: 2 },
      app_metadata: { kxra_session_version: 2 },
    }),
    {},
  );
});
test("The actual Supabase SDK verifies a synthetic signed token before principal/session extraction", async () => {
  const user = crypto.randomUUID(),
    session = crypto.randomUUID(),
    claims = syntheticSessionClaims(user, session, 7),
    issuer = syntheticVerifiedSession(claims);
  const p = await issuer.principal();
  assert.equal(p?.id, user);
  assert.equal(p?.provider_session_version, 7);
  assert.equal(p?.provider_session_id, session);
  assert.equal(
    await issuer.alteredPrincipal({ ...claims, kxra_session_version: 8 }),
    null,
  );
  assert.equal(await issuer.mismatchedPrincipal(), null);
});
test("Missing attestation does not fabricate a version or turn an invalid identity into a principal", async () => {
  const p = await syntheticVerifiedSession(
    syntheticSessionClaims(crypto.randomUUID(), crypto.randomUUID()),
  ).principal();
  assert.equal(p?.source, "supabase");
  assert.equal(p?.provider_session_version, undefined);
  assert.equal(p?.provider_session_id, undefined);
  assert.equal(
    await resolveVerifiedSupabasePrincipal({
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
        getClaims: async () => {
          throw Error("must not run");
        },
      },
    }),
    null,
  );
});
