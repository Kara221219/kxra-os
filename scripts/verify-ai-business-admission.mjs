// Disposable synthetic fixture only; never loads an environment file.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import os from "node:os";
import pg from "pg";
import { acquireNativeFixtureLease } from "./native-fixture-lease.mjs";
import { postgresBin } from "./postgres-bin.mjs";
const root = path.resolve(import.meta.dirname, ".."),
  release = acquireNativeFixtureLease("ai-business-admission"),
  runtime = fs.mkdtempSync("/tmp/kxra-ai-admission-proof-");
fs.chmodSync(runtime, 0o700);
const env = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  USER: process.env.USER,
  TMPDIR: process.env.TMPDIR,
  NODE_ENV: "development",
  KXRA_RUNTIME: runtime,
  KXRA_AUTH_MODE: "fixture",
  KXRA_LOCAL_SECRET: crypto.randomBytes(48).toString("hex"),
  KXRA_ORIGIN: "http://127.0.0.1:31111",
  KXRA_PG_PORT: "54382",
  KXRA_MODERN_BILLING_TEST_MODE: "STAGING_SANDBOX",
};
function run(args) {
  const r = spawnSync(process.execPath, args, {
    cwd: root,
    env,
    stdio: "inherit",
    timeout: 120_000,
  });
  if (r.status !== 0)
    throw Error(`Local admission check failed: ${args[0]} (${r.status})`);
}
try {
  assert.ok(
    !fs.existsSync(path.join(runtime, "postgres")),
    "New empty runtime required",
  );
  run(["scripts/database.mjs", "start"]);
  const cfg = JSON.parse(
    fs.readFileSync(path.join(runtime, "database.json"), "utf8"),
  );
  assert.equal(
    fs.realpathSync(cfg.host),
    fs.realpathSync(path.join(runtime, "socket")),
  );
  assert.equal(cfg.database, "postgres");
  assert.ok(!cfg.password && !cfg.connectionString && !cfg.ssl);
  const admin = new pg.Client({ ...cfg, user: os.userInfo().username });
  try {
    await admin.connect();
    assert.equal(
      fs.realpathSync(
        (await admin.query("show data_directory")).rows[0].data_directory,
      ),
      fs.realpathSync(path.join(runtime, "postgres")),
    );
    assert.equal(
      (await admin.query("show listen_addresses")).rows[0].listen_addresses,
      "",
    );
  } finally {
    await admin.end();
  }
  fs.writeFileSync(
    path.join(runtime, "isolation.json"),
    JSON.stringify({
      freshOwnedRuntime: true,
      dataDirectoryVerified: true,
      unixSocketOnly: true,
      database: cfg.database,
    }) + "\n",
    { mode: 0o600 },
  );
  run([
    "--import",
    "tsx",
    "--test",
    "--test-concurrency=1",
    "tests/admission/ai-admission.db.test.ts",
    "tests/admission/ai-admission.test.ts",
    "tests/admission/ai-resume-api.test.ts",
    "tests/admission/ai-setup-status.test.ts",
    "tests/team-provider.test.ts",
    "tests/business-admission.test.ts",
  ]);
  run(["scripts/verify-migrations.mjs"]);
  console.log("AI business admission local proof PASS");
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  const stopped = spawnSync(
      process.execPath,
      ["scripts/database.mjs", "stop"],
      { cwd: root, env, stdio: "inherit", timeout: 30_000 },
    ),
    absent = spawnSync(
      path.join(postgresBin(env), "pg_ctl"),
      ["-D", path.join(runtime, "postgres"), "status"],
      { stdio: "ignore", timeout: 10_000 },
    );
  const cleaned =
    !fs.existsSync(path.join(runtime, "postgres")) ||
    (stopped.status === 0 &&
      absent.status === 3 &&
      !fs.existsSync(path.join(runtime, "postgres/postmaster.pid")));
  fs.writeFileSync(
    path.join(runtime, "cleanup.json"),
    JSON.stringify({
      runtime,
      postgresStop: stopped.status,
      postgresStatus: absent.status,
      postmasterPidAbsent: !fs.existsSync(
        path.join(runtime, "postgres/postmaster.pid"),
      ),
      leaseReleaseAllowed: cleaned,
    }) + "\n",
    { mode: 0o600 },
  );
  if (cleaned) release();
  else {
    process.exitCode = 1;
    console.error("Cleanup uncertain; own lease retained");
  }
  console.log(`Private synthetic diagnostics: ${runtime}; cleanup=${cleaned}`);
}
