import assert from "node:assert/strict";
import { test } from "node:test";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { importSeeds, loadSeeds } from "../scripts/seed.mjs";
import {
  applyOwnerBootstrap,
  inspectAuthOwner,
  inspectOwnerState,
  ownerStateFindings,
  ownerTakeoverFindings,
  validateOwnerOperator,
} from "../scripts/staging-owner-core.mjs";
import { runtimeFile } from "./support/runtime";

const root = process.cwd();
const projectRef = "abcdefghijklmnopqrst";
const userId = "30000000-0000-4000-8000-000000000031";
const input = {
  userId,
  email: "owner.staging@example.com",
  displayName: "Staging Owner",
};
const base = {
  KXRA_ENVIRONMENT: "staging",
  KXRA_STAGING_PROJECT_REF: projectRef,
  KXRA_STAGING_MIGRATOR_DATABASE_URL: `postgresql://postgres:private-password@db.${projectRef}.supabase.co:5432/postgres?sslmode=verify-full`,
  KXRA_STAGING_OWNER_USER_ID: userId,
  KXRA_STAGING_OWNER_EMAIL: input.email,
  KXRA_STAGING_OWNER_DISPLAY_NAME: input.displayName,
};
const local = JSON.parse(fs.readFileSync(runtimeFile("database.json"), "utf8"));
const admin = { ...local, user: os.userInfo().username, database: "postgres" };

function databaseName() {
  return `kxra_owner_${process.pid}_${crypto.randomBytes(4).toString("hex")}`;
}

function migrationSql(name: string) {
  return fs
    .readFileSync(path.join(root, "supabase/migrations", name), "utf8")
    .replace(/^([\s\S]*?)\bbegin;\s*/i, "$1")
    .replace(/commit;\s*$/i, "");
}

async function withDatabase(work: (database: pg.Client) => Promise<void>) {
  const name = databaseName();
  const control = new pg.Client(admin);
  await control.connect();
  await control.query(`create database ${name}`);
  const database = new pg.Client({ ...admin, database: name });
  try {
    await database.connect();
    await database.query(`
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
      $$;
      create function auth.jwt() returns jsonb language sql stable as $$
        select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb
      $$;
      create table auth.users(
        id uuid primary key,email text,email_confirmed_at timestamptz,
        deleted_at timestamptz,banned_until timestamptz
      );
      create table auth.mfa_factors(
        id uuid primary key,user_id uuid not null,status text not null,created_at timestamptz not null
      );
      grant usage on schema auth to anon,authenticated;
      grant execute on all functions in schema auth to anon,authenticated;
    `);
    for (const name of fs
      .readdirSync(path.join(root, "supabase/migrations"))
      .filter((entry) => entry.endsWith(".sql"))
      .sort())
      await database.query(migrationSql(name));
    await database.query("begin");
    await importSeeds(database, loadSeeds(root), { canonicalOnly: true });
    await database.query("commit");
    await work(database);
  } finally {
    await database.end().catch(() => {});
    await control.query(`drop database if exists ${name} with (force)`);
    await control.end();
  }
}

test("staging owner apply requires exact identity and confirmation", () => {
  assert.equal(validateOwnerOperator(base, "plan").ok, true);
  assert.equal(validateOwnerOperator(base, "apply").ok, false);
  assert.equal(
    validateOwnerOperator(
      {
        ...base,
        KXRA_STAGING_OWNER_CONFIRMATION: `OWNER:${projectRef}:${userId}:codex/phase-2-completion`,
      },
      "apply",
    ).ok,
    true,
  );
  assert.equal(
    validateOwnerOperator(
      { ...base, KXRA_STAGING_OWNER_EMAIL: " Owner@Example.com " },
      "plan",
    ).input.email,
    "owner@example.com",
  );
});

test("owner bootstrap requires confirmed email and verified MFA", () =>
  withDatabase(async (database) => {
    await database.query("insert into auth.users(id,email) values($1,$2)", [
      input.userId,
      input.email,
    ]);
    assert.deepEqual(await inspectAuthOwner(database, input), {
      ready: false,
      reason: "AUTH_EMAIL_UNCONFIRMED",
    });
    await database.query(
      "update auth.users set email_confirmed_at=now() where id=$1",
      [input.userId],
    );
    const confirmed = await inspectAuthOwner(database, input);
    assert.deepEqual(confirmed, {
      ready: true,
      confirmedAt: (
        await database.query(
          "select email_confirmed_at from auth.users where id=$1",
          [input.userId],
        )
      ).rows[0].email_confirmed_at,
      mfaVerified: false,
      factorId: null,
    });
    await database.query("begin");
    try {
      await applyOwnerBootstrap(database, input, confirmed);
      const state = await inspectOwnerState(database, input);
      assert.deepEqual(
        ownerStateFindings(state, input, confirmed, { requireMfa: false }),
        [],
      );
      assert.ok(
        ownerStateFindings(state, input, confirmed).includes(
          "auth: AUTH_MFA_NOT_VERIFIED",
        ),
      );
      assert.equal(
        (
          await database.query(
            "select metadata->>'mfa_verified' value from kxra.audit_events where action='owner.bootstrap'",
          )
        ).rows[0].value,
        "false",
      );
    } finally {
      await database.query("rollback");
    }
  }));

test("owner bootstrap creates one exact auditable owner and rejects takeover drift", () =>
  withDatabase(async (database) => {
    const factorId = "30000000-0000-4000-8000-000000000032";
    await database.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
      [input.userId, input.email],
    );
    await database.query(
      "insert into auth.mfa_factors(id,user_id,status,created_at) values($1,$2,'verified',now())",
      [factorId, input.userId],
    );
    const auth = await inspectAuthOwner(database, input);
    assert.equal(auth.ready, true);
    await database.query("begin");
    try {
      await applyOwnerBootstrap(database, input, auth, {
        profile: "KXRA-PRODUCTION-OWNER-V1",
        grantSource: "PRODUCTION_OWNER_BOOTSTRAP",
      });
      const state = await inspectOwnerState(database, input);
      assert.deepEqual(
        ownerStateFindings(state, input, auth, {
          grantSource: "PRODUCTION_OWNER_BOOTSTRAP",
        }),
        [],
      );
      assert.equal(
        (
          await database.query(
            "select metadata->>'profile' profile from kxra.audit_events where action='owner.bootstrap'",
          )
        ).rows[0].profile,
        "KXRA-PRODUCTION-OWNER-V1",
      );
      assert.deepEqual(ownerTakeoverFindings(state, input, []), []);
      await database.query(
        "update kxra.organisation_memberships set display_name='Drifted' where account_id=$1",
        [input.userId],
      );
      const drifted = await inspectOwnerState(database, input);
      const exact = ownerStateFindings(drifted, input, auth, {
        grantSource: "PRODUCTION_OWNER_BOOTSTRAP",
      });
      assert.ok(exact.includes("membership: mismatch"));
      assert.deepEqual(ownerTakeoverFindings(drifted, input, exact), [
        "target has conflicting KXRA identity state",
      ]);
    } finally {
      await database.query("rollback");
    }
  }));
