import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";
import os from "node:os";
import { spawnSync, spawn } from "node:child_process";
const runtime = process.env.KXRA_RUNTIME;
if (
  !runtime?.startsWith("/tmp/kxra-connectors-") &&
  !runtime?.startsWith("/private/tmp/kxra-connectors-")
)
  throw Error("Disposable connector runtime required");
const config = JSON.parse(
  fs.readFileSync(path.join(runtime, "database.json"), "utf8"),
);
if (!config.host.startsWith("/") || config.password)
  throw Error("Private fixture socket required");
async function snapshot() {
  const db = new pg.Client({ ...config, user: os.userInfo().username });
  await db.connect();
  try {
    return (
      await db.query(
        `select jsonb_build_object('writes',(select count(*) from kxra_private.github_writes),'uncertain',(select count(*) from kxra_private.github_writes where state='UNCERTAIN'),'receipts',(select count(*) from kxra_private.github_receipts),'digest',encode(sha256(convert_to(coalesce((select jsonb_agg(to_jsonb(w) order by id)::text from kxra_private.github_writes w),'[]')||coalesce((select jsonb_agg(to_jsonb(r) order by id)::text from kxra_private.github_receipts r),'[]'),'UTF8')),'hex')) result`,
      )
    ).rows[0].result;
  } finally {
    await db.end();
  }
}
const before = await snapshot();
assert.ok(before.writes > 0 && before.receipts > 0 && before.uncertain > 0);
const store = path.join(runtime, "github-provider-store.json");
const digest = () =>
  crypto.createHash("sha256").update(fs.readFileSync(store)).digest("hex");
const providerBefore = digest();
for (const action of ["stop", "start"]) {
  const r = spawnSync(process.execPath, ["scripts/database.mjs", action], {
    stdio: "inherit",
    env: process.env,
  });
  assert.equal(r.status, 0);
}
assert.deepEqual(await snapshot(), before);
assert.equal(digest(), providerBefore);
fs.rmSync(path.join(runtime, "github-fake-origin"));
const child = spawn(process.execPath, ["scripts/github-fake-server.mjs"], {
  env: process.env,
  stdio: "ignore",
});
try {
  for (
    let i = 0;
    i < 50 && !fs.existsSync(path.join(runtime, "github-fake-origin"));
    i++
  )
    await new Promise((resolve) => setTimeout(resolve, 100));
  const recorded = new URL(
    fs.readFileSync(path.join(runtime, "github-fake-origin"), "utf8").trim(),
  );
  if (
    recorded.protocol !== "http:" ||
    recorded.hostname !== "127.0.0.1" ||
    recorded.username ||
    recorded.password ||
    recorded.pathname !== "/" ||
    recorded.search ||
    recorded.hash
  )
    throw Error("LOCAL_FIXTURE_ORIGIN_REQUIRED");
  const r = await fetch(
    `http://127.0.0.1:${recorded.port}/repos/fixture-org/fixture-repo/issues/1/comments?per_page=100&page=1`,
    {
      headers: {
        authorization: "Bearer kxra-local-github-fixture-only",
        "x-github-api-version": "2026-03-10",
      },
      signal: AbortSignal.timeout(2000),
    },
  );
  assert.equal(r.status, 200);
  assert.equal(digest(), providerBefore);
  console.log(
    `GitHub durable restart PASS (${before.writes} retained writes, ${before.uncertain} uncertain, ${before.receipts} receipts; provider file unchanged; no POST replay).`,
  );
} finally {
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));
}
