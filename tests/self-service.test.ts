import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";
import { localModeConfiguration } from "../packages/authz/local-guard";
test("self-service SQL rejects missing local admission, unverified claims, anonymous calls and direct table writes", async () => {
  assert.ok(localModeConfiguration(process.env));
  const config = JSON.parse(
    fs.readFileSync(
      path.join(process.env.KXRA_RUNTIME!, "database.json"),
      "utf8",
    ),
  );
  async function attempt(
    role: string,
    enabled: boolean,
    verified: boolean,
    sql: string,
    values: unknown[] = [],
  ) {
    assert.ok(["anon", "authenticated"].includes(role));
    const db = new pg.Client(config);
    await db.connect();
    try {
      await db.query("begin");
      await db.query("set local role " + role);
      const uid = crypto.randomUUID();
      await db.query(
        "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.local_self_service',$3,true)",
        [
          uid,
          JSON.stringify({
            sub: uid,
            email: "synthetic@example.test",
            email_verified: verified,
            aal: "aal1",
          }),
          enabled ? "on" : "off",
        ],
      );
      return await db.query(sql, values);
    } finally {
      await db.query("rollback");
      await db.end();
    }
  }
  const sql = "select kxra_private.provision_self_service($1,$2)";
  for (const [role, enabled, verified] of [
    ["authenticated", false, true],
    ["authenticated", true, false],
    ["anon", true, true],
  ] as const) {
    await assert.rejects(
      attempt(role, enabled, verified, sql, [
        crypto.randomUUID(),
        "Synthetic denial",
      ]),
      (e) => (e as { code: string }).code === "42501",
    );
  }
  await assert.rejects(
    attempt(
      "authenticated",
      true,
      true,
      "insert into kxra.self_service_workspaces(account_id,org_id,project_id,request_id,requested_name) values($1,$2,$3,$4,'Forged')",
      [
        crypto.randomUUID(),
        crypto.randomUUID(),
        crypto.randomUUID(),
        crypto.randomUUID(),
      ],
    ),
    (e) => (e as { code: string }).code === "42501",
  );
});
