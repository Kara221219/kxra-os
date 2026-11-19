import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { pairedSetupHttp } from "../packages/workspace/paired-setup-http";
import {
  PairedSetupStore,
  pairedSetupCommand,
  pairedSetupReceipt,
} from "../packages/workspace/paired-setup";
const actor = () => ({
  id: crypto.randomUUID(),
  organisation_id: crypto.randomUUID(),
  aal: "aal2" as const,
  auth_time: 1,
  session_version: 1,
  source: "supabase" as const,
});
const origin = "http://127.0.0.1:39881";
const request = (body: unknown) =>
  new Request(origin + "/api/paired-setup", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
test("setup and HTTP default off before identity or pool discovery", async () => {
  let connections = 0;
  const pool = {
    async connect(): Promise<never> {
      connections++;
      throw Error("unexpected");
    },
  };
  await assert.rejects(
    new PairedSetupStore(pool, actor()).command({}),
    /DISABLED/,
  );
  assert.equal(connections, 0);
  assert.equal((await pairedSetupHttp(request({}))).status, 503);
});
test("body identities, token grants and activation are not setup commands", () => {
  const good = {
    action: "REQUEST",
    request_id: crypto.randomUUID(),
    room_id: crypto.randomUUID(),
    ai_intent_id: crypto.randomUUID(),
    auth_route: "CUSTOMER_API_KEY",
    label: "Private agent",
  };
  assert.equal(pairedSetupCommand.safeParse(good).success, true);
  for (const bad of [
    { ...good, account_id: crypto.randomUUID() },
    { ...good, role: "ORG_ADMIN" },
    { ...good, token: "PAIRED_DEVICE" },
    { ...good, activate: true },
    { ...good, auth_route: "UNKNOWN" },
  ])
    assert.equal(pairedSetupCommand.safeParse(bad).success, false);
  assert.equal(
    pairedSetupReceipt.safeParse({
      activation_allowed: true,
      credential_issued: true,
    }).success,
    false,
  );
});
test("HTTP rejects unverified purpose and oversized bodies before store construction", async () => {
  let stores = 0;
  const ports = {
    enabled: true,
    origin,
    verifyIdentity: async () => ({ ...actor(), source: "fixture" as const }),
    store: () => {
      stores++;
      throw Error("unexpected");
    },
  };
  assert.equal((await pairedSetupHttp(request({}), ports)).status, 401);
  const verified = { ...ports, verifyIdentity: async () => actor() };
  assert.equal(
    (await pairedSetupHttp(request({ data: "x".repeat(9000) }), verified))
      .status,
    413,
  );
  assert.equal(
    (await pairedSetupHttp(request({ account_id: actor().id }), verified))
      .status,
    400,
  );
  assert.equal(stores, 0);
});
test("setup store does not accept paired/fixture identities as customer sessions", () => {
  const pool = {
    async connect(): Promise<never> {
      throw Error("unexpected");
    },
  };
  assert.throws(
    () => new PairedSetupStore(pool, { ...actor(), source: "fixture" }),
    /IDENTITY_REQUIRED/,
  );
  assert.throws(
    () => new PairedSetupStore(pool, { ...actor(), session_version: 0 }),
    /IDENTITY_REQUIRED/,
  );
});
