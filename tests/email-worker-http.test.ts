import assert from "node:assert/strict";
import { test } from "node:test";
import {
  authorizeWorkerRequest,
  validWorkerTriggerSecret,
} from "../packages/integrations/worker-auth";
import { POST } from "../apps/email-worker/app/api/process/route";

const secret = "w".repeat(72);

test("email worker trigger authorization is exact and timing-safe", () => {
  assert.equal(validWorkerTriggerSecret(secret), true);
  assert.equal(validWorkerTriggerSecret("short"), false);
  assert.equal(
    authorizeWorkerRequest(
      new Request("https://worker.example/api/process", {
        method: "POST",
        headers: { authorization: `Bearer ${secret}` },
      }),
      secret,
    ),
    true,
  );
  assert.equal(
    authorizeWorkerRequest(
      new Request("https://worker.example/api/process", {
        method: "POST",
        headers: { authorization: `Bearer ${"x".repeat(72)}` },
      }),
      secret,
    ),
    false,
  );
});

test("hosted email worker rejects anonymous, malformed and body-bearing requests", async () => {
  process.env.KXRA_EMAIL_WORKER_TRIGGER_SECRET = secret;
  assert.equal(
    (
      await POST(
        new Request("https://worker.example/api/process", { method: "POST" }),
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await POST(
        new Request("https://worker.example/api/process", {
          method: "POST",
          headers: { authorization: "Bearer malformed" },
        }),
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await POST(
        new Request("https://worker.example/api/process", {
          method: "POST",
          headers: { authorization: `Bearer ${secret}` },
          body: "authority must not enter through payload",
        }),
      )
    ).status,
    400,
  );
});
