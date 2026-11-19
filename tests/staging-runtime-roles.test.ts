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

test("runtime roles remain non-bypass, non-owning and limited to exact reviewed delivery RPCs", async () => {
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
    // The unpublished canonical fixture 0118 adds one dedicated resolver.
    // Verify its exact ACL, then transactionally test the original hosted 0114
    // role profile without that local-only addition. The production operator
    // and its complete unknown-grant assertions remain unchanged.
    const fixtureAcl = (await inspectRuntimeRoles(database)).directAcl.filter(
      (x: { identity: string }) =>
        x.identity === "kxra_pairing" || x.identity.startsWith("kxra_pairing."),
    );
    assert.deepEqual(
      fixtureAcl
        .map(
          (x: {
            object_kind: string;
            identity: string;
            privilege_type: string;
            is_grantable: boolean;
            owner_grantor: boolean;
          }) => ({
            kind: x.object_kind,
            identity: x.identity,
            privilege: x.privilege_type,
            grantable: x.is_grantable,
            ownerGrantor: x.owner_grantor,
          }),
        )
        .sort((a: { identity: string }, b: { identity: string }) =>
          a.identity.localeCompare(b.identity),
        ),
      [
        {
          kind: "SCHEMA",
          identity: "kxra_pairing",
          privilege: "USAGE",
          grantable: false,
          ownerGrantor: true,
        },
        {
          kind: "FUNCTION",
          identity: "kxra_pairing.paired_resolve(text, text)",
          privilege: "EXECUTE",
          grantable: false,
          ownerGrantor: true,
        },
      ],
    );
    assert.equal(
      (
        await database.query(
          "select has_schema_privilege('kxra_app','kxra_private','USAGE') allowed",
        )
      ).rows[0].allowed,
      false,
    );
    await database.query(
      "revoke execute on function kxra_pairing.paired_resolve(text,text) from kxra_app; revoke usage on schema kxra_pairing from kxra_app",
    );
    await applyRuntimeRoles(database, password("a"), password("b"));
    assert.deepEqual(
      runtimeRoleFindings(await inspectRuntimeRoles(database)),
      [],
      "Exact 0114 schema/RPC grants only; no general role-none access",
    );
    async function rejectAcl(sql: string, role = "kxra_app") {
      await database.query("savepoint runtime_acl_negative");
      try {
        await database.query(sql);
        assert.ok(
          runtimeRoleFindings(await inspectRuntimeRoles(database)).includes(
            `${role}: runtime role has direct object grants`,
          ),
        );
      } finally {
        await database.query("rollback to savepoint runtime_acl_negative");
        await database.query("release savepoint runtime_acl_negative");
      }
    }
    await rejectAcl(
      "drop function kxra_room_worker.health(); create procedure kxra_room_worker.health() language sql as 'select 1'; revoke all on procedure kxra_room_worker.health() from public; grant execute on procedure kxra_room_worker.health() to kxra_app",
    );
    await rejectAcl("grant create on schema kxra_room_worker to kxra_app");
    await rejectAcl(
      "grant execute on function kxra_room_worker.next(uuid) to kxra_app with grant option",
    );
    await rejectAcl(
      "revoke execute on function kxra_room_worker.health() from kxra_app",
    );
    await rejectAcl(
      "create function kxra_room_worker.next(text) returns boolean language sql as 'select false'; revoke all on function kxra_room_worker.next(text) from public; grant execute on function kxra_room_worker.next(text) to kxra_app",
    );
    await rejectAcl(
      "create function kxra_room_worker.unreviewed_probe() returns boolean language sql as 'select false'; revoke all on function kxra_room_worker.unreviewed_probe() from public; grant execute on function kxra_room_worker.unreviewed_probe() to kxra_app",
    );
    await rejectAcl("grant select(id) on kxra.projects to kxra_app");
    await rejectAcl(
      "alter default privileges in schema kxra grant select on tables to kxra_app",
    );
    await rejectAcl(
      "grant usage on schema kxra_room_worker to kxra_public_ingress",
      "kxra_public_ingress",
    );
    await database.query("grant select on pg_catalog.pg_class to kxra_app");
    assert.ok(
      runtimeRoleFindings(await inspectRuntimeRoles(database)).includes(
        "kxra_app: runtime role has direct object grants",
      ),
    );
    await database.query("revoke select on pg_catalog.pg_class from kxra_app");
    if (
      Number(
        (await database.query("show server_version_num")).rows[0]
          .server_version_num,
      ) >= 160000
    ) {
      for (const option of ["inherit true", "set false"]) {
        await database.query("savepoint membership_negative");
        try {
          await database.query(
            `grant authenticated to kxra_app with ${option}`,
          );
          assert.ok(
            runtimeRoleFindings(await inspectRuntimeRoles(database)).includes(
              "kxra_app: unexpected role memberships",
            ),
          );
        } finally {
          await database.query("rollback to savepoint membership_negative");
          await database.query("release savepoint membership_negative");
        }
      }
    }
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
      {
        member: "kxra_app",
        granted: "anon",
        admin_option: false,
        inherit_option: false,
        set_option: true,
      },
      {
        member: "kxra_app",
        granted: "authenticated",
        admin_option: false,
        inherit_option: false,
        set_option: true,
      },
      {
        member: "kxra_public_ingress",
        granted: "anon",
        admin_option: false,
        inherit_option: false,
        set_option: true,
      },
    ]);
    assert.deepEqual(state.ownership, [
      { rolname: "kxra_app", owned: 0 },
      { rolname: "kxra_public_ingress", owned: 0 },
    ]);
    await database.query("alter role kxra_app createrole");
    await assert.rejects(
      () => applyRuntimeRoles(database, password("a"), password("b")),
      /RUNTIME_ROLE_PRIVILEGED_ATTRIBUTE_REJECTED:kxra_app/,
    );
  } finally {
    await database.query("rollback");
    await database.end();
  }
});
