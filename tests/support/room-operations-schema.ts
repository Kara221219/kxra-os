import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type pg from "pg";
import { localModeConfiguration } from "../../packages/authz/local-guard";

export const roomMigrationName = "0114_hosted_room_operations.sql";
const proposalNames = [
  "hosted-room-operations.sql",
  "hosted-room-maintenance.sql",
];
const tableNames = [
  "team_execution_grants",
  "team_worker_deliveries",
  "team_room_rollouts",
  "team_byok_consents",
  "team_uncertainty_cases",
  "team_maintenance_receipts",
];
export function roomSchemaSources(root = process.cwd()) {
  const proposals = proposalNames.map((name) =>
    fs.readFileSync(path.join(root, "proposals", name), "utf8"),
  );
  const numbered = fs
    .readdirSync(path.join(root, "supabase/migrations"))
    .filter((name) => name.startsWith("0114_") && name.endsWith(".sql"));
  assert.ok(
    numbered.length <= 1 &&
      numbered.every((name) => name === roomMigrationName),
    "Unexpected 0114 migration identity",
  );
  const migration = path.join(root, "supabase/migrations", roomMigrationName);
  const migrationSource = fs.existsSync(migration)
    ? fs.readFileSync(migration, "utf8")
    : null;
  if (migrationSource !== null) {
    const first = migrationSource.indexOf(proposals[0].trim());
    const second = migrationSource.indexOf(proposals[1].trim());
    assert.ok(
      first >= 0 && second > first,
      "0114 must contain the exact reviewed base then maintenance SQL",
    );
  }
  return {
    proposals,
    migrationSource,
    hash: crypto
      .createHash("sha256")
      .update(proposals.join("\n"))
      .digest("hex"),
  };
}
export function roomSchemaDecision(
  promoted: boolean,
  ledger: boolean,
  objects: number,
  receipt: string | null,
  hash: string,
) {
  if (promoted) {
    assert.ok(
      ledger && objects === tableNames.length && receipt === null,
      "Promoted 0114 requires its ledger, complete objects and no standalone proposal receipt",
    );
    return "VERIFY";
  }
  assert.equal(
    ledger,
    false,
    "0114 ledger without source is not a standalone fixture",
  );
  if (objects === 0 && receipt === null) return "INSTALL";
  assert.ok(
    objects === tableNames.length && receipt === hash,
    "Reject partial, unreceipted or changed standalone operations schema",
  );
  return "VERIFY";
}
export function roomSchemaFunctions(proposals: string[]) {
  const expected = new Map<string, string>();
  for (const source of proposals) {
    const pattern =
      /create(?: or replace)? function ([\w.]+)\(([\s\S]*?)\) returns [\s\S]*?as \$\$([\s\S]*?)\$\$;/g;
    for (const match of source.matchAll(pattern)) {
      const types = match[2].trim()
        ? match[2]
            .split(",")
            .map((p) => p.trim().split(/\s+/).slice(1).join(" "))
            .join(",")
        : "";
      expected.set(`${match[1]}(${types})`, match[3]);
    }
  }
  assert.ok(
    expected.size >= 18,
    "Expected complete operations function contract",
  );
  return expected;
}
export async function verifyRoomFunctions(
  db: pg.PoolClient,
  proposals: string[],
) {
  const expected = roomSchemaFunctions(proposals);
  for (const [signature, body] of expected) {
    const result = await db.query(
      "select prosrc,prosecdef,proconfig from pg_proc where oid=to_regprocedure($1)",
      [signature],
    );
    assert.equal(
      result.rowCount,
      1,
      `Missing operations function ${signature}`,
    );
    assert.equal(
      result.rows[0].prosrc,
      body,
      `Operations function drift ${signature}`,
    );
    assert.equal(
      result.rows[0].prosecdef,
      true,
      `Definer contract drift ${signature}`,
    );
    assert.ok(
      result.rows[0].proconfig?.some((v: string) =>
        /^search_path=(?:""|)$/.test(v),
      ),
      `Unsafe search path ${signature}`,
    );
  }
}
/** Test-only installer: generated socket fixture only; never repairs or reapplies partial state. */
export async function ensureRoomOperationsSchema(
  admin: pg.Pool,
  config: pg.PoolConfig,
) {
  assert.ok(
    localModeConfiguration(process.env) && !process.env.VERCEL_ENV,
    "Operations schema requires generated local fixture",
  );
  assert.ok(
    typeof config.host === "string" &&
      config.host.startsWith("/") &&
      !config.password &&
      !config.connectionString,
    "Operations schema requires credential-free private Unix socket",
  );
  const source = roomSchemaSources();
  const db = await admin.connect();
  try {
    await db.query("begin");
    await db.query(
      "select pg_advisory_xact_lock(hashtext('kxra-test-room-operations'))",
    );
    const ledger =
      (
        await db.query(
          "select 1 from public.kxra_local_migrations where name=$1",
          [roomMigrationName],
        )
      ).rowCount === 1;
    const objects = Number(
      (
        await db.query(
          "select count(*) n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='kxra' and c.relname=any($1::text[]) and c.relkind='r'",
          [tableNames],
        )
      ).rows[0].n,
    );
    const marker = (
      await db.query(
        "select to_regclass('public.kxra_operations_fixture_receipt') present",
      )
    ).rows[0].present;
    const receipts = marker
      ? (
          await db.query(
            "select hash from public.kxra_operations_fixture_receipt",
          )
        ).rows
      : [];
    assert.ok(receipts.length <= 1, "Invalid standalone schema receipt");
    const action = roomSchemaDecision(
      source.migrationSource !== null,
      ledger,
      objects,
      receipts[0]?.hash ?? null,
      source.hash,
    );
    if (action === "INSTALL") {
      for (const sql of source.proposals) await db.query(sql);
      await db.query(
        "create table public.kxra_operations_fixture_receipt(hash text primary key)",
      );
      await db.query(
        "revoke all on public.kxra_operations_fixture_receipt from public,anon,authenticated,kxra_app",
      );
      await db.query(
        "insert into public.kxra_operations_fixture_receipt values($1)",
        [source.hash],
      );
    }
    await verifyRoomFunctions(db, source.proposals);
    await db.query("commit");
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    db.release();
  }
}
