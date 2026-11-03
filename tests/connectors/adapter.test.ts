import { test } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import {
  mockNotesAdapter,
  type AdapterCommand,
} from "../../packages/connectors/adapter";
const id = "30000000-0000-4000-8000-000000000001";
function driver(result: unknown) {
  const calls: { sql: string; values: unknown[] }[] = [];
  return {
    calls,
    db: {
      query: async (sql: string, values: unknown[]) => {
        calls.push({ sql, values });
        return { rows: [{ result }] };
      },
    } as unknown as Pick<PoolClient, "query">,
  };
}
test("mock adapter has fixed no-credential metadata and rejects injected provider configuration before querying", async () => {
  assert.equal(mockNotesAdapter.descriptor.mode, "mock");
  assert.equal(mockNotesAdapter.descriptor.credentials, "none");
  assert.equal(Object.isFrozen(mockNotesAdapter.descriptor), true);
  const { db, calls } = driver({});
  await assert.rejects(
    mockNotesAdapter.invokeInScopedTransaction(db, {
      action: "connect",
      allow_write: true,
      url: "https://foreign.invalid",
      token: "not-a-credential",
    } as unknown as AdapterCommand),
  );
  assert.equal(calls.length, 0);
});
test("mock adapter uses one fixed scoped RPC and rejects malformed or mismatched provider outcomes", async () => {
  const { db, calls } = driver({ state: "REVOKED" });
  assert.deepEqual(
    await mockNotesAdapter.invokeInScopedTransaction(db, {
      action: "revoke",
      connector_id: id,
    }),
    { state: "REVOKED" },
  );
  assert.equal(
    calls[0].sql,
    "select kxra.customer_connector($1,$2::jsonb) result",
  );
  assert.deepEqual(calls[0].values, [
    "revoke",
    JSON.stringify({ connector_id: id }),
  ]);
  await assert.rejects(
    mockNotesAdapter.invokeInScopedTransaction(driver({ notes: [] }).db, {
      action: "read",
      connector_id: id,
    }),
  );
  const result = {
    id,
    connector_id: id,
    revision: 1,
    state: "APPROVED",
    payload: { tool: "notes.append", note: "Mock note" },
    digest: "a".repeat(64),
    expires_at: new Date(Date.now() + 60000).toISOString(),
  };
  await assert.rejects(
    mockNotesAdapter.invokeInScopedTransaction(driver(result).db, {
      action: "execute",
      connector_id: id,
      request_id: id,
    }),
  );
  await assert.rejects(
    mockNotesAdapter.invokeInScopedTransaction(
      driver({
        ...result,
        state: "EXECUTED",
        connector_id: "30000000-0000-4000-8000-000000000002",
      }).db,
      { action: "execute", connector_id: id, request_id: id },
    ),
  );
});
