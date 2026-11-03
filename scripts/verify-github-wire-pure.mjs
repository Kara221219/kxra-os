// No sockets or DB: the test replaces fetch and uses only generated fixture material.
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
const env = {
  NODE_ENV: "development",
  KXRA_AUTH_MODE: "fixture",
  KXRA_ORIGIN: "http://127.0.0.1:31111",
  KXRA_RUNTIME: "/tmp/kxra-github-wire-unit",
  KXRA_LOCAL_SECRET: crypto.randomBytes(48).toString("hex"),
};
const r = spawnSync(
  process.execPath,
  [
    "--import",
    "tsx",
    "--test",
    "tests/connectors/github-lease.test.ts",
    "tests/connectors/github-wire.test.ts",
  ],
  { cwd: path.resolve(import.meta.dirname, ".."), env, stdio: "inherit" },
);
process.exitCode = r.status ?? 1;
