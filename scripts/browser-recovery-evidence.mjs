import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { localModeConfiguration } from "../packages/authz/local-guard.ts";

export function assertBrowserRecoveryFixture(
  config,
  environment = process.env,
) {
  assert.ok(
    localModeConfiguration(environment) && !environment.VERCEL_ENV,
    "Browser recovery requires the guarded synthetic local fixture",
  );
  assert.equal(
    config.host,
    path.join(path.resolve(environment.KXRA_RUNTIME), "socket"),
    "Browser recovery requires the fixture Unix socket",
  );
  assert.match(
    environment.KXRA_CI_RUN_ID || "",
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: path.resolve(import.meta.dirname, ".."),
    encoding: "utf8",
    timeout: 2000,
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  assert.match(sourceSha, /^[a-f0-9]{40}$/);
  if (
    environment.GITHUB_ACTIONS === "true" ||
    ["GITHUB_SHA", "GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT"].some(
      (key) => environment[key],
    )
  ) {
    assert.equal(environment.GITHUB_ACTIONS, "true");
    assert.match(environment.GITHUB_RUN_ID || "", /^[1-9][0-9]{0,19}$/);
    assert.match(environment.GITHUB_RUN_ATTEMPT || "", /^[1-9][0-9]{0,5}$/);
    assert.equal(
      environment.GITHUB_SHA,
      sourceSha,
      "Browser recovery source identity must match HEAD",
    );
  }
}

// Explicit noncredential columns only. Values are hashed inside PostgreSQL;
// no row payload, cookie, key or credential-bearing table is returned or logged.
const manifests = Object.freeze({
  ideas: `select r.id,r.title,r.body,r.version,i.raw_idea,i.state,
    i.version as idea_version,i.submitted_at,i.updated_at from kxra.ideas i join kxra.records r on r.id=i.record_id
    where r.title like 'Browser-owned idea %'`,
  case_records: `select id,org_id,room_id,kind,title,body,responsible,next_step,
    due_on,parent_id,stage,version,created_by,updated_by,details,created_at,updated_at
    from kxra.team_case_records`,
  case_actions: `select id,org_id,room_id,kind,source_id,source_version,
    source_hash,source_snapshot,target_stage,note,state,version,requested_by,
    reviewed_by,reviewed_at,expires_at,result,executed_at,created_at from kxra.team_case_actions`,
  uploads: `select id,file_id,record_id,project_id,version,object_key,filename,
    declared_mime,size_bytes,sha256,lifecycle_state,created_by,upload_request_id,
    source_record_version from kxra.file_versions`,
  knowledge_chunks: `select id,file_version_id,ordinal,content_sha256,
    start_offset,end_offset,classification,audience from kxra.knowledge_chunks`,
  file_jobs: `select id,file_version_id,state,attempts,last_reason_code
    from kxra.file_processing_jobs`,
});

export async function browserRecoveryEvidence(client) {
  const result = {};
  for (const [name, rows] of Object.entries(manifests)) {
    const evidence = (
      await client.query(`with proof as (${rows}) select count(*)::integer as count,
        encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(proof)
          order by proof.id)::text,'[]'),'UTF8')),'hex') as sha256 from proof`)
    ).rows[0];
    assert.ok(evidence.count > 0, `Missing browser recovery evidence: ${name}`);
    assert.match(evidence.sha256, /^[a-f0-9]{64}$/);
    result[name] = evidence;
  }
  const executed = (
    await client.query(
      "select count(*)::integer as count from kxra.team_case_actions where state='EXECUTED' and result is not null",
    )
  ).rows[0].count;
  assert.ok(
    executed > 0,
    "Missing browser-produced executed proposal evidence",
  );
  result.executedCaseActions = executed;
  return result;
}

export async function browserObjectEvidence(client, runtime) {
  const versions = (
    await client.query(
      "select id,object_key,sha256,size_bytes from kxra.file_versions order by id",
    )
  ).rows;
  assert.ok(versions.length > 0, "Missing browser upload objects");
  const objectRoot = path.resolve(runtime, "objects") + path.sep;
  const manifest = [];
  for (const version of versions) {
    const absolute = path.resolve(objectRoot, ...version.object_key.split("/"));
    assert.ok(absolute.startsWith(objectRoot), "Unsafe browser object key");
    const fd = fs.openSync(
      absolute,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
    );
    try {
      const before = fs.fstatSync(fd);
      assert.ok(before.isFile() && before.nlink === 1);
      assert.equal(before.size, Number(version.size_bytes));
      assert.ok(before.size <= 20971520);
      const sha256 = crypto
        .createHash("sha256")
        .update(fs.readFileSync(fd))
        .digest("hex");
      assert.equal(sha256, version.sha256);
      const after = fs.fstatSync(fd);
      assert.equal(after.ino, before.ino);
      assert.equal(after.dev, before.dev);
      assert.equal(after.size, before.size);
      manifest.push({ id: version.id, sha256, bytes: before.size });
    } finally {
      fs.closeSync(fd);
    }
  }
  return {
    count: manifest.length,
    sha256: crypto
      .createHash("sha256")
      .update(JSON.stringify(manifest))
      .digest("hex"),
  };
}
