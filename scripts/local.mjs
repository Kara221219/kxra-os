import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const root = path.resolve(import.meta.dirname, "..");
process.chdir(root);
const runtime = path.resolve(
  process.env.KXRA_RUNTIME || path.join(root, ".runtime"),
);
const origin = new URL(process.env.KXRA_ORIGIN || "http://127.0.0.1:3210");
const port = Number(origin.port);
if (
  origin.protocol !== "http:" ||
  origin.hostname !== "127.0.0.1" ||
  !Number.isInteger(port) ||
  port < 1024 ||
  port > 65535 ||
  origin.username !== "" ||
  origin.password !== "" ||
  origin.pathname !== "/" ||
  origin.search !== "" ||
  origin.hash !== ""
)
  throw Error(
    "Local fixture server requires an HTTP 127.0.0.1 origin with an unprivileged port",
  );
const environment = {
  ...process.env,
  KXRA_AUTH_MODE: "fixture",
  KXRA_ORIGIN: origin.origin,
  KXRA_RUNTIME: runtime,
};
execFileSync(process.execPath, ["scripts/database.mjs", "start"], {
  stdio: "inherit",
  env: environment,
});
const key = path.join(runtime, "session-key");
if (!fs.existsSync(key))
  fs.writeFileSync(key, crypto.randomBytes(48).toString("hex"), {
    mode: 0o600,
  });
const child = spawn(
  process.execPath,
  [
    path.join(root, "node_modules", "next", "dist", "bin", "next"),
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  {
    cwd: path.join(root, "apps", "os"),
    stdio: "inherit",
    env: {
      ...environment,
      KXRA_LOCAL_SECRET: fs.readFileSync(key, "utf8"),
    },
  },
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code || 0));
