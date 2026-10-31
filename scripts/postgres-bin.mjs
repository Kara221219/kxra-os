import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
export function postgresBin(environment = process.env) {
  if (environment.KXRA_PG_BIN) return environment.KXRA_PG_BIN;
  for (const candidate of [
    "/opt/homebrew/opt/postgresql@14/bin",
    "/opt/homebrew/opt/postgresql@16/bin",
    "/usr/local/opt/postgresql@14/bin",
    "/usr/local/opt/postgresql@16/bin",
  ])
    if (fs.existsSync(path.join(candidate, "pg_ctl"))) return candidate;
  try {
    return execFileSync("pg_config", ["--bindir"], {
      encoding: "utf8",
      env: environment,
      timeout: 2000,
      maxBuffer: 4096,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    throw Error("PostgreSQL binaries unavailable; set KXRA_PG_BIN");
  }
}
