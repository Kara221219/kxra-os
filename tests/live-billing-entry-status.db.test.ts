import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { localModeConfiguration } from "../packages/authz/local-guard";
import { liveEntryStatus } from "../packages/authz/live-billing-entry-contract";

// Automatic native test SOURCE. Owner runs after0104/0105 on a disposable fixture.
// Never skipped or run by this worker. Synthetic writes remain inside one rollback.
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
  const file = path.join(runtime, "database.json"),
    meta = fs.lstatSync(file);
  assert.ok(meta.isFile() && !meta.isSymbolicLink());
  assert.equal(meta.uid, process.getuid!());
  assert.equal(meta.mode & 0o022, 0);
  const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
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

test("own live billing SQL status: own verified tenant, disabled/fresh/pending/bound/review and denied contexts", async () => {
  const config = nativeConfiguration(),
    db = new pg.Client(config);
  await db.connect();
  const hash = "b".repeat(64);
  let revision = 0;
  type Context = { actor: string; org: string };
  async function fixture() {
    const org = crypto.randomUUID(),
      actor = crypto.randomUUID();
    await db.query(
      "insert into kxra.organisations(id,name,slug,organisation_kind) values($1,'Synthetic billing status tenant',$2,'CUSTOMER')",
      [org, `status-${org}`],
    );
    await db.query(
      "insert into kxra.account_identities(account_id,auth_provider,auth_subject,state,email_verified_at) values($1,'SUPABASE',$2,'ACTIVE',now())",
      [actor, `synthetic-${actor}`],
    );
    await db.query(
      "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_ADMIN','CUSTOMER','ACTIVE','Synthetic status admin','LOCAL_STATUS_TEST')",
      [org, actor],
    );
    return { org, actor };
  }
  async function read(
    context: Context,
    denied = false,
    role = "authenticated",
    claimVerified = true,
  ) {
    await db.query("savepoint status_assertion");
    try {
      await db.query("set local session authorization kxra_app");
      await db.query(
        `set local role ${role === "anon" ? "anon" : role === "kxra_billing_worker" ? "kxra_billing_worker" : "authenticated"}`,
      );
      await db.query(
        "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true),set_config('request.kxra.verified_supabase_identity','off',true),set_config('request.kxra.hosted_self_service','off',true)",
        [
          context.actor,
          JSON.stringify({
            sub: context.actor,
            aal: "aal2",
            auth_time: Math.floor(Date.now() / 1000),
            email_verified: claimVerified,
          }),
          context.org,
        ],
      );
      const value = (
        await db.query("select kxra_private.own_live_billing_status() value")
      ).rows[0].value;
      if (denied) assert.fail("Expected private SQL status denial");
      const safe = liveEntryStatus.parse(value),
        serialized = JSON.stringify(value);
      for (const forbidden of [
        "customer_id",
        "price_id",
        "product_id",
        "subscription_id",
        "provider_session_id",
        "account_id",
        "terms_review_sha256",
        "tax_review_sha256",
        "cus_",
        "price_",
        "prod_",
        "sub_",
        "acct_",
      ])
        assert.ok(
          !serialized.includes(forbidden),
          `Provider field/value escaped: ${forbidden}`,
        );
      assert.equal(safe.dispatch_ready, false);
      assert.equal(safe.entitlement_authority, false);
      await db.query("reset role");
      await db.query("reset session authorization");
      await db.query("release savepoint status_assertion");
      return safe;
    } catch (error) {
      await db.query("rollback to savepoint status_assertion");
      await db.query("release savepoint status_assertion");
      if (!denied || error instanceof assert.AssertionError) throw error;
      assert.equal((error as { code?: string }).code, "42501");
      return null;
    }
  }
  async function bound(context: Context) {
    await db.query(
      "insert into kxra_private.live_billing_bindings(org_id,customer_id,offer_key,mapping_revision) values($1,$2,'KXRA_STARTER_V1',$3)",
      [context.org, `cus_${crypto.randomBytes(12).toString("hex")}`, revision],
    );
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
    await db.query("set local statement_timeout='5s'");
    const fresh = await fixture(),
      foreign = await fixture();
    await db.query(
      "update kxra_private.live_billing_activation set enabled=false",
    );
    assert.equal((await read(fresh))!.state, "DISABLED");
    await db.query(
      "update kxra_private.live_billing_activation set enabled=true,review_sha256=$1",
      [hash],
    );
    await db.query(
      "update kxra_private.live_billing_mappings set enabled=false where enabled",
    );
    revision = (
      await db.query(
        "select coalesce(max(revision),0)+1 n from kxra_private.live_billing_mappings where offer_key='KXRA_STARTER_V1'",
      )
    ).rows[0].n;
    await db.query(
      "insert into kxra_private.live_billing_mappings(offer_key,revision,enabled,account_id,price_id,product_id,portal_configuration_id,activation_review_sha256,terms_review_sha256,tax_review_sha256,tax_behavior,automatic_tax,payment_method) values('KXRA_STARTER_V1',$2,true,'acct_1Rv3KdC84VkhhIRz','price_1UTbq7C84VkhhIRzkBHEHivV','prod_VUb2kv7rUiTeiu','bpc_syntheticstatus',$1,$1,$1,'inclusive',false,'card')",
      [hash, revision],
    );
    assert.equal((await read(fresh))!.state, "FRESH");
    assert.deepEqual((await read(fresh))!.available_actions, ["CUSTOMER"]);
    await read({ actor: foreign.actor, org: fresh.org }, true);
    await read({ actor: fresh.actor, org: foreign.org }, true);
    await read(fresh, true, "anon");
    await read(fresh, true, "kxra_billing_worker");
    const unverified = await fixture();
    await db.query(
      "update kxra.account_identities set email_verified_at=null where account_id=$1",
      [unverified.actor],
    );
    await read(unverified, true);
    const revoked = await fixture();
    await db.query(
      "update kxra.organisation_memberships set state='REVOKED',revoked_at=now() where org_id=$1 and account_id=$2",
      [revoked.org, revoked.actor],
    );
    await read(revoked, true);
    const member = await fixture();
    await db.query(
      "update kxra.organisation_memberships set security_role='ORG_MEMBER' where org_id=$1",
      [member.org],
    );
    await read(member, true);
    const customer = await fixture(),
      customerId = crypto.randomUUID();
    await db.query(
      "insert into kxra_private.live_customer_intents(id,org_id,actor_id,offer_key,mapping_revision,terms_review_sha256,auth_time) values($1,$2,$3,'KXRA_STARTER_V1',$4,$5,now())",
      [customerId, customer.org, customer.actor, revision, hash],
    );
    const queued = (await read(customer))!;
    assert.equal(queued.state, "CUSTOMER_PENDING");
    assert.equal(queued.request_id, customerId);
    assert.deepEqual(queued.available_actions, []);
    const binding = await fixture();
    await bound(binding);
    assert.equal((await read(binding))!.state, "BOUND");
    assert.deepEqual((await read(binding))!.available_actions, ["CHECKOUT"]);
    const checkout = crypto.randomUUID();
    await db.query(
      "insert into kxra_private.live_billing_intents(id,org_id,actor_id,kind,customer_id,offer_key,mapping_revision,terms_review_sha256,observed_version,auth_time) select $1,org_id,$2,'CHECKOUT',customer_id,offer_key,mapping_revision,$3,version,now() from kxra_private.live_billing_bindings where org_id=$4",
      [checkout, binding.actor, hash, binding.org],
    );
    await db.query(
      "update kxra_private.live_billing_bindings set checkout_intent_id=$1 where org_id=$2",
      [checkout, binding.org],
    );
    const requested = (await read(binding))!;
    assert.equal(requested.state, "REQUEST_PENDING");
    assert.equal(requested.kind, "CHECKOUT");
    assert.equal(requested.request_id, checkout);
    assert.deepEqual(requested.available_actions, []);
    const review = await fixture();
    await bound(review);
    await db.query(
      "update kxra_private.live_billing_bindings set quarantined=true where org_id=$1",
      [review.org],
    );
    assert.equal((await read(review))!.state, "REVIEW_REQUIRED");
    // Global signup admission remains off above; existing verified billing reads still work.
    assert.equal((await read(foreign))!.state, "FRESH");
  } finally {
    await db.query("rollback").catch(() => {});
    await db.end();
  }
});
