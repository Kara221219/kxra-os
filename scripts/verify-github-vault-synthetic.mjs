// New private, disposable, loopback-only fixture; never loads environment files.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import crypto from "node:crypto";
import os from "node:os";
import pg from "pg";
import { acquireNativeFixtureLease } from "./native-fixture-lease.mjs";
import { stopOwnedFixtureChild } from "./owned-fixture-child.mjs";
import { postgresBin } from "./postgres-bin.mjs";
const root = path.resolve(import.meta.dirname, "..");
const release = acquireNativeFixtureLease("github-vault-synthetic");
const runtime = fs.mkdtempSync("/tmp/kxra-vault-proof-");
fs.chmodSync(runtime, 0o700);
async function port() {
  const s = net.createServer();
  await new Promise((r, j) => {
    s.once("error", j);
    s.listen(0, "127.0.0.1", r);
  });
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}
const env = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  USER: process.env.USER,
  TMPDIR: process.env.TMPDIR,
  NODE_ENV: "development",
  KXRA_AUTH_MODE: "fixture",
  KXRA_RUNTIME: runtime,
  KXRA_LOCAL_SECRET: crypto.randomBytes(48).toString("hex"),
  KXRA_CI_RUN_ID: crypto.randomUUID(),
};
for (const k of [
  "DATABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "VERCEL",
  "VERCEL_ENV",
])
  delete env[k];
let fake;
function run(args) {
  const r = spawnSync(process.execPath, args, {
    cwd: root,
    env,
    stdio: "inherit",
  });
  if (r.status !== 0) throw Error(`Check failed (${r.status}): ${args[0]}`);
}
try {
  env.KXRA_ORIGIN = `http://127.0.0.1:${await port()}`;
  env.KXRA_PG_PORT = String(await port());
  run(["scripts/database.mjs", "start"]);
  const cfg = JSON.parse(
    fs.readFileSync(path.join(runtime, "database.json"), "utf8"),
  );
  const db = new pg.Client({ ...cfg, user: os.userInfo().username });
  await db.connect();
  try {
    for (const name of [
      "customer-connectors.sql",
      "github-connector-outbox.sql",
      "github-vault-receipts.sql",
    ])
      await db.query(
        fs.readFileSync(path.join(root, "database/proposals", name), "utf8"),
      );
  } finally {
    await db.end();
  }
  fake = spawn(process.execPath, ["scripts/github-fake-server.mjs"], {
    cwd: root,
    env,
    stdio: ["ignore", "ignore", "inherit"],
  });
  for (
    let i = 0;
    i < 50 && !fs.existsSync(path.join(runtime, "github-fake-origin"));
    i++
  )
    await new Promise((r) => setTimeout(r, 100));
  env.KXRA_GITHUB_FAKE_ORIGIN = fs.readFileSync(
    path.join(runtime, "github-fake-origin"),
    "utf8",
  );
  run([
    "--import",
    "tsx",
    "--test",
    "--test-concurrency=1",
    "tests/connectors/github-vault-synthetic.test.ts",
    "tests/connectors/github-custody-synthetic.test.ts",
  ]);
  run(["scripts/verify-github-wire-pure.mjs"]);
  run(["scripts/verify-migrations.mjs"]);
  console.log("Synthetic GitHub vault/receipt proof PASS");
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  const fakeStopped = await stopOwnedFixtureChild(fake, {
    termMs: 5000,
    onUncertain: () => {
      fs.writeFileSync(
        path.join(runtime, "native-child-cleanup-uncertain.json"),
        JSON.stringify({ pid: fake?.pid, purpose: "provider" }),
        { mode: 0o600 },
      );
    },
  });
  const stop = spawnSync(process.execPath, ["scripts/database.mjs", "stop"], {
    cwd: root,
    env,
    stdio: "inherit",
  });
  const absent = spawnSync(
    path.join(postgresBin(env), "pg_ctl"),
    ["-D", path.join(runtime, "postgres"), "status"],
    { stdio: "ignore" },
  );
  const cleaned =
    (!fs.existsSync(path.join(runtime, "postgres")) ||
      (stop.status === 0 && absent.status === 3)) &&
    fakeStopped &&
    !fs.existsSync(path.join(runtime, "native-child-cleanup-uncertain.json"));
  if (cleaned) release();
  else {
    process.exitCode = 1;
    console.error("Cleanup uncertain; lease retained");
  }
  console.log(`Private synthetic diagnostics: ${runtime}; cleanup=${cleaned}`);
}
