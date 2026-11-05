// Internal owned-fixture continuation probe; no external target or credentials accepted.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import pg from "pg";
import { customAppHttp } from "../apps/os/lib/custom-app-http";
import { getPool, query } from "../packages/db";
import {
  syntheticVerifiedSession,
  syntheticSessionClaims,
} from "../tests/support/synthetic-session-attestation";
import type { Actor } from "../apps/os/lib/auth";
async function main() {
  const root = fs.realpathSync(process.cwd());
  assert.match(root, /^\/(?:private\/)?tmp\/kxra-session-[A-Za-z0-9]+$/);
  const runtime = path.join(root, ".runtime/proof"),
    s = JSON.parse(
      fs.readFileSync(path.join(runtime, "probe-input.json"), "utf8"),
    ),
    cfg = JSON.parse(
      fs.readFileSync(path.join(runtime, "database.json"), "utf8"),
    );
  assert.equal(cfg.host, path.join(runtime, "socket"));
  assert.equal(cfg.user, "kxra_app");
  assert.ok(!cfg.password);
  assert.ok(
    s.database === "postgres" ||
      (s.database === s.ownedRestoreTarget &&
        /^kxra_session_restore_[a-f0-9]{12}$/.test(s.database)),
  );
  Object.assign(process.env, {
    NODE_ENV: "development",
    KXRA_AUTH_MODE: "supabase",
    KXRA_CUSTOM_APPS_ENABLED: "true",
    KXRA_ORIGIN: "http://127.0.0.1:19731",
    DATABASE_URL: `postgresql://kxra_app@localhost/${s.database}?host=${encodeURIComponent(cfg.host)}&port=${cfg.port}`,
  });
  const provider = new pg.Client({
    ...cfg,
    database: s.database,
    user: os.userInfo().username,
  });
  await provider.connect();
  await provider.query("set session authorization supabase_auth_admin");
  const hook = async (session: string) =>
    (
      await provider.query(
        "select kxra_private.custom_app_access_token_hook($1) value",
        [
          JSON.stringify({
            user_id: s.author,
            authentication_method: "token_refresh",
            claims: syntheticSessionClaims(s.author, session, 999),
          }),
        ],
      )
    ).rows[0].value.claims;
  try {
    const current = await hook(s.session);
    assert.equal(current.kxra_session_version, s.version);
    assert.equal((await hook(s.original)).kxra_session_version, undefined);
    assert.equal((await hook(s.deleted)).kxra_session_version, undefined);
    const issuer = syntheticVerifiedSession(current);
    const principal = await issuer.principal();
    assert.ok(principal);
    const rows = await query<{
      session_version: number;
      security_role: string;
    }>(
      { ...principal, organisation_id: s.org },
      "select a.session_version,m.security_role from kxra.account_identities a join kxra.organisation_memberships m on m.account_id=a.account_id where a.account_id=$1 and m.org_id=$2",
      [s.author, s.org],
    );
    const actor = {
      ...principal,
      ...rows[0],
      organisation_id: s.org,
      org_id: s.org,
      organisation_kind: "CUSTOMER",
    } as Actor;
    async function call(tail: string, body?: unknown) {
      const r = await customAppHttp(
        new Request(
          process.env.KXRA_ORIGIN + "/api/custom-apps/" + s.room + tail,
          {
            method: body ? "POST" : "GET",
            headers: {
              origin: process.env.KXRA_ORIGIN!,
              "content-type": "application/json",
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
          },
        ),
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
    const detail = await call(`/${s.app}`);
    assert.equal(detail.app.revision, s.revision);
    assert.equal(detail.app.active_version, 1);
    assert.deepEqual(await call(`/${s.app}/records`, s.first), s.saved);
    assert.deepEqual(await call(`/${s.app}/records`, s.next), s.second);
    assert.equal((await call(`/${s.app}/records`)).records[0].version, 2);
    await provider.query("begin");
    await assert.rejects(
      provider.query(
        "insert into auth.sessions(id,user_id,created_at) values($1,$2,clock_timestamp())",
        [s.deleted, s.author],
      ),
      { code: "23505" },
    );
    await provider.query("rollback");
    console.log("ATTESTED_SESSION_RECOVERY_PROBE_PASS " + s.database);
  } finally {
    await provider.end();
    await getPool().end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
