import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import { localModeConfiguration } from "../packages/authz/local-guard";
import { runtimeFile } from "../tests/support/runtime";
import { ensureRoomOperationsSchema } from "../tests/support/room-operations-schema";
assert.ok(localModeConfiguration(process.env) && !process.env.VERCEL_ENV);
const cfg = JSON.parse(fs.readFileSync(runtimeFile("database.json"), "utf8"));
assert.ok(
  typeof cfg.host === "string" &&
    cfg.host.startsWith("/") &&
    !cfg.password &&
    !cfg.connectionString,
);
const admin = new pg.Pool({ ...cfg, user: os.userInfo().username });
try {
  await ensureRoomOperationsSchema(admin, cfg);
} finally {
  await admin.end();
}
