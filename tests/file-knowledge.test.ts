import { after, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import {
  chunkExtractedText,
  inspectPrivateObject,
  LocalPrivateObjectStore,
  sha256,
} from "../packages/storage";
import {
  processFileJobs,
  reconcilePrivateObjects,
} from "../packages/storage/worker";
import { runtimeFile } from "./support/runtime";

const root = process.cwd();
process.env.KXRA_AUTH_MODE ||= "fixture";
process.env.KXRA_RUNTIME ||= path.join(root, ".runtime");

const config = JSON.parse(
  fs.readFileSync(runtimeFile("database.json"), "utf8"),
);
const admin = new pg.Pool({ ...config, user: os.userInfo().username });
const store = new LocalPrivateObjectStore(process.env.KXRA_RUNTIME);
const org = "10000000-0000-4000-8000-000000000001";
const p2 = "30000000-0000-4000-8000-000000000002";
const p3 = "30000000-0000-4000-8000-000000000003";
const actors = {
  owner: "20000000-0000-4000-8000-000000000001",
  partner: "20000000-0000-4000-8000-000000000002",
  viewer: "20000000-0000-4000-8000-000000000003",
  revoked: "20000000-0000-4000-8000-000000000004",
};

type Actor = keyof typeof actors;

async function as(database: pg.PoolClient, actor: Actor | null) {
  await database.query("reset role");
  await database.query(`set local role ${actor ? "authenticated" : "anon"}`);
  await database.query(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true)",
    [
      actor ? actors[actor] : "",
      JSON.stringify({
        sub: actor ? actors[actor] : null,
        aal: "aal2",
        auth_time: Math.floor(Date.now() / 1000),
      }),
      actor ? org : "",
    ],
  );
}

async function actorTransaction<T>(
  actor: Actor,
  work: (database: pg.PoolClient) => Promise<T>,
) {
  const database = await admin.connect();
  try {
    await database.query("begin");
    await as(database, actor);
    const output = await work(database);
    await database.query("commit");
    return output;
  } catch (error) {
    await database.query("rollback");
    throw error;
  } finally {
    database.release();
  }
}

async function createUpload(
  actor: Actor,
  projectId: string,
  filename: string,
  content: Buffer,
  mime = "text/plain",
  visibility = "project_shared",
) {
  const requestId = crypto.randomUUID();
  const metadata = await actorTransaction(actor, async (database) => {
    const result = await database.query<{
      file_id: string;
      record_id: string;
      file_version_id: string;
      object_key: string;
      lifecycle_state: string;
    }>("select * from kxra.create_file_upload($1,$2,$3,$4,$5,$6,$7)", [
      projectId,
      filename,
      mime,
      content.length,
      sha256(content),
      visibility,
      requestId,
    ]);
    return result.rows[0];
  });
  await store.putImmutable(metadata.object_key, content, mime);
  const lifecycleState = await actorTransaction(actor, async (database) => {
    return (
      await database.query<{ state: string }>(
        "select kxra.finalize_file_upload($1,$2,$3,$4) as state",
        [metadata.file_id, requestId, sha256(content), content.length],
      )
    ).rows[0].state;
  });
  return { ...metadata, lifecycle_state: lifecycleState };
}

async function setPartnerProject(active: boolean) {
  const database = await admin.connect();
  try {
    await database.query("begin");
    await database.query(
      "update kxra.project_memberships set active=$1 where project_id=$2 and user_id=$3",
      [active, p2, actors.partner],
    );
    await database.query(
      "update kxra.members set access_version=access_version+1 where id=$1 and org_id=$2",
      [actors.partner, org],
    );
    await database.query("commit");
  } catch (error) {
    await database.query("rollback");
    throw error;
  } finally {
    database.release();
  }
}

after(async () => {
  await setPartnerProject(true);
  await admin.end();
});

test("AT-10 scanner rejects malware, active content, archives and MIME deception", () => {
  assert.equal(
    inspectPrivateObject(
      Buffer.from("clean synthetic evidence"),
      "evidence.txt",
      "text/plain",
    ).outcome,
    "CLEAN",
  );
  assert.equal(
    inspectPrivateObject(
      Buffer.from(
        "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
      ),
      "eicar.txt",
      "text/plain",
    ).reasonCode,
    "MALWARE_DETECTED",
  );
  assert.equal(
    inspectPrivateObject(
      Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]),
      "expansion.zip",
      "application/zip",
    ).reasonCode,
    "ARCHIVE_EXPANSION_RISK",
  );
  assert.equal(
    inspectPrivateObject(
      Buffer.from("synthetic macro container"),
      "automation.docm",
      "application/vnd.ms-word.document.macroEnabled.12",
    ).reasonCode,
    "ACTIVE_CONTENT",
  );
  assert.equal(
    inspectPrivateObject(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      "deceptive.txt",
      "text/plain",
    ).reasonCode,
    "MIME_MISMATCH",
  );
  assert.equal(
    inspectPrivateObject(
      Buffer.from("%PDF-1.4\n/OpenAction /JavaScript"),
      "active.pdf",
      "application/pdf",
    ).reasonCode,
    "ACTIVE_CONTENT",
  );
  const chunks = chunkExtractedText("bounded evidence ".repeat(250));
  assert.ok(chunks.length > 1);
  assert.deepEqual(
    chunks.map((chunk, ordinal) => [
      chunk.ordinal,
      chunk.content_sha256 === sha256(chunk.content),
      chunk.end_offset > chunk.start_offset,
      ordinal,
    ]),
    chunks.map((_, ordinal) => [ordinal, true, true, ordinal]),
  );
  assert.equal(
    inspectPrivateObject(
      Buffer.from("harmless text"),
      "payload.exe",
      "text/plain",
    ).reasonCode,
    "EXECUTABLE_CONTENT",
  );
});

test("AT-10 clean upload becomes immutable indexed chunks with inherited RLS", async () => {
  const marker = `indexed-evidence-${crypto.randomUUID()}`;
  const upload = await createUpload(
    "owner",
    p2,
    `${marker}.txt`,
    Buffer.from(`${marker} proves the isolated extraction path.`),
  );
  const processed = await processFileJobs({
    workerReference: "at10-clean-worker",
  });
  assert.ok(
    processed.some(
      (result) =>
        result.fileId === upload.file_id && result.state === "INDEXED",
    ),
  );

  await actorTransaction("owner", async (database) => {
    const file = (
      await database.query(
        "select lifecycle_state,scan_status,indexed_at from kxra.files where id=$1",
        [upload.file_id],
      )
    ).rows[0];
    assert.equal(file.lifecycle_state, "INDEXED");
    assert.equal(file.scan_status, "clean");
    assert.ok(file.indexed_at);
    assert.deepEqual(
      (
        await database.query(
          "select to_state from kxra.file_state_events where file_id=$1 order by id",
          [upload.file_id],
        )
      ).rows.map((row) => row.to_state),
      [
        "UPLOADING",
        "QUARANTINED",
        "SCANNING",
        "CLEAN",
        "EXTRACTING",
        "EXTRACTED",
        "INDEXING",
        "INDEXED",
      ],
    );
    assert.equal(
      (
        await database.query(
          `select count(*)::int as count,
            bool_and(source_record_version>0 and start_offset>=0 and end_offset>start_offset
              and extraction_adapter='KXRA_ISOLATED_TEXT_EXTRACTOR'
              and classification='USER-SUPPLIED INFORMATION'
              and audience='project_shared') as metadata_valid
           from kxra.knowledge_chunks where file_id=$1`,
          [upload.file_id],
        )
      ).rows[0].count,
      1,
    );
    assert.equal(
      (
        await database.query(
          `select bool_and(source_record_version>0 and start_offset>=0 and end_offset>start_offset
            and extraction_adapter='KXRA_ISOLATED_TEXT_EXTRACTOR'
            and classification='USER-SUPPLIED INFORMATION'
            and audience='project_shared') as valid
           from kxra.knowledge_chunks where file_id=$1`,
          [upload.file_id],
        )
      ).rows[0].valid,
      true,
    );
  });

  await actorTransaction("partner", async (database) => {
    const chunks = await database.query(
      "select content from kxra.knowledge_chunks where file_id=$1",
      [upload.file_id],
    );
    assert.equal(chunks.rowCount, 1);
    assert.match(chunks.rows[0].content, new RegExp(marker));
    await assert.rejects(() =>
      database.query(
        "update kxra.files set lifecycle_state='INDEXED' where id=$1",
        [upload.file_id],
      ),
    );
    await assert.rejects(() =>
      database.query(
        "select * from kxra_private.claim_file_processing_job($1)",
        ["forged-browser-worker"],
      ),
    );
  });
  await actorTransaction("viewer", async (database) => {
    assert.equal(
      (
        await database.query(
          "select id from kxra.knowledge_chunks where file_id=$1",
          [upload.file_id],
        )
      ).rowCount,
      0,
    );
  });
  await actorTransaction("revoked", async (database) => {
    assert.equal(
      (
        await database.query(
          "select id from kxra.knowledge_chunks where file_id=$1",
          [upload.file_id],
        )
      ).rowCount,
      0,
    );
  });
});

test("AT-10 upload intent retry is idempotent and immutable", async () => {
  const requestId = crypto.randomUUID();
  const content = Buffer.from(`idempotent-${crypto.randomUUID()}`);
  const create = () =>
    actorTransaction("owner", async (database) => {
      return (
        await database.query<{
          file_id: string;
          file_version_id: string;
          object_key: string;
          lifecycle_state: string;
        }>("select * from kxra.create_file_upload($1,$2,$3,$4,$5,$6,$7)", [
          p2,
          "idempotent.txt",
          "text/plain",
          content.length,
          sha256(content),
          "owner_only",
          requestId,
        ])
      ).rows[0];
    });
  const first = await create();
  const retry = await create();
  assert.deepEqual(retry, first);
  await assert.rejects(() =>
    actorTransaction("owner", (database) =>
      database.query(
        "select * from kxra.create_file_upload($1,$2,$3,$4,$5,$6,$7)",
        [
          p2,
          "changed.txt",
          "text/plain",
          content.length,
          sha256(content),
          "owner_only",
          requestId,
        ],
      ),
    ),
  );
  await store.putImmutable(first.object_key, content, "text/plain");
  const finalize = () =>
    actorTransaction(
      "owner",
      async (database) =>
        (
          await database.query<{ state: string }>(
            "select kxra.finalize_file_upload($1,$2,$3,$4) as state",
            [first.file_id, requestId, sha256(content), content.length],
          )
        ).rows[0].state,
    );
  assert.equal(await finalize(), "QUARANTINED");
  assert.equal(await finalize(), "QUARANTINED");
  await actorTransaction("owner", async (database) => {
    assert.equal(
      (
        await database.query(
          "select count(*)::int as count from kxra.file_processing_jobs where file_version_id=$1",
          [first.file_version_id],
        )
      ).rows[0].count,
      1,
    );
  });
});

test("AT-10 deterministic file processor fails closed outside fixtures", async () => {
  const previousMode = process.env.KXRA_AUTH_MODE;
  process.env.KXRA_AUTH_MODE = "supabase";
  await assert.rejects(
    () => processFileJobs({ workerReference: "forbidden-static-worker" }),
    /fixture-only/,
  );
  process.env.KXRA_AUTH_MODE = previousMode;
});

test("AT-10 rejected and failed files never enter retrieval", async () => {
  const cases = [
    {
      name: `malware-${crypto.randomUUID()}.txt`,
      mime: "text/plain",
      content: Buffer.from(
        "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
      ),
      state: "REJECTED",
    },
    {
      name: `archive-${crypto.randomUUID()}.zip`,
      mime: "application/zip",
      content: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]),
      state: "REJECTED",
    },
    {
      name: `unsupported-${crypto.randomUUID()}.pdf`,
      mime: "application/pdf",
      content: Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj"),
      state: "FAILED",
    },
  ];
  const uploads: Awaited<ReturnType<typeof createUpload>>[] = [];
  for (const fixture of cases)
    uploads.push(
      await createUpload(
        "owner",
        p2,
        fixture.name,
        fixture.content,
        fixture.mime,
      ),
    );
  await processFileJobs({ workerReference: "at10-adversarial-worker" });
  await actorTransaction("owner", async (database) => {
    for (let index = 0; index < uploads.length; index += 1) {
      const file = (
        await database.query(
          "select lifecycle_state from kxra.files where id=$1",
          [uploads[index].file_id],
        )
      ).rows[0];
      assert.equal(file.lifecycle_state, cases[index].state);
      assert.equal(
        (
          await database.query(
            "select id from kxra.knowledge_chunks where file_id=$1",
            [uploads[index].file_id],
          )
        ).rowCount,
        0,
      );
    }
  });
});

test("AT-10 delivery recheck withholds bytes after project revocation", async () => {
  await setPartnerProject(true);
  const content = Buffer.from(`delivery-${crypto.randomUUID()}`);
  const upload = await createUpload(
    "owner",
    p2,
    `delivery-${crypto.randomUUID()}.txt`,
    content,
  );
  await processFileJobs({ workerReference: "at10-delivery-worker" });
  const delivery = await actorTransaction("partner", async (database) => {
    const result = await database.query<{
      delivery_id: string;
      sha256: string;
      size_bytes: number;
    }>("select * from kxra.authorize_file_delivery($1,$2)", [
      upload.file_id,
      crypto.randomUUID(),
    ]);
    assert.equal(result.rowCount, 1);
    return result.rows[0];
  });
  await setPartnerProject(false);
  const allowed = await actorTransaction("partner", async (database) => {
    return (
      await database.query<{ allowed: boolean }>(
        "select kxra.complete_file_delivery($1,$2,$3) as allowed",
        [delivery.delivery_id, delivery.sha256, delivery.size_bytes],
      )
    ).rows[0].allowed;
  });
  assert.equal(allowed, false);
  await actorTransaction("owner", async (database) => {
    const event = (
      await database.query(
        "select state,reason_code,delivered_bytes from kxra.file_delivery_events where id=$1",
        [delivery.delivery_id],
      )
    ).rows[0];
    assert.equal(event.state, "WITHHELD");
    assert.equal(event.reason_code, "AUTHORITY_CHANGED");
    assert.equal(event.delivered_bytes, null);
  });
  await setPartnerProject(true);
});

test("AT-11 stale evidence envelope is withheld after retrieval-time revocation", async () => {
  await setPartnerProject(true);
  const marker = `query-envelope-${crypto.randomUUID()}`;
  const upload = await createUpload(
    "owner",
    p2,
    `${marker}.txt`,
    Buffer.from(`${marker} current evidence`),
  );
  await processFileJobs({ workerReference: "at11-query-worker" });
  const envelope = await actorTransaction("partner", async (database) => {
    const run = (
      await database.query<{ id: string }>(
        "select kxra.begin_knowledge_query($1,$2,$3,$4) as id",
        [p2, crypto.randomUUID(), sha256(marker), "PROJECT_EVIDENCE"],
      )
    ).rows[0].id;
    const chunk = (
      await database.query<{ id: string; source_version: number }>(
        "select id,source_version from kxra.knowledge_chunks where file_id=$1",
        [upload.file_id],
      )
    ).rows[0];
    return { run, chunk };
  });
  await setPartnerProject(false);
  const allowed = await actorTransaction("partner", async (database) => {
    return (
      await database.query<{ allowed: boolean }>(
        "select kxra.complete_knowledge_query($1,$2,$3,$4) as allowed",
        [
          envelope.run,
          JSON.stringify([
            {
              type: "CHUNK",
              id: envelope.chunk.id,
              version: envelope.chunk.source_version,
            },
          ]),
          "DELIVERED",
          null,
        ],
      )
    ).rows[0].allowed;
  });
  assert.equal(allowed, false);
  await actorTransaction("owner", async (database) => {
    const run = (
      await database.query(
        "select state,evidence_refs,failure_code from kxra.knowledge_query_runs where id=$1",
        [envelope.run],
      )
    ).rows[0];
    assert.equal(run.state, "WITHHELD");
    assert.deepEqual(run.evidence_refs, []);
    assert.equal(run.failure_code, "AUTHORITY_OR_EVIDENCE_CHANGED");
  });
  await setPartnerProject(true);
});

test("AT-10 reconciliation recovers matching orphan and quarantines unknown object", async () => {
  const content = Buffer.from(`recovery-${crypto.randomUUID()}`);
  const upload = await createUpload(
    "owner",
    p2,
    `recovery-${crypto.randomUUID()}.txt`,
    content,
    "text/plain",
    "owner_only",
  );
  await processFileJobs({ workerReference: "at10-recovery-worker" });
  const orphanKey = `orphan/${crypto.randomUUID()}`;
  await store.move(upload.object_key, orphanKey);
  const unrelatedKey = `orphan/${crypto.randomUUID()}`;
  await store.putImmutable(
    unrelatedKey,
    Buffer.from("unrelated orphan object"),
    "text/plain",
  );
  const run = await reconcilePrivateObjects("at10-reconciliation-worker");
  const restored = await store.head(upload.object_key);
  assert.ok(restored);
  assert.equal(restored.sha256, sha256(content));
  await actorTransaction("owner", async (database) => {
    const outcomes = (
      await database.query(
        "select outcome from kxra.object_reconciliation_items where run_id=$1 order by id",
        [run],
      )
    ).rows.map((row) => row.outcome);
    assert.ok(outcomes.includes("RECOVERED_FROM_ORPHAN"));
    assert.ok(outcomes.includes("QUARANTINED_ORPHAN"));
    assert.equal(
      (
        await database.query(
          "select lifecycle_state from kxra.files where id=$1",
          [upload.file_id],
        )
      ).rows[0].lifecycle_state,
      "INDEXED",
    );
  });
});
