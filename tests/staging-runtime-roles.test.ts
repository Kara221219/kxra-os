import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import {
  applyRuntimeRoles,
  inspectRuntimeRoles,
  runtimeRoleFindings,
  validateRuntimeRoleOperator,
} from "../scripts/staging-runtime-roles-core.mjs";
import { runtimeFile } from "./support/runtime";

const projectRef = "abcdefghijklmnopqrst";
const base = {
  KXRA_ENVIRONMENT: "staging",
  KXRA_STAGING_PROJECT_REF: projectRef,
  KXRA_STAGING_MIGRATOR_DATABASE_URL: `postgresql://postgres:private-password@db.${projectRef}.supabase.co:5432/postgres?sslmode=verify-full`,
};
const password = (character: string) => character.repeat(64);

test("runtime role apply requires distinct strong secrets and exact confirmation", () => {
  assert.equal(validateRuntimeRoleOperator(base, "plan").ok, true);
  const invalid = validateRuntimeRoleOperator(
    {
      ...base,
      KXRA_STAGING_APP_PASSWORD: "weak",
      KXRA_STAGING_PUBLIC_INGRESS_PASSWORD: "weak",
    },
    "apply",
  );
  assert.equal(invalid.ok, false);
  assert.ok(
    invalid.findings.includes(
      "KXRA_STAGING_APP_PASSWORD must be 48-128 base64url characters",
    ),
  );
  assert.ok(
    invalid.findings.includes("runtime role passwords must be different"),
  );
  assert.equal(
    validateRuntimeRoleOperator(
      {
        ...base,
        KXRA_STAGING_APP_PASSWORD: password("a"),
        KXRA_STAGING_PUBLIC_INGRESS_PASSWORD: password("b"),
        KXRA_STAGING_ROLE_CONFIRMATION: `ROLES:${projectRef}:codex/phase-2-completion`,
      },
      "apply",
    ).ok,
    true,
  );
});

test("runtime roles are login-only, non-bypass, non-owning and exactly scoped", async () => {
  const local = JSON.parse(
    fs.readFileSync(runtimeFile("database.json"), "utf8"),
  );
  const database = new pg.Client({
    ...local,
    user: os.userInfo().username,
    database: "postgres",
  });
  await database.connect();
  await database.query("begin");
  try {
    await applyRuntimeRoles(database, password("a"), password("b"));
    await database.query("grant select on pg_catalog.pg_class to kxra_app");
    assert.ok(
      runtimeRoleFindings(await inspectRuntimeRoles(database)).includes(
        "kxra_app: runtime role has direct object grants",
      ),
    );
    await database.query("revoke select on pg_catalog.pg_class from kxra_app");
    await database.query("grant anon to kxra_public_ingress with admin option");
    assert.ok(
      runtimeRoleFindings(await inspectRuntimeRoles(database)).includes(
        "kxra_public_ingress: unexpected role memberships",
      ),
    );
    await applyRuntimeRoles(database, password("a"), password("b"));
    const state = await inspectRuntimeRoles(database);
    assert.deepEqual(runtimeRoleFindings(state), []);
    assert.deepEqual(state.memberships, [
      { member: "kxra_app", granted: "anon", admin_option: false },
      { member: "kxra_app", granted: "authenticated", admin_option: false },
      { member: "kxra_public_ingress", granted: "anon", admin_option: false },
    ]);
    assert.deepEqual(state.ownership, [
      { rolname: "kxra_app", owned: 0 },
      { rolname: "kxra_public_ingress", owned: 0 },
    ]);
  } finally {
    await database.query("rollback");
    await database.end();
  }
});
