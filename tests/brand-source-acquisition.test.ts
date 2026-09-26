import { after, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { processNextBrandSourceAcquisition } from "../packages/integrations/public-web-worker";
import { runtimeFile } from "./support/runtime";

const root = process.cwd();
process.env.KXRA_AUTH_MODE ||= "fixture";
process.env.KXRA_RUNTIME ||= path.join(root, ".runtime");
const config = JSON.parse(
  fs.readFileSync(runtimeFile("database.json"), "utf8"),
);
const admin = new pg.Pool({ ...config, user: os.userInfo().username });
const org = "10000000-0000-4000-8000-000000000001";
const p2 = "30000000-0000-4000-8000-000000000002";
const p3 = "30000000-0000-4000-8000-000000000003";
const actors = {
  owner: "20000000-0000-4000-8000-000000000001",
  partner: "20000000-0000-4000-8000-000000000002",
  viewer: "20000000-0000-4000-8000-000000000003",
  revoked: "20000000-0000-4000-8000-000000000004",
};

after(() => admin.end());

async function as(database: pg.PoolClient, actor: keyof typeof actors | null) {
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
  actor: keyof typeof actors,
  work: (database: pg.PoolClient) => Promise<T>,
) {
  const database = await admin.connect();
  try {
    await database.query("begin");
    await as(database, actor);
    const result = await work(database);
    await database.query("commit");
    return result;
  } catch (error) {
    await database.query("rollback");
    throw error;
  } finally {
    database.release();
  }
}

async function denied(
  database: pg.PoolClient,
  sql: string,
  values: unknown[] = [],
) {
  await database.query("savepoint expected_denial");
  try {
    await database.query(sql, values);
    assert.fail("Expected action to be denied");
  } catch {
    await database.query("rollback to savepoint expected_denial");
  }
}

async function createWebsiteSource(projectId = p2) {
  return actorTransaction(
    projectId === p2 ? "partner" : "owner",
    async (db) => {
      return (
        await db.query<{
          source_id: string;
          source_version_id: string;
          version: number;
        }>(
          "select * from kxra.create_brand_source($1,'WEBSITE',$2,$3,$4,true,$5)",
          [
            projectId,
            `https://${crypto.randomUUID()}.example.test/about`,
            "Customer supplied initial website snapshot.",
            "Synthetic owner-authorized public website evidence.",
            crypto.randomUUID(),
          ],
        )
      ).rows[0];
    },
  );
}

test("AT-35 website acquisition is exact, isolated and creates immutable external evidence", async () => {
  const source = await createWebsiteSource();
  const requestId = crypto.randomUUID();
  const acquisition = await actorTransaction("partner", async (db) => {
    const first = (
      await db.query<{
        acquisition_id: string;
        state: string;
        input_sha256: string;
      }>("select * from kxra.request_brand_source_refresh($1,1,$2)", [
        source.source_id,
        requestId,
      ])
    ).rows[0];
    const replay = (
      await db.query<{
        acquisition_id: string;
        state: string;
        input_sha256: string;
      }>("select * from kxra.request_brand_source_refresh($1,1,$2)", [
        source.source_id,
        requestId,
      ])
    ).rows[0];
    assert.deepEqual(replay, first);
    await denied(
      db,
      "select * from kxra.request_brand_source_refresh($1,2,$2)",
      [source.source_id, requestId],
    );
    await denied(
      db,
      "select * from kxra_private.claim_brand_source_acquisition($1)",
      ["forged-browser-worker"],
    );
    return first;
  });
  assert.equal(acquisition.state, "PENDING");

  const result = await processNextBrandSourceAcquisition({
    workerReference: `fixture-brand-${crypto.randomUUID()}`,
    resolve: async () => ["93.184.216.34"],
    transport: async () =>
      new Response(
        "<html><head><style>secret style</style><script>hostile()</script></head><body><h1>Northstar &amp; Co</h1><p>Verified public operating evidence.</p></body></html>",
        { headers: { "content-type": "text/html; charset=utf-8" } },
      ),
  });
  assert.equal(result?.state, "SUCCEEDED");
  assert.equal(result?.version, 2);

  await actorTransaction("partner", async (db) => {
    const versions = (
      await db.query<{
        version: number;
        supplied_content: string;
        fetch_state: string;
        security_result: string;
        source_classification: string;
      }>(
        `select version,supplied_content,fetch_state,security_result,source_classification
         from kxra.brand_source_versions where source_id=$1 order by version`,
        [source.source_id],
      )
    ).rows;
    assert.equal(versions.length, 2);
    assert.equal(
      versions[0].supplied_content,
      "Customer supplied initial website snapshot.",
    );
    assert.deepEqual(
      {
        content: versions[1].supplied_content,
        fetch: versions[1].fetch_state,
        security: versions[1].security_result,
        classification: versions[1].source_classification,
      },
      {
        content: "Northstar & Co Verified public operating evidence.",
        fetch: "FETCHED",
        security: "PASSED",
        classification: "EXTERNAL RESEARCH",
      },
    );
    const job = (
      await db.query(
        "select * from kxra.brand_source_acquisitions where id=$1",
        [acquisition.acquisition_id],
      )
    ).rows[0];
    assert.equal(job.source_version_id, result?.source_version_id);
    assert.equal(job.worker_reference, null);
    assert.equal(job.failure_code, null);
  });

  for (const actor of ["viewer", "revoked"] as const)
    await actorTransaction(actor, async (db) => {
      assert.equal(
        (
          await db.query(
            "select * from kxra.brand_source_acquisitions where id=$1",
            [acquisition.acquisition_id],
          )
        ).rowCount,
        0,
      );
    });
});

test("AT-35 private DNS, stale jobs and crafted project sources fail closed", async () => {
  const source = await createWebsiteSource();
  await actorTransaction("partner", async (db) => {
    await db.query("select * from kxra.request_brand_source_refresh($1,1,$2)", [
      source.source_id,
      crypto.randomUUID(),
    ]);
  });
  const failed = await processNextBrandSourceAcquisition({
    workerReference: `fixture-brand-${crypto.randomUUID()}`,
    resolve: async () => ["127.0.0.1"],
    transport: async () => {
      assert.fail("Transport must not run for a private address");
    },
  });
  assert.equal(failed?.state, "FAILED");
  await actorTransaction("partner", async (db) => {
    assert.equal(
      (
        await db.query<{ current_version: number }>(
          "select current_version from kxra.brand_sources where id=$1",
          [source.source_id],
        )
      ).rows[0].current_version,
      1,
    );
  });

  const other = await createWebsiteSource(p3);
  await actorTransaction("partner", async (db) => {
    await denied(
      db,
      "select * from kxra.request_brand_source_refresh($1,1,$2)",
      [other.source_id, crypto.randomUUID()],
    );
    assert.equal(
      (
        await db.query(
          "select * from kxra.brand_source_acquisitions where source_id=$1",
          [other.source_id],
        )
      ).rowCount,
      0,
    );
  });
});
