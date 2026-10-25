import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { localModeConfiguration } from "../packages/authz/local-guard";
import { runtimeFile } from "./support/runtime";

test("upload quota preserves its cap, immutable retries and independent actor allowance", async () => {
  assert.ok(
    localModeConfiguration(process.env) && !process.env.VERCEL_ENV,
    "Upload quota regression requires the guarded local fixture runtime",
  );
  const config = JSON.parse(
    fs.readFileSync(runtimeFile("database.json"), "utf8"),
  );
  assert.equal(
    config.host,
    path.join(path.resolve(process.env.KXRA_RUNTIME!), "socket"),
    "Upload quota regression requires the fixture Unix socket",
  );
  const db = new pg.Client({ ...config, user: os.userInfo().username });
  await db.connect();
  try {
    await db.query("begin");
    const org = crypto.randomUUID(),
      project = crypto.randomUUID(),
      actors = [crypto.randomUUID(), crypto.randomUUID()];
    await db.query(
      "insert into kxra.organisations(id,name) values($1,'Synthetic upload quota regression')",
      [org],
    );
    await db.query(
      `insert into kxra.projects(id,org_id,code,name,stage,status,next_action)
       values($1,$2,'UPLOAD-QUOTA','Synthetic upload quota','TEST','ACTIVE','Review')`,
      [project, org],
    );
    for (const actor of actors) {
      // Existing identity-sync triggers create the active organisation membership.
      await db.query(
        "insert into kxra.members(id,org_id,display_name,role) values($1,$2,'Synthetic upload actor','partner')",
        [actor, org],
      );
      await db.query(
        `insert into kxra.profiles(
          user_id,org_id,first_name,last_name,account_state,email_verified_at,
          onboarding_completed_at
         ) values($1,$2,'Synthetic','Upload actor','ACTIVE',now(),now())`,
        [actor, org],
      );
      await db.query(
        `insert into kxra.project_memberships(org_id,project_id,user_id,role,active)
         values($1,$2,$3,'contributor',true)`,
        [org, project, actor],
      );
    }

    async function as(actor: string) {
      await db.query("reset role");
      await db.query("set local role authenticated");
      await db.query(
        `select set_config('request.jwt.claim.sub',$1,true),
          set_config('request.jwt.claims',$2,true),
          set_config('request.kxra.org_id',$3,true),
          set_config('request.kxra.execution_mode','fixture',true)`,
        [
          actor,
          JSON.stringify({
            sub: actor,
            aal: "aal2",
            auth_time: Math.floor(Date.now() / 1000),
          }),
          org,
        ],
      );
      assert.equal(
        (await db.query("select current_user as role")).rows[0].role,
        "authenticated",
      );
    }

    function intent() {
      const request = crypto.randomUUID(),
        content = "Synthetic quota evidence " + request;
      return [
        project,
        `Quota evidence ${request}.txt`,
        "text/plain",
        Buffer.byteLength(content),
        crypto.createHash("sha256").update(content).digest("hex"),
        "project_shared",
        request,
      ];
    }
    async function upload(values: unknown[]) {
      return (
        await db.query(
          "select * from kxra.create_file_upload($1,$2,$3,$4,$5,$6,$7)",
          values,
        )
      ).rows[0] as { file_id: string; lifecycle_state: string };
    }
    async function state(actor: string) {
      await db.query("reset role");
      const digest = crypto.createHash("sha256").update(actor).digest("hex");
      return (
        await db.query(
          `select
            (select coalesce(sum(request_count),0)::int from kxra.request_rate_limits
             where scope='file_upload' and subject_digest=$1) as requests,
            (select count(*)::int from kxra.file_versions where created_by=$2) as versions`,
          [digest, actor],
        )
      ).rows[0] as { requests: number; versions: number };
    }
    async function rejectsUpload(values: unknown[]) {
      await db.query("savepoint rejected_upload");
      try {
        await assert.rejects(() => upload(values), {
          code: "P0001",
          message: "File upload unavailable",
        });
      } finally {
        await db.query("rollback to savepoint rejected_upload");
        await db.query("release savepoint rejected_upload");
      }
    }

    assert.deepEqual(await state(actors[0]), { requests: 0, versions: 0 });
    const firstIntent = intent();
    await as(actors[0]);
    const first = await upload(firstIntent),
      files = new Set([first.file_id]);
    assert.equal(first.lifecycle_state, "UPLOADING");
    for (let index = 1; index < 50; index++) {
      const saved = await upload(intent());
      assert.equal(saved.lifecycle_state, "UPLOADING");
      files.add(saved.file_id);
    }
    assert.equal(files.size, 50);
    assert.deepEqual(await state(actors[0]), { requests: 50, versions: 50 });

    await as(actors[0]);
    await rejectsUpload(intent());
    assert.deepEqual(await state(actors[0]), { requests: 50, versions: 50 });

    await as(actors[0]);
    assert.deepEqual(await upload(firstIntent), first);
    assert.deepEqual(await state(actors[0]), { requests: 50, versions: 50 });

    const changedIntent = [...firstIntent];
    changedIntent[4] = crypto
      .createHash("sha256")
      .update("Changed synthetic evidence")
      .digest("hex");
    await as(actors[0]);
    await rejectsUpload(changedIntent);
    assert.deepEqual(await state(actors[0]), { requests: 50, versions: 50 });

    assert.deepEqual(await state(actors[1]), { requests: 0, versions: 0 });
    await as(actors[1]);
    assert.equal((await upload(intent())).lifecycle_state, "UPLOADING");
    assert.deepEqual(await state(actors[1]), { requests: 1, versions: 1 });
    assert.deepEqual(await state(actors[0]), { requests: 50, versions: 50 });
  } finally {
    try {
      await db.query("rollback");
    } finally {
      await db.end();
    }
  }
});
