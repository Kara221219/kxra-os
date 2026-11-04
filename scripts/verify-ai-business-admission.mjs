// Disposable synthetic fixture only; never loads an environment file.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
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
  });
  if (r.status !== 0)
    throw Error(`Local admission check failed: ${args[0]} (${r.status})`);
}
try {
  run(["scripts/database.mjs", "start"]);
  run([
    "--import",
    "tsx",
    "--test",
    "--test-concurrency=1",
    "tests/admission/ai-admission.db.test.ts",
    "tests/admission/ai-admission.test.ts",
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
      { cwd: root, env, stdio: "inherit" },
    ),
    absent = spawnSync(
      path.join(postgresBin(env), "pg_ctl"),
      ["-D", path.join(runtime, "postgres"), "status"],
      { stdio: "ignore" },
    );
  const cleaned =
    !fs.existsSync(path.join(runtime, "postgres")) ||
    (stopped.status === 0 && absent.status === 3);
  if (cleaned) release();
  else {
    process.exitCode = 1;
    console.error("Cleanup uncertain; own lease retained");
  }
  console.log(`Private synthetic diagnostics: ${runtime}; cleanup=${cleaned}`);
}
