import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import dns from "node:dns/promises";
import https from "node:https";
import {
  admitAiConnection,
  sealAdmittedAiConnection,
  aiCredentialFingerprint,
} from "../../packages/admission/ai-connection";
import {
  generate,
  secureTransport,
  connectionInput,
  type Connection,
} from "../../packages/workspace/provider";
test("connection intent forwards only private fingerprint and exact provider/model/endpoint, never key or caller authority", async () => {
  const id = crypto.randomUUID(),
    key = "SYNTHETIC_NOT_A_CREDENTIAL",
    value = {
      admission_id: id,
      provider: "OPENAI",
      model: "synthetic-model",
      endpoint_id: "",
      key,
      endpoint_sha256: "a".repeat(64),
    };
  const receipt = await admitAiConnection(value, async (input) => {
    assert.equal(input.fingerprint, aiCredentialFingerprint(id, key));
    assert.ok(!JSON.stringify(input).includes(key));
    assert.deepEqual(
      Object.keys(input).sort(),
      [
        "connection_id",
        "endpoint_id",
        "endpoint_sha256",
        "fingerprint",
        "model",
        "provider",
      ].sort(),
    );
    return { connection_id: id, state: "REVIEW_REQUIRED" };
  });
  assert.equal(receipt.state, "REVIEW_REQUIRED");
  assert.notEqual(
    aiCredentialFingerprint(crypto.randomUUID(), key),
    receipt.fingerprint,
  );
  for (const state of ["BLOCKED", "REVIEW_REQUIRED", "ELIGIBLE"] as const)
    assert.equal(
      (
        await admitAiConnection(value, async () => ({
          connection_id: id,
          state,
        }))
      ).state,
      state,
    );
  await assert.rejects(
    admitAiConnection(value, async () => ({
      connection_id: crypto.randomUUID(),
      state: "ELIGIBLE",
    })),
  );
  await assert.rejects(
    admitAiConnection(value, async () => ({
      connection_id: id,
      state: "ELIGIBLE",
      provider_evidence: "forged",
    })),
  );
  assert.throws(() =>
    connectionInput.parse({
      ...value,
      customer_billed_acknowledged: true,
      org_id: crypto.randomUUID(),
    }),
  );
});
test("missing or denied admission stops before key decryption, DNS and provider transport", async () => {
  const enabled = process.env.KXRA_AI_ENABLED,
    vault = process.env.KXRA_MODEL_VAULT_KEY;
  process.env.KXRA_AI_ENABLED = "true";
  delete process.env.KXRA_MODEL_VAULT_KEY;
  const c: Connection = {
    id: crypto.randomUUID(),
    org_id: crypto.randomUUID(),
    provider: "OPENAI",
    model: "synthetic-model",
    endpoint_id: "",
    encrypted_key: "not-even-a-ciphertext",
  };
  let calls = 0;
  try {
    await assert.rejects(
      generate(c, "system", "context"),
      /^Error: AI_ADMISSION_REQUIRED$/,
    );
    await assert.rejects(
      generate(
        c,
        "system",
        "context",
        async () => {
          calls++;
          return {};
        },
        async (target) => {
          assert.equal(
            target.href,
            "https://api.openai.com/v1/chat/completions",
          );
          throw Error("AI_ADMISSION_REQUIRED");
        },
      ),
      /^Error: AI_ADMISSION_REQUIRED$/,
    );
    await assert.rejects(
      secureTransport(new URL("https://must-not-resolve.invalid"), {}, {}),
      /^Error: AI_ADMISSION_REQUIRED$/,
    );
    await assert.rejects(
      secureTransport(
        new URL("https://must-not-resolve.invalid"),
        {},
        {},
        async () => {
          throw Error("AI_ADMISSION_REQUIRED");
        },
      ),
      /^Error: AI_ADMISSION_REQUIRED$/,
    );
    assert.equal(calls, 0);
  } finally {
    if (enabled === undefined) delete process.env.KXRA_AI_ENABLED;
    else process.env.KXRA_AI_ENABLED = enabled;
    if (vault === undefined) delete process.env.KXRA_MODEL_VAULT_KEY;
    else process.env.KXRA_MODEL_VAULT_KEY = vault;
  }
});

test("pending/blocked/malformed/missing admission never reaches the vault, while exact clearance seals once", async () => {
  const input = {
    admission_id: crypto.randomUUID(),
    provider: "OPENAI",
    model: "synthetic-model",
    endpoint_id: "",
    key: "SYNTHETIC_ONLY",
    endpoint_sha256: "a".repeat(64),
  };
  let seals = 0;
  for (const state of ["BLOCKED", "REVIEW_REQUIRED"] as const)
    await assert.rejects(
      sealAdmittedAiConnection(
        input,
        "own-tenant",
        async (r) => ({ connection_id: r.connection_id, state }),
        () => {
          seals++;
          return "fake";
        },
      ),
    );
  await assert.rejects(
    sealAdmittedAiConnection(
      input,
      "own-tenant",
      async () => {
        throw Error("undefined_function");
      },
      () => {
        seals++;
        return "fake";
      },
    ),
  );
  assert.equal(seals, 0);
  const result = await sealAdmittedAiConnection(
    input,
    "own-tenant",
    async (r) => ({ connection_id: r.connection_id, state: "ELIGIBLE" }),
    (key, scope) => {
      seals++;
      assert.equal(key, input.key);
      assert.equal(scope, `own-tenant:${input.admission_id}`);
      return "synthetic-envelope";
    },
  );
  assert.equal(seals, 1);
  assert.equal(result.encrypted, "synthetic-envelope");
});
test("withdrawal during DNS lookup is checked again before a provider socket can open", async () => {
  const enabled = process.env.KXRA_AI_ENABLED,
    lookup = dns.lookup,
    request = https.request;
  process.env.KXRA_AI_ENABLED = "true";
  let gates = 0,
    lookups = 0,
    sockets = 0;
  try {
    dns.lookup = (async () => {
      lookups++;
      return [{ address: "93.184.216.34", family: 4 }];
    }) as unknown as typeof dns.lookup;
    https.request = (() => {
      sockets++;
      throw Error("Provider socket forbidden");
    }) as typeof https.request;
    await assert.rejects(
      secureTransport(
        new URL("https://synthetic.invalid"),
        {},
        {},
        async () => {
          if (++gates === 2) throw Error("AI_ADMISSION_REQUIRED");
        },
      ),
      /^Error: AI_ADMISSION_REQUIRED$/,
    );
    assert.equal(gates, 2);
    assert.equal(lookups, 1);
    assert.equal(sockets, 0);
  } finally {
    dns.lookup = lookup;
    https.request = request;
    if (enabled === undefined) delete process.env.KXRA_AI_ENABLED;
    else process.env.KXRA_AI_ENABLED = enabled;
  }
});
