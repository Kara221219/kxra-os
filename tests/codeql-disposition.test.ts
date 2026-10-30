import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FakeAuthProvider } from "../packages/authz/fake-provider";
import {
  operatorRequestId,
  pollOperatorStatus,
} from "../scripts/operator-generation-status";

test("token-digest evidence: actual passwords use independently salted scrypt; random tokens stay hashed, rotate, expire and consume once", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "kxra-token-evidence-"),
  );
  const filename = path.join(directory, "synthetic-auth.json");
  try {
    const provider = new FakeAuthProvider(filename);
    const email = "token-evidence@fixture.invalid";
    const password = "SyntheticOnlyPassword481";
    const nextPassword = "SyntheticOnlyPassword592";
    const created = await provider.registerInvited(email, password);
    const second = await provider.registerInvited(
      "second@fixture.invalid",
      password,
    );
    const verification = created.verification!;
    assert.equal(Buffer.from(verification.token, "base64url").length, 32);
    assert.match(verification.token, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(verification.token, second.verification!.token);
    const stored = JSON.parse(await fs.readFile(filename, "utf8"));
    const user = stored.users[email];
    assert.match(user.passwordSalt, /^[a-f0-9]{32}$/);
    assert.equal(
      user.passwordHash,
      crypto.scryptSync(password, user.passwordSalt, 64).toString("hex"),
    );
    assert.notEqual(
      user.passwordHash,
      crypto.createHash("sha256").update(password).digest("hex"),
    );
    assert.notEqual(
      user.passwordSalt,
      stored.users["second@fixture.invalid"].passwordSalt,
    );
    assert.notEqual(
      user.passwordHash,
      stored.users["second@fixture.invalid"].passwordHash,
    );
    assert.equal(
      user.verificationDigest,
      crypto.createHash("sha256").update(verification.token).digest("hex"),
    );
    assert.equal(JSON.stringify(stored).includes(verification.token), false);
    assert.equal(JSON.stringify(stored).includes(password), false);
    await provider.verifyEmail(verification.token);
    await assert.rejects(
      provider.verifyEmail(verification.token),
      /VERIFICATION_UNAVAILABLE/,
    );

    const oldReset = (await provider.requestPasswordReset(email))!;
    const reset = (await provider.requestPasswordReset(email))!;
    assert.equal(Buffer.from(reset.token, "base64url").length, 32);
    assert.notEqual(reset.token, oldReset.token);
    await assert.rejects(
      provider.resetPassword(oldReset.token, nextPassword),
      /RESET_UNAVAILABLE/,
    );
    const resetState = JSON.parse(await fs.readFile(filename, "utf8"));
    assert.equal(
      resetState.users[email].resetDigest,
      crypto.createHash("sha256").update(reset.token).digest("hex"),
    );
    assert.equal(JSON.stringify(resetState).includes(reset.token), false);
    const outcomes = await Promise.allSettled([
      provider.resetPassword(reset.token, nextPassword),
      provider.resetPassword(reset.token, nextPassword),
    ]);
    assert.equal(
      outcomes.filter((outcome) => outcome.status === "fulfilled").length,
      1,
    );
    assert.equal(
      outcomes.filter((outcome) => outcome.status === "rejected").length,
      1,
    );
    await assert.rejects(
      provider.signIn(email, password),
      /SIGN_IN_UNAVAILABLE/,
    );
    assert.equal(
      (await provider.signIn(email, nextPassword)).providerSessionVersion,
      created.identity.providerSessionVersion + 1,
    );
    const expired = (await provider.requestPasswordReset(email))!;
    const expiredState = JSON.parse(await fs.readFile(filename, "utf8"));
    expiredState.users[email].resetExpiresAt = new Date(
      Date.now() - 1000,
    ).toISOString();
    await fs.writeFile(filename, JSON.stringify(expiredState));
    await assert.rejects(
      provider.resetPassword(expired.token, password),
      /RESET_UNAVAILABLE/,
    );
    await provider.signIn(email, nextPassword);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("file-to-HTTP evidence: only a bounded job identifier reaches the fixed provider origin with redirects forbidden", async () => {
  const id = "synthetic_job-123";
  const result = await pollOperatorStatus(
    id,
    "SYNTHETIC_OPERATOR_CREDENTIAL",
    async (input, init) => {
      const url = new URL(String(input));
      assert.equal(url.origin, "https://api.higgsfield.ai");
      assert.equal(url.pathname, `/requests/${id}/status`);
      assert.equal(url.search, "");
      assert.equal(init?.redirect, "error");
      assert.equal(init?.body, undefined);
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        "Key SYNTHETIC_OPERATOR_CREDENTIAL",
      );
      return Response.json({
        status: "completed",
        request_id: id,
        video: { url: "https://video.example/clip.mp4" },
        unrelated: "not persisted",
      });
    },
  );
  assert.deepEqual(result, {
    status: "completed",
    videoUrl: "https://video.example/clip.mp4",
  });
});

test("corrupt ledger IDs cannot select a path, URL, query, credential destination or unbounded request", async () => {
  let calls = 0;
  const transport: typeof fetch = async () => {
    calls++;
    throw Error("MUST_NOT_CONNECT");
  };
  for (const id of [
    undefined,
    null,
    {},
    "",
    ".",
    "..",
    "../billing",
    "x/y",
    "x?token=secret",
    "x#fragment",
    "https://other.example",
    "%2e%2e",
    "a".repeat(129),
  ]) {
    assert.throws(
      () => operatorRequestId(id),
      /REQUEST_ID_INVALID_REQUIRES_REVIEW/,
    );
    await assert.rejects(
      pollOperatorStatus(id, "SYNTHETIC", transport),
      /REQUEST_ID_INVALID_REQUIRES_REVIEW/,
    );
  }
  await assert.rejects(
    pollOperatorStatus("synthetic", "", transport),
    /CREDENTIAL_REQUIRED/,
  );
  assert.equal(calls, 0);
});

test("provider status rejects redirect responses, mismatched jobs and malformed/unbounded fields", async () => {
  await assert.rejects(
    pollOperatorStatus(
      "synthetic",
      "SYNTHETIC",
      async () => new Response("SYNTHETIC_PRIVATE_RESPONSE_CONTENT"),
    ),
    { message: "STATUS_RESPONSE_INVALID" },
  );
  const invalid = [
    null,
    [],
    { status: "unexpected" },
    { status: "completed", request_id: "other-job" },
    { status: "completed", video: { url: 123 } },
    { status: "completed", video: { url: "x".repeat(8193) } },
  ];
  for (const body of invalid)
    await assert.rejects(
      pollOperatorStatus("synthetic", "SYNTHETIC", async () =>
        Response.json(body),
      ),
      /STATUS_RESPONSE_INVALID/,
    );
  await assert.rejects(
    pollOperatorStatus(
      "synthetic",
      "SYNTHETIC",
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://other.example" },
        }),
    ),
    /STATUS_RESPONSE_INVALID/,
  );
  const redirected = Response.json({ status: "queued" });
  Object.defineProperty(redirected, "redirected", { value: true });
  await assert.rejects(
    pollOperatorStatus("synthetic", "SYNTHETIC", async () => redirected),
    /STATUS_RESPONSE_INVALID/,
  );
});

test("status response byte limits are enforced before buffering, including dishonest missing lengths", async () => {
  await assert.rejects(
    pollOperatorStatus(
      "synthetic",
      "SYNTHETIC",
      async () =>
        new Response("not read", { headers: { "content-length": "65537" } }),
    ),
    /STATUS_RESPONSE_TOO_LARGE/,
  );
  let cancelled = false;
  const stream = new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array(32_769));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(
    pollOperatorStatus(
      "synthetic",
      "SYNTHETIC",
      async () => new Response(stream),
    ),
    /STATUS_RESPONSE_TOO_LARGE/,
  );
  assert.equal(cancelled, true);
});
