import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { retireFirstUseMembership } from "./support/first-use-fixture";
const scope = {
  membership: "10000000-0000-4000-8000-000000000001",
  organisation: "10000000-0000-4000-8000-000000000002",
  account: "10000000-0000-4000-8000-000000000003",
};

test("first-use cleanup revokes only the exact owned fixture without deleting history or touching account authority", async () => {
  const calls: Array<{ sql: string; values: string[] }> = [];
  const query = async (sql: string, values: string[]) => {
    calls.push({ sql, values });
    return { rowCount: 1 };
  };
  await retireFirstUseMembership(query, scope);
  await retireFirstUseMembership(query, scope);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], calls[1]);
  assert.deepEqual(calls[0].values, [
    scope.membership,
    scope.organisation,
    scope.account,
  ]);
  assert.match(calls[0].sql, /where id=\$1 and org_id=\$2 and account_id=\$3/);
  assert.match(calls[0].sql, /grant_source='FIRST_USE_LOCAL_TEST'/);
  assert.match(
    calls[0].sql,
    /state='REVOKED',revoked_at=coalesce\(revoked_at,now\(\)\)/,
  );
  assert.match(
    calls[0].sql,
    /version=case when state='REVOKED' then version else version\+1 end/,
  );
  assert.match(
    calls[0].sql,
    /updated_at=case when state='REVOKED' then updated_at else now\(\) end/,
  );
  assert.doesNotMatch(
    calls[0].sql,
    /\bdelete\b|\btruncate\b|\balter\b|active_context_events|account_identities|session_version/i,
  );
});

test("missing, foreign or unexpectedly broad cleanup scope fails closed without another operation", async () => {
  for (const rowCount of [0, null, 2]) {
    let calls = 0;
    await assert.rejects(
      retireFirstUseMembership(async () => {
        calls++;
        return { rowCount };
      }, scope),
      /FIRST_USE_FIXTURE_MEMBERSHIP_SCOPE_MISMATCH/,
    );
    assert.equal(calls, 1);
  }
  for (const key of Object.keys(scope)) {
    let calls = 0;
    await assert.rejects(
      retireFirstUseMembership(
        async () => {
          calls++;
          return { rowCount: 1 };
        },
        { ...scope, [key]: "" },
      ),
    );
    assert.equal(calls, 0);
  }
});

test("browser fixture verifies audit retention, repeated cleanup, original context and unconditional database close", () => {
  const source = fs.readFileSync(
    "tests/e2e/customer-first-use.spec.ts",
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /delete from kxra\.organisation_memberships|delete from kxra\.active_context_events/i,
  );
  assert.equal(
    (source.match(/await retireFirstUseMembership\(/g) || []).length,
    2,
  );
  assert.match(source, /expect\(await events\(\)\).toEqual\(priorEvents\)/);
  assert.match(source, /toEqual\(originalMembership\)/);
  assert.match(source, /if \(returnedToPartner\)/);
  assert.match(source, /finally \{\s*await db.end\(\);/);
});
