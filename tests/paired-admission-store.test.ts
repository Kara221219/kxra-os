import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import util from "node:util";
import { PairedAdmissionStore } from "../packages/workspace/paired-admission-store";
const actor = () => ({
  id: crypto.randomUUID(),
  organisation_id: crypto.randomUUID(),
  session_version: 1,
  auth_time: 1,
  aal: "aal2" as const,
  source: "supabase" as const,
});
test("storage stays off before pool acquisition; options cannot later enable it", async () => {
  let connections = 0;
  const pool = {
      async connect(): Promise<never> {
        connections++;
        throw Error("unexpected connection");
      },
    },
    options = { enabled: false };
  const store = new PairedAdmissionStore(pool, pool, actor(), options);
  options.enabled = true;
  await assert.rejects(store.readCurrent({}), /UNAVAILABLE/);
  assert.equal(connections, 0);
});
test("paired tokens, missing server session and fixture identities cannot act as customer identity", () => {
  const pool = {
    async connect(): Promise<never> {
      throw Error("unexpected connection");
    },
  };
  for (const bad of [
    { ...actor(), source: "fixture" as const },
    { ...actor(), session_version: 0 },
    { ...actor(), auth_time: undefined },
  ])
    assert.throws(
      () => new PairedAdmissionStore(pool, pool, bad),
      /UNAVAILABLE/,
    );
});
test("pool credentials and principal are hidden from JSON and inspect", () => {
  const a = actor(),
    pool = {
      password: "SYNTHETIC_NOT_A_CREDENTIAL",
      async connect(): Promise<never> {
        throw Error("unexpected connection");
      },
    };
  const store = new PairedAdmissionStore(pool, pool, a);
  for (const text of [JSON.stringify(store), util.inspect(store)]) {
    assert.ok(!text.includes(pool.password));
    assert.ok(!text.includes(a.id));
  }
});
