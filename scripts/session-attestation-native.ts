import { sessionAttestationPayload } from "./session-attestation-payload.mjs";
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
import { productionOperationsPayload } from "./production-operations-review.mjs";
import { customAppsProductionPayload } from "./custom-apps-production-payload.mjs";
import {
  pairedCompositionCatalog as catalog,
  pairedCompositionData as data,
} from "./paired-composition-catalog.mjs";
import { seedAiResumeFixture } from "../tests/support/ai-resume-fixture";
import {
  syntheticSessionClaims,
  syntheticVerifiedSession,
} from "../tests/support/synthetic-session-attestation";
import { exampleCustomApp } from "../packages/custom-apps/contract";
import type { Actor } from "../apps/os/lib/auth";
async function main() {
  const root = fs.realpathSync(process.cwd());
  assert.match(root, /^\/(?:private\/)?tmp\/kxra-session-[A-Za-z0-9]+$/);
  const runtime = path.join(root, ".runtime/proof"),
    uuid = () => crypto.randomUUID(),
    bin = postgresBin();
  fs.mkdirSync(runtime, { recursive: true, mode: 0o700 });
  async function port() {
    const s = net.createServer();
    await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
    const n = (s.address() as net.AddressInfo).port;
    await new Promise<void>((r) => s.close(() => r()));
    return n;
  }
  const env = {
    PATH: process.env.PATH,
    HOME: runtime,
    USER: os.userInfo().username,
    TMPDIR: process.env.TMPDIR,
    NODE_ENV: "development" as const,
    LANG: "C",
    LC_ALL: "C",
    KXRA_AUTH_MODE: "fixture",
    KXRA_RUNTIME: runtime,
    KXRA_PG_PORT: String(await port()),
    KXRA_ORIGIN: `http://127.0.0.1:${await port()}`,
    KXRA_LOCAL_SECRET: crypto.randomBytes(48).toString("hex"),
  };
  const write = (file: string, value: unknown) =>
    fs.writeFileSync(
      path.join(runtime, file),
      JSON.stringify(value, null, 2) + "\n",
      { mode: 0o600 },
    );
  const database = (action: string) =>
    execFileSync(process.execPath, ["scripts/database.mjs", action], {
      cwd: root,
      env,
      stdio: "inherit",
      timeout: 45000,
    });
  let admin: pg.Client | undefined,
    provider: pg.Client | undefined,
    server: http.Server | undefined,
    pool: any;
  const receipt: any = {
    classification: "LOCAL_SYNTHETIC_AUTH_SESSION_HOOK_NOT_PROVIDER_ACCEPTANCE",
    baseCommit: "2b74d665c81893aa100b91b14813e2b40fe9fcfa",
    sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    payloadSha256: crypto
      .createHash("sha256")
      .update(
        fs.readFileSync(
          "database/production/custom-app-session-attestation-v1.sql",
        ),
      )
      .digest("hex"),
    phases: [],
  };
  try {
    Object.assign(process.env, env);
    database("start");
    const cfg = JSON.parse(
      fs.readFileSync(path.join(runtime, "database.json"), "utf8"),
    );
    assert.equal(cfg.host, path.join(runtime, "socket"));
    assert.equal(cfg.user, "kxra_app");
    assert.equal(cfg.database, "postgres");
    assert.ok(!cfg.password && !cfg.connectionString && !cfg.ssl);
    admin = new pg.Client({ ...cfg, user: os.userInfo().username });
    await admin.connect();
    assert.equal(
      (await admin.query("show data_directory")).rows[0].data_directory,
      path.join(runtime, "postgres"),
    );
    assert.equal(
      (await admin.query("show listen_addresses")).rows[0].listen_addresses,
      "",
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
    await admin.query(customAppsProductionPayload(root).sql);
    await admin.query("begin");
    const f = await seedAiResumeFixture(admin, false);
    await admin.query("commit");
    const author = f.actor,
      org = f.org,
      room = f.room,
      reviewer = uuid(),
      outsider = uuid(),
      otherOrg = uuid();
    await admin.query(
      "insert into kxra.account_identities(account_id,auth_provider,auth_subject,state,email_verified_at) values($1::uuid,'SUPABASE',$1::text,'ACTIVE',now()),($2::uuid,'SUPABASE',$2::text,'ACTIVE',now())",
      [reviewer, outsider],
    );
    await admin.query(
      "insert into kxra.organisations(id,name,slug,organisation_kind) values($1::uuid,'Synthetic other tenant',$1::text,'CUSTOMER')",
      [otherOrg],
    );
    await admin.query(
      "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_ADMIN','CUSTOMER','ACTIVE','Synthetic reviewer','LOCAL_SESSION_TEST'),($3,$4,'ORG_ADMIN','CUSTOMER','ACTIVE','Synthetic outsider','LOCAL_SESSION_TEST')",
      [org, reviewer, otherOrg, outsider],
    );
    await admin.query("select set_config('request.jwt.claim.sub',$1,false)", [
      author,
    ]);
    await admin.query(
      "insert into kxra.team_room_members(room_id,account_id) values($1,$2)",
      [room, reviewer],
    );
    // Synthetic Auth schema and role only inside this newly owned private Unix-socket cluster.
    await admin.query(
      "create table auth.sessions(id uuid primary key,user_id uuid not null,created_at timestamptz,updated_at timestamptz,not_after timestamptz); alter table auth.sessions owner to supabase_auth_admin; revoke all on auth.sessions from public,anon,authenticated,kxra_app; grant usage on schema auth to supabase_auth_admin",
    );
    provider = new pg.Client({ ...cfg, user: os.userInfo().username });
    await provider.connect();
    await provider.query("set session authorization supabase_auth_admin");
    const existing = uuid();
    await provider.query(
      "insert into auth.sessions(id,user_id,created_at) values($1,$2,clock_timestamp())",
      [existing, author],
    );
    const before = await catalog(admin),
      oldOID = (
        await admin.query(
          "select 'kxra_private.custom_apps_access()'::regprocedure::oid oid",
        )
      ).rows[0].oid;
    const { sql, spec: attestationSpec } = sessionAttestationPayload(root);
    receipt.verifiedRuntimeSources = attestationSpec.sourceFiles;
    receipt.verifiedPreservedSources = attestationSpec.preservedSources;
    receipt.sourceVerifier =
      "sessionAttestationPayload: exact bytes, inventory and explicit prior-cohort transitions";
    await admin.query("begin");
    await admin.query(
      sql.replace(/^[\s\S]*?\bbegin;\s*/i, "").replace(/commit;\s*$/i, ""),
    );
    await assert.rejects(admin.query("select 1/0"));
    await admin.query("rollback");
    assert.deepEqual(await catalog(admin), before);
    await admin.query(sql);
    const afterAttestation = await catalog(admin);
    const key = (r: any) => r.schema + "." + r.name;
    assert.deepEqual(
      afterAttestation.tables
        .filter(
          (r: any) => !before.tables.some((old: any) => key(old) === key(r)),
        )
        .map(key)
        .sort(),
      attestationSpec.tables,
    );
    assert.deepEqual(
      afterAttestation.functions
        .filter(
          (r: any) => !before.functions.some((old: any) => key(old) === key(r)),
        )
        .map(key)
        .sort(),
      attestationSpec.functions.filter(
        (f: string) => f !== "kxra_private.custom_apps_access",
      ),
    );
    for (const [section, rows] of Object.entries(before) as [string, any[]][])
      for (const row of rows) {
        if (
          section === "functions" &&
          key(row) === "kxra_private.custom_apps_access"
        ) {
          const changed = afterAttestation.functions.find(
            (r: any) => key(r) === key(row),
          );
          assert.ok(changed);
          const { definition: ignoredBefore, ...oldAuthority } = row;
          const { definition: ignoredAfter, ...newAuthority } = changed;
          assert.deepEqual(newAuthority, oldAuthority);
        } else
          assert.ok(
            (afterAttestation as any)[section].some(
              (r: any) => JSON.stringify(r) === JSON.stringify(row),
            ),
            "Unreviewed catalogue change " + section,
          );
      }
    assert.equal(
      (
        await admin.query(
          "select 'kxra_private.custom_apps_access()'::regprocedure::oid oid",
        )
      ).rows[0].oid,
      oldOID,
    );
    for (const p of before.policies)
      assert.ok(
        (await catalog(admin)).policies.some(
          (x: any) => JSON.stringify(x) === JSON.stringify(p),
        ),
        "Preexisting policy changed",
      );
    async function hook(
      user: string,
      session: string,
      version = 999,
      extra: Record<string, unknown> = {},
    ) {
      const event = {
        user_id: user,
        authentication_method: "token_refresh",
        claims: { ...syntheticSessionClaims(user, session, version), ...extra },
      };
      return (
        await provider!.query(
          "select kxra_private.custom_app_access_token_hook($1) value",
          [JSON.stringify(event)],
        )
      ).rows[0].value.claims as Record<string, unknown>;
    }
    async function newSession(user: string, created = true) {
      const s = uuid();
      await provider!.query(
        "insert into auth.sessions(id,user_id,created_at) values($1,$2,case when $3 then clock_timestamp() else null end)",
        [s, user, created],
      );
      return s;
    }
    assert.equal(
      (await hook(author, existing)).kxra_session_version,
      undefined,
    );
    const initial = await newSession(author),
      reviewSession = await newSession(reviewer),
      outsideSession = await newSession(outsider);
    const stamped = await hook(author, initial, 999, {
      user_metadata: { kxra_session_version: 999 },
      app_metadata: { kxra_session_version: 999 },
    });
    assert.equal(stamped.kxra_session_version, 1);
    assert.deepEqual(stamped.user_metadata, { kxra_session_version: 999 });
    assert.equal((await hook(author, initial)).kxra_session_version, 1);
    assert.equal(
      (await hook(author, reviewSession)).kxra_session_version,
      undefined,
    );
    const missingUser = uuid(),
      missingSession = await newSession(missingUser);
    await admin.query(
      "insert into kxra.account_identities(account_id,auth_provider,auth_subject,state,email_verified_at) values($1::uuid,'SUPABASE',$1::text,'ACTIVE',now())",
      [missingUser],
    );
    assert.equal(
      (await hook(missingUser, missingSession)).kxra_session_version,
      undefined,
    );
    assert.equal(
      (await hook(missingUser, await newSession(missingUser)))
        .kxra_session_version,
      1,
    );
    assert.equal(
      (await hook(author, await newSession(author, false)))
        .kxra_session_version,
      undefined,
    );
    await provider.query("begin");
    await assert.rejects(
      provider.query(
        "update auth.sessions set created_at=created_at+interval '1 second' where id=$1",
        [initial],
      ),
      { code: "P0001" },
    );
    await provider.query("rollback");
    const pendingAccount = uuid();
    await admin.query(
      "insert into kxra.account_identities(account_id,auth_provider,auth_subject,state) values($1::uuid,'SUPABASE',$1::text,'REGISTERED')",
      [pendingAccount],
    );
    const pendingSession = await newSession(pendingAccount);
    assert.equal(
      (await hook(pendingAccount, pendingSession)).kxra_session_version,
      undefined,
    );
    await admin.query(
      "update kxra.account_identities set state='ACTIVE',email_verified_at=clock_timestamp() where account_id=$1",
      [pendingAccount],
    );
    assert.equal(
      (await hook(pendingAccount, pendingSession)).kxra_session_version,
      1,
    );
    for (const claims of [
      { ...syntheticSessionClaims(author, initial, 999), is_anonymous: true },
      { ...syntheticSessionClaims(author, initial, 999), role: "anon" },
      { ...syntheticSessionClaims(author, reviewSession, 999) },
    ])
      assert.equal(
        (
          await provider.query(
            "select kxra_private.custom_app_access_token_hook($1) value",
            [JSON.stringify({ user_id: author, claims })],
          )
        ).rows[0].value.claims.kxra_session_version,
        undefined,
      );
    await assert.rejects(
      provider.query("select kxra_private.custom_app_access_token_hook($1)", [
        JSON.stringify({ claims: [] }),
      ]),
      { code: "22023" },
    );
    const preservedClaims = {
      ...syntheticSessionClaims(author, initial, 999),
      user_metadata: { kxra_session_version: 999, role: "ORG_ADMIN" },
      app_metadata: { kxra_session_version: 999 },
    };
    const preservedOutput = (
      await provider.query(
        "select kxra_private.custom_app_access_token_hook($1) value",
        [JSON.stringify({ user_id: author, claims: preservedClaims })],
      )
    ).rows[0].value.claims;
    assert.deepEqual(
      preservedOutput,
      { ...preservedClaims, kxra_session_version: 1 },
      "Standard claims and ignored metadata must remain byte-equivalent JSON values",
    );
    const roleClient = new pg.Client(cfg);
    await roleClient.connect();
    await assert.rejects(
      roleClient.query("select kxra_private.custom_app_access_token_hook($1)", [
        JSON.stringify({ claims: {} }),
      ]),
      { code: "42501" },
    );
    await roleClient.query("begin;set local role authenticated");
    await assert.rejects(
      roleClient.query(
        "select * from kxra_private.custom_app_session_bindings",
      ),
      { code: "42501" },
    );
    await roleClient.query("rollback");
    await roleClient.end();
    await provider.query("begin");
    await assert.rejects(
      provider.query("select * from kxra_private.custom_app_session_bindings"),
      { code: "42501" },
    );
    await provider.query("rollback");
    receipt.phases.push(
      "Immutable INSERT-only original version, refresh no rebinding, incoming claim stripped/metadata ignored, no backfill, permanent missing-account/null-time tombstones, ownership mismatch/identity update/direct hook/table ACL denial; original RLS predicate OID and policies preserved",
    );
    Object.assign(process.env, {
      KXRA_AUTH_MODE: "supabase",
      KXRA_CUSTOM_APPS_ENABLED: "true",
      DATABASE_URL: `postgresql://kxra_app@localhost/postgres?host=${encodeURIComponent(cfg.host)}&port=${cfg.port}`,
    });
    pool = await import("../packages/db");
    const { customAppHttp } = await import("../apps/os/lib/custom-app-http");
    const sessions: Record<
      string,
      { issuer: ReturnType<typeof syntheticVerifiedSession>; org: string }
    > = {};
    async function identity(
      name: string,
      user: string,
      s: string,
      o = org,
      claims?: Record<string, unknown>,
    ) {
      sessions[name] = {
        issuer: syntheticVerifiedSession(claims ?? (await hook(user, s))),
        org: o,
      };
    }
    await identity("author", author, initial);
    await identity("reviewer", reviewer, reviewSession);
    await identity("outsider", outsider, outsideSession, otherOrg);
    server = http.createServer(async (req, res) => {
      try {
        let bytes = Buffer.alloc(0);
        for await (const c of req) bytes = Buffer.concat([bytes, c]);
        const url = new URL(req.url!, env.KXRA_ORIGIN),
          parts = url.pathname.split("/").filter(Boolean),
          which =
            sessions[String(req.headers["x-synthetic-session"] ?? "author")];
        const response = await customAppHttp(
          new Request(url, {
            method: req.method,
            headers: req.headers as HeadersInit,
            ...(bytes.length ? { body: bytes } : {}),
          }),
          { params: Promise.resolve({ room: parts[2], path: parts.slice(3) }) },
          async () => {
            assert.ok(which);
            const principal = await which.issuer.principal();
            assert.ok(principal, "Signed SDK-verified identity required");
            const rows = await pool.query(
              { ...principal, organisation_id: which.org },
              "select a.session_version,m.security_role from kxra.account_identities a join kxra.organisation_memberships m on m.account_id=a.account_id where a.account_id=$1 and m.org_id=$2",
              [principal.id, which.org],
            );
            assert.equal(rows.length, 1);
            return {
              ...principal,
              ...rows[0],
              organisation_id: which.org,
              org_id: which.org,
              organisation_kind: "CUSTOMER",
            } as Actor;
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
      server!.listen(Number(new URL(env.KXRA_ORIGIN).port), "127.0.0.1", r),
    );
    async function request(tail = "", body?: unknown, who = "author") {
      return fetch(env.KXRA_ORIGIN + "/api/custom-apps/" + room + tail, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          origin: env.KXRA_ORIGIN,
          "content-type": "application/json",
          "x-synthetic-session": who,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    }
    async function ok(tail = "", body?: unknown, who = "author") {
      const r = await request(tail, body, who);
      assert.equal(r.status, 200, await r.clone().text());
      return r.json();
    }
    async function deny(
      tail: string,
      body: unknown,
      who = "author",
      status = 404,
    ) {
      const r = await request(tail, body, who);
      assert.equal(r.status, status, await r.text());
    }
    const refresh = () =>
      admin!.query(
        "update kxra_private.live_paid_access set checked_at=now(),valid_until=now()+interval '55 seconds' where org_id=$1",
        [org],
      );
    await refresh();
    const app = uuid(),
      record = uuid();
    let d = await ok("", {
      operation: "register",
      app_id: app,
      expected_revision: 0,
      schema: exampleCustomApp,
    });
    d = await ok(
      "",
      {
        operation: "APPROVED",
        app_id: app,
        expected_revision: d.app.revision,
        version: 1,
        sha256: d.versions[0].sha256,
      },
      "reviewer",
    );
    d = await ok("", {
      operation: "PUBLISH",
      app_id: app,
      expected_revision: d.app.revision,
      version: 1,
    });
    const revision = d.app.revision;
    const values = Object.fromEntries(
      exampleCustomApp.fields.map((f) => [
        f.key,
        f.type === "checkbox"
          ? true
          : f.type === "select"
            ? f.options[0]
            : "Synthetic attested record",
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
    const saved = await ok(`/${app}/records`, first);
    assert.deepEqual(await ok(`/${app}/records`, first), saved);
    await deny(`/${app}`, undefined, "outsider");
    await admin.query(
      "update kxra.account_identities set session_version=2 where account_id=$1",
      [author],
    );
    await deny(`/${app}`, undefined);
    assert.equal(
      (await hook(author, initial, 2)).kxra_session_version,
      undefined,
    );
    await identity("refresh-old", author, initial);
    await deny(`/${app}`, undefined, "refresh-old");
    await identity(
      "forged-new-version",
      author,
      initial,
      org,
      syntheticSessionClaims(author, initial, 2),
    );
    await deny(`/${app}`, undefined, "forged-new-version");
    let liveSession = await newSession(author);
    await identity("author", author, liveSession);
    assert.equal((await hook(author, liveSession)).kxra_session_version, 2);
    await ok(`/${app}`);
    await identity(
      "swapped-session",
      author,
      reviewSession,
      org,
      syntheticSessionClaims(author, reviewSession, 2),
    );
    await deny(`/${app}`, undefined, "swapped-session");
    async function heldRevocation(
      client: pg.Client,
      sql: string,
      params: unknown[],
    ) {
      await client.query("begin");
      await client.query(sql, params);
      const pending = request(`/${app}/records`, {
        ...first,
        operation_id: uuid(),
        expected_record_revision: 1,
      });
      let observed = false;
      for (let n = 0; n < 100; n++) {
        if (
          (
            await admin!.query(
              "select exists(select 1 from pg_locks l join pg_stat_activity a using(pid) where l.locktype='advisory' and not l.granted and a.usename='kxra_app') waiting",
            )
          ).rows[0].waiting
        ) {
          observed = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 20));
      }
      await client.query("commit");
      assert.equal(
        observed,
        true,
        "Mutation must demonstrably wait for revocation",
      );
      assert.equal((await pending).status, 403);
      assert.equal(
        (
          await admin!.query(
            "select count(*)::int n from kxra.custom_app_record_versions where record_id=$1",
            [record],
          )
        ).rows[0].n,
        1,
      );
    }
    const revoker = new pg.Client({ ...cfg, user: os.userInfo().username });
    await revoker.connect();
    await heldRevocation(
      revoker,
      "update kxra.account_identities set session_version=3 where account_id=$1",
      [author],
    );
    await revoker.end();
    liveSession = await newSession(author);
    await identity("author", author, liveSession);
    const deleted = liveSession;
    await heldRevocation(provider, "delete from auth.sessions where id=$1", [
      deleted,
    ]);
    await deny(`/${app}`, undefined);
    assert.equal(
      (await hook(author, deleted, 3)).kxra_session_version,
      undefined,
    );
    await provider.query("begin");
    await assert.rejects(
      provider.query(
        "insert into auth.sessions(id,user_id,created_at) values($1,$2,clock_timestamp())",
        [deleted, author],
      ),
      { code: "23505" },
    );
    await provider.query("rollback");
    liveSession = await newSession(author);
    await identity("author", author, liveSession);
    await heldRevocation(
      provider,
      "update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=$1",
      [liveSession],
    );
    await deny(`/${app}`, undefined);
    liveSession = await newSession(author);
    await identity("author", author, liveSession);
    const next = {
      ...first,
      operation_id: uuid(),
      expected_record_revision: 1,
    };
    const second = await ok(`/${app}/records`, next);
    assert.equal(second.version, 2);
    assert.deepEqual(await ok(`/${app}/records`, next), second);
    receipt.phases.push(
      "Synthetic ES256 issuer in memory, actual Supabase SDK getUser/getClaims boundary, authenticated create/review/publish/save/read/retry; original token+refresh+forged-current-version+foreign-session denial after account revocation; fresh sign-in succeeds; deterministic account bump/session DELETE/not_after UPDATE versus waiting save; deleted ID cannot rebind",
    );
    const checkpoint = await catalog(admin),
      checkpointData = await data(admin, checkpoint);
    write("source-catalog.json", checkpoint);
    write("source-data.json", checkpointData);
    const dump = path.join(runtime, "source.dump");
    fs.writeFileSync(path.join(runtime, "empty.pgpass"), "", { mode: 0o600 });
    const pgEnv = {
      NODE_ENV: "development" as const,
      PATH: process.env.PATH,
      PGPASSFILE: path.join(runtime, "empty.pgpass"),
    };
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
      { env: pgEnv },
    );
    await pool.getPool().end();
    pool = undefined;
    await provider.end();
    provider = undefined;
    await admin.end();
    admin = undefined;
    database("stop");
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
    assert.deepEqual(await catalog(admin), checkpoint);
    assert.deepEqual(await data(admin, checkpoint), checkpointData);
    const input = {
      author,
      org,
      room,
      app,
      record,
      session: liveSession,
      original: initial,
      deleted,
      version: 3,
      revision,
      first,
      saved,
      next,
      second,
    };
    async function probe(database: string, target?: string) {
      write("probe-input.json", {
        ...input,
        database,
        ownedRestoreTarget: target,
      });
      execFileSync(
        process.execPath,
        ["--import", "tsx", "scripts/session-attestation-probe.ts"],
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
    await refresh();
    await probe("postgres");
    const afterSource = await data(admin, checkpoint);
    write("source-after-probe.json", afterSource);
    const target =
      "kxra_session_restore_" + crypto.randomBytes(6).toString("hex");
    assert.equal(
      (
        await admin.query("select 1 from pg_database where datname=$1", [
          target,
        ])
      ).rowCount,
      0,
    );
    await admin.query(`create database ${target} template template0`);
    const targetAdmin = new pg.Client({
      ...cfg,
      database: target,
      user: os.userInfo().username,
    });
    await targetAdmin.connect();
    assert.equal(
      (
        await targetAdmin.query(
          "select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not like 'pg_%' and n.nspname<>'information_schema'",
        )
      ).rows[0].n,
      0,
    );
    await targetAdmin.end();
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
      { env: pgEnv },
    );
    const restored = new pg.Client({
      ...cfg,
      database: target,
      user: os.userInfo().username,
    });
    await restored.connect();
    assert.deepEqual(await catalog(restored), checkpoint);
    assert.deepEqual(await data(restored, checkpoint), checkpointData);
    await restored.query(
      "update kxra_private.live_paid_access set checked_at=now(),valid_until=now()+interval '55 seconds' where org_id=$1",
      [org],
    );
    await restored.end();
    await probe(target, target);
    assert.deepEqual(
      await data(admin, checkpoint),
      afterSource,
      "Restored target must not change original source",
    );
    receipt.phases.push(
      "Exact full combined catalogue/data/ACL/constraint/policy/sequence preservation on graceful restart and fresh empty-target restore; new signed synthetic claims use preserved original binding; old revoked/deleted sessions still deny, receipt replay remains exactly once, source unchanged by target probe",
    );
    receipt.restoreTarget = target;
    receipt.dumpSha256 = crypto
      .createHash("sha256")
      .update(fs.readFileSync(dump))
      .digest("hex");
    receipt.knownLiveGates = [
      "No real Auth service/provider sessions/hook transaction or hosted getUser/getClaims acceptance",
      "Session creation hook ordering, correct schema/role and same authoritative DB must be verified on actual version",
      "Old Auth/application snapshots require coordinated revocation/provider-session invalidation before reopening; same-database restore cannot prove external revocation continuity",
      "No feature/hook activation, cohort numbering, hosted deployment or full launch acceptance supplied",
    ];
    write("receipt.json", receipt);
    console.log("ORIGINAL_SESSION_ATTESTATION_NATIVE_PASS " + runtime);
  } finally {
    const closes = await Promise.allSettled([
      server
        ? new Promise<void>((r, j) => {
            server!.close((e) => (e ? j(e) : r()));
            server!.closeAllConnections();
          })
        : Promise.resolve(),
      pool ? pool.getPool().end() : Promise.resolve(),
      provider ? provider.end() : Promise.resolve(),
      admin ? admin.end() : Promise.resolve(),
    ]);
    const dataDir = path.join(runtime, "postgres");
    const stop = fs.existsSync(path.join(dataDir, "PG_VERSION"))
      ? spawnSync(
          path.join(bin, "pg_ctl"),
          ["-D", dataDir, "-m", "fast", "-w", "stop"],
          { timeout: 30000 },
        )
      : { status: 0 };
    const status = fs.existsSync(path.join(dataDir, "PG_VERSION"))
      ? spawnSync(path.join(bin, "pg_ctl"), ["-D", dataDir, "status"], {
          timeout: 5000,
        })
      : { status: 3 };
    const clean =
      closes.every((r) => r.status === "fulfilled") &&
      stop.status === 0 &&
      status.status === 3 &&
      !fs.existsSync(path.join(dataDir, "postmaster.pid"));
    write("cleanup.json", {
      clean,
      resourceCloses: closes.map((r) => r.status),
      postgresStop: stop.status,
      postgresStatus: status.status,
    });
    assert.ok(clean, "OWNED_CLEANUP_UNCERTAIN");
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
