// Fresh fixture only. Every extension is atomic and installed exactly once.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import pg from "pg";
import assert from "node:assert/strict";
import { integrationCatalog } from "./integration-catalog.mjs";
const root = fs.realpathSync(path.resolve(import.meta.dirname, ".."));
const runtime = fs.realpathSync(process.env.KXRA_RUNTIME || "");
if (
  !runtime.startsWith(path.join(root, ".runtime") + path.sep) ||
  process.env.KXRA_AUTH_MODE !== "fixture" ||
  process.env.VERCEL ||
  process.env.VERCEL_ENV ||
  process.env.DATABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  !/^http:\/\/127\.0\.0\.1:[0-9]+$/.test(process.env.KXRA_ORIGIN || "") ||
  !/^[a-f0-9]{96}$/.test(process.env.KXRA_LOCAL_SECRET || "")
)
  throw Error("OWNED_FIXTURE_REQUIRED");
const config = JSON.parse(
  fs.readFileSync(path.join(runtime, "database.json"), "utf8"),
);
if (
  config.host !== path.join(runtime, "socket") ||
  fs.realpathSync(config.host) !== config.host ||
  config.user !== "kxra_app" ||
  config.database !== "postgres" ||
  config.password ||
  config.ssl ||
  config.connectionString ||
  !Number.isInteger(config.port)
)
  throw Error("OWNED_SOCKET_REQUIRED");
const files = [
  "database/proposals/customer-connectors.sql",
  "database/proposals/github-connector-outbox.sql",
  "database/proposals/github-vault-receipts.sql",
  "packages/custom-apps/local-schema.sql",
  "packages/custom-apps/local-records-schema.sql",
  "packages/integration/local-orchestration.sql",
];
const client = new pg.Client({ ...config, user: os.userInfo().username });
await client.connect();
try {
  if (
    fs.realpathSync(
      (await client.query("show data_directory")).rows[0].data_directory,
    ) !== path.join(runtime, "postgres")
  )
    throw Error("OWNED_DATABASE_REQUIRED");
  const names = [
    "kxra_private.customer_connectors",
    "kxra_private.github_connections",
    "kxra_private.github_vault_bindings",
    "kxra.custom_apps",
    "kxra.custom_app_records",
    "kxra_private.paired_delegations",
  ];
  for (const name of names)
    if (
      (await client.query("select to_regclass($1) present", [name])).rows[0]
        .present
    )
      throw Error("FRESH_EXTENSION_COHORT_REQUIRED");
  const canonical = await integrationCatalog(client);
  const expectedTables = [],
    expectedFunctions = [];
  const manifest = [];
  for (const file of files) {
    const ddl = fs.readFileSync(path.join(root, file), "utf8");
    expectedTables.push(
      ...Array.from(
        ddl.matchAll(
          /create table (kxra(?:_private|_github_receipt)?\.[a-z_]+)/gi,
        ),
        (m) => m[1],
      ),
    );
    expectedFunctions.push(
      ...Array.from(
        ddl.matchAll(
          /create function (kxra(?:_private|_github_receipt)?\.[a-z_]+)/gi,
        ),
        (m) => m[1],
      ),
    );
    await client.query(ddl);
    manifest.push({
      file,
      sha256: crypto.createHash("sha256").update(ddl).digest("hex"),
    });
  }
  const installed = await integrationCatalog(client);
  for (const [kind, rows] of Object.entries(canonical))
    for (const row of rows)
      assert.ok(
        installed[kind].some(
          (candidate) => JSON.stringify(candidate) === JSON.stringify(row),
        ),
        `Canonical ${kind} changed during fixture extension install`,
      );
  const tableNames = (c) =>
    c.tables.filter((t) => t.kind === "r").map((t) => t.schema + "." + t.name);
  const functionNames = (c) => c.functions.map((f) => f.schema + "." + f.name);
  assert.deepEqual(
    tableNames(installed)
      .filter((n) => !tableNames(canonical).includes(n))
      .sort(),
    expectedTables.sort(),
  );
  assert.deepEqual(
    functionNames(installed)
      .filter((n) => !functionNames(canonical).includes(n))
      .sort(),
    expectedFunctions.sort(),
  );
  fs.writeFileSync(
    path.join(runtime, "integration-catalogue.json"),
    JSON.stringify({ canonical, installed }, null, 2) + "\n",
    { mode: 0o600 },
  );
  fs.writeFileSync(
    path.join(runtime, "integration-extension-install.json"),
    JSON.stringify(
      {
        sourceSha: (await import("node:child_process"))
          .execFileSync("git", ["rev-parse", "HEAD"], {
            cwd: root,
            encoding: "utf8",
          })
          .trim(),
        fixture: {
          runtime,
          host: config.host,
          port: config.port,
          database: config.database,
          runId: process.env.KXRA_CI_RUN_ID,
        },
        files: manifest,
      },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
} finally {
  await client.end();
}
