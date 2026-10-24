import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { localModeConfiguration } from "../../packages/authz/local-guard";
import type { ModernExecutionMode } from "../../packages/integrations/modern-billing-scope";
import { modernBillingFixture } from "./modern-billing-scope";

type Query = (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, any>[] }>;
/** SOURCE ONLY. Owner executes inside a rollback on an isolated generated Unix-socket fixture.
 * Never binds a hosted database, changes an existing identity, or switches one DB's mode. */
export async function bindSyntheticModernScope(query: Query, mode: ModernExecutionMode = "LIVE") {
  assert.ok(localModeConfiguration(process.env), "Generated private local fixture required");
  assert.ok(!process.env.VERCEL_ENV && !process.env.DATABASE_URL);
  const runtime = fs.realpathSync(process.env.KXRA_RUNTIME!);
  for (const directory of [runtime, path.join(runtime, "socket")]) {
    const meta = fs.lstatSync(directory);
    assert.ok(meta.isDirectory() && !meta.isSymbolicLink());
    assert.equal(meta.uid, process.getuid!());
    assert.equal(meta.mode & 0o077, 0);
  }
  const file = path.join(runtime, "database.json"), meta = fs.lstatSync(file);
  assert.ok(meta.isFile() && !meta.isSymbolicLink());
  assert.equal(meta.uid, process.getuid!());
  assert.equal(meta.mode & 0o022, 0);
  const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(cfg.host, path.join(process.env.KXRA_RUNTIME!, "socket"));
  assert.equal(fs.realpathSync(cfg.host), path.join(runtime, "socket"));
  assert.equal(cfg.user, "kxra_app");
  assert.ok(!cfg.password && !cfg.connectionString && !cfg.ssl);
  const isolation = (await query("select current_setting('listen_addresses') listen,current_setting('unix_socket_directories') socket,current_database() db")).rows[0];
  assert.equal(isolation.listen, "");
  assert.equal(fs.realpathSync(isolation.socket), path.join(runtime, "socket"));
  assert.equal(isolation.db, cfg.database);
  const { execution } = modernBillingFixture(mode), tag = execution.execution_scope;
  // This advisory lock only serializes local fixture setup. It does not confer worker authority.
  await query("select pg_advisory_xact_lock(hashtextextended('synthetic-modern-scope',0))");
  const identity = (await query("select * from kxra_private.modern_billing_execution_identity where singleton for update")).rows[0];
  assert.ok(identity, "Migration0100 scope identity required");
  if (identity.scope_id === null) {
    assert.equal(identity.enabled, false);
    await query("update kxra_private.modern_billing_execution_identity set scope_id=$1,execution_mode=$2,project_ref=$3,account_id=$4,api_version=$5,catalogue_revision=$6,review_sha256=$7,scope_sha256=$8 where singleton and scope_id is null and not enabled", [tag.scope_id,tag.execution_mode,tag.project_ref,tag.account_id,tag.api_version,tag.catalogue_revision,execution.review_sha256,tag.scope_sha256]);
    for (const row of execution.catalogue) await query("insert into kxra_private.modern_billing_scope_catalogue(scope_id,offer_key,price_id,product_id,monthly_amount_minor,people,currency,interval) values($1,$2,$3,$4,$5,$6,$7,$8)",[tag.scope_id,row.offer_key,row.price_id,row.product_id,row.monthly_amount_minor,row.people,row.currency,row.interval]);
    await query("update kxra_private.modern_billing_execution_identity set enabled=true where singleton");
  } else {
    // Never silently reset, repair, enable, or cross-switch an already bound fixture.
    assert.equal(identity.enabled, true);
    assert.equal(identity.review_sha256, execution.review_sha256);
    assert.deepEqual((await query("select kxra_private.modern_billing_scope_tag() tag")).rows[0].tag, tag);
  }
  const attestation = (await query("select kxra_private.modern_billing_scope_attestation() result")).rows[0].result;
  assert.deepEqual(attestation.execution_scope, tag);
  assert.equal(attestation.enabled, true);
  assert.equal(attestation.review_sha256, execution.review_sha256);
  const sort = (rows: typeof execution.catalogue) => [...rows].sort((a,b) => a.offer_key.localeCompare(b.offer_key));
  assert.deepEqual(sort(attestation.catalogue), sort(execution.catalogue));
  return attestation as typeof execution;
}
