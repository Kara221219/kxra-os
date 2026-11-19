// Internal continuation probe. Consumes only the fixture's own retained state, never a caller target.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { customAppHttp } from "../apps/os/lib/custom-app-http";
import { getPool } from "../packages/db";
import type { Actor } from "../apps/os/lib/auth";
async function main() {
  const root = fs.realpathSync(process.cwd());
  assert.match(root, /^\/(?:private\/)?tmp\/kxra-capps-[A-Za-z0-9]+$/);
  const runtime = path.join(root, ".runtime/production-apps"),
    s = JSON.parse(
      fs.readFileSync(path.join(runtime, "probe-input.json"), "utf8"),
    );
  const cfg = JSON.parse(
    fs.readFileSync(path.join(runtime, "database.json"), "utf8"),
  );
  assert.equal(cfg.host, path.join(runtime, "socket"));
  assert.ok(!cfg.password);
  assert.equal(cfg.user, "kxra_app");
  assert.ok(
    s.database === "postgres" ||
      (s.database === s.ownedRestoreTarget &&
        /^kxra_app_restore_[a-f0-9]{12}$/.test(s.database)),
  );
  process.env.DATABASE_URL = `postgresql://kxra_app@localhost/${s.database}?host=${encodeURIComponent(cfg.host)}&port=${cfg.port}`;
  process.env.KXRA_AUTH_MODE = "supabase";
  process.env.KXRA_CUSTOM_APPS_ENABLED = "true";
  process.env.KXRA_ORIGIN = "http://127.0.0.1:19731";
  const actor = {
    id: s.author,
    organisation_id: s.org,
    source: "supabase",
    session_version: 1,
    provider_session_version: 1,
    aal: "aal2",
    auth_time: Math.floor(Date.now() / 1000),
    security_role: "ORG_ADMIN",
  } as Actor;
  async function call(tail: string, body?: unknown) {
    const request = new Request(
      process.env.KXRA_ORIGIN + "/api/custom-apps/" + s.room + tail,
      {
        method: body ? "POST" : "GET",
        headers: {
          origin: process.env.KXRA_ORIGIN!,
          "content-type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
    const r = await customAppHttp(
      request,
      {
        params: Promise.resolve({
          room: s.room,
          path: tail.split("/").filter(Boolean),
        }),
      },
      async () => actor,
    );
    assert.equal(r.status, 200, await r.clone().text());
    return r.json();
  }
  try {
    const detail = await call(`/${s.app}`);
    assert.equal(detail.app.active_version, 1);
    assert.equal(detail.app.revision, s.revision);
    assert.equal(
      detail.versions.find((v: any) => v.version === 1).sha256,
      s.hash1,
    );
    assert.deepEqual(
      await call(`/${s.app}/receipts/${s.first.operation_id}`),
      s.receipt,
    );
    assert.deepEqual(await call(`/${s.app}/records`, s.first), s.receipt); // uncertain committed response: no replay
    const before = await call(`/${s.app}/records`);
    assert.equal(before.records.length, 1);
    assert.equal(before.records[0].version, 2);
    const saved = await call(`/${s.app}/records`, s.interrupted);
    assert.equal(saved.version, 3);
    assert.deepEqual(await call(`/${s.app}/records`, s.interrupted), saved);
    assert.equal((await call(`/${s.app}/records`)).records[0].version, 3);
    console.log("HTTP_RECOVERY_CONTINUATION_PASS " + s.database);
  } finally {
    await getPool().end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
