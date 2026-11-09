import { captureDatabaseClientFailure } from "../../scripts/customer-directory-joined-ownership.mjs";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { localModeConfiguration } from "../../packages/authz/local-guard";
import { readPrivateFixtureJson } from "./private-fixture-json";
function configuration() {
  assert.ok(
    localModeConfiguration(process.env),
    "EXPLICIT_LOCAL_FIXTURE_REQUIRED",
  );
  assert.ok(
    !process.env.DATABASE_URL &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL &&
      !process.env.VERCEL &&
      !process.env.VERCEL_ENV,
  );
  const runtime = fs.realpathSync(process.env.KXRA_RUNTIME!);
  const cfg = readPrivateFixtureJson(path.join(runtime, "database.json"));
  for (const directory of [runtime, path.join(runtime, "socket")]) {
    const stat = fs.lstatSync(directory);
    assert.ok(stat.isDirectory() && !stat.isSymbolicLink());
    assert.equal(stat.uid, process.getuid!());
    assert.equal(stat.mode & 0o077, 0);
  }
  assert.equal(cfg.host, path.join(runtime, "socket"));
  assert.equal(cfg.user, "kxra_app");
  assert.ok(!cfg.password && !cfg.connectionString && !cfg.ssl);
  return {
    host: cfg.host as string,
    port: cfg.port as number,
    database: cfg.database as string,
    user: os.userInfo().username,
    ssl: false as const,
    password: "",
    options: "",
  };
}

export const enquiryOrg = "10000000-0000-4000-8000-000000000001";
export const enquiryOwner = "20000000-0000-4000-8000-000000000001";
export async function enquiryFixture() {
  const db = new pg.Client(configuration());
  let asynchronousFailure: string | undefined;
  captureDatabaseClientFailure(db, (code: string) => {
    asynchronousFailure ||= code;
  });
  await db.connect();
  const foreignOrg = crypto.randomUUID(),
    foreignId = crypto.randomUUID();
  const ids = Array.from({ length: 61 }, () => crypto.randomUUID())
    .sort()
    .reverse();
  const marker = "Synthetic inbox " + crypto.randomUUID();
  try {
    await db.query(
      "insert into kxra.organisations(id,name,slug,organisation_kind,relationship_type) values($1,$2,$3,'CUSTOMER','CUSTOMER')",
      [foreignOrg, marker, "inbox-" + foreignOrg],
    );
    for (const [index, id] of [...ids, foreignId].entries())
      await db.query(
        `insert into kxra.public_enquiry_submissions(id,org_id,form_kind,status,name,email,company,message,source_path,consent_recorded_at,request_digest,content_fingerprint,idempotency_key,received_at) values($1,$2,'CONTACT','SPAM','Synthetic sender','private@example.invalid',$3,$4,'/contact',now(),$5,$6,$7,'2020-01-01T00:00:00Z')`,
        [
          id,
          index === 61 ? foreignOrg : enquiryOrg,
          marker + " " + id,
          "Synthetic private body " + id,
          "a".repeat(64),
          crypto.randomBytes(32).toString("hex"),
          crypto.randomUUID(),
        ],
      );
  } catch (error) {
    await db.end();
    throw error;
  }
  return {
    db,
    ids,
    marker,
    foreignOrg,
    foreignId,
    async close() {
      try {
        await db.query(
          "delete from kxra.public_enquiry_submissions where id=any($1::uuid[])",
          [[...ids, foreignId]],
        );
      } finally {
        await db.end();
        assert.equal(
          asynchronousFailure,
          undefined,
          "ASYNC_DATABASE_CLIENT_FAILURE",
        );
      }
    },
  };
}
