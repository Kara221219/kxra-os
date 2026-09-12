import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const root = path.resolve(import.meta.dirname, "..");
process.chdir(root);
execFileSync(process.execPath, ["scripts/database.mjs", "start"], {
  stdio: "inherit",
});
const key = path.join(root, ".runtime/session-key");
if (!fs.existsSync(key))
  fs.writeFileSync(key, crypto.randomBytes(48).toString("hex"), {
    mode: 0o600,
  });
const child = spawn("npm", ["run", "dev:os"], {
  stdio: "inherit",
  env: {
    ...process.env,
    KXRA_AUTH_MODE: "fixture",
    KXRA_ORIGIN: "http://127.0.0.1:3210",
    KXRA_RUNTIME: path.join(root, ".runtime"),
    KXRA_LOCAL_SECRET: fs.readFileSync(key, "utf8"),
  },
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code || 0));
