import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import crypto from "node:crypto";
import os from "node:os";
import { seedVaultRecovery } from "../../scripts/integration-vault-proof";
const runtime = fs.realpathSync(process.env.KXRA_RUNTIME!);
assert.ok(runtime.startsWith(path.resolve(".runtime/i-")));
test("combined vault cohort persists encrypted leases and hashed receipt authority without another provider POST", async () => {
  const provider = path.join(
    process.env.KXRA_GITHUB_FAKE_RUNTIME!,
    "github-provider-store.json",
  );
  const before = JSON.parse(fs.readFileSync(provider, "utf8")).posts;
  const pool = new pg.Pool(
    JSON.parse(fs.readFileSync(path.join(runtime, "database.json"), "utf8")),
  );
  const principal = { user: crypto.randomUUID(), org: crypto.randomUUID() };
  const admin = new pg.Client({
    ...JSON.parse(fs.readFileSync(path.join(runtime, "database.json"), "utf8")),
    user: os.userInfo().username,
  });
  try {
    await admin.connect();
    await admin.query(
      "insert into kxra.organisations(id,name,slug,organisation_kind) values($1,'Combined vault fixture',$2,'CUSTOMER')",
      [principal.org, `combined-vault-${principal.org}`],
    );
    await admin.query(
      "insert into kxra.account_identities(account_id,auth_provider,auth_subject,state,email_verified_at) values($1,'FIXTURE',$2,'ACTIVE',clock_timestamp())",
      [principal.user, `combined-vault-${principal.user}`],
    );
    await admin.query(
      "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_ADMIN','CUSTOMER','ACTIVE','Combined vault fixture','LOCAL_TEST')",
      [principal.org, principal.user],
    );
    await seedVaultRecovery(pool, runtime, principal);
  } finally {
    await pool.end();
    await admin.end();
  }
  assert.equal(JSON.parse(fs.readFileSync(provider, "utf8")).posts, before);
});
