import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import net from "node:net";
import http from "node:http";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import pg from "pg";
import { postgresBin } from "./postgres-bin.mjs";
import { seedAiResumeFixture } from "../tests/support/ai-resume-fixture";
import {
  customAppsProductionPayload,
  assertCustomAppsCatalogDelta,
} from "./custom-apps-production-payload.mjs";
import {
  pairedCompositionCatalog as integrationCatalog,
  pairedCompositionData as integrationData,
} from "./paired-composition-catalog.mjs";
import { productionOperationsPayload } from "./production-operations-review.mjs";
import { proveCustomAppsTargetRefusal } from "./custom-apps-target-native";
import { runCustomAppsCompositionProof } from "./custom-apps-composition-native";
import { customAppsBrowserFixture } from "./custom-apps-browser-native";
import { exampleCustomApp } from "../packages/custom-apps/contract";
import type { Actor } from "../apps/os/lib/auth";
async function main() {
  const root = fs.realpathSync(process.cwd());
  assert.match(root, /^\/(?:private\/)?tmp\/kxra-capps-[A-Za-z0-9]+$/);
  const runtime = path.join(root, ".runtime/production-apps"),
    bin = postgresBin(),
    uuid = () => crypto.randomUUID();
  fs.mkdirSync(runtime, { recursive: true, mode: 0o700 });
  async function port() {
    const s = net.createServer();
    await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
    const p = (s.address() as net.AddressInfo).port;
    await new Promise<void>((r) => s.close(() => r()));
    return p;
  }
  const bootstrapEnv = {
    PATH: process.env.PATH,
    HOME: runtime,
    USER: os.userInfo().username,
    TMPDIR: process.env.TMPDIR,
    NODE_ENV: "development" as const,
    LANG: "C",
    LC_ALL: "C",
    KXRA_RUNTIME: runtime,
    KXRA_AUTH_MODE: "fixture",
    KXRA_ORIGIN: `http://127.0.0.1:${await port()}`,
    KXRA_PG_PORT: String(await port()),
    KXRA_LOCAL_SECRET: crypto.randomBytes(48).toString("hex"),
  };
  function runDatabase(action: string) {
    execFileSync(process.execPath, ["scripts/database.mjs", action], {
      cwd: root,
      env: bootstrapEnv,
      stdio: "inherit",
      timeout: 45000,
    });
  }
  let admin: pg.Client | undefined, server: http.Server | undefined;
  let pooled: any;
  let browserFixture:
    Awaited<ReturnType<typeof customAppsBrowserFixture>> | undefined;
  const evidence: any = {
    classification:
      "LOCAL_SYNTHETIC_SERVER_IDENTITY_BOUNDARY_NOT_HOSTED_ACCEPTANCE",
    sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    payloadSha256: crypto
      .createHash("sha256")
      .update(fs.readFileSync("database/production/custom-apps-v1.sql"))
      .digest("hex"),
    phases: [],
  };
  const write = (n: string, v: unknown) =>
    fs.writeFileSync(path.join(runtime, n), JSON.stringify(v, null, 2) + "\n", {
      mode: 0o600,
    });
  try {
    Object.assign(process.env, bootstrapEnv);
    runDatabase("start");
    const cfg = JSON.parse(
      fs.readFileSync(path.join(runtime, "database.json"), "utf8"),
    );
    assert.equal(cfg.host, path.join(runtime, "socket"));
    assert.equal(cfg.database, "postgres");
    assert.equal(cfg.user, "kxra_app");
    assert.ok(!cfg.password && !cfg.connectionString && !cfg.ssl);

    admin = new pg.Client({ ...cfg, user: os.userInfo().username });
    await admin.connect();
    assert.equal(
      (await admin.query("show data_directory")).rows[0].data_directory,
      path.join(runtime, "postgres"),
    );
    assert.equal(
      (
        await admin.query(
          "select count(*)::int n from public.kxra_local_migrations",
        )
      ).rows[0].n,
      117,
    );
    const profile = productionOperationsPayload(root);
    await admin.query(profile.ai.bytes);
    await admin.query(profile.bytes);
    for (const file of [
      "github-outbox-v1.sql",
      "paired-admission-v1.sql",
      "paired-setup-policy-v1.sql",
      "paired-setup-options-v1.sql",
    ])
      await admin.query(
        fs.readFileSync(path.join(root, "database/production", file), "utf8"),
      );
    write("composition-profile.json", {
      canonicalBaseline: 117,
      genuineProfile: [
        profile.ai.spec.candidateMigration.name,
        profile.spec.candidateMigration.name,
      ],
      unnumbered: [
        "github-outbox-v1.sql",
        "paired-admission-v1.sql",
        "paired-setup-policy-v1.sql",
        "paired-setup-options-v1.sql",
        "custom-apps-v1.sql",
      ],
      hostedApplied: false,
      migrationPromotions: [],
    });
    await admin.query("begin");
    const fixture = await seedAiResumeFixture(admin, false);
    await admin.query("commit");
    const baselineAppsCatalog = await integrationCatalog(admin);
    const payload = customAppsProductionPayload(root);
    await proveCustomAppsTargetRefusal({
      admin,
      cfg,
      runtime,
      bin,
      fixture,
      sql: payload.sql,
      write,
    });
    await admin.query("begin");
    await admin.query(
      payload.sql
        .replace(/^([\s\S]*?)\bbegin;\s*/i, "$1")
        .replace(/commit;\s*$/i, ""),
    );
    await assert.rejects(admin.query("select 1/0"));
    await admin.query("rollback");
    assert.deepEqual(await integrationCatalog(admin), baselineAppsCatalog);
    await admin.query(payload.sql);
    assertCustomAppsCatalogDelta(
      baselineAppsCatalog,
      await integrationCatalog(admin),
      payload.spec,
    );
    const author = fixture.actor,
      org = fixture.org,
      room = fixture.room,
      reviewer = uuid(),
      outsider = uuid(),
      otherOrg = uuid();
    await admin.query(
      "insert into kxra.account_identities(account_id,auth_provider,auth_subject,state,email_verified_at) values($1::uuid,'SUPABASE',$1::text,'ACTIVE',now()),($2::uuid,'SUPABASE',$2::text,'ACTIVE',now())",
      [reviewer, outsider],
    );
    await admin.query(
      "insert into kxra.organisations(id,name,slug,organisation_kind) values($1::uuid,'Synthetic foreign tenant',$1::text,'CUSTOMER')",
      [otherOrg],
    );
    await admin.query(
      "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_ADMIN','CUSTOMER','ACTIVE','Synthetic reviewer','LOCAL_APP_TEST'),($3,$4,'ORG_ADMIN','CUSTOMER','ACTIVE','Synthetic outsider','LOCAL_APP_TEST')",
      [org, reviewer, otherOrg, outsider],
    );
    await admin.query("select set_config('request.jwt.claim.sub',$1,false)", [
      author,
    ]);
    await admin.query(
      "insert into kxra.team_room_members(room_id,account_id) values($1,$2)",
      [room, reviewer],
    );
    // Existing source fixture has a 60-second paid proof. Refresh only synthetic proof timestamps between restart phases; never change policy/authority functions.
    async function refreshProof() {
      await admin!.query(
        "update kxra_private.live_paid_access set checked_at=now(),valid_until=now()+interval '55 seconds' where org_id=$1",
        [org],
      );
    }
    Object.assign(process.env, {
      NODE_ENV: "development",
      KXRA_AUTH_MODE: "supabase",
      KXRA_ORIGIN: bootstrapEnv.KXRA_ORIGIN,
      KXRA_CUSTOM_APPS_ENABLED: "true",
      DATABASE_URL: `postgresql://kxra_app@localhost/postgres?host=${encodeURIComponent(cfg.host)}&port=${cfg.port}`,
    });
    const { customAppHttp } = await import("../apps/os/lib/custom-app-http");
    pooled = await import("../packages/db");
    const actor = (id: string, organization = org): Actor =>
      ({
        id,
        source: "supabase",
        aal: "aal2",
        auth_time: Math.floor(Date.now() / 1000),
        session_version: 1,
        provider_session_version: 1,
        organisation_id: organization,
        org_id: organization,
        organisation_kind: "CUSTOMER",
        security_role: "ORG_ADMIN",
      }) as Actor;
    // Injection is confined to this disposable HTTP adapter. The shipped Next route always resolves actor() itself.
    const identities: Record<string, Actor> = {
      author: actor(author),
      reviewer: actor(reviewer),
      outsider: actor(outsider, otherOrg),
      fake: { ...actor(author), source: "fake-provider" },
    };
    browserFixture = await customAppsBrowserFixture({
      root,
      runtime,
      room,
      origin: process.env.KXRA_ORIGIN!,
      refreshProof,
      write,
    });
    server = http.createServer(async (req, res) => {
      try {
        if (browserFixture!.serve(req, res)) return;
        let bytes = Buffer.alloc(0);
        for await (const c of req) bytes = Buffer.concat([bytes, c]);
        const url = new URL(req.url!, process.env.KXRA_ORIGIN);
        const parts = url.pathname.split("/").filter(Boolean);
        const identity =
          identities[String(req.headers["x-synthetic-actor"] ?? "author")];
        const request = new Request(url, {
          method: req.method,
          headers: req.headers as HeadersInit,
          ...(bytes.length ? { body: bytes } : {}),
        });
        const response = await customAppHttp(
          request,
          { params: Promise.resolve({ room: parts[2], path: parts.slice(3) }) },
          async () => {
            if (!identity) throw Error("Unverified synthetic identity");
            return identity;
          },
        );
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
      } catch {
        res.writeHead(503);
        res.end();
      }
    });
    await new Promise<void>((r) =>
      server!.listen(
        Number(new URL(process.env.KXRA_ORIGIN!).port),
        "127.0.0.1",
        r,
      ),
    );
    async function request(
      suffix = "",
      body?: unknown,
      who = "author",
      origin = process.env.KXRA_ORIGIN,
    ) {
      return fetch(
        `${process.env.KXRA_ORIGIN}/api/custom-apps/${room}${suffix}`,
        {
          method: body === undefined ? "GET" : "POST",
          headers: {
            "x-synthetic-actor": who,
            "content-type": "application/json",
            origin: origin!,
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        },
      );
    }
    async function ok(suffix = "", body?: unknown, who = "author") {
      const r = await request(suffix, body, who);
      assert.equal(r.status, 200, await r.clone().text());
      assert.match(r.headers.get("cache-control")!, /no-store/);
      return r.json();
    }
    async function denied(
      suffix: string,
      body: unknown,
      who = "author",
      status = 403,
    ) {
      const r = await request(suffix, body, who);
      assert.equal(r.status, status, await r.text());
    }
    const app = uuid(),
      record = uuid();
    let revision = 0;
    let hash1 = "";
    const register = async (title: string) => {
      const d = await ok("", {
        operation: "register",
        app_id: app,
        expected_revision: revision,
        schema: { ...exampleCustomApp, title },
      });
      revision = d.app.revision;
      return d;
    };
    const review = async (
      version: number,
      hash: string,
      decision = "APPROVED",
    ) => {
      const d = await ok(
        "",
        {
          operation: decision,
          app_id: app,
          expected_revision: revision,
          version,
          sha256: hash,
        },
        "reviewer",
      );
      revision = d.app.revision;
    };
    const release = async (version: number, operation = "PUBLISH") => {
      const d = await ok("", {
        operation,
        app_id: app,
        expected_revision: revision,
        version,
      });
      revision = d.app.revision;
    };
    await refreshProof();
    let d = await register("Synthetic production form");
    hash1 = d.versions[0].sha256;
    await denied("", {
      operation: "PUBLISH",
      app_id: app,
      expected_revision: revision,
      version: 1,
    });
    await denied("", {
      operation: "APPROVED",
      app_id: app,
      expected_revision: revision,
      version: 1,
      sha256: hash1,
    });
    await denied(
      "",
      {
        operation: "APPROVED",
        app_id: app,
        expected_revision: revision,
        version: 1,
        sha256: "0".repeat(64),
      },
      "reviewer",
    );
    await review(1, hash1);
    await release(1);
    const values = Object.fromEntries(
      exampleCustomApp.fields.map((f) => [
        f.key,
        f.type === "checkbox"
          ? true
          : f.type === "select"
            ? f.options[0]
            : "Synthetic saved value",
      ]),
    );
    const first = {
      operation_id: uuid(),
      record_id: record,
      expected_app_revision: revision,
      schema_version: 1,
      expected_record_revision: 0,
      data: values,
    };
    const receipt = await ok(`/${app}/records`, first);
    assert.equal(receipt.version, 1);
    assert.deepEqual(await ok(`/${app}/records`, first), receipt);
    assert.equal(
      (await ok(`/${app}/records`)).records[0].data[
        exampleCustomApp.fields[0].key
      ],
      values[exampleCustomApp.fields[0].key],
    );
    const second = {
      ...first,
      operation_id: uuid(),
      expected_record_revision: 1,
    };
    await ok(`/${app}/records`, second);
    await denied(`/${app}/records`, { ...first, data: {} }, "author", 400);
    await denied(`/${app}`, undefined, "outsider", 404);
    await denied(`/${app}/records`, first, "outsider", 404);
    await denied(`/${app}`, undefined, "fake", 404);
    const crossOrigin = await request(
      "",
      { operation: "register" },
      "author",
      "https://invalid.example",
    );
    assert.equal(crossOrigin.status, 403);
    process.env.KXRA_CUSTOM_APPS_ENABLED = "false";
    await denied(`/${app}`, undefined, "author", 404);
    process.env.KXRA_CUSTOM_APPS_ENABLED = "true";
    await admin.query(
      "update kxra_private.live_paid_access set valid_until=now()-interval '1 second' where org_id=$1",
      [org],
    );
    await denied(`/${app}`, undefined, "author", 404);
    await refreshProof();
    d = await register("Synthetic v2");
    await review(2, d.versions[0].sha256);
    await release(2);
    await denied(
      `/${app}/records`,
      {
        ...second,
        operation_id: uuid(),
        expected_app_revision: revision,
        expected_record_revision: 2,
      },
      "author",
      409,
    );
    await release(1, "ROLLBACK");
    // Withdrawn/expired/revoked reviews cannot authorize new records or release.
    await review(1, hash1, "WITHDRAWN");
    await denied(`/${app}/records`, {
      ...second,
      operation_id: uuid(),
      expected_app_revision: revision,
      expected_record_revision: 2,
    });
    await review(1, hash1);
    // Exercise authority revocation while a save is waiting, without relying on a timing-only sleep.
    const revoker = new pg.Client({ ...cfg, user: os.userInfo().username });
    await revoker.connect();
    await revoker.query("select set_config('request.jwt.claim.sub',$1,false)", [
      author,
    ]);
    await revoker.query("begin");
    await revoker.query(
      "update kxra.team_room_members set active=false where room_id=$1 and account_id=$2",
      [room, reviewer],
    );
    const waitingSave = request(`/${app}/records`, {
      ...second,
      operation_id: uuid(),
      expected_app_revision: revision,
      expected_record_revision: 2,
    });
    let observed = false;
    for (let n = 0; n < 100; n++) {
      if (
        (
          await admin.query(
            "select exists(select 1 from pg_locks l join pg_stat_activity a using(pid) where l.locktype='advisory' and not l.granted and a.usename='kxra_app') waiting",
          )
        ).rows[0].waiting
      ) {
        observed = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    await revoker.query("commit");
    assert.equal(
      observed,
      true,
      "Save must demonstrably wait behind authority revocation",
    );
    assert.equal((await waitingSave).status, 403);
    assert.equal((await ok(`/${app}/records`)).can_write, false);
    await revoker.query(
      "update kxra.team_room_members set active=true where room_id=$1 and account_id=$2",
      [room, reviewer],
    );
    await revoker.end();
    // Model account() loading a newer DB version while the verified token retains its old claim.
    await admin.query(
      "update kxra.account_identities set session_version=2 where account_id=$1",
      [author],
    );
    identities.author.session_version = 2;
    await denied(`/${app}`, undefined, "author", 404);
    identities.author.provider_session_version = 2;
    await ok(`/${app}`);
    await admin.query(
      "update kxra.account_identities set session_version=1 where account_id=$1",
      [author],
    );
    identities.author.session_version = 1;
    identities.author.provider_session_version = 1;
    await denied(
      "",
      {
        operation: "register",
        app_id: uuid(),
        expected_revision: 0,
        schema: { ...exampleCustomApp, source: "fetch" },
      },
      "author",
      400,
    );
    const another = await ok("", {
      operation: "register",
      app_id: uuid(),
      expected_revision: 0,
      schema: exampleCustomApp,
    });
    await denied(
      `/${another.app.id}/receipts/${first.operation_id}`,
      undefined,
      "author",
      404,
    );
    evidence.phases.push(
      "Deterministic held-fence reviewer-room revocation versus save; stale signed claim rejected even when Actor carries fresh database version; malformed schema and cross-app receipt denied",
    );
    await runCustomAppsCompositionProof({
      admin,
      pool: pooled.getPool(),
      fixture,
      reviewer,
      root,
      runtime,
      cfg,
      refreshProof,
      write,
    });
    evidence.phases.push(
      "Combined genuine119+GitHub+paired+apps actual review lock races, clock expiry, current reviewer legal and orphan/target/ACL negatives",
    );
    await browserFixture.run();
    evidence.phases.push(
      "Actual shipped React browser components to HTTP core to combined production SQL; synthetic resolved identity only",
    );
    // Database boundaries are tested without the HTTP capability guard.
    const unauthorized = new pg.Client(cfg);
    await unauthorized.connect();
    await unauthorized.query("begin; set local role authenticated");
    await unauthorized.query(
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.kxra.org_id',$2,true),set_config('request.jwt.claims',$3,true),set_config('request.kxra.execution_mode','hosted',true),set_config('request.kxra.custom_apps_verified','off',true)",
      [
        author,
        org,
        JSON.stringify({
          sub: author,
          aal: "aal2",
          auth_time: Math.floor(Date.now() / 1000),
          session_version: 1,
          provider_session_version: 1,
        }),
      ],
    );
    assert.equal(
      (await unauthorized.query("select * from kxra.custom_apps")).rowCount,
      0,
    );
    await assert.rejects(
      unauthorized.query("select kxra.custom_app_register($1,$2,0,$3)", [
        uuid(),
        room,
        JSON.stringify(exampleCustomApp),
      ]),
      { code: "42501" },
    );
    await unauthorized.query("rollback");
    await unauthorized.query("begin;set local role authenticated");
    await assert.rejects(
      unauthorized.query("delete from kxra.custom_app_reviews"),
      { code: "42501" },
    );
    await unauthorized.query("rollback");
    await unauthorized.end();
    await admin.query("begin");
    await assert.rejects(
      admin.query(
        "update kxra.custom_app_versions set sha256=sha256 where app_id=$1",
        [app],
      ),
      { code: "P0001" },
    );
    await admin.query("rollback");
    await admin.query(
      "insert into kxra.custom_app_reviews(app_id,version,artifact_sha256,decision,reviewed_by,session_version,reviewed_at,expires_at) values($1,1,$2,'APPROVED',$3,1,clock_timestamp()-interval '1 hour',clock_timestamp()-interval '1 second')",
      [app, hash1, reviewer],
    );
    assert.equal((await ok(`/${app}/records`)).can_write, false);
    await denied(`/${app}/records`, {
      ...second,
      operation_id: uuid(),
      expected_app_revision: revision,
      expected_record_revision: 2,
    });
    await review(1, hash1);
    await admin.query(
      "update kxra.account_identities set session_version=2 where account_id=$1",
      [reviewer],
    );
    assert.equal((await ok(`/${app}/records`)).can_write, false);
    await admin.query(
      "update kxra.account_identities set session_version=1 where account_id=$1",
      [reviewer],
    );
    evidence.phases.push(
      "Direct authenticated SQL: disabled verified capability hides all apps and denies register; table writes and immutable artifact edits deny; expired approval and reviewer-session revocation deny new record saves",
    );
    const interrupted = {
      ...second,
      operation_id: uuid(),
      expected_app_revision: revision,
      expected_record_revision: 2,
    };
    const beforeCount = (
      await admin.query(
        "select count(*)::int n from kxra.custom_app_record_versions",
      )
    ).rows[0].n;
    // Roll back an otherwise valid operation to model an interrupted transaction (not a process crash).
    const session = new pg.Client(cfg);
    await session.connect();
    await session.query("begin;set local role authenticated");
    await session.query(
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.kxra.org_id',$2,true),set_config('request.jwt.claims',$3,true),set_config('request.kxra.execution_mode','hosted',true),set_config('request.kxra.custom_apps_verified','on',true)",
      [
        author,
        org,
        JSON.stringify({
          sub: author,
          aal: "aal2",
          auth_time: Math.floor(Date.now() / 1000),
          session_version: 1,
          provider_session_version: 1,
        }),
      ],
    );
    await session.query(
      "select kxra.custom_app_record_save($1,$2,$3,$4,$5,1,2,$6)",
      [
        interrupted.operation_id,
        record,
        app,
        room,
        revision,
        JSON.stringify(values),
      ],
    );
    await session.query("rollback");
    await session.end();
    assert.equal(
      (
        await admin.query(
          "select count(*)::int n from kxra.custom_app_record_versions",
        )
      ).rows[0].n,
      beforeCount,
    );
    evidence.phases.push(
      "HTTP:create-independent-review-publish-save-reload-revise-v2-rollback-cross-tenant-fake-identity-CSRF-default-off-expired-paid-withdrawal-and-transaction-rollback",
    );
    const catalog = await integrationCatalog(admin),
      data = await integrationData(admin, catalog);
    write("source-catalog.json", catalog);
    write("source-data.json", data);
    fs.writeFileSync(path.join(runtime, "empty.pgpass"), "", { mode: 0o600 });
    const dump = path.join(runtime, "source.dump");
    execFileSync(
      path.join(bin, "pg_dump"),
      [
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
      ],
      {
        env: {
          NODE_ENV: "development",
          PATH: process.env.PATH,
          PGPASSFILE: path.join(runtime, "empty.pgpass"),
        },
      },
    );
    fs.writeFileSync(path.join(runtime, "empty.pgpass"), "", { mode: 0o600 });
    await pooled.getPool().end();
    pooled = undefined; // Closure acknowledged before restart; do not end the same pool twice.
    await admin.end();
    admin = undefined;
    runDatabase("stop");
    // pg_ctl restart only; never rerun seeding or migrations over the checkpoint.
    execFileSync(
      path.join(bin, "pg_ctl"),
      [
        "-D",
        path.join(runtime, "postgres"),
        "-l",
        path.join(runtime, "restart.log"),
        "-o",
        `-k '${cfg.host}' -p ${cfg.port} -h ''`,
        "-w",
        "start",
      ],
      { stdio: "inherit" },
    );
    admin = new pg.Client({ ...cfg, user: os.userInfo().username });
    await admin.connect();
    assert.deepEqual(await integrationCatalog(admin), catalog);
    assert.deepEqual(await integrationData(admin, catalog), data);
    async function probe(database: string, ownedRestoreTarget?: string) {
      if (database === "postgres") await refreshProof();
      write("probe-input.json", {
        database,
        ownedRestoreTarget,
        author,
        org,
        room,
        app,
        record,
        revision,
        hash1,
        receipt,
        first,
        interrupted,
      });
      execFileSync(
        process.execPath,
        ["--import", "tsx", "scripts/custom-apps-production-probe.ts"],
        {
          cwd: root,
          env: {
            PATH: process.env.PATH,
            HOME: runtime,
            USER: os.userInfo().username,
            TMPDIR: process.env.TMPDIR,
            NODE_ENV: "development",
          },
          stdio: "inherit",
          timeout: 30000,
        },
      );
    }
    await probe("postgres");
    const afterSourceProbe = await integrationData(admin, catalog);
    write("source-after-continuation.json", afterSourceProbe);

    const target = "kxra_app_restore_" + crypto.randomBytes(6).toString("hex");
    assert.equal(
      (
        await admin.query("select 1 from pg_database where datname=$1", [
          target,
        ])
      ).rowCount,
      0,
    );
    await admin.query(`create database ${target} template template0`);
    const restored = new pg.Client({
      ...cfg,
      database: target,
      user: os.userInfo().username,
    });
    await restored.connect();
    assert.equal(
      (
        await restored.query(
          "select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not like 'pg_%' and n.nspname<>'information_schema'",
        )
      ).rows[0].n,
      0,
    );
    await restored.end();
    execFileSync(
      path.join(bin, "pg_restore"),
      [
        "-h",
        cfg.host,
        "-p",
        String(cfg.port),
        "-U",
        os.userInfo().username,
        "-d",
        target,
        "--single-transaction",
        "--exit-on-error",
        dump,
      ],
      {
        env: {
          NODE_ENV: "development",
          PATH: process.env.PATH,
          PGPASSFILE: path.join(runtime, "empty.pgpass"),
        },
      },
    );
    const restoredAdmin = new pg.Client({
      ...cfg,
      database: target,
      user: os.userInfo().username,
    });
    await restoredAdmin.connect();
    assert.deepEqual(await integrationCatalog(restoredAdmin), catalog);
    assert.deepEqual(await integrationData(restoredAdmin, catalog), data);
    await restoredAdmin.query(
      "update kxra_private.live_paid_access set checked_at=now(),valid_until=now()+interval '55 seconds' where org_id=$1",
      [org],
    );
    await restoredAdmin.end();
    await probe(target, target);
    assert.deepEqual(
      await integrationData(admin, catalog),
      afterSourceProbe,
      "Restore/probe must not change source checkpoint",
    );
    evidence.phases.push(
      "Restart and fresh-empty-target restore: exact complete catalog, ACLs, policies, constraints, definitions, sequences, all app/record/review/release/receipt data",
    );
    evidence.target = target;
    evidence.dumpSha256 = crypto
      .createHash("sha256")
      .update(fs.readFileSync(dump))
      .digest("hex");
    evidence.app = { app, record, revision, hash1, receipt, interrupted };
    evidence.knownLimitations = [
      "Synthetic server-resolved identities injected only by test adapter; no real Supabase session acceptance",
      "Same-cluster fresh database restore; no independent infrastructure or SIGKILL test",
      "Verified hook-issued custom session-version claim is required; token hook installation remains a live gate",
    ];
    write("receipt.json", evidence);
    console.log("PRODUCTION_CUSTOM_APPS_NATIVE_PASS " + runtime);
  } finally {
    async function bounded(promise: Promise<unknown>, ms = 4000) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          promise,
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(Error("OWNED_RESOURCE_CLOSE_UNCONFIRMED")),
              ms,
            );
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
    const results = await Promise.allSettled([
      server
        ? bounded(
            new Promise<void>((resolve, reject) => {
              server!.close((error) => (error ? reject(error) : resolve()));
              server!.closeAllConnections();
            }),
          )
        : Promise.resolve(),
      pooled ? bounded(pooled.getPool().end()) : Promise.resolve(),
      admin ? bounded(admin.end()) : Promise.resolve(),
    ]);
    const data = path.join(runtime, "postgres");
    const stop = fs.existsSync(path.join(data, "PG_VERSION"))
      ? spawnSync(
          path.join(bin, "pg_ctl"),
          ["-D", data, "-m", "fast", "-w", "stop"],
          { env: bootstrapEnv, timeout: 30000 },
        )
      : { status: 0 };
    const status = fs.existsSync(path.join(data, "PG_VERSION"))
      ? spawnSync(path.join(bin, "pg_ctl"), ["-D", data, "status"], {
          env: bootstrapEnv,
          timeout: 5000,
        })
      : { status: 3 };
    const clean =
      (browserFixture?.cleanupConfirmed() ?? true) &&
      results.every((r) => r.status === "fulfilled") &&
      stop.status === 0 &&
      status.status === 3 &&
      !fs.existsSync(path.join(data, "postmaster.pid"));
    write("cleanup.json", {
      clean,
      browserCleanupConfirmed: browserFixture?.cleanupConfirmed() ?? true,
      independentResourceCloseResults: results.map((r) => r.status),
      postgresStop: stop.status,
      postgresStatus: status.status,
      postmasterPidAbsent: !fs.existsSync(path.join(data, "postmaster.pid")),
    });
    assert.ok(clean, "OWNED_CLEANUP_UNCERTAIN_LEASE_RETAINED");
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
