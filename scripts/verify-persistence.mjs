import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const root = path.resolve(import.meta.dirname, "..");
const runtime = path.resolve(
  process.env.KXRA_RUNTIME || path.join(root, ".runtime"),
);
const configPath = path.join(runtime, "database.json");

if (!fs.existsSync(configPath)) {
  throw Error("Local database is not initialized. Run npm run db:start first.");
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const owner = "20000000-0000-4000-8000-000000000001";
const organisation = "10000000-0000-4000-8000-000000000001";

async function snapshot() {
  const db = new pg.Client(config);
  await db.connect();
  try {
    await db.query("begin");
    await db.query("set local role authenticated");
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true)",
      [
        owner,
        JSON.stringify({
          sub: owner,
          aal: "aal2",
          auth_time: Math.floor(Date.now() / 1000),
        }),
        organisation,
      ],
    );
    const manifest = (
      await db.query(`
        select jsonb_build_object(
          'completed_tasks',coalesce((
            select jsonb_agg(jsonb_build_object(
              'id',t.id,
              'version',t.version,
              'context_record_id',t.context_record_id,
              'context_version',t.context_version,
              'assignee_id',t.assignee_id,
              'state',t.state,
              'completion_note',t.completion_note
            ) order by t.id)
            from kxra.workflow_tasks t
            where t.title='Record the HTTP experiment result' and t.state='completed'
          ),'[]'::jsonb),
          'supersessions',coalesce((
            select jsonb_agg(jsonb_build_object(
              'link_id',l.id,
              'decision_id',l.from_record_id,
              'decision_version',l.from_version,
              'superseded_id',l.to_record_id,
              'superseded_version',l.to_version
            ) order by l.id)
            from kxra.record_links l
            join kxra.records current_decision on current_decision.id=l.from_record_id
            join kxra.records prior_decision on prior_decision.id=l.to_record_id
            where l.relation='supersedes'
              and current_decision.title='HTTP refined prototype decision'
              and current_decision.status='accepted'
              and prior_decision.title='HTTP bounded prototype decision'
              and prior_decision.status='accepted'
          ),'[]'::jsonb),
          'file_versions',coalesce((
            select jsonb_agg(jsonb_build_object(
              'id',v.id,
              'file_id',v.file_id,
              'object_key',v.object_key,
              'sha256',v.sha256,
              'size_bytes',v.size_bytes,
              'lifecycle_state',v.lifecycle_state,
              'source_record_version',v.source_record_version,
              'chunks',coalesce((
                select jsonb_agg(jsonb_build_object(
                  'id',c.id,
                  'ordinal',c.ordinal,
                  'content_sha256',c.content_sha256,
                  'start_offset',c.start_offset,
                  'end_offset',c.end_offset,
                  'classification',c.classification,
                  'audience',c.audience
                ) order by c.ordinal)
                from kxra.knowledge_chunks c where c.file_version_id=v.id
              ),'[]'::jsonb)
            ) order by v.id)
            from kxra.file_versions v
          ),'[]'::jsonb),
          'file_jobs',coalesce((
            select jsonb_agg(jsonb_build_object(
              'id',j.id,
              'file_version_id',j.file_version_id,
              'state',j.state,
              'attempts',j.attempts,
              'last_reason_code',j.last_reason_code
            ) order by j.id)
            from kxra.file_processing_jobs j
          ),'[]'::jsonb)
        ) as manifest
      `)
    ).rows[0].manifest;
    await db.query("rollback");
    return manifest;
  } finally {
    await db.end();
  }
}

function verifyPrivateObjects(manifest) {
  for (const version of manifest.file_versions) {
    const objectPath = path.resolve(
      runtime,
      "objects",
      ...version.object_key.split("/"),
    );
    const objectRoot = path.resolve(runtime, "objects") + path.sep;
    assert.ok(
      objectPath.startsWith(objectRoot),
      "Unsafe object key in manifest",
    );
    assert.ok(
      fs.existsSync(objectPath),
      `Missing private object ${version.id}`,
    );
    const bytes = fs.readFileSync(objectPath);
    assert.equal(bytes.length, version.size_bytes);
    assert.equal(
      crypto.createHash("sha256").update(bytes).digest("hex"),
      version.sha256,
    );
  }
}

const before = await snapshot();
verifyPrivateObjects(before);
assert.ok(
  before.completed_tasks.length > 0,
  "No completed AT-08 HTTP task found. Run npm test first.",
);
assert.ok(
  before.supersessions.length > 0,
  "No accepted AT-08 HTTP decision supersession found. Run npm test first.",
);

execFileSync(process.execPath, ["scripts/database.mjs", "stop"], {
  cwd: root,
  stdio: "inherit",
});
execFileSync(process.execPath, ["scripts/database.mjs", "start"], {
  cwd: root,
  stdio: "inherit",
});

const after = await snapshot();
verifyPrivateObjects(after);
assert.deepEqual(after, before);
console.log(
  `AT-08/10 restart persistence PASS (${after.completed_tasks.length} completed task(s), ${after.supersessions.length} accepted supersession(s), ${after.file_versions.length} private object version(s)).`,
);
