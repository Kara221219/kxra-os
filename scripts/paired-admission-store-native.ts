import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import net from "node:net";
import { execFileSync, spawnSync } from "node:child_process";
import pg from "pg";
import { postgresBin } from "./postgres-bin.mjs";
import { hostedMigrationManifest } from "./hosted-release-guard.mjs";
import { PairedAdmissionStore } from "../packages/workspace/paired-admission-store";
import {
  pairedAdmissionDigest,
  pairedRuntimeSubject,
} from "../packages/workspace/paired-execution-admission";
import { syntheticPairedAuthority } from "../tests/support/paired-authority-fixture";

async function main() {
  const root = fs.realpathSync(process.cwd());
  assert.match(root, /^\/(?:private\/)?tmp\/kxra-pas-[A-Za-z0-9]+$/);
  const runtime = path.join(root, ".runtime/pas"),
    external = path.join(runtime, "fence"),
    bin = postgresBin();
  fs.mkdirSync(external, { recursive: true, mode: 0o700 });
  const freePort = async () => {
    const s = net.createServer();
    await new Promise<void>((resolve, reject) => {
      s.once("error", reject);
      s.listen(0, "127.0.0.1", resolve);
    });
    const value = (s.address() as net.AddressInfo).port;
    await new Promise<void>((r) => s.close(() => r()));
    return value;
  };
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: runtime,
    USER: os.userInfo().username,
    TMPDIR: process.env.TMPDIR,
    NODE_ENV: "development",
    NODE_OPTIONS: "--conditions=development",
    KXRA_AUTH_MODE: "fixture",
    KXRA_RUNTIME: runtime,
    KXRA_ORIGIN: `http://127.0.0.1:${await freePort()}`,
    KXRA_PG_PORT: String(await freePort()),
    KXRA_LOCAL_SECRET: crypto.randomBytes(48).toString("hex"),
  };
  const externalConfig = {
    host: path.join(external, "s"),
    port: await freePort(),
    database: "postgres",
    user: os.userInfo().username,
  };
  const run = (file: string, args: string[]) =>
    execFileSync(file, args, {
      cwd: root,
      env,
      stdio: "pipe",
      timeout: 120000,
    });
  const write = (file: string, value: unknown) =>
    fs.writeFileSync(
      path.join(runtime, file),
      JSON.stringify(value, null, 2) + "\n",
      { mode: 0o600 },
    );
  const results: string[] = [],
    pools: pg.Pool[] = [];
  let admin: pg.Client | undefined,
    fenceAdmin: pg.Client | undefined,
    appStarted = false,
    fenceStarted = false;
  const check = async (name: string, fn: () => Promise<void>) => {
    await fn();
    results.push(name);
    console.log("PASS " + name);
  };
  try {
    assert.equal(hostedMigrationManifest(root).length, 117);
    appStarted = true;
    run(process.execPath, ["scripts/database.mjs", "start"]);
    const cfg = JSON.parse(
      fs.readFileSync(path.join(runtime, "database.json"), "utf8"),
    );
    assert.equal(cfg.host, path.join(runtime, "socket"));
    assert.equal(cfg.user, "kxra_app");
    assert.ok(!cfg.password && !cfg.connectionString && !cfg.ssl);
    admin = new pg.Client({ ...cfg, user: os.userInfo().username });
    await admin.connect();
    assert.equal(
      fs.realpathSync(
        (await admin.query("show data_directory")).rows[0].data_directory,
      ),
      path.join(runtime, "postgres"),
    );
    assert.equal(
      (await admin.query("show listen_addresses")).rows[0].listen_addresses,
      "",
    );
    const acl = () =>
      admin!
        .query(
          "select p.oid::regprocedure::text identity,has_function_privilege('authenticated',p.oid,'EXECUTE') executable,has_schema_privilege('authenticated',n.oid,'USAGE') reachable from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='kxra_private' order by 1",
        )
        .then((r) => r.rows);
    const privateBefore = await acl();
    const sql = fs.readFileSync(
      "database/production/paired-admission-v1.sql",
      "utf8",
    );
    await check(
      "atomic proposal rollback leaves no schema or ACL change",
      async () => {
        await admin!.query("begin");
        await admin!.query(
          sql
            .replace(/^([\s\S]*?)\bbegin;\s*/i, "$1")
            .replace(/commit;\s*$/i, ""),
        );
        await assert.rejects(admin!.query("select 1/0"));
        await admin!.query("rollback");
        assert.equal(
          (
            await admin!.query(
              "select to_regnamespace('kxra_paired_admission') value",
            )
          ).rows[0].value,
          null,
        );
        assert.deepEqual(await acl(), privateBefore);
      },
    );
    await admin.query(sql);
    fs.mkdirSync(externalConfig.host, { mode: 0o700 });
    run(path.join(bin, "initdb"), [
      "-D",
      path.join(external, "pg"),
      "--auth-local=trust",
      "--auth-host=reject",
      "--encoding=UTF8",
      "--no-locale",
    ]);
    fenceStarted = true;
    run(path.join(bin, "pg_ctl"), [
      "-D",
      path.join(external, "pg"),
      "-l",
      path.join(external, "postgres.log"),
      "-o",
      `-k '${externalConfig.host}' -p ${externalConfig.port} -h ''`,
      "-w",
      "start",
    ]);
    fenceAdmin = new pg.Client(externalConfig);
    await fenceAdmin.connect();
    assert.equal(
      (await fenceAdmin.query("show listen_addresses")).rows[0]
        .listen_addresses,
      "",
    );
    await fenceAdmin.query(
      "create role kxra_pair_fence login noinherit nobypassrls",
    );
    await fenceAdmin.query(
      fs.readFileSync(
        "database/production/paired-external-fence-v1.sql",
        "utf8",
      ),
    );
    const app = new pg.Pool({ ...cfg, connectionTimeoutMillis: 2000 }),
      fence = new pg.Pool({
        ...externalConfig,
        user: "kxra_pair_fence",
        connectionTimeoutMillis: 2000,
      });
    pools.push(app, fence);
    await check(
      "ACL surface limited; no unrelated private-helper expansion",
      async () => {
        assert.deepEqual(await acl(), privateBefore);
        const surface = (
          await admin!.query(
            "select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='kxra_paired_admission' and has_function_privilege('authenticated',p.oid,'EXECUTE') order by 1",
          )
        ).rows.map((r) => r.proname);
        assert.deepEqual(surface, ["consume", "current_task"]);
        const c = await app.connect();
        try {
          await c.query("set role authenticated");
          for (const statement of [
            "select * from kxra_paired_admission.devices",
            "select * from kxra_paired_admission.reviews",
            "select * from kxra_paired_admission.consumptions",
            "insert into kxra_paired_admission.authorities(task_id) values(gen_random_uuid())",
            "select kxra_paired_admission.digest('{}')",
          ])
            await assert.rejects(c.query(statement), { code: "42501" });
          // Direct negative calls to existing private helper identities, not just ACL reachability.
          for (const helper of [
            "kxra_private.claim_live_paid_refresh(1)",
            "kxra_private.webhook_reconciliation_scope_attestation()",
          ])
            await assert.rejects(c.query("select " + helper), {
              code: "42501",
            });
        } finally {
          c.release();
        }
        const fc = await fence.connect();
        try {
          await assert.rejects(
            fc.query("select * from kxra_paired_fence.burns"),
            { code: "42501" },
          );
          await assert.rejects(
            fc.query("update kxra_paired_fence.realms set enabled=true"),
            { code: "42501" },
          );
        } finally {
          fc.release();
        }
        write("acl.json", {
          privateBefore,
          privateAfter: await acl(),
          exposed: surface,
        });
      },
    );
    const id = () => crypto.randomUUID(),
      org = id(),
      account = id(),
      project = id(),
      room = id();
    await admin.query(
      "insert into kxra.organisations(id,name,slug,organisation_kind) values($1,'Synthetic paired authority',$2,'CUSTOMER')",
      [org, "synthetic-paired-" + org],
    );
    await admin.query(
      "insert into kxra.account_identities(account_id,auth_provider,auth_subject,state,email_verified_at) values($1,'SUPABASE',$2,'ACTIVE',now())",
      [account, "synthetic-" + account],
    );
    await admin.query(
      "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_ADMIN','CUSTOMER','ACTIVE','Synthetic','LOCAL_PAIRED_TEST')",
      [org, account],
    );
    await admin.query(
      "insert into kxra.projects(id,org_id,code,name,stage,status,next_action) values($1,$2,'SYNTHETIC','Synthetic','IDEA','ACTIVE','Test only')",
      [project, org],
    );
    await admin.query(
      "insert into kxra.project_memberships(org_id,project_id,user_id,role) values($1,$2,$3,'contributor')",
      [org, project, account],
    );
    await admin.query(
      "insert into kxra.team_rooms(id,org_id,project_id,name,access,created_by) values($1,$2,$3,'Synthetic','PROJECT',$4)",
      [room, org, project, account],
    );
    await admin.query("insert into kxra.team_room_members values($1,$2,true)", [
      room,
      account,
    ]);
    const actor = {
      id: account,
      organisation_id: org,
      session_version: 1,
      aal: "aal2" as const,
      auth_time: Math.floor(Date.now() / 1000),
      source: "supabase" as const,
    };
    const store = new PairedAdmissionStore(app, fence, actor, {
      enabled: true,
    });
    async function seed() {
      const thread = id(),
        mv = (
          await admin!.query(
            "select version from kxra.organisation_memberships where org_id=$1 and account_id=$2",
            [org, account],
          )
        ).rows[0].version;
      const a = syntheticPairedAuthority(org, account, room, thread, mv);
      await admin!.query(
        "insert into kxra.team_messages(id,room_id,author_id,body) values($1,$2,$3,$4)",
        [thread, room, account, a.task.sources[0].body],
      );
      await admin!.query(
        "insert into kxra_paired_admission.agents values($1,$2,$3,$4,true,null)",
        [a.task.agent_id, org, account, room],
      );
      await admin!.query(
        "insert into kxra_paired_admission.devices values($1,$2,$3,$4,$5,$6,$7,true,$8,null)",
        [
          a.device_id,
          org,
          account,
          a.task.agent_id,
          a.device_session_id,
          a.realm_id,
          a.continuity_epoch,
          a.task.lease_until,
        ],
      );
      const sourceReview = id();
      for (const [rid, kind, artifact] of [
        [a.runtime_review.id, "RUNTIME", a.runtime_review],
        [a.auth_review.id, "AUTH", a.auth_review],
        [
          sourceReview,
          "SOURCE",
          { approval: a.approval, task: a.task, context: a.context },
        ],
      ])
        await admin!.query(
          "insert into kxra_paired_admission.reviews values($1,$2,$3,$4,null)",
          [rid, kind, artifact, a.task.lease_until],
        );
      await admin!.query(
        "insert into kxra_paired_admission.authorities(task_id,org_id,account_id,room_id,device_id,runtime_review_id,auth_review_id,source_review_id,manifest,enabled) values($1,$2,$3,$4,$5,$6,$7,$8,$9,true)",
        [
          a.task.id,
          org,
          account,
          room,
          a.device_id,
          a.runtime_review.id,
          a.auth_review.id,
          sourceReview,
          a,
        ],
      );
      await fenceAdmin!.query(
        "insert into kxra_paired_fence.realms values($1,$2,$3,$4,$5,$6,true)",
        [
          a.realm_id,
          a.continuity_epoch,
          org,
          account,
          a.device_id,
          a.device_session_id,
        ],
      );
      return {
        a,
        request: { task_id: a.task.id, fence: a.task.fence, attempt_id: id() },
        hash: pairedAdmissionDigest(a),
      };
    }
    await check("default-off adapter refuses before storage", async () => {
      const f = await seed();
      await assert.rejects(
        new PairedAdmissionStore(app, fence, actor).readCurrent(f.request),
        /UNAVAILABLE/,
      );
      assert.deepEqual(await store.readCurrent(f.request), f.a);
      assert.ok(!JSON.stringify(store).includes(account));
    });
    await check(
      "foreign tenant, foreign member, stale session and owner nonmembership denied by RLS",
      async () => {
        const f = await seed();
        for (const bad of [
          { ...actor, organisation_id: id() },
          { ...actor, id: id() },
          { ...actor, session_version: 2 },
        ])
          await assert.rejects(
            new PairedAdmissionStore(app, fence, bad, {
              enabled: true,
            }).readCurrent(f.request),
          );
        await admin!.query(
          "update kxra.team_room_members set active=false where room_id=$1 and account_id=$2",
          [room, account],
        );
        await assert.rejects(store.readCurrent(f.request));
        await admin!.query(
          "update kxra.team_room_members set active=true where room_id=$1 and account_id=$2",
          [room, account],
        );
        assert.deepEqual(await store.readCurrent(f.request), f.a);
      },
    );
    await check(
      "source mutation and mismatched reviewed subject/auth binding denied in database",
      async () => {
        for (const mode of ["SOURCE", "SUBJECT", "AUTH"]) {
          const f = await seed();
          if (mode === "SOURCE")
            await admin!.query(
              "update kxra.team_messages set body='Changed synthetic source' where id=$1",
              [f.a.task.thread_id],
            );
          else {
            if (mode === "SUBJECT")
              f.a.runtime_review.subject_sha256 = "0".repeat(64);
            else {
              f.a.auth_review.binding_sha256 = "1".repeat(64);
              f.a.runtime_review.subject_sha256 = pairedRuntimeSubject(f.a);
            }
            await admin!.query(
              "update kxra_paired_admission.authorities set manifest=$2 where task_id=$1",
              [f.a.task.id, f.a],
            );
            await admin!.query(
              "update kxra_paired_admission.reviews set artifact=$2 where id=$1",
              [f.a.runtime_review.id, f.a.runtime_review],
            );
            await admin!.query(
              "update kxra_paired_admission.reviews set artifact=$2 where id=$1",
              [f.a.auth_review.id, f.a.auth_review],
            );
          }
          await assert.rejects(store.readCurrent(f.request));
        }
      },
    );
    await check(
      "missing/null purpose and task identity rejected at installation constraint",
      async () => {
        const f = await seed();
        for (const path of [["purpose"], ["task", "id"], ["task", "fence"]]) {
          for (const value of [null, undefined]) {
            const bad = structuredClone(f.a) as unknown as Record<
              string,
              unknown
            >;
            const target =
              path.length === 1 ? bad : (bad.task as Record<string, unknown>);
            const key = path[path.length - 1];
            if (value === undefined) delete target[key];
            else target[key] = value;
            await assert.rejects(
              admin!.query(
                "update kxra_paired_admission.authorities set manifest=$2 where task_id=$1",
                [f.a.task.id, bad],
              ),
              { code: "23514" },
            );
          }
        }
      },
    );
    await check("direct SQL rejects a null supplied fence", async () => {
      const f = await seed(),
        c = await app.connect();
      try {
        await c.query("begin");
        await c.query("set local role authenticated");
        await c.query(
          "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true)",
          [
            account,
            JSON.stringify({
              sub: account,
              session_version: 1,
              aal: "aal2",
              auth_time: actor.auth_time,
            }),
            org,
          ],
        );
        await assert.rejects(
          c.query("select kxra_paired_admission.consume($1,null,$2,$3,$4)", [
            f.a.task.id,
            f.request.attempt_id,
            f.hash,
            id(),
          ]),
          { code: "42501" },
        );
      } finally {
        await c.query("rollback");
        c.release();
      }
    });
    await check(
      "project membership withdrawal serializes with SQL consumption",
      async () => {
        await admin!.query(
          "update kxra.organisation_memberships set security_role='ORG_MEMBER' where org_id=$1 and account_id=$2",
          [org, account],
        );
        const f = await seed(),
          consumer = await app.connect();
        const writer = new pg.Client({ ...cfg, user: os.userInfo().username });
        await writer.connect();
        try {
          await consumer.query("begin");
          await consumer.query("set local role authenticated");
          await consumer.query(
            "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true)",
            [
              account,
              JSON.stringify({
                sub: account,
                session_version: 1,
                aal: "aal2",
                auth_time: actor.auth_time,
              }),
              org,
            ],
          );
          const receipt = (
            await consumer.query(
              "select kxra_paired_admission.consume($1,$2,$3,$4,$5) value",
              [f.a.task.id, f.a.task.fence, f.request.attempt_id, f.hash, id()],
            )
          ).rows[0].value;
          assert.equal(receipt.state, "CONSUMED"); // storage receipt, never external execution authority
          await writer.query("set lock_timeout='150ms'");
          await assert.rejects(
            writer.query(
              "update kxra.project_memberships set active=false where project_id=$1 and user_id=$2",
              [project, account],
            ),
            { code: "55P03" },
          );
          await consumer.query("rollback");
          await writer.query(
            "update kxra.project_memberships set active=false where project_id=$1 and user_id=$2",
            [project, account],
          );
          await assert.rejects(store.readCurrent(f.request));
        } finally {
          await consumer.query("rollback");
          consumer.release();
          await writer.end();
          await admin!.query(
            "update kxra.project_memberships set active=true where project_id=$1 and user_id=$2",
            [project, account],
          );
          await admin!.query(
            "update kxra.organisation_memberships set security_role='ORG_ADMIN' where org_id=$1 and account_id=$2",
            [org, account],
          );
        }
      },
    );
    await check(
      "single-use consumption under concurrent distinct attempts",
      async () => {
        const f = await seed();
        const attempts = await Promise.allSettled(
          Array.from({ length: 8 }, () =>
            store.consume({ ...f.request, attempt_id: id() }, f.hash),
          ),
        );
        assert.equal(
          attempts.filter((x) => x.status === "fulfilled").length,
          1,
        );
        assert.equal(
          (
            await admin!.query(
              "select count(*)::int n from kxra_paired_admission.consumptions where task_id=$1",
              [f.a.task.id],
            )
          ).rows[0].n,
          1,
        );
        assert.equal(
          (
            await fenceAdmin!.query(
              "select count(*)::int n from kxra_paired_fence.burns where task_id=$1",
              [f.a.task.id],
            )
          ).rows[0].n,
          1,
        );
      },
    );
    await check(
      "permit expiry bounded by device and review-row expiry",
      async () => {
        for (const mode of ["DEVICE", "SOURCE", "RUNTIME", "AUTH"]) {
          const f = await seed(),
            expiry = new Date(Date.now() + 30000).toISOString();
          if (mode === "DEVICE")
            await admin!.query(
              "update kxra_paired_admission.devices set expires_at=$2 where id=$1",
              [f.a.device_id, expiry],
            );
          else
            await admin!.query(
              "update kxra_paired_admission.reviews set expires_at=$2 where id=(select case $3 when 'SOURCE' then source_review_id when 'RUNTIME' then runtime_review_id else auth_review_id end from kxra_paired_admission.authorities where task_id=$1)",
              [f.a.task.id, expiry, mode],
            );
          const receipt = (await store.consume(f.request, f.hash)) as {
            expires_at: string;
          };
          assert.equal(Date.parse(receipt.expires_at), Date.parse(expiry));
        }
      },
    );
    await check(
      "lost external commit acknowledgement remains burned without app consumption",
      async () => {
        const f = await seed(),
          uncertain = new PairedAdmissionStore(app, fence, actor, {
            enabled: true,
            afterExternalCommit: async () => {
              throw Error("SYNTHETIC_LOST_ACK");
            },
          });
        await assert.rejects(
          uncertain.consume(f.request, f.hash),
          /UNCONFIRMED_NO_REPLAY/,
        );
        await assert.rejects(
          store.consume({ ...f.request, attempt_id: id() }, f.hash),
          /UNCONFIRMED_NO_REPLAY/,
        );
        assert.equal(
          (
            await admin!.query(
              "select count(*)::int n from kxra_paired_admission.consumptions where task_id=$1",
              [f.a.task.id],
            )
          ).rows[0].n,
          0,
        );
      },
    );
    await check(
      "revocation/abort after independent burn prevent application consumption",
      async () => {
        for (const mode of ["REVOKE", "ABORT"]) {
          const f = await seed(),
            controller = new AbortController();
          const hooked = new PairedAdmissionStore(app, fence, actor, {
            enabled: true,
            afterExternalCommit: async () => {
              if (mode === "REVOKE")
                await admin!.query(
                  "update kxra_paired_admission.devices set revoked_at=clock_timestamp() where id=$1",
                  [f.a.device_id],
                );
              else controller.abort();
            },
          });
          await assert.rejects(
            hooked.consume(f.request, f.hash, controller.signal),
            /UNCONFIRMED_NO_REPLAY/,
          );
          assert.equal(
            (
              await admin!.query(
                "select count(*)::int n from kxra_paired_admission.consumptions where task_id=$1",
                [f.a.task.id],
              )
            ).rows[0].n,
            0,
          );
          assert.equal(
            (
              await fenceAdmin!.query(
                "select count(*)::int n from kxra_paired_fence.burns where task_id=$1",
                [f.a.task.id],
              )
            ).rows[0].n,
            1,
          );
        }
      },
    );
    await check(
      "separate store HOLD, stale epoch and null purpose fail closed",
      async () => {
        const f = await seed();
        await fenceAdmin!.query(
          "update kxra_paired_fence.realms set enabled=false where id=$1",
          [f.a.realm_id],
        );
        await assert.rejects(
          store.consume(f.request, f.hash),
          /UNCONFIRMED_NO_REPLAY/,
        );
        await fenceAdmin!.query(
          "update kxra_paired_fence.realms set enabled=true,epoch=$2 where id=$1",
          [f.a.realm_id, id()],
        );
        await assert.rejects(
          store.consume(f.request, f.hash),
          /UNCONFIRMED_NO_REPLAY/,
        );
        await fenceAdmin!.query(
          "update kxra_paired_fence.realms set epoch=$2 where id=$1",
          [f.a.realm_id, f.a.continuity_epoch],
        );
        const c = await fence.connect();
        try {
          const subject = {
            purpose: null,
            org_id: org,
            account_id: account,
            device_id: f.a.device_id,
            device_session_id: f.a.device_session_id,
            fence: f.request.fence,
            attempt_id: f.request.attempt_id,
            snapshot_sha256: f.hash,
          };
          await assert.rejects(
            c.query("select kxra_paired_fence.burn($1,$2,$3,$4)", [
              f.a.realm_id,
              f.a.continuity_epoch,
              f.a.task.id,
              subject,
            ]),
            { code: "42501" },
          );
          const foreign = {
            ...subject,
            purpose: "PAIRED_TEXT_EXECUTION_V1",
            org_id: id(),
          };
          await assert.rejects(
            c.query("select kxra_paired_fence.burn($1,$2,$3,$4)", [
              f.a.realm_id,
              f.a.continuity_epoch,
              f.a.task.id,
              foreign,
            ]),
            { code: "42501" },
          );
        } finally {
          c.release();
        }
      },
    );
    await check(
      "application backup restore cannot replay independently burned task",
      async () => {
        const f = await seed(),
          dump = path.join(runtime, "application.dump");
        run(path.join(bin, "pg_dump"), [
          "-h",
          cfg.host,
          "-p",
          String(cfg.port),
          "-U",
          os.userInfo().username,
          "-d",
          "postgres",
          "-Fc",
          "-f",
          dump,
        ]);
        await store.consume(f.request, f.hash);
        await admin!.query("create database paired_restored");
        run(path.join(bin, "pg_restore"), [
          "-h",
          cfg.host,
          "-p",
          String(cfg.port),
          "-U",
          os.userInfo().username,
          "-d",
          "paired_restored",
          "--no-owner",
          dump,
        ]);
        const restored = new pg.Pool({
          ...cfg,
          database: "paired_restored",
          connectionTimeoutMillis: 2000,
        });
        pools.push(restored);
        const oldStore = new PairedAdmissionStore(restored, fence, actor, {
          enabled: true,
        });
        assert.deepEqual(await oldStore.readCurrent(f.request), f.a);
        await assert.rejects(
          oldStore.consume({ ...f.request, attempt_id: id() }, f.hash),
          /UNCONFIRMED_NO_REPLAY/,
        );
        const rc = new pg.Client({
          ...cfg,
          user: os.userInfo().username,
          database: "paired_restored",
        });
        await rc.connect();
        try {
          assert.equal(
            (
              await rc.query(
                "select count(*)::int n from kxra_paired_admission.consumptions where task_id=$1",
                [f.a.task.id],
              )
            ).rows[0].n,
            0,
          );
        } finally {
          await rc.end();
        }
      },
    );
    write("acceptance.json", {
      source: execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      passed: results,
      realProvider: false,
      hostedChanges: false,
      executionAuthority: false,
    });
  } finally {
    let clean = true;
    for (const pool of pools)
      try {
        await pool.end();
      } catch {
        clean = false;
      }
    for (const client of [admin, fenceAdmin])
      try {
        await client?.end();
      } catch {
        clean = false;
      }
    for (const [started, data] of [
      [fenceStarted, path.join(external, "pg")],
      [appStarted, path.join(runtime, "postgres")],
    ] as const) {
      if (!started || !fs.existsSync(path.join(data, "PG_VERSION"))) continue;
      const stop = spawnSync(
        path.join(bin, "pg_ctl"),
        ["-D", data, "-m", "fast", "-w", "stop"],
        { env, timeout: 30000 },
      );
      const status = spawnSync(
        path.join(bin, "pg_ctl"),
        ["-D", data, "status"],
        { env, timeout: 5000 },
      );
      clean =
        clean &&
        stop.status === 0 &&
        status.status === 3 &&
        !fs.existsSync(path.join(data, "postmaster.pid"));
    }
    write("cleanup.json", { clean, independentClustersStopped: clean });
    assert.ok(clean, "OWNED_CLEANUP_UNCERTAIN");
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
