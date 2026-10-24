import { readPrivateFixtureJson } from "./support/private-fixture-json";
import { bindSyntheticModernScope } from "./support/modern-billing-scope-db";
import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { localModeConfiguration } from "../packages/authz/local-guard";
import { liveWorkspaceAccess } from "../packages/workspace/live-start";
// Automatic native SOURCE only: owner runs after0108; no worker execution.
function nativeConfiguration() {
  assert.ok(
    localModeConfiguration(process.env),
    "Explicit generated local fixture required",
  );
  assert.ok(
    !process.env.VERCEL && !process.env.VERCEL_ENV && !process.env.DATABASE_URL,
  );
  const runtime = fs.realpathSync(process.env.KXRA_RUNTIME!);
  for (const directory of [runtime, path.join(runtime, "socket")]) {
    const m = fs.lstatSync(directory);
    assert.ok(m.isDirectory() && !m.isSymbolicLink());
    assert.equal(m.uid, process.getuid!());
    assert.equal(m.mode & 0o077, 0, "Owner-private generated fixture only");
  }
  const cfg = readPrivateFixtureJson(path.join(runtime, "database.json"));
  assert.equal(cfg.host, path.join(process.env.KXRA_RUNTIME!, "socket"));
  assert.equal(fs.realpathSync(cfg.host), path.join(runtime, "socket"));
  assert.equal(cfg.user, "kxra_app");
  assert.ok(!cfg.password && !cfg.connectionString && !cfg.ssl);
  assert.ok(
    Number.isInteger(cfg.port) && cfg.port >= 1024 && cfg.port <= 65535,
  );
  assert.ok(
    typeof cfg.database === "string" && /^[a-zA-Z0-9_-]+$/.test(cfg.database),
  );
  return {
    host: path.join(runtime, "socket"),
    port: cfg.port as number,
    database: cfg.database as string,
    user: os.userInfo().username,
    password: "",
    ssl: false as const,
    options: "",
  };
}

test("member workspace projection: pending before first live intent, LIVE blocked, legacy preserved and identity fenced", async () => {
  const config = nativeConfiguration(),
    db = new pg.Client(config);
  await db.connect();
  const uuid = () => crypto.randomUUID(),
    hash = "c".repeat(64);
  type Context = { org: string; actor: string };
  async function fixture(provider = "SUPABASE") {
    const org = uuid(),
      actor = uuid(),
      member = uuid(),
      project = uuid();
    await db.query(
      "insert into kxra.organisations(id,name,slug,organisation_kind) values($1,'Synthetic member access',$2,'CUSTOMER')",
      [org, `member-${org}`],
    );
    for (const id of [actor, member])
      await db.query(
        "insert into kxra.account_identities(account_id,auth_provider,auth_subject,state,email_verified_at) values($1,$2,$3,'ACTIVE',now())",
        [id, provider, `synthetic-${id}`],
      );
    for (const [id, role] of [
      [actor, "ORG_ADMIN"],
      [member, "ORG_MEMBER"],
    ])
      await db.query(
        "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,$3,'CUSTOMER','ACTIVE','Synthetic member access','LOCAL_MEMBER_TEST')",
        [org, id, role],
      );
    await db.query(
      "insert into kxra.projects(id,org_id,code,name,stage,status,next_action) values($1,$2,'MEMBER','Synthetic member project','TEST','ACTIVE','Verify')",
      [project, org],
    );
    return { org, actor, member, project };
  }
  async function status(
    context: Context,
    denied = false,
    role = "authenticated",
  ) {
    await db.query("savepoint member_assertion");
    try {
      await db.query("set local session authorization kxra_app");
      await db.query(
        `set local role ${role === "anon" ? "anon" : "authenticated"}`,
      );
      await db.query(
        "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true),set_config('request.kxra.verified_supabase_identity','off',true),set_config('request.kxra.hosted_self_service','off',true)",
        [
          context.actor,
          JSON.stringify({
            sub: context.actor,
            aal: "aal2",
            auth_time: Math.floor(Date.now() / 1000),
            email_verified: true,
          }),
          context.org,
        ],
      );
      const value = (
        await db.query(
          "select kxra_private.own_member_live_workspace_access() value",
        )
      ).rows[0].value;
      if (denied) assert.fail("Expected member SQL denial");
      if (value !== null) {
        liveWorkspaceAccess.parse(value);
        assert.deepEqual(
          Object.keys(value).sort(),
          [
            "lane",
            "entitled",
            "reconciliation_required",
            "quarantined",
            "proof_valid_until",
          ].sort(),
        );
      }
      await db.query("reset role");
      await db.query("reset session authorization");
      await db.query("release savepoint member_assertion");
      return value;
    } catch (error) {
      await db.query("rollback to savepoint member_assertion");
      await db.query("release savepoint member_assertion");
      if (!denied || error instanceof assert.AssertionError) throw error;
      assert.equal((error as { code?: string }).code, "42501");
      return null;
    }
  }
  try {
    const isolation = (
      await db.query(
        "select current_setting('listen_addresses') listen,current_setting('unix_socket_directories') socket",
      )
    ).rows[0];
    assert.equal(isolation.listen, "");
    assert.equal(fs.realpathSync(isolation.socket), config.host);
    await db.query("begin");
    assert.ok(
      [undefined, "LIVE", "STAGING_SANDBOX"].includes(
        process.env.KXRA_MODERN_BILLING_TEST_MODE,
      ),
    );
    const modern = await bindSyntheticModernScope(
      db.query.bind(db),
      process.env.KXRA_MODERN_BILLING_TEST_MODE === "STAGING_SANDBOX"
        ? "STAGING_SANDBOX"
        : "LIVE",
    );
    await db.query("set local statement_timeout='5s'");
    const f = await fixture(),
      legacy = await fixture(),
      local = await fixture("FIXTURE"),
      foreign = await fixture();
    assert.equal(await status(local), null);
    assert.equal(await status(legacy), null);
    await db.query(
      "insert into kxra.self_service_workspaces(account_id,org_id,project_id,request_id,requested_name,auth_provider) values($1,$2,$3,$4,'Synthetic member pending','SUPABASE')",
      [f.actor, f.org, f.project, uuid()],
    );
    assert.equal(
      (
        await db.query("select kxra_private.is_live_billing_lane($1) value", [
          f.org,
        ])
      ).rows[0].value,
      false,
    );
    const pending = await status({ org: f.org, actor: f.member });
    assert.equal(pending.lane, "PENDING");
    assert.equal(pending.entitled, false);
    assert.equal(
      (await db.query("select kxra_private.pilot_entitled($1) value", [f.org]))
        .rows[0].value,
      false,
    );
    await status({ org: f.org, actor: foreign.member }, true);
    await status({ org: foreign.org, actor: f.member }, true);
    await status(f, true, "anon");
    // A real prior LEGACY reservation remains legacy even with hosted provenance.
    await db.query(
      "insert into kxra.self_service_workspaces(account_id,org_id,project_id,request_id,requested_name,auth_provider) values($1,$2,$3,$4,'Synthetic legacy member','SUPABASE')",
      [legacy.actor, legacy.org, legacy.project, uuid()],
    );
    await db.query(
      "insert into kxra.billing_customer_intents(org_id,requested_by,client_request_id,organisation_name,idempotency_key,request_hash) values($1,$2,$3,'Synthetic legacy member history',$4,$5)",
      [legacy.org, legacy.actor, uuid(), `kxra-customer-${uuid()}`, hash],
    );
    assert.equal(await status({ org: legacy.org, actor: legacy.member }), null);
    await db.query(
      "update kxra_private.live_billing_activation set enabled=true,review_sha256=$1",
      [hash],
    );
    await db.query(
      "update kxra_private.live_billing_mappings set enabled=false where enabled",
    );
    const revision = (
      await db.query(
        "select coalesce(max(revision),0)+1 n from kxra_private.live_billing_mappings where offer_key='KXRA_TEAM_V1'",
      )
    ).rows[0].n;
    const offer = modern.catalogue.find((r) => r.offer_key === "KXRA_TEAM_V1")!;
    await db.query(
      "insert into kxra_private.live_billing_mappings(mode,offer_key,revision,enabled,account_id,price_id,product_id,portal_configuration_id,activation_review_sha256,terms_review_sha256,tax_review_sha256,tax_behavior,automatic_tax,payment_method) values($3,'KXRA_TEAM_V1',$2,true,$4,$5,$6,'bpc_syntheticmembers',$1,$1,$1,'inclusive',false,'card')",
      [
        hash,
        revision,
        modern.execution_scope.livemode ? "live" : "staging_sandbox",
        modern.execution_scope.account_id,
        offer.price_id,
        offer.product_id,
      ],
    );
    await db.query(
      "insert into kxra_private.live_customer_intents(id,org_id,actor_id,offer_key,mapping_revision,terms_review_sha256,auth_time) values($1,$2,$3,'KXRA_TEAM_V1',$4,$5,now())",
      [uuid(), f.org, f.actor, revision, hash],
    );
    const live = await status({ org: f.org, actor: f.member });
    assert.equal(live.lane, "LIVE");
    assert.equal(live.entitled, false);
    assert.ok(!JSON.stringify(live).includes("price_"));
    assert.ok(!JSON.stringify(live).includes("CUSTOMER"));
    await db.query(
      "update kxra.organisation_memberships set state='REVOKED',revoked_at=now() where org_id=$1 and account_id=$2",
      [f.org, f.member],
    );
    await status({ org: f.org, actor: f.member }, true);
    await db.query(
      "update kxra.account_identities set email_verified_at=null where account_id=$1",
      [f.actor],
    );
    await status(f, true);
  } finally {
    await db.query("rollback").catch(() => {});
    await db.end();
  }
});
