import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { localModeConfiguration } from "../packages/authz/local-guard";
import { bindSyntheticModernScope } from "./support/modern-billing-scope-db";

// SOURCE ONLY: OWNER executes sequentially in a FRESH isolated fixture after0107.
// Complements the full104 paid-access test in a second fresh STAGING_SANDBOX fixture.
// No provider call, real resource, legal approval or production activation is represented.
test("modern sandbox keeps false-mode receipts, rejects LIVE capabilities and cross-scope mutation", async () => {
  assert.ok(localModeConfiguration(process.env));
  assert.ok(!process.env.VERCEL_ENV && !process.env.DATABASE_URL);
  const runtime = fs.realpathSync(process.env.KXRA_RUNTIME!);
  for (const directory of [runtime,path.join(runtime,"socket")]) {
    const m = fs.lstatSync(directory);
    assert.ok(m.isDirectory() && !m.isSymbolicLink());
    assert.equal(m.uid,process.getuid!());assert.equal(m.mode & 0o077,0);
  }
  const file=path.join(runtime,"database.json"),meta=fs.lstatSync(file);
  assert.ok(meta.isFile() && !meta.isSymbolicLink());
  assert.equal(meta.uid,process.getuid!());assert.equal(meta.mode & 0o022,0);
  const cfg=JSON.parse(fs.readFileSync(file,"utf8"));
  assert.equal(cfg.host,path.join(process.env.KXRA_RUNTIME!,"socket"));
  assert.equal(fs.realpathSync(cfg.host),path.join(runtime,"socket"));
  assert.equal(cfg.user,"kxra_app");assert.ok(!cfg.password && !cfg.connectionString && !cfg.ssl);
  assert.ok(Number.isInteger(cfg.port) && cfg.port>=1024 && cfg.port<=65535);
  assert.match(cfg.database,/^[A-Za-z0-9_-]+$/);
  const db=new pg.Client({host:path.join(runtime,"socket"),port:cfg.port,database:cfg.database,user:os.userInfo().username,password:"",ssl:false,options:""});
  await db.connect();
  async function denied(sql:string,values:unknown[]=[],worker=true) {
    await db.query("savepoint scope_denial");
    try {
      if(worker) await db.query("set local role kxra_billing_worker");
      await assert.rejects(db.query(sql,values));
    } finally {await db.query("rollback to scope_denial");await db.query("release scope_denial");}
  }
  async function worker(sql:string,values:unknown[]=[]) {
    await db.query("set local role kxra_billing_worker");
    try {return await db.query(sql,values);} finally {await db.query("reset role");}
  }
  try {
    await db.query("begin");
    const execution=await bindSyntheticModernScope(db.query.bind(db),"STAGING_SANDBOX"),tag=execution.execution_scope;
    assert.equal(tag.livemode,false);assert.equal(tag.project_ref,"jlebgsxcvhvpueuibekd");
    assert.deepEqual(await bindSyntheticModernScope(db.query.bind(db),"STAGING_SANDBOX"),execution);
    await assert.rejects(bindSyntheticModernScope(db.query.bind(db),"LIVE"));
    await denied("update kxra_private.modern_billing_execution_identity set execution_mode='LIVE' where singleton",[],false);
    await denied("update kxra_private.modern_billing_scope_catalogue set people=people where scope_id=$1",[tag.scope_id],false);
    await db.query("update kxra_private.live_webhook_endpoint_binding set enabled=true,project_ref=$1,review_sha256=$2 where singleton",[tag.project_ref,"a".repeat(64)]);
    const event={execution_scope:tag,event_id:"evt_SYNTHETICsandboxScope",event_type:"invoice.paid",payload_sha256:"b".repeat(64),customer_id:"cus_SYNTHETICunknown",subscription_id:null,invoice_id:"in_SYNTHETICunknown",account_id:tag.account_id,project_ref:tag.project_ref,api_version:tag.api_version,livemode:false};
    assert.equal((await worker("select kxra_private.staging_sandbox_record_live_billing_wakeup($1::jsonb) result",[JSON.stringify(event)])).rows[0].result,"UNMATCHED");
    assert.equal((await worker("select kxra_private.staging_sandbox_record_live_billing_wakeup($1::jsonb) result",[JSON.stringify(event)])).rows[0].result,"DUPLICATE");
    const receipt=(await db.query("select livemode,execution_mode,scope_id from kxra_private.live_webhook_receipts where event_id=$1",[event.event_id])).rows[0];
    assert.deepEqual(receipt,{livemode:false,execution_mode:"STAGING_SANDBOX",scope_id:tag.scope_id});
    assert.equal((await db.query("select state from kxra_private.live_webhook_queue where event_id=$1",[event.event_id])).rows[0].state,"HELD");
    await denied("select kxra_private.record_live_billing_wakeup($1::jsonb)",[JSON.stringify(event)]);
    await denied("select kxra_private.staging_sandbox_record_live_billing_wakeup($1::jsonb)",[JSON.stringify({...event,livemode:true})]);
    await denied("select kxra_private.staging_sandbox_record_live_billing_wakeup($1::jsonb)",[JSON.stringify({...event,execution_scope:{...tag,project_ref:"lhbgeucifxxcdoyrnesf"}})]);
    // Correct stage entrypoints remain fail-closed without canonical customer/session/readjob.
    for(const prefix of ["","staging_sandbox_"]) {
      await denied(`select kxra_private.${prefix}claim_live_customer_intent($1::uuid)`,[crypto.randomUUID()]);
      await denied(`select kxra_private.${prefix}claim_live_billing_intent($1::uuid)`,[crypto.randomUUID()]);
    }
    assert.equal((await worker("select kxra_private.staging_sandbox_live_paid_read_current($1::uuid) result",[crypto.randomUUID()])).rows[0].result,false);
    await denied("select kxra_private.live_paid_read_current($1::uuid)",[crypto.randomUUID()]);
    await denied("select kxra_private.modern_core_record_live_billing_wakeup($1::jsonb)",[JSON.stringify(event)]);
    const changed={...event,payload_sha256:"c".repeat(64)};
    for(let n=0;n<2;n++) assert.equal((await worker("select kxra_private.staging_sandbox_record_live_billing_wakeup($1::jsonb) result",[JSON.stringify(changed)])).rows[0].result,"CONFLICT");
    assert.equal((await db.query("select count(*)::integer n from kxra_private.live_webhook_conflicts where event_id=$1",[event.event_id])).rows[0].n,1);
    await db.query("update kxra_private.modern_billing_execution_identity set enabled=false where singleton");
    await denied("select kxra_private.staging_sandbox_record_live_billing_wakeup($1::jsonb)",[JSON.stringify(event)]);
    assert.equal((await worker("select kxra_private.staging_sandbox_live_paid_read_current($1::uuid) result",[crypto.randomUUID()])).rows[0].result,false);
  } finally {await db.query("rollback");await db.end();}
});
