import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { execFileSync } from "node:child_process";
import {
  pairedSetupFixtureBoundary,
  isPairedSetupFixtureBoundary,
  signPairedSetupFixture,
  pairedSetupFixtureIdentity,
  pairedSetupFixtureCookie,
} from "../packages/workspace/paired-setup-fixture";
import { PairedSetupStore } from "../packages/workspace/paired-setup";
function fixture() {
  const root = fs.realpathSync(fs.mkdtempSync("/tmp/kxra-pas-")),
    runtime = path.join(root, ".runtime/pas");
  fs.mkdirSync(runtime, { recursive: true, mode: 0o700 });
  fs.mkdirSync(runtime + "/socket", { mode: 0o700 });
  fs.writeFileSync(
    runtime + "/database.json",
    JSON.stringify({
      host: runtime + "/socket",
      port: 65432,
      user: "kxra_app",
      database: "postgres",
    }),
    { mode: 0o600 },
  );
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: "development",
    KXRA_AUTH_MODE: "fixture",
    KXRA_RUNTIME: runtime,
    KXRA_ORIGIN: "http://127.0.0.1:39881",
    KXRA_LOCAL_SECRET: crypto.randomBytes(48).toString("hex"),
    KXRA_PAIRED_SETUP_UI_PROOF: "1",
  };
  return { env, close: () => fs.rmSync(root, { recursive: true }) };
}
const actor = () => ({
  id: crypto.randomUUID(),
  organisation_id: crypto.randomUUID(),
  source: "fixture" as const,
  aal: "aal2" as const,
  auth_time: Math.floor(Date.now() / 1000),
  session_version: 1,
});
test("fixture identity requires owned proof and cannot be forged or relabelled", () => {
  const f = fixture();
  try {
    const cap = pairedSetupFixtureBoundary(f.env),
      pool = {
        async connect(): Promise<never> {
          throw Error("not called");
        },
      },
      a = actor();
    assert.ok(isPairedSetupFixtureBoundary(cap));
    assert.equal(isPairedSetupFixtureBoundary({ ...cap }), false);
    assert.throws(() => new PairedSetupStore(pool, a, true), /IDENTITY/);
    assert.doesNotThrow(() => new PairedSetupStore(pool, a, true, cap));
    assert.equal(a.source, "fixture");
  } finally {
    f.close();
  }
});
test("purpose-bound synthetic cookie rejects tamper, duplicates, expiration and other cookie roles", () => {
  const f = fixture();
  try {
    const a = actor(),
      token = signPairedSetupFixture(a, f.env),
      req = (cookie: string) =>
        new Request(f.env.KXRA_ORIGIN!, { headers: { cookie } }),
      header = pairedSetupFixtureCookie + "=" + token;
    assert.equal(
      pairedSetupFixtureIdentity(req(header), f.env)?.source,
      "fixture",
    );
    for (const cookie of [
      header + "x",
      header + "; " + header,
      "kxra_local_session=" + token,
      "paired_session=" + token,
    ])
      assert.equal(pairedSetupFixtureIdentity(req(cookie), f.env), null);
    assert.equal(
      pairedSetupFixtureIdentity(req(header), f.env, Date.now() + 601000),
      null,
    );
    const payload = Buffer.from(
        JSON.stringify({ purpose: "CUSTOMER_SESSION" }),
      ).toString("base64url"),
      signature = crypto
        .createHmac("sha256", f.env.KXRA_LOCAL_SECRET!)
        .update(payload)
        .digest("base64url");
    assert.equal(
      pairedSetupFixtureIdentity(
        req(pairedSetupFixtureCookie + "=" + payload + "." + signature),
        f.env,
      ),
      null,
    );
  } finally {
    f.close();
  }
});
test("fixture proof refuses hosted modes, real-auth configuration, TCP stores and broad file permissions", () => {
  const f = fixture();
  try {
    for (const change of [
      { NODE_ENV: "production" },
      { VERCEL: "1" },
      { VERCEL_ENV: "preview" },
      { NEXT_PUBLIC_SUPABASE_URL: "https://synthetic.invalid" },
      { SUPABASE_SERVICE_ROLE_KEY: "SYNTHETIC_UNUSED" },
      { DATABASE_URL: "SYNTHETIC_UNUSED" },
      { KXRA_PAIRED_SETUP_UI_PROOF: "0" },
      { KXRA_ORIGIN: "https://synthetic.invalid" },
    ])
      assert.throws(() =>
        pairedSetupFixtureBoundary({
          ...f.env,
          ...change,
        } as NodeJS.ProcessEnv),
      );
    fs.chmodSync(f.env.KXRA_RUNTIME! + "/database.json", 0o644);
    assert.throws(() => pairedSetupFixtureBoundary(f.env));
  } finally {
    f.close();
  }
});
test("production route stays disabled with fixture-shaped flags and no database access", () => {
  const script = `import assert from 'node:assert/strict';import {POST} from './apps/os/app/api/paired-setup/route.ts';const r=await POST(new Request('http://127.0.0.1:39881/api/paired-setup',{method:'POST'}));assert.equal(r.status,503);console.log('PRODUCTION_SETUP_DISABLED');`;
  const result = execFileSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", script],
    {
      cwd: path.resolve(import.meta.dirname, ".."),
      encoding: "utf8",
      timeout: 30000,
      env: {
        PATH: process.env.PATH,
        HOME: os.tmpdir(),
        NODE_ENV: "production",
        KXRA_AUTH_MODE: "fixture",
        KXRA_ORIGIN: "http://127.0.0.1:39881",
        KXRA_RUNTIME: "/tmp/no-setup-runtime",
        KXRA_LOCAL_SECRET: crypto.randomBytes(48).toString("hex"),
        KXRA_PAIRED_SETUP_UI_PROOF: "1",
      },
    },
  );
  assert.match(result, /PRODUCTION_SETUP_DISABLED/);
});

test("local adapter canonicalizes only after pinned Host and Origin validation", () => {
  const f = fixture();
  try {
    const script = `import assert from 'node:assert/strict';import {pairedSetupRoute} from './apps/os/lib/paired-setup.local.ts';
 for(const [host,origin,status] of [['127.0.0.1:39881','http://127.0.0.1:39881',401],['foreign.invalid','http://127.0.0.1:39881',403],['127.0.0.1:39881','https://foreign.invalid',403]]){const r=await pairedSetupRoute(new Request('http://localhost:39881/api/paired-setup',{method:'POST',headers:{host,origin,'content-type':'application/json'},body:'{\"action\":\"OPTIONS\"}'}));assert.equal(r.status,status);}
 console.log('PINNED_HOST_ORIGIN_PASS');`;
    const output = execFileSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", script],
      {
        cwd: path.resolve(import.meta.dirname, ".."),
        encoding: "utf8",
        timeout: 30000,
        env: { PATH: process.env.PATH, HOME: os.tmpdir(), ...f.env },
      },
    );
    assert.match(output, /PINNED_HOST_ORIGIN_PASS/);
  } finally {
    f.close();
  }
});
