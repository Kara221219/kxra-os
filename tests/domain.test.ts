import { test } from "node:test";
import assert from "node:assert/strict";
import {
  moneyUnits,
  formatMoney,
  sumFinance,
  recordInput,
} from "../packages/domain";
import {
  signSession,
  verifySession,
  fixtureUsers,
} from "../packages/authz/session";
import { verifyWebhook } from "../packages/integrations/whatsapp";
import { localMode } from "../packages/db";
import crypto from "node:crypto";
test("money uses exact arithmetic and separates actual, paper and currencies", () => {
  assert.equal(formatMoney(moneyUnits("0.1") + moneyUnits("0.2")), "0.3000");
  assert.deepEqual(
    sumFinance([
      {
        data: {
          amount: "2.3001",
          currency: "GBP",
          entry_type: "actual",
          direction: "income",
        },
      },
      {
        data: {
          amount: "0.1001",
          currency: "GBP",
          entry_type: "actual",
          direction: "expense",
        },
      },
      {
        data: {
          amount: "9999",
          currency: "GBP",
          entry_type: "paper",
          direction: "income",
        },
      },
      {
        data: {
          amount: "5",
          currency: "USD",
          entry_type: "actual",
          direction: "income",
        },
      },
    ]),
    { GBP: "2.2000", USD: "5.0000" },
  );
  assert.throws(() => moneyUnits("1e9"));
});
test("request identity cannot be injected into record schema", () => {
  assert.equal(
    recordInput.safeParse({
      kind: "note",
      title: "test",
      classification: "FACT",
      user_id: "owner",
    }).success,
    false,
  );
});
test("local sessions are signed, expiring and reject tampering", () => {
  const key = "x".repeat(64),
    token = signSession(fixtureUsers.partner, key);
  assert.equal(verifySession(token, key), fixtureUsers.partner);
  assert.equal(verifySession(token + "x", key), null);
  assert.equal(verifySession(token, "y".repeat(64)), null);
  assert.equal(verifySession(token, key, Date.now() + 8 * 3600_000 + 1), null);
});
test("AT-03 fixture mode rejects hosted, production, non-loopback and weak-secret mixes", () => {
  const valid: NodeJS.ProcessEnv = {
    KXRA_AUTH_MODE: "fixture",
    KXRA_ORIGIN: "http://127.0.0.1:3210",
    KXRA_RUNTIME: "/synthetic/runtime",
    KXRA_LOCAL_SECRET: "x".repeat(64),
    NODE_ENV: "development",
  };
  assert.equal(localMode(valid), true);
  for (const changed of [
    { NODE_ENV: "production" },
    { VERCEL: "1" },
    { KXRA_ORIGIN: "http://localhost:3210" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://fixture.supabase.invalid" },
    { DATABASE_URL: "postgresql://fixture.invalid/db" },
    { KXRA_RUNTIME: "" },
    { KXRA_LOCAL_SECRET: "short" },
    { KXRA_LOCAL_SECRET: "" },
  ] as Partial<NodeJS.ProcessEnv>[])
    assert.equal(localMode({ ...valid, ...changed }), false);
});
test("WhatsApp signature validates raw bytes and rejects altered payload", () => {
  const raw = Buffer.from('{"test":true}'),
    secret = "synthetic-test-secret";
  const sig =
    "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
  assert.equal(verifyWebhook(raw, sig, secret), true);
  assert.equal(verifyWebhook(Buffer.from("{}"), sig, secret), false);
  assert.equal(verifyWebhook(raw, null, secret), false);
});
import {
  scoreVenture,
  weights,
  type Assessment,
} from "../packages/domain/scoring";
test("missing scores remain unknown with explicit bounds; confidence is not probability", () => {
  assert.deepEqual(scoreVenture({}), {
    formula_version: "genesis-1",
    score: null,
    lower_bound: 0,
    upper_bound: 100,
    coverage: 0,
    confidence_score: null,
  });
  const one = {
    rating: 5,
    evidence_ids: ["40000000-0000-4000-8000-000000000001"],
    rationale: "Synthetic formula test",
    confidence: { quality: 1, independence: 0.5, recency: 1, directness: 1 },
  };
  assert.equal(
    scoreVenture({ customer_problem: one }, true).confidence_score,
    7.5,
  );
  assert.equal(scoreVenture({ customer_problem: one }).score, null);
  const all = Object.fromEntries(
    Object.keys(weights).map((k) => [k, one]),
  ) as Assessment;
  assert.equal(scoreVenture(all, true).score, 100);
  assert.equal(scoreVenture(all, true).confidence_score, 50);
  assert.throws(() =>
    scoreVenture({ customer_problem: { ...one, evidence_ids: [] } }),
  );
});
