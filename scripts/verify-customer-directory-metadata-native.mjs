// Explicit window required. Fresh disposable PostgreSQL only; no target accepted.
// Synthetic Auth shape + exact application126, NOT real Supabase Auth acceptance.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import pg from "pg";
import { readCustomerDirectory } from "../packages/workspace/customer-admin-contract.ts";
import { applicationReleaseCohort } from "./application-release-cohort.mjs";
import {
  applicationCatalog,
  validateApplicationProfiles,
} from "./production-application-core.mjs";
import {
  pairedCompositionCatalog,
  pairedCompositionData,
} from "./paired-composition-catalog.mjs";
import { acquireNativeFixtureLease } from "./native-fixture-lease.mjs";
import { postgresBin } from "./postgres-bin.mjs";
assert.deepEqual(
  process.argv.slice(2),
  ["--reviewed-local-window"],
  "EXPLICIT_COORDINATED_LOCAL_WINDOW_REQUIRED",
);
for (const key of Object.keys(process.env))
  if (
    /^(DATABASE_URL$|PGHOST|PGPORT|PGUSER|PGPASSWORD|PGDATABASE|PGSERVICE|KXRA_PRODUCTION_|NEXT_PUBLIC_SUPABASE_URL$|SUPABASE_|VERCEL)/.test(
      key,
    )
  )
    assert.ok(!process.env[key], "NO_HOSTED_ENVIRONMENT_OR_CREDENTIALS");
const root = fs.realpathSync(path.resolve(import.meta.dirname, ".."));
const git = (args) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    timeout: 10000,
  }).trim();
assert.equal(
  git(["status", "--porcelain"]),
  "",
  "CLEAN_COMMITTED_SOURCE_REQUIRED",
);
const sourceCommit = git(["rev-parse", "HEAD"]);
const cohort = applicationReleaseCohort(root);
const payload = fs.readFileSync(
  path.join(root, "database/proposals/customer-directory-metadata-v1.sql"),
  "utf8",
);
const body = payload
  .replace(/^[\s\S]*?\bbegin;\s*/i, "")
  .replace(/commit;\s*$/i, "");
const runtime = fs.realpathSync(fs.mkdtempSync("/tmp/kxra-customer-metadata-"));
const bin = postgresBin(),
  dir = path.join(runtime, "postgres"),
  socket = path.join(runtime, "socket");
fs.mkdirSync(socket, { mode: 0o700 });
const env = {
  PATH: process.env.PATH,
  HOME: runtime,
  USER: os.userInfo().username,
  LANG: "C",
  LC_ALL: "C",
};
const run = (command, args) =>
  execFileSync(path.join(bin, command), args, {
    env,
    stdio: "pipe",
    timeout: 60000,
    maxBuffer: 32 * 1024 * 1024,
  });
const cfg = {
  host: socket,
  port: 55439,
  user: "postgres",
  database: "postgres",
  connectionTimeoutMillis: 5000,
  query_timeout: 15000,
};
const clients = [],
  phases = [];
const result = {
  classification:
    "LOCAL_SYNTHETIC_AUTH_APPLICATION126_PROPOSAL_NOT_HOSTED_ACCEPTANCE",
  sourceCommit,
  payloadSha256: crypto.createHash("sha256").update(payload).digest("hex"),
  runtime,
  phases,
  passed: false,
  hostedCalls: 0,
  providerCalls: 0,
  credentialsUsed: false,
};
const write = (file, value) =>
  fs.writeFileSync(
    path.join(runtime, file),
    JSON.stringify(value, null, 2) + "\n",
    { mode: 0o600 },
  );
let started = false;
let stopRequested = null;
const onInterrupt = () => {
  stopRequested = "SIGINT";
};
const onTerminate = () => {
  stopRequested = "SIGTERM";
};
process.on("SIGINT", onInterrupt);
process.on("SIGTERM", onTerminate);
function checkCancellation() {
  assert.equal(stopRequested, null, "COOPERATIVE_LOCAL_RUN_CANCELLED");
}
const release = acquireNativeFixtureLease(
  "customer-directory-metadata-proposal",
);
async function connect(user = "postgres") {
  const db = new pg.Client({ ...cfg, user });
  await db.connect();
  clients.push(db);
  await db.query("set statement_timeout='10s'; set timezone='UTC'");
  return db;
}
async function check(name, work) {
  checkCancellation();
  await work();
  checkCancellation();
  phases.push(name);
  console.log("PASS " + name);
}
const uuid = () => crypto.randomUUID();
try {
  run("initdb", [
    "-D",
    dir,
    "-U",
    "postgres",
    "--auth-local=trust",
    "--auth-host=reject",
    "--encoding=UTF8",
    "--no-locale",
  ]);
  started = true;
  run("pg_ctl", [
    "-D",
    dir,
    "-l",
    path.join(runtime, "postgres.log"),
    "-o",
    `-k '${socket}' -p 55439 -h ''`,
    "-w",
    "start",
  ]);
  const admin = await connect(),
    observer = await connect();
  assert.equal(
    (await admin.query("show data_directory")).rows[0].data_directory,
    dir,
  );
  assert.equal(
    (await admin.query("show listen_addresses")).rows[0].listen_addresses,
    "",
  );
  for (const role of [
    "anon",
    "authenticated",
    "kxra_app",
    "supabase_auth_admin",
    "metadata_hostile_default",
  ])
    await admin.query(
      `create role ${role} ${["kxra_app", "supabase_auth_admin"].includes(role) ? "login" : "nologin"} noinherit nobypassrls`,
    );
  await admin.query(`grant authenticated,anon to kxra_app;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    grant usage on schema auth to anon,authenticated,supabase_auth_admin;
    grant execute on all functions in schema auth to anon,authenticated;
    create table auth.sessions(id uuid primary key,user_id uuid not null,created_at timestamptz,updated_at timestamptz,not_after timestamptz);
    alter table auth.sessions owner to supabase_auth_admin;
    revoke all on auth.sessions from public,anon,authenticated,kxra_app;`);
  const owner = uuid(),
    ownerOrg = uuid(),
    membership = uuid(),
    unbound = uuid();
  await admin.query(
    "insert into auth.sessions(id,user_id,created_at) values($1,$2,clock_timestamp())",
    [unbound, owner],
  );
  for (const item of cohort.migrations) {
    checkCancellation();
    await admin.query("begin");
    try {
      await admin.query(item.sql);
      await admin.query("commit");
    } catch (error) {
      await admin.query("rollback");
      throw error;
    }
  }
  const major = String(
    Math.trunc(
      Number(
        (await admin.query("show server_version_num")).rows[0]
          .server_version_num,
      ) / 10000,
    ),
  );
  const profiles = validateApplicationProfiles(
    JSON.parse(
      fs.readFileSync(
        path.join(
          root,
          "packages/release/production-application-targets-v1.json",
        ),
        "utf8",
      ),
    ),
  );
  assert.equal(
    (await applicationCatalog(admin, 126)).sha256,
    profiles.find((p) => p.serverMajor === major)?.catalogs["126"],
    "EXACT_APPLICATION126_CATALOG_REQUIRED",
  );
  await admin.query(
    "alter default privileges grant execute on functions to metadata_hostile_default,authenticated,kxra_app",
  );
  const baseline = await pairedCompositionCatalog(admin),
    baselineData = await pairedCompositionData(admin, baseline);
  await check(
    "proposal rollback is atomic and installer role elevation is rejected",
    async () => {
      await admin.query("begin");
      await admin.query(body);
      await assert.rejects(admin.query("select 1/0"));
      await admin.query("rollback");
      assert.equal(
        (
          await admin.query(
            "select to_regnamespace('kxra_owner_metadata') value",
          )
        ).rows[0].value,
        null,
      );
      await admin.query("begin;grant postgres to kxra_app");
      await assert.rejects(admin.query(body), /Reviewed application126 owner/);
      await admin.query("rollback");
      assert.deepEqual(await pairedCompositionCatalog(admin), baseline);
      assert.deepEqual(
        await pairedCompositionData(admin, baseline),
        baselineData,
      );
    },
  );
  await admin.query(payload);
  await check(
    "hostile default grants removed; owner-only ACL; original catalog/data unchanged",
    async () => {
      assert.deepEqual(await pairedCompositionCatalog(admin), baseline);
      assert.deepEqual(
        await pairedCompositionData(admin, baseline),
        baselineData,
      );
      const privileges = (
        await admin.query(`select r.rolname,
      has_schema_privilege(r.oid,'kxra_owner_metadata','usage') usage,
      has_function_privilege(r.oid,'kxra_owner_metadata.customer_directory_page_v1(uuid,integer,integer,jsonb)','execute') execute,
      has_function_privilege(r.oid,'kxra_owner_metadata.customer_directory_authorized_v1(uuid,integer,integer)','execute') authorize
      from pg_roles r where not r.rolsuper order by r.rolname`)
      ).rows;
      write("dormant-privileges.json", privileges);
      // PostgreSQL built-ins have implicit USAGE on every schema, independent
      // of ACLs. Neither receives function EXECUTE from that predefined power.
      assert.ok(privileges.every((r) => !r.execute && !r.authorize));
      assert.ok(
        privileges
          .filter(
            (r) =>
              !["pg_read_all_data", "pg_write_all_data"].includes(r.rolname),
          )
          .every((r) => !r.usage),
      );
      const schema = (
        await admin.query(
          "select pg_get_userbyid(nspowner) owner,nspacl::text acl from pg_namespace where nspname='kxra_owner_metadata'",
        )
      ).rows[0];
      assert.deepEqual(schema, {
        owner: "postgres",
        acl: "{postgres=UC/postgres}",
      });
      const functions = (
        await admin.query(
          "select p.proname,pg_get_userbyid(p.proowner) owner,p.proacl::text,p.provolatile,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='kxra_owner_metadata' order by p.proname",
        )
      ).rows;
      assert.equal(functions.length, 2);
      for (const f of functions) {
        assert.equal(f.owner, "postgres");
        assert.equal(f.proacl, "{postgres=X/postgres}");
        assert.equal(f.provolatile, "v");
        assert.equal(f.prosecdef, true);
        assert.deepEqual(f.proconfig, ['search_path=""']);
      }
      write("dormant-catalog.json", { functions, privileges });
    },
  );
  // Narrow test-only grants in this fresh disposable cluster, never in proposal.
  await admin.query(
    "grant usage on schema kxra_owner_metadata to authenticated;grant execute on all functions in schema kxra_owner_metadata to authenticated",
  );
  const app = await connect("kxra_app"),
    racer = await connect("kxra_app"),
    provider = await connect("supabase_auth_admin"),
    writer = await connect();
  const customerIds = Array.from(
    { length: 55 },
    (_, i) => `30000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  );
  await admin.query(
    "insert into kxra.organisations(id,name,slug,organisation_kind,relationship_type) values($1,'Synthetic KXRA owner','synthetic-kxra-owner','KXRA','INTERNAL')",
    [ownerOrg],
  );
  await admin.query(
    "insert into kxra.account_identities(account_id,auth_subject,state,email_verified_at) values($1::uuid,$1::uuid::text,'ACTIVE',clock_timestamp())",
    [owner],
  );
  await admin.query(
    "insert into kxra.organisation_memberships(id,org_id,account_id,security_role,relationship_type,display_name) values($1,$2,$3,'KXRA_OWNER','INTERNAL','Synthetic owner')",
    [membership, ownerOrg, owner],
  );
  for (const [i, id] of customerIds.entries())
    await admin.query(
      'insert into kxra.organisations(id,name,slug,state,created_provenance) values($1,$2,$3,$4,\'{"private":"NEVER_EXPOSE_PROVENANCE"}\')',
      [
        id,
        `Synthetic customer ${i + 1}`,
        `synthetic-customer-${i + 1}`,
        ["ACTIVE", "SUSPENDED", "CLOSED"][i % 3],
      ],
    );
  async function newSession(who = owner, timestamp = true) {
    const id = uuid();
    await provider.query(
      "insert into auth.sessions(id,user_id,created_at) values($1,$2,case when $3 then clock_timestamp() else null end)",
      [id, who, timestamp],
    );
    return id;
  }
  const session = await newSession();
  const identity = (changes = {}) => ({
    sub: owner,
    role: "authenticated",
    aal: "aal2",
    auth_time: Math.floor(Date.now() / 1000),
    session_version: 1,
    provider_session_version: 1,
    provider_session_id: session,
    org: ownerOrg,
    ...changes,
  });
  const request = (changes = {}) => ({
    version: 1,
    after_organisation_id: null,
    organisation_state: null,
    limit: 3,
    ...changes,
  });
  const authSql =
    "select kxra_owner_metadata.customer_directory_authorized_v1($1,$2,$3) value";
  const pageSql =
    "select kxra_owner_metadata.customer_directory_page_v1($1,$2,$3,$4) value";
  const guardedSql =
    "select case when kxra_owner_metadata.customer_directory_authorized_v1($1,$2,$3) then kxra_owner_metadata.customer_directory_page_v1($1,$2,$3,$4) end value";
  const args = (req = request(), authority = [membership, 1, 1]) => [
    ...authority,
    req,
  ];
  async function begin(db, who = identity(), options = {}) {
    assert.ok(
      ["read committed", "repeatable read", "serializable"].includes(
        options.isolation ?? "read committed",
      ),
    );
    assert.ok(
      ["authenticated", "anon", "none"].includes(
        options.role ?? "authenticated",
      ),
    );
    await db.query(
      `begin isolation level ${options.isolation ?? "read committed"}`,
    );
    if (options.role !== "none")
      await db.query(`set local role ${options.role ?? "authenticated"}`);
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true),set_config('request.kxra.execution_mode',$4,true)",
      [
        who.sub ?? "",
        JSON.stringify(who),
        who.org ?? "",
        options.mode ?? "hosted",
      ],
    );
  }
  async function call(
    sql = pageSql,
    values = args(),
    who = identity(),
    options = {},
    db = app,
  ) {
    await begin(db, who, options);
    try {
      const value = (await db.query(sql, values)).rows[0]?.value;
      await db.query("commit");
      return value;
    } catch (error) {
      await db.query("rollback");
      throw error;
    }
  }
  async function denied(
    who = identity(),
    authority = [membership, 1, 1],
    options = {},
    db = app,
  ) {
    assert.equal(await call(authSql, authority, who, options, db), false);
    assert.equal(
      await call(guardedSql, args(request(), authority), who, options, db),
      null,
    );
    await assert.rejects(
      call(pageSql, args(request(), authority), who, options, db),
      { code: "42501" },
    );
  }
  await check(
    "direct reader, keyset, filters, lookahead, UTC and exact metadata allowlist",
    async () => {
      assert.equal(await call(authSql, [membership, 1, 1]), true);
      const first = await call();
      assert.deepEqual(Object.keys(first).sort(), [
        "has_more",
        "items",
        "sampled_at",
        "version",
      ]);
      assert.equal(first.version, 1);
      assert.equal(first.has_more, true);
      assert.deepEqual(
        first.items.map((r) => r.organisation_id),
        customerIds.slice(0, 3),
      );
      for (const row of first.items) {
        assert.deepEqual(Object.keys(row).sort(), [
          "name",
          "organisation_id",
          "organisation_kind",
          "organisation_state",
          "relationship_type",
          "slug",
          "updated_at",
        ]);
        assert.equal(row.organisation_kind, "CUSTOMER");
        assert.match(
          row.updated_at,
          /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/,
        );
      }
      assert.match(
        first.sampled_at,
        /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/,
      );
      assert.doesNotMatch(
        JSON.stringify(first),
        /NEVER_EXPOSE|created_at|account|member|contact|room|message|prompt|credential|billing|revenue/,
      );
      assert.equal(
        (await call(pageSql, args(request({ limit: 51 })))).items.length,
        51,
      );
      const second = await call(
        pageSql,
        args(request({ after_organisation_id: customerIds[1], limit: 2 })),
      );
      assert.deepEqual(
        second.items.map((r) => r.organisation_id),
        customerIds.slice(2, 4),
      );
      for (const state of ["ACTIVE", "SUSPENDED", "CLOSED"])
        assert.ok(
          (
            await call(
              pageSql,
              args(request({ organisation_state: state, limit: 51 })),
            )
          ).items.every((r) => r.organisation_state === state),
        );
      const empty = await call(
        pageSql,
        args(
          request({
            after_organisation_id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
          }),
        ),
      );
      assert.deepEqual(empty.items, []);
      assert.equal(empty.has_more, false);
      const nil = await call(
        pageSql,
        args(
          request({
            after_organisation_id: "00000000-0000-0000-0000-000000000000",
          }),
        ),
      );
      assert.deepEqual(nil.items, first.items);
      // Existing selected-org RLS stays narrow despite metadata RPC access.
      assert.deepEqual(
        await call(
          "select array_agg(id order by id) value from kxra.organisations",
          [],
        ),
        [ownerOrg],
      );
      await assert.rejects(
        call(
          "select kxra_private.custom_app_original_session_current() value",
          [],
        ),
        { code: "42501" },
      );
    },
  );
  await check(
    "malformed cursor/filter/limit/version/keys and invalid hidden metadata fail closed",
    async () => {
      for (const req of [
        null,
        [],
        {},
        request({ version: "1" }),
        request({ unknown: true }),
        ...[0, 1, 52, 1.5, "3", null].map((limit) => request({ limit })),
        request({ after_organisation_id: "ABC" }),
        request({ organisation_state: "active" }),
        request({ organisation_state: [] }),
      ])
        await assert.rejects(call(pageSql, args(req)), { code: "22023" });
      for (const key of Object.keys(request())) {
        const req = request();
        delete req[key];
        await assert.rejects(call(pageSql, args(req)), { code: "22023" });
      }
      for (const name of [
        "",
        " Bad",
        "Bad\u00a0",
        "Bad\nName",
        "x".repeat(241),
        "😀".repeat(121),
        "x".repeat(100000),
      ]) {
        await admin.query("update kxra.organisations set name=$1 where id=$2", [
          name,
          customerIds[2],
        ]);
        await assert.rejects(call(), { code: "22023" });
      }
      await admin.query(
        "update kxra.organisations set name='Synthetic customer 3' where id=$1",
        [customerIds[2]],
      );
    },
  );
  await check(
    "anonymous, staff, tenant-admin, partner, customer and altered selected authority denied",
    async () => {
      await assert.rejects(
        call(pageSql, args(), identity(), { role: "anon" }),
        { code: "42501" },
      );
      await assert.rejects(
        call(pageSql, args(), identity(), { role: "none" }),
        { code: "42501" },
      );
      await denied(identity({ sub: undefined }));
      await denied(identity({ role: "anon" }));
      await denied(identity({ org: customerIds[0] }));
      await denied(identity({ org: undefined }));
      await denied(identity(), [uuid(), 1, 1]);
      await denied(identity(), [membership, 2, 1]);
      await denied(identity(), [membership, 1, 2]);
      await denied(identity(), [membership, 1, 1], { mode: "fixture" });
      await denied(identity(), [membership, 1, 1], {
        isolation: "repeatable read",
      });
      await denied(identity(), [membership, 1, 1], {
        isolation: "serializable",
      });
      await denied(identity(), [membership, 1, 1], {}, admin);
      for (const [role, relationship] of [
        ["KXRA_STAFF", "INTERNAL"],
        ["ORG_ADMIN", "INTERNAL"],
        ["KXRA_OWNER", "PARTNER"],
        ["ORG_MEMBER", "CUSTOMER"],
      ]) {
        await admin.query(
          "update kxra.organisation_memberships set security_role=$1,relationship_type=$2 where id=$3",
          [role, relationship, membership],
        );
        await denied();
      }
      await admin.query(
        "update kxra.organisation_memberships set security_role='KXRA_OWNER',relationship_type='INTERNAL' where id=$1",
        [membership],
      );
    },
  );
  await check(
    "account/member/org state, validity, verification, version and recent MFA enforced",
    async () => {
      const cases = [
        [
          "update kxra.account_identities set state='REVOKED' where account_id=$1",
          "update kxra.account_identities set state='ACTIVE' where account_id=$1",
          owner,
        ],
        [
          "update kxra.account_identities set email_verified_at=null where account_id=$1",
          "update kxra.account_identities set email_verified_at=clock_timestamp() where account_id=$1",
          owner,
        ],
        [
          "update kxra.organisation_memberships set state='SUSPENDED' where id=$1",
          "update kxra.organisation_memberships set state='ACTIVE' where id=$1",
          membership,
        ],
        [
          "update kxra.organisation_memberships set state='REVOKED',revoked_at=clock_timestamp() where id=$1",
          "update kxra.organisation_memberships set state='ACTIVE',revoked_at=null where id=$1",
          membership,
        ],
        [
          "update kxra.organisation_memberships set starts_at=clock_timestamp()+interval '1 hour' where id=$1",
          "update kxra.organisation_memberships set starts_at=clock_timestamp()-interval '1 day' where id=$1",
          membership,
        ],
        [
          "update kxra.organisation_memberships set expires_at=clock_timestamp()-interval '1 second' where id=$1",
          "update kxra.organisation_memberships set expires_at=null where id=$1",
          membership,
        ],
        [
          "update kxra.organisation_memberships set version=2 where id=$1",
          "update kxra.organisation_memberships set version=1 where id=$1",
          membership,
        ],
        [
          "update kxra.organisations set state='SUSPENDED' where id=$1",
          "update kxra.organisations set state='ACTIVE' where id=$1",
          ownerOrg,
        ],
      ];
      for (const [change, restore, id] of cases) {
        await admin.query(change, [id]);
        await denied();
        await admin.query(restore, [id]);
      }
      for (const claims of [
        { aal: "aal1" },
        { auth_time: 0 },
        { auth_time: "bad" },
        { auth_time: Math.floor(Date.now() / 1000) + 120 },
        { auth_time: Math.floor(Date.now() / 1000) - 901 },
        { provider_session_version: 2 },
        { session_version: 2 },
      ])
        await denied(identity(claims));
    },
  );
  await check(
    "original-session missing/unbound/foreign/null-time/deleted/expired denied",
    async () => {
      const outsider = uuid();
      await admin.query(
        "insert into kxra.account_identities(account_id,auth_subject,state,email_verified_at) values($1::uuid,$1::uuid::text,'ACTIVE',clock_timestamp())",
        [outsider],
      );
      const foreign = await newSession(outsider),
        noTime = await newSession(owner, false),
        deleted = await newSession(),
        expired = await newSession();
      await provider.query("delete from auth.sessions where id=$1", [deleted]);
      await provider.query(
        "update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=$1",
        [expired],
      );
      for (const provider_session_id of [
        undefined,
        "bad",
        uuid(),
        unbound,
        foreign,
        noTime,
        deleted,
        expired,
      ])
        await denied(identity({ provider_session_id }));
      await admin.query(
        "update kxra.account_identities set session_version=2 where account_id=$1",
        [owner],
      );
      await denied();
      await denied(
        identity({ session_version: 2, provider_session_version: 2 }),
        [membership, 1, 2],
      );
      const fresh = await newSession();
      assert.equal(
        await call(
          authSql,
          [membership, 1, 2],
          identity({
            provider_session_id: fresh,
            session_version: 2,
            provider_session_version: 2,
          }),
        ),
        true,
      );
      await admin.query(
        "update kxra.account_identities set session_version=1 where account_id=$1",
        [owner],
      );
    },
  );
  const legalDocument = uuid(),
    legalRequirement = uuid();
  await admin.query(
    `insert into kxra.legal_documents(id,org_id,document_type,audience,version,title,rendered_content,content_sha256,status,effective_at,immutable_object_key,owner_approval_reference,owner_approved_at)
    values($1,$2,'OTHER','STAFF',1,'Synthetic test terms','Synthetic test terms',encode(sha256(convert_to('Synthetic test terms','UTF8')),'hex'),'APPROVED',clock_timestamp(),'fixture/test','SYNTHETIC_NOT_LEGAL_APPROVAL',clock_timestamp())`,
    [legalDocument, ownerOrg],
  );
  await admin.query(
    `insert into kxra.legal_document_requirements(id,org_id,document_id,document_version,document_sha256,acceptance_wording,acceptance_wording_version,acceptance_wording_sha256,state,effective_at)
    select $1,$2,id,version,content_sha256,'Synthetic accept',1,encode(sha256(convert_to('Synthetic accept','UTF8')),'hex'),'DRAFT',clock_timestamp() from kxra.legal_documents where id=$3`,
    [legalRequirement, ownerOrg, legalDocument],
  );
  await check(
    "new mandatory requirement without acceptance closes read gate",
    async () => {
      await admin.query(
        "update kxra.legal_document_requirements set state='ACTIVE' where id=$1",
        [legalRequirement],
      );
      await denied();
      await admin.query(
        "update kxra.legal_document_requirements set state='DRAFT' where id=$1",
        [legalRequirement],
      );
    },
  );
  const pid = async (db) =>
    (await db.query("select pg_backend_pid() pid")).rows[0].pid;
  const readerPid = await pid(racer),
    writerPid = await pid(writer),
    providerPid = await pid(provider);
  async function blocked(waiter, holder) {
    for (let i = 0; i < 100; i++) {
      const row = (
        await observer.query(
          "select wait_event,pg_blocking_pids(pid) blockers from pg_stat_activity where pid=$1",
          [waiter],
        )
      ).rows[0];
      if (row?.wait_event === "advisory" && row.blockers.includes(holder))
        return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw Error("EXPECTED_CUSTOM_AUTHORITY_ADVISORY_WAIT_NOT_OBSERVED");
  }
  const outcome = (promise) =>
    promise.then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
  const races = [
    {
      name: "account revoke",
      sql: "update kxra.account_identities set state='REVOKED' where account_id=$1",
      restore:
        "update kxra.account_identities set state='ACTIVE' where account_id=$1",
      id: owner,
    },
    {
      name: "membership revoke",
      sql: "update kxra.organisation_memberships set state='REVOKED',revoked_at=clock_timestamp() where id=$1",
      restore:
        "update kxra.organisation_memberships set state='ACTIVE',revoked_at=null where id=$1",
      id: membership,
    },
    {
      name: "organisation suspend",
      sql: "update kxra.organisations set state='SUSPENDED' where id=$1",
      restore: "update kxra.organisations set state='ACTIVE' where id=$1",
      id: ownerOrg,
    },
    {
      name: "mandatory legal activation",
      sql: "update kxra.legal_document_requirements set state='ACTIVE' where id=$1",
      restore:
        "update kxra.legal_document_requirements set state='DRAFT' where id=$1",
      id: legalRequirement,
    },
    {
      name: "Auth deletion",
      sql: "delete from auth.sessions where id=$1",
      auth: true,
    },
  ];
  for (const race of races)
    for (const guarded of [false, true])
      for (const writerFirst of [false, true])
        await check(
          `${race.name} / ${guarded ? "CASE" : "direct"} / ${writerFirst ? "writer" : "reader"} wins`,
          async () => {
            const connection = race.auth ? provider : writer,
              holderPid = race.auth ? providerPid : writerPid;
            const sid = race.auth ? await newSession() : session,
              id = race.auth ? sid : race.id;
            const who = identity({ provider_session_id: sid }),
              query = guarded ? guardedSql : pageSql;
            if (writerFirst) {
              await connection.query("begin");
              await connection.query(race.sql, [id]);
              await begin(racer, who);
              const pending = outcome(racer.query(query, args()));
              try {
                await blocked(readerPid, holderPid);
                await connection.query("commit");
                const r = await pending;
                if (guarded) {
                  assert.equal(r.error, undefined);
                  assert.equal(r.value.rows[0].value, null);
                } else assert.equal(r.error?.code, "42501");
              } finally {
                await connection.query("rollback");
                await racer.query("rollback");
                await pending;
              }
            } else {
              await begin(racer, who);
              assert.equal(
                (await racer.query(query, args())).rows[0].value.items.length,
                3,
              );
              await connection.query("begin");
              const pending = outcome(connection.query(race.sql, [id]));
              try {
                await blocked(holderPid, readerPid);
                await racer.query("commit");
                assert.equal((await pending).error, undefined);
                await connection.query("commit");
              } finally {
                await racer.query("rollback");
                await connection.query("rollback");
                await pending;
              }
              await denied(who);
            }
            if (race.restore) await admin.query(race.restore, [id]);
          },
        );
  await check(
    "customer metadata writer waits for reader, then later live page sees change",
    async () => {
      await begin(racer);
      const first = (await racer.query(pageSql, args())).rows[0].value;
      await writer.query("begin");
      const pending = outcome(
        writer.query(
          "update kxra.organisations set name='Changed customer' where id=$1",
          [customerIds[0]],
        ),
      );
      try {
        await blocked(writerPid, readerPid);
        assert.equal(first.items[0].name, "Synthetic customer 1");
        await racer.query("commit");
        assert.equal((await pending).error, undefined);
        await writer.query("commit");
      } finally {
        await racer.query("rollback");
        await writer.query("rollback");
        await pending;
      }
      assert.equal((await call()).items[0].name, "Changed customer");
    },
  );
  await check(
    "actual TypeScript adapter with authenticated PostgreSQL transaction",
    async () => {
      const principal = () => ({
        id: owner,
        org_id: ownerOrg,
        organisation_id: ownerOrg,
        membership_id: membership,
        access_version: 1,
        session_version: 1,
        provider_session_version: 1,
        provider_session_id: session,
        source: "supabase",
        aal: "aal2",
        auth_time: Math.floor(Date.now() / 1000),
        security_role: "KXRA_OWNER",
        organisation_kind: "KXRA",
        relationship_type: "INTERNAL",
        account_state: "ACTIVE",
      });
      const ports = {
        identity: async () => principal(),
        query: async (actor, sql, values) => {
          // Real PostgreSQL authenticated scope, not a fake RPC response.
          const value = await call(
            sql,
            values,
            identity({
              sub: actor.id,
              org: actor.organisation_id,
              aal: actor.aal,
              auth_time: actor.auth_time,
              session_version: actor.session_version,
              provider_session_version: actor.provider_session_version,
              provider_session_id: actor.provider_session_id,
            }),
          );
          return [{ value }];
        },
      };
      // In-memory test parameter only: no environment/file feature flag is activated.
      const enabled = { KXRA_OWNER_CUSTOMER_DIRECTORY_ENABLED: "true" };
      let cursor;
      const all = [];
      do {
        const page = await readCustomerDirectory(
          { version: 1, page_size: 7, ...(cursor ? { cursor } : {}) },
          ports,
          enabled,
        );
        assert.equal(page.consistency, "LIVE");
        assert.ok(page.items.length <= 7);
        for (const item of page.items)
          assert.equal(Object.keys(item).length, 6);
        all.push(...page.items.map((item) => item.organisation_id));
        cursor = page.next_cursor;
      } while (cursor);
      assert.deepEqual(all, customerIds);
      const filtered = await readCustomerDirectory(
        { version: 1, page_size: 50, organisation_state: "CLOSED" },
        ports,
        enabled,
      );
      assert.ok(
        filtered.items.every((item) => item.organisation_state === "CLOSED"),
      );
      await admin.query("update kxra.organisations set name=$1 where id=$2", [
        "😀".repeat(120),
        customerIds[0],
      ]);
      assert.equal(
        (
          await readCustomerDirectory(
            { version: 1, page_size: 1 },
            ports,
            enabled,
          )
        ).items[0].name.length,
        240,
      );
      await admin.query("update kxra.organisations set name=$1 where id=$2", [
        "😀".repeat(121),
        customerIds[1],
      ]);
      await assert.rejects(
        readCustomerDirectory({ version: 1, page_size: 1 }, ports, enabled),
        { code: "UNAVAILABLE" },
      );
      await admin.query(
        "update kxra.organisations set name='Restored customer' where id=any($1::uuid[])",
        [customerIds.slice(0, 2)],
      );
      await admin.query(
        "update kxra.organisation_memberships set version=2 where id=$1",
        [membership],
      );
      await assert.rejects(
        readCustomerDirectory({ version: 1 }, ports, enabled),
        { code: "ACCESS_DENIED" },
      );
      await admin.query(
        "update kxra.organisation_memberships set version=1 where id=$1",
        [membership],
      );
      // Deliberate owned-cluster corruption proves bounded invalid timestamp handling.
      const setTimestamp = async (value) => {
        await admin.query(
          "begin;alter table kxra.organisations disable trigger organisation_defaults",
        );
        await admin.query(
          "update kxra.organisations set updated_at=$2::timestamptz where id=$1",
          [customerIds[0], value],
        );
        await admin.query(
          "alter table kxra.organisations enable trigger organisation_defaults;commit",
        );
      };
      await setTimestamp("infinity");
      await assert.rejects(
        readCustomerDirectory({ version: 1 }, ports, enabled),
        { code: "UNAVAILABLE" },
      );
      // Local year9999 must not admit UTC year10000 to the direct RPC.
      await app.query("set timezone='Etc/GMT+12'");
      await setTimestamp("10000-01-01 00:00:00+00");
      await assert.rejects(call(), { code: "22023" });
      await assert.rejects(
        readCustomerDirectory({ version: 1 }, ports, enabled),
        { code: "UNAVAILABLE" },
      );
      // Conversely, a local year10000 must not reject a valid UTC year9999.
      await app.query("set timezone='Etc/GMT-14'");
      await setTimestamp("9999-12-31 23:30:00+00");
      assert.equal(
        (
          await readCustomerDirectory(
            { version: 1, page_size: 1 },
            ports,
            enabled,
          )
        ).items[0].updated_at,
        "9999-12-31T23:30:00.000000Z",
      );
      await app.query("set timezone='UTC'");
      await admin.query("update kxra.organisations set name=name where id=$1", [
        customerIds[0],
      ]);
    },
  );
  await check(
    "accepted mandatory legal document must remain approved",
    async () => {
      await admin.query(
        "update kxra.legal_document_requirements set state='ACTIVE' where id=$1",
        [legalRequirement],
      );
      const presentation = await call(
        "select presentation_id value from kxra.present_required_legal_documents(null,null)",
        [],
      );
      assert.ok(presentation);
      assert.equal(
        await call(
          "select response value from kxra.record_legal_response($1,true,$2)",
          [presentation, uuid()],
        ),
        "ACCEPTED",
      );
      assert.equal(await call(authSql, [membership, 1, 1]), true);
      await admin.query(
        "update kxra.legal_documents set status='RETIRED',retired_at=clock_timestamp() where id=$1",
        [legalDocument],
      );
      await denied();
      await admin.query(
        "update kxra.legal_document_requirements set state='RETIRED',retired_at=clock_timestamp() where id=$1",
        [legalRequirement],
      );
      assert.equal(await call(authSql, [membership, 1, 1]), true);
    },
  );
  checkCancellation();
  result.passed = true;
} finally {
  const closed = await Promise.allSettled(clients.map((c) => c.end()));
  const pidFile = path.join(dir, "postmaster.pid"),
    pid = fs.existsSync(pidFile)
      ? Number(fs.readFileSync(pidFile, "utf8").split("\n")[0])
      : null;
  const stop = started
    ? spawnSync(
        path.join(bin, "pg_ctl"),
        ["-D", dir, "-m", "fast", "-w", "stop"],
        { env, timeout: 30000 },
      )
    : { status: 0 };
  const status = started
    ? spawnSync(path.join(bin, "pg_ctl"), ["-D", dir, "status"], {
        env,
        timeout: 5000,
      })
    : { status: 3 };
  let absent = !pid;
  if (pid) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      absent = error.code === "ESRCH";
    }
  }
  const cleanup = {
    clean:
      closed.every((c) => c.status === "fulfilled") &&
      stop.status === 0 &&
      status.status === 3 &&
      absent &&
      !fs.existsSync(pidFile),
    stop: stop.status,
    status: status.status,
    ownPostgresProcessAbsent: absent,
  };
  result.cleanup = cleanup;
  result.stopRequested = stopRequested;
  write("result.json", result);
  write("cleanup.json", cleanup);
  assert.ok(cleanup.clean, "OWNED_CLEANUP_UNCERTAIN_LEASE_RETAINED");
  release();
  process.removeListener("SIGINT", onInterrupt);
  process.removeListener("SIGTERM", onTerminate);
}
console.log(JSON.stringify(result, null, 2));
