import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import util from "node:util";
import { GithubProductionOutbox } from "../packages/connectors/github-production-outbox";
const uuid = () => crypto.randomUUID();
function fixture() {
  const queries: any[] = [];
  let connects = 0;
  const client = {
    query: async (sql: string, args?: unknown[]) => {
      queries.push([sql, args]);
      return {
        rows: sql.startsWith("select kxra.")
          ? [{ value: { revoked: true } }]
          : [],
      };
    },
    release: () => {},
  };
  return {
    queries,
    pool: {
      connect: async () => {
        connects++;
        return client;
      },
    },
    connects: () => connects,
  };
}
const actor = {
  id: uuid(),
  organisation_id: uuid(),
  session_version: 1,
  aal: "aal2" as const,
  auth_time: Math.floor(Date.now() / 1000),
};
test("production outbox is default-off before pool/identity/capability queries", async () => {
  const f = fixture(),
    store = new GithubProductionOutbox(f.pool, { environment: () => ({}) });
  await assert.rejects(
    store.human(actor, { action: "REVOKE", connection_id: uuid() }),
  );
  await assert.rejects(store.readContext("a".repeat(43)));
  assert.equal(f.connects(), 0);
});
test("human command cannot supply worker capabilities, identity, expiry or replacement payload", async () => {
  const f = fixture(),
    store = new GithubProductionOutbox(f.pool, {
      environment: () => ({
        KXRA_GITHUB_OUTBOX_ENABLED: "true",
        KXRA_GITHUB_OUTBOX_POLICY_SHA256: "a".repeat(64),
      }),
    });
  for (const field of [
    "org_id",
    "user_id",
    "token",
    "receipt_token",
    "body",
    "expires_at",
  ])
    await assert.rejects(
      store.human(actor, {
        action: "APPROVE",
        connection_id: uuid(),
        write_id: uuid(),
        proposal_digest: "b".repeat(64),
        attested: true,
        [field]: "injected",
      }),
    );
  assert.equal(f.connects(), 0);
});
test("human transaction sends only verified server identity and clears both private capability channels", async () => {
  const f = fixture(),
    store = new GithubProductionOutbox(f.pool, {
      environment: () => ({
        KXRA_GITHUB_OUTBOX_ENABLED: "true",
        KXRA_GITHUB_OUTBOX_POLICY_SHA256: "a".repeat(64),
      }),
    });
  assert.deepEqual(
    await store.human(actor, { action: "REVOKE", connection_id: uuid() }),
    { revoked: true },
  );
  const set = f.queries.find((q) => q[0].includes("set_config"));
  assert.equal(set[1][0], actor.id);
  assert.equal(set[1][2], actor.organisation_id);
  assert.equal(set[1][3], "");
  assert.equal(set[1][4], "");
  assert.equal(f.queries.at(-1)[0], "commit");
});
test("unconfirmed commit propagates a held error, never a successful acknowledgment or retry", async () => {
  const f = fixture(),
    store = new GithubProductionOutbox(f.pool, {
      environment: () => ({
        KXRA_GITHUB_OUTBOX_ENABLED: "true",
        KXRA_GITHUB_OUTBOX_POLICY_SHA256: "a".repeat(64),
      }),
      afterCommit: async () => {
        throw Error("lost commit");
      },
    });
  await assert.rejects(
    store.human(actor, { action: "REVOKE", connection_id: uuid() }),
    /UNAVAILABLE_OR_UNCONFIRMED/,
  );
  assert.equal(f.queries.filter((q) => q[0] === "commit").length, 1);
  assert.equal(
    f.queries.filter((q) => q[0].startsWith("select kxra.")).length,
    1,
  );
});
test("REFUSED cannot become a historical nonexecution receipt and malformed capability reaches no database", async () => {
  const f = fixture(),
    store = new GithubProductionOutbox(f.pool);
  await assert.rejects(
    store.publishReceipt("a".repeat(43), uuid(), "b".repeat(64), {
      outcome: "REFUSED",
      evidence: { reason: "no" },
    }),
  );
  await assert.rejects(
    store.publishReceipt("bad", uuid(), "b".repeat(64), {
      outcome: "UNCERTAIN",
      evidence: { reason: "RESPONSE_UNCONFIRMED" },
    }),
  );
  assert.equal(f.connects(), 0);
});
test("pool/credential configuration is not serializable or inspectable through the adapter object", () => {
  const f = fixture();
  (f.pool as any).secret = "DO_NOT_LEAK_POOL_SECRET";
  const store = new GithubProductionOutbox(f.pool);
  assert.ok(!JSON.stringify(store).includes("DO_NOT_LEAK"));
  assert.ok(!util.inspect(store).includes("DO_NOT_LEAK"));
  assert.deepEqual(Object.keys(store), []);
});
