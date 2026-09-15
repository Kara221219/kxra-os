import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FakeAuthProvider } from "../packages/authz/fake-provider";
import {
  joinIntentCookie,
  openJoinIntent,
  sealJoinIntent,
} from "../packages/authz/join-intent";
import {
  emailTemplateKeys,
  FakeEmailTransport,
  renderEmail,
} from "../packages/integrations/email";

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporary
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

async function directory() {
  const value = await fs.mkdtemp(
    path.join(os.tmpdir(), "kxra-account-contract-"),
  );
  temporary.push(value);
  return value;
}

test("AT-19 fake Auth keeps passwords and one-use provider tokens outside KXRA data", async () => {
  const root = await directory();
  const stateFile = path.join(root, "auth.json");
  const provider = new FakeAuthProvider(stateFile);
  const email = "account-contract@fixture.invalid";
  const password = "FirstSyntheticPass123";
  await assert.rejects(
    () => provider.registerInvited(email, "short"),
    /PASSWORD_POLICY/,
  );
  const created = await provider.registerInvited(email, password);
  assert.equal(created.identity.emailVerified, false);
  assert.ok(created.verification);
  assert.equal(
    (await provider.signIn(email, password)).id,
    created.identity.id,
  );
  await assert.rejects(
    () => provider.signIn(email, "WrongSyntheticPass123"),
    /SIGN_IN_UNAVAILABLE/,
  );

  const serialized = await fs.readFile(stateFile, "utf8");
  assert.equal(serialized.includes(password), false);
  assert.equal(serialized.includes(created.verification!.token), false);
  await assert.rejects(
    () => provider.verifyEmail("wrong-token"),
    /VERIFICATION_UNAVAILABLE/,
  );
  const verified = await provider.verifyEmail(created.verification!.token);
  assert.equal(verified.emailVerified, true);
  await assert.rejects(
    () => provider.verifyEmail(created.verification!.token),
    /VERIFICATION_UNAVAILABLE/,
  );

  await provider.beginMfaEnrollment(verified.id);
  await assert.rejects(
    () => provider.completeMfaEnrollment(verified.id, "wrong"),
    /MFA_PROOF_UNAVAILABLE/,
  );
  const enrolled = await provider.completeMfaEnrollment(
    verified.id,
    "KXRA-LOCAL-MFA",
  );
  assert.equal(enrolled.mfaState, "ENROLLED");
  assert.equal(
    (await provider.challengeMfa(verified.id, "KXRA-LOCAL-MFA")).aal,
    "aal2",
  );
  assert.equal(
    (await provider.beginMfaRecovery(verified.id)).mfaState,
    "RECOVERY_REQUIRED",
  );
  await assert.rejects(
    () => provider.recoverMfa(verified.id, "wrong"),
    /MFA_PROOF_UNAVAILABLE/,
  );
  assert.equal(
    (await provider.recoverMfa(verified.id, "KXRA-LOCAL-RECOVERY")).mfaState,
    "ENROLLED",
  );
  const oldProviderVersion = enrolled.providerSessionVersion;
  assert.equal(await provider.signOutAll(verified.id), oldProviderVersion + 1);

  const changed = await provider.changePassword(
    verified.id,
    password,
    "SecondSyntheticPass456",
  );
  assert.equal(changed.providerSessionVersion, oldProviderVersion + 2);
  await assert.rejects(
    () => provider.signIn(email, password),
    /SIGN_IN_UNAVAILABLE/,
  );
  assert.equal(
    (await provider.signIn(email, "SecondSyntheticPass456"))
      .providerSessionVersion,
    oldProviderVersion + 2,
  );
});

test("AT-19 join intent is encrypted, bounded, tamper-evident and named consistently", () => {
  assert.equal(joinIntentCookie, "kxra_join_intent");
  const now = Date.now();
  const secret = "j".repeat(64);
  const input = {
    invitationId: "11111111-1111-4111-8111-111111111111",
    invitationVersion: 3,
    tokenDigest: "a".repeat(64),
    email: "invited@fixture.invalid",
    recipientHint: "i***@fixture.invalid",
    invitationExpiresAt: new Date(now + 3_600_000).toISOString(),
  };
  const sealed = sealJoinIntent(input, secret, now);
  assert.equal(sealed.includes(input.email), false);
  assert.equal(sealed.includes(input.tokenDigest), false);
  assert.deepEqual(openJoinIntent(sealed, secret, now + 1_000), {
    ...input,
    issuedAt: now,
    expiresAt: now + 30 * 60_000,
  });
  assert.equal(openJoinIntent(sealed + "x", secret, now + 1_000), null);
  assert.equal(openJoinIntent(sealed, "x".repeat(64), now + 1_000), null);
  assert.equal(openJoinIntent(sealed, secret, now + 30 * 60_000 + 1), null);
});

test("AT-19/21 fake email renders every required template and preserves delivery outcomes", async () => {
  const root = await directory();
  const transport = new FakeEmailTransport(path.join(root, "email.json"));
  for (const template of emailTemplateKeys) {
    const rendered = renderEmail({
      template,
      recipientHint: "p***@fixture.invalid",
      projectNames: ["PROJECT-002 · Synthetic project"],
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      actionUrl: "http://127.0.0.1:3210/synthetic-action",
      accountState: "SUSPENDED",
    });
    assert.equal(rendered.version, 1);
    assert.ok(rendered.subject.length > 4);
    assert.match(rendered.text, /contains no project document content/);
    assert.match(rendered.html, /KXRA/);
  }
  const rendered = renderEmail({
    template: "SECURITY_ALERT",
    recipientHint: "p***@fixture.invalid",
  });
  const failed = await transport.deliver({
    operationKey: "synthetic-security-alert",
    recipient: "partner@fixture.invalid",
    rendered,
    outcome: "temporary-failure",
  });
  assert.equal(failed.state, "DELIVERY_FAILED");
  const retried = await transport.deliver({
    operationKey: "synthetic-security-alert",
    recipient: "partner@fixture.invalid",
    rendered,
  });
  assert.equal(retried.state, "SENT");
  assert.equal(retried.attempts, 2);
  const duplicate = await transport.deliver({
    operationKey: "synthetic-security-alert",
    recipient: "partner@fixture.invalid",
    rendered,
  });
  assert.equal(duplicate.attempts, 2);
  assert.equal(
    (await transport.cancel("synthetic-security-alert"))?.state,
    "SENT",
  );
  const cancellable = await transport.deliver({
    operationKey: "synthetic-cancelled-alert",
    recipient: "partner@fixture.invalid",
    rendered,
    outcome: "temporary-failure",
  });
  assert.equal(cancellable.state, "DELIVERY_FAILED");
  assert.equal(
    (await transport.cancel("synthetic-cancelled-alert"))?.state,
    "CANCELLED",
  );
});
