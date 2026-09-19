import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import {
  importSeeds,
  loadSeeds,
  projectId,
  stableId,
  validateSeeds,
} from "../scripts/seed.mjs";
import { runtimeFile } from "./support/runtime";

const root = process.cwd();
const baseConfig = JSON.parse(
  fs.readFileSync(runtimeFile("database.json"), "utf8"),
);
const adminConfig = {
  ...baseConfig,
  user: os.userInfo().username,
  database: "postgres",
};

function databaseName() {
  return `kxra_seed_${process.pid}_${crypto.randomBytes(4).toString("hex")}`;
}

async function setupAuth(db: pg.Client) {
  await db.query(`
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb
    $$;
    grant usage on schema auth to anon,authenticated;
    grant execute on all functions in schema auth to anon,authenticated;
  `);
}

function migrationSql(name: string) {
  return fs
    .readFileSync(path.join(root, "supabase/migrations", name), "utf8")
    .replace(/^([\s\S]*?)\bbegin;\s*/i, "$1")
    .replace(/commit;\s*$/i, "");
}

async function withDatabase(work: (db: pg.Client) => Promise<void>) {
  const name = databaseName();
  const control = new pg.Client(adminConfig);
  await control.connect();
  await control.query(`create database ${name}`);
  const db = new pg.Client({ ...adminConfig, database: name });
  try {
    await db.connect();
    await work(db);
  } finally {
    await db.end().catch(() => {});
    await control.query(`drop database if exists ${name} with (force)`);
    await control.end();
  }
}

async function migrate(db: pg.Client) {
  await setupAuth(db);
  for (const name of fs
    .readdirSync(path.join(root, "supabase/migrations"))
    .filter((entry) => entry.endsWith(".sql"))
    .sort())
    await db.query(migrationSql(name));
}

test("AT-05 fresh seed is exact, attributable, repeatable and reorder-stable", () =>
  withDatabase(async (db) => {
    await migrate(db);
    const bundle = loadSeeds(root);
    await db.query("begin");
    await importSeeds(db, bundle);
    await db.query("commit");

    assert.equal((await db.query("select * from kxra.projects")).rowCount, 5);
    assert.deepEqual(
      (await db.query("select code from kxra.projects order by code")).rows.map(
        (row) => row.code,
      ),
      [
        "PROJECT-001",
        "PROJECT-002",
        "PROJECT-003",
        "PROJECT-004",
        "PROJECT-005",
      ],
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from kxra.projects where venture_score is null and confidence_score is null and not live_execution_enabled and not product_creation_enabled and source_hash is not null",
        )
      ).rows[0].n,
      5,
    );
    assert.deepEqual(
      (
        await db.query(
          `select code,lifecycle_stage,disposition,next_gate
           from kxra.projects order by code`,
        )
      ).rows,
      [
        {
          code: "PROJECT-001",
          lifecycle_stage: "PROBLEM_DISCOVERY",
          disposition: "MONITOR",
          next_gate: "P001_REVISIT",
        },
        {
          code: "PROJECT-002",
          lifecycle_stage: "VALIDATION",
          disposition: "ACTIVE",
          next_gate: "P002_LISTING",
        },
        {
          code: "PROJECT-003",
          lifecycle_stage: "VALIDATION",
          disposition: "ACTIVE",
          next_gate: "P003_FAITHFUL_DELIVERY",
        },
        {
          code: "PROJECT-004",
          lifecycle_stage: "FEASIBILITY",
          disposition: "MONITOR",
          next_gate: "P004_PAPER_READINESS",
        },
        {
          code: "PROJECT-005",
          lifecycle_stage: "VALIDATION",
          disposition: "ACTIVE",
          next_gate: "P005_LOCAL_PROTOTYPE",
        },
      ],
    );
    assert.deepEqual(
      (
        await db.query(
          `select p.code,
            count(*) filter(where m.module_group='COMMON')::int as common,
            count(*) filter(where m.module_group='SPECIALIST')::int as specialist
           from kxra.projects p
           join kxra.project_workspace_modules m on m.project_id=p.id
           group by p.code order by p.code`,
        )
      ).rows,
      [
        { code: "PROJECT-001", common: 18, specialist: 8 },
        { code: "PROJECT-002", common: 18, specialist: 12 },
        { code: "PROJECT-003", common: 18, specialist: 12 },
        { code: "PROJECT-004", common: 18, specialist: 13 },
        { code: "PROJECT-005", common: 18, specialist: 16 },
      ],
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from kxra.project_gate_policies",
        )
      ).rows[0].n,
      5,
    );
    assert.equal(
      (
        await db.query(
          `select count(*)::int as n from kxra.project_governance_versions v
           join kxra.projects p on p.id=v.project_id
           where v.version=p.governance_version and v.next_gate=p.next_gate`,
        )
      ).rows[0].n,
      5,
    );
    assert.deepEqual(
      (
        await db.query(
          `select id::text,vehicle_family,fitment_state,safety_state
           from kxra.vehicle_compatibility order by vehicle_family`,
        )
      ).rows,
      [
        {
          id: "62000000-0000-4000-8000-000000000001",
          vehicle_family: "Ford F-150",
          fitment_state: "UNKNOWN",
          safety_state: "UNKNOWN",
        },
        {
          id: "62000000-0000-4000-8000-000000000002",
          vehicle_family: "Ram / Dodge Ram",
          fitment_state: "UNKNOWN",
          safety_state: "UNKNOWN",
        },
        {
          id: "62000000-0000-4000-8000-000000000003",
          vehicle_family: "Toyota Tacoma",
          fitment_state: "UNKNOWN",
          safety_state: "UNKNOWN",
        },
      ],
    );
    assert.equal((await db.query("select * from kxra.members")).rowCount, 0);
    assert.equal(
      (await db.query("select * from kxra.project_memberships")).rowCount,
      0,
    );
    assert.equal(
      (await db.query("select * from kxra.finance_totals()")).rowCount,
      0,
    );
    for (const [kind, expected] of [
      ["agent", 13],
      ["skill", 12],
      ["routine", 9],
    ] as const)
      assert.equal(
        (
          await db.query(
            "select count(*)::int as n from kxra.records where kind=$1",
            [kind],
          )
        ).rows[0].n,
        expected,
      );
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from kxra.records where kind='routine' and data->>'enabled'='false'",
        )
      ).rows[0].n,
      9,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from kxra.records where source_code in ('DEC-001','DEC-002','DEC-003','DEC-004','DEC-005') and status='accepted' and provenance->>'authority'='owner_directive'",
        )
      ).rows[0].n,
      5,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from kxra.records where source_code is not null and created_by is not null",
        )
      ).rows[0].n,
      0,
    );

    const before = await db.query(
      "select id,source_code,version from kxra.records order by source_code",
    );
    const reordered = Object.fromEntries(
      Object.entries(bundle).map(([key, value]) => [key, [...value].reverse()]),
    );
    await db.query("begin");
    await importSeeds(db, reordered);
    await db.query("commit");
    const after = await db.query(
      "select id,source_code,version from kxra.records order by source_code",
    );
    assert.deepEqual(after.rows, before.rows);
    assert.equal(
      projectId("PROJECT-002"),
      "30000000-0000-4000-8000-000000000002",
    );
    assert.equal(stableId("DEC-001"), stableId("DEC-001"));

    const modified = structuredClone(bundle);
    modified.decisions[0].decision = "Synthetic unauthorized overwrite";
    await assert.rejects(
      () => importSeeds(db, modified),
      /provenance mismatch/,
    );

    const unknownScope = structuredClone(bundle);
    unknownScope.assumptions[0].project_scope = "PROJECT-999";
    assert.throws(() => validateSeeds(unknownScope), /Unknown source scope/);
    const missingEvidence = structuredClone(bundle);
    missingEvidence.assumptions[0].evidence_ids = ["MISSING-001"];
    assert.throws(
      () => validateSeeds(missingEvidence),
      /Unknown evidence reference/,
    );
  }));

test("AT-05 simulated mid-import failure commits no partial schema or seed", () =>
  withDatabase(async (db) => {
    await db.query("begin");
    try {
      await migrate(db);
      await importSeeds(db, loadSeeds(root), { failAfter: 3 });
      assert.fail("Expected the synthetic importer failure");
    } catch (error) {
      assert.match(String(error), /Synthetic mid-import failure/);
      await db.query("rollback");
    }
    assert.equal(
      (await db.query("select to_regclass('kxra.records') as relation")).rows[0]
        .relation,
      null,
    );
  }));
