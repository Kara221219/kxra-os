import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  roomSchemaDecision,
  roomSchemaSources,
  roomSchemaFunctions,
  verifyRoomFunctions,
  roomMigrationName,
  ensureRoomOperationsSchema,
} from "./support/room-operations-schema";
import type pg from "pg";
test("promoted source verifies ledger and complete state, never falls back to installation", () => {
  assert.equal(roomSchemaDecision(true, true, 6, null, "hash"), "VERIFY");
  for (const [ledger, count, receipt] of [
    [false, 0, null],
    [false, 6, null],
    [true, 5, null],
    [true, 6, "hash"],
  ] as const)
    assert.throws(() =>
      roomSchemaDecision(true, ledger, count, receipt, "hash"),
    );
});
test("standalone installation occurs once only, and incomplete or changed fixture state fails closed", () => {
  assert.equal(roomSchemaDecision(false, false, 0, null, "hash"), "INSTALL");
  assert.equal(roomSchemaDecision(false, false, 6, "hash", "hash"), "VERIFY");
  for (const [ledger, count, receipt] of [
    [true, 6, null],
    [false, 1, null],
    [false, 6, null],
    [false, 6, "changed"],
    [false, 0, "hash"],
  ] as const)
    assert.throws(() =>
      roomSchemaDecision(false, ledger, count, receipt, "hash"),
    );
});
test("0114 must preserve exact base then maintenance source, not stale or inverted proposals", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kxra-schema-source-"));
  try {
    fs.mkdirSync(path.join(root, "proposals"));
    fs.mkdirSync(path.join(root, "supabase/migrations"), { recursive: true });
    for (const name of [
      "hosted-room-operations.sql",
      "hosted-room-maintenance.sql",
    ])
      fs.copyFileSync(
        path.join("proposals", name),
        path.join(root, "proposals", name),
      );
    const plain = roomSchemaSources(root);
    assert.equal(plain.migrationSource, null);
    const migration = path.join(root, "supabase/migrations", roomMigrationName);
    fs.writeFileSync(migration, plain.proposals.join("\n"));
    assert.ok(roomSchemaSources(root).migrationSource);
    for (const sql of [
      plain.proposals.toReversed().join("\n"),
      plain.proposals[0],
      "stale source",
    ]) {
      fs.writeFileSync(migration, sql);
      assert.throws(() => roomSchemaSources(root));
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("actual installed routines must match latest composed bodies, definer and empty search path", async () => {
  const source = roomSchemaSources(),
    expected = roomSchemaFunctions(source.proposals);
  assert.ok(expected.size >= 18);
  let defect = "";
  const db = {
    query: async (_sql: string, args: string[]) => ({
      rowCount: defect === "MISSING" ? 0 : 1,
      rows: [
        {
          prosrc: defect === "BODY" ? "drift" : expected.get(args[0]),
          prosecdef: defect !== "DEFINER",
          proconfig:
            defect === "PATH" ? ["search_path=public"] : ['search_path=""'],
        },
      ],
    }),
  } as unknown as pg.PoolClient;
  await verifyRoomFunctions(db, source.proposals);
  for (const bad of ["MISSING", "BODY", "DEFINER", "PATH"]) {
    defect = bad;
    await assert.rejects(verifyRoomFunctions(db, source.proposals));
  }
});
test("root service discovery includes both native and boundary suites without cluster launch", () => {
  const entry = fs.readFileSync("tests/room-operations.test.ts", "utf8");
  for (const file of [
    "hosted-room-operations",
    "room-maintenance",
    "hosted-room-boundary",
    "room-maintenance-boundary",
  ])
    assert.ok(entry.includes(`./operations/${file}.test`));
  assert.ok(
    entry.indexOf('"./operations/hosted-room-operations.test"') <
      entry.indexOf('"./operations/room-maintenance.test"'),
  );
  assert.doesNotMatch(entry, /spawn|database\.mjs|initdb/);
  assert.ok(
    fs.readFileSync("package.json", "utf8").includes("tests/*.test.ts"),
  );
});

test("nonfixture execution rejects before any connection or SQL", async () => {
  const previous = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = "preview";
  let connects = 0;
  try {
    const pool = {
      connect: async () => {
        connects++;
        throw Error("unexpected connection");
      },
    } as unknown as pg.Pool;
    await assert.rejects(
      ensureRoomOperationsSchema(pool, { host: "/tmp/generated-synthetic" }),
    );
    assert.equal(connects, 0);
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
  }
});
