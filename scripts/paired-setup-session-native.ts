// Synthetic owned Unix-socket PostgreSQL only. Never claims hosted Auth acceptance.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import net from "node:net";
import { execFileSync, spawnSync } from "node:child_process";
import pg from "pg";
import { postgresBin } from "./postgres-bin.mjs";
import { productionOperationsPayload } from "./production-operations-review.mjs";
import { customAppsProductionPayload } from "./custom-apps-production-payload.mjs";
import { sessionAttestationPayload } from "./session-attestation-payload.mjs";
import { sessionRoleCatalogue } from "./session-attestation-role-catalog.mjs";
import {
  pairedCompositionCatalog as catalog,
  pairedCompositionData as data,
} from "./paired-composition-catalog.mjs";
import { seedAiResumeFixture } from "../tests/support/ai-resume-fixture";

async function main() {
  const root = fs.realpathSync(process.cwd());
  assert.match(root, /^\/(?:private\/)?tmp\/kxra-setup-session-[A-Za-z0-9]+$/);
  const runtime = path.join(root, ".runtime/proof"),
    bin = postgresBin(),
    uuid = () => crypto.randomUUID();
  fs.mkdirSync(runtime, { recursive: true, mode: 0o700 });
  async function port() {
    const s = net.createServer();
    await new Promise<void>((r, j) => {
      s.once("error", j);
      s.listen(0, "127.0.0.1", r);
    });
    const p = (s.address() as net.AddressInfo).port;
    await new Promise<void>((r) => s.close(() => r()));
    return p;
  }
  const env = {
    PATH: process.env.PATH,
    HOME: runtime,
    USER: os.userInfo().username,
    TMPDIR: process.env.TMPDIR,
    NODE_ENV: "development" as const,
    NODE_OPTIONS: "--conditions=development",
    LANG: "C",
    LC_ALL: "C",
    KXRA_AUTH_MODE: "fixture",
    KXRA_RUNTIME: runtime,
    KXRA_PG_PORT: String(await port()),
    KXRA_ORIGIN: `http://127.0.0.1:${await port()}`,
    KXRA_LOCAL_SECRET: crypto.randomBytes(48).toString("hex"),
  };
  const write = (name: string, v: unknown) =>
    fs.writeFileSync(
      path.join(runtime, name),
      JSON.stringify(v, null, 2) + "\n",
      { mode: 0o600 },
    );
  const sql = fs.readFileSync(
    "database/production/paired-setup-session-v1.sql",
    "utf8",
  );
  const phases: string[] = [];
  const check = async (name: string, work: () => Promise<void>) => {
    await work();
    phases.push(name);
    console.log("PASS " + name);
  };
  const clients: pg.Client[] = [];
  let started = false;
  const receipt = {
    classification: "LOCAL_SYNTHETIC_AUTH_SCHEMA_NOT_HOSTED_ACCEPTANCE",
    sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    payloadSha256: crypto.createHash("sha256").update(sql).digest("hex"),
    phases,
    passed: false,
    hostedChanges: false,
    providerCalls: 0,
  };
  try {
    Object.assign(process.env, env);
    started = true;
    execFileSync(process.execPath, ["scripts/database.mjs", "start"], {
      cwd: root,
      env,
      stdio: "inherit",
      timeout: 120000,
    });
    const cfg = JSON.parse(
      fs.readFileSync(path.join(runtime, "database.json"), "utf8"),
    );
    assert.equal(cfg.host, path.join(runtime, "socket"));
    assert.equal(cfg.user, "kxra_app");
    assert.equal(cfg.database, "postgres");
    assert.ok(!cfg.password && !cfg.connectionString && !cfg.ssl);
    async function connect(user = os.userInfo().username) {
      const c = new pg.Client({ ...cfg, user, connectionTimeoutMillis: 2000 });
      clients.push(c);
      await c.connect();
      await c.query("set statement_timeout='8s'");
      return c;
    }
    const admin = await connect(),
      observer = await connect();
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
    const intent = uuid();
    await f.register(intent);
    await f.reviewAi(intent);
    const outsider = uuid();
    await admin.query(
      "insert into kxra.account_identities(account_id,auth_provider,auth_subject,state,email_verified_at) values($1,'SUPABASE',$1::text,'ACTIVE',now())",
      [outsider],
    );
    // Exact synthetic shape required by existing original-session payload. No real Auth table is touched.
    await admin.query(
      "create table auth.sessions(id uuid primary key,user_id uuid not null,created_at timestamptz,updated_at timestamptz,not_after timestamptz); alter table auth.sessions owner to supabase_auth_admin; revoke all on auth.sessions from public,anon,authenticated,kxra_app; grant usage on schema auth to supabase_auth_admin",
    );
    const provider = await connect();
    await provider.query("set session authorization supabase_auth_admin");
    const preexisting = uuid();
    await provider.query(
      "insert into auth.sessions(id,user_id,created_at) values($1,$2,clock_timestamp())",
      [preexisting, f.actor],
    );
    await admin.query(sessionAttestationPayload(root).sql);
    const before = await catalog(admin),
      dataBefore = await data(admin, before),
      rolesBefore = await sessionRoleCatalogue(admin);
    const humanIdentity = async () =>
      (
        await admin.query(
          "select oid,proowner,proacl,provolatile,prosecdef,proconfig from pg_proc where oid='kxra_paired_admission.setup_human(uuid,uuid,uuid,integer,integer)'::regprocedure",
        )
      ).rows[0];
    const humanBefore = await humanIdentity();
    await check(
      "atomic rollback restores catalog, predicate OID/ACL and all source data",
      async () => {
        await admin.query("begin");
        await admin.query(
          sql.replace(/^[\s\S]*?\bbegin;\s*/i, "").replace(/commit;\s*$/i, ""),
        );
        await assert.rejects(admin.query("select 1/0"));
        await admin.query("rollback");
        assert.deepEqual(await catalog(admin), before);
        assert.deepEqual(await data(admin, before), dataBefore);
        assert.deepEqual(await humanIdentity(), humanBefore);
      },
    );
    await admin.query(sql);
    await check(
      "only setup predicate, narrow helper and ordered Auth statement trigger change",
      async () => {
        const after = await catalog(admin);
        assert.deepEqual(await data(admin, before), dataBefore);
        assert.deepEqual(await humanIdentity(), humanBefore);
        for (const section of Object.keys(before).filter(
          (s) => !["functions", "triggers"].includes(s),
        ) as (keyof typeof before)[])
          assert.deepEqual(after[section], before[section], section);
        assert.deepEqual(
          after.functions
            .filter((r: any) => r.name !== "hosted_setup_session_current")
            .map((r: any) =>
              r.name === "setup_human" ? { ...r, definition: "replaced" } : r,
            ),
          before.functions.map((r: any) =>
            r.name === "setup_human" ? { ...r, definition: "replaced" } : r,
          ),
        );
        assert.deepEqual(
          after.triggers.filter(
            (r: any) => r.tgname !== "b00_paired_setup_session_authority",
          ),
          before.triggers,
        );
        const helper = after.functions.find(
          (r: any) =>
            r.schema === "kxra_paired_admission" &&
            r.name === "hosted_setup_session_current",
        );
        assert.equal(
          helper.owner,
          before.functions.find((r: any) => r.name === "setup_human").owner,
        );
        assert.equal(helper.authenticated_reachable, true);
        assert.equal(helper.anon_reachable, false);
        assert.equal(helper.app_reachable, false);
        const trigger = after.triggers.find(
          (r: any) => r.tgname === "b00_paired_setup_session_authority",
        );
        assert.match(
          trigger.definition,
          /BEFORE INSERT OR DELETE OR UPDATE ON auth.sessions FOR EACH STATEMENT EXECUTE FUNCTION kxra_paired_admission.policy_writer\(\)/,
        );
        const statementTriggers = (
          await admin.query(
            "select tgname,tgtype::int from pg_trigger where tgrelid='auth.sessions'::regclass and not tgisinternal and (tgtype::int & 1)=0 order by tgname",
          )
        ).rows;
        assert.deepEqual(statementTriggers, [
          { tgname: "a00_custom_app_session_authority", tgtype: 30 },
          { tgname: "b00_paired_setup_session_authority", tgtype: 30 },
        ]);
        const rolesAfter = await sessionRoleCatalogue(admin);
        for (const section of Object.keys(
          rolesBefore,
        ) as (keyof typeof rolesBefore)[])
          assert.deepEqual(
            section === "functions"
              ? rolesAfter[section].filter(
                  (r: any) =>
                    !(
                      r.schema === "kxra_paired_admission" &&
                      r.name === "hosted_setup_session_current"
                    ),
                )
              : rolesAfter[section],
            rolesBefore[section],
            section,
          );
        assert.deepEqual(
          rolesAfter.functions
            .filter(
              (r: any) =>
                r.name === "hosted_setup_session_current" && r.reachable,
            )
            .map((r: any) => r.role),
          ["authenticated"],
        );
        write("catalog-delta.json", {
          humanBefore,
          humanAfter: await humanIdentity(),
          helper,
          statementTriggers,
          privatePrivilegesUnchanged: true,
          sourceDataUnchanged: true,
        });
      },
    );
    const app = await connect("kxra_app"),
      racer = await connect("kxra_app");
    type Identity = {
      sub?: string;
      session_version?: number;
      provider_session_version?: number;
      provider_session_id?: string;
      aal?: string;
      auth_time?: number;
      org?: string;
    };
    async function newSession(who = f.actor, timestamp = true) {
      const s = uuid();
      await provider.query(
        "insert into auth.sessions(id,user_id,created_at) values($1,$2,case when $3 then clock_timestamp() else null end)",
        [s, who, timestamp],
      );
      return s;
    }
    const initial = await newSession();
    const claims = (
      s: string | undefined = initial,
      changes: Identity = {},
    ): Identity => ({
      sub: f.actor,
      session_version: 1,
      provider_session_version: 1,
      provider_session_id: s,
      aal: "aal2",
      auth_time: Math.floor(Date.now() / 1000),
      org: f.org,
      ...changes,
    });
    async function begin(c: pg.Client, who = claims()) {
      await c.query("begin");
      await c.query("set local role authenticated");
      await c.query(
        "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true),set_config('request.kxra.execution_mode','hosted',true)",
        [who.sub ?? "", JSON.stringify(who), who.org ?? ""],
      );
    }
    async function call(query: string, args: unknown[] = [], who = claims()) {
      await begin(app, who);
      try {
        const r = await app.query(query, args);
        await app.query("commit");
        return r.rows[0]?.value;
      } catch (e) {
        await app.query("rollback");
        throw e;
      }
    }
    const human =
      "select kxra_paired_admission.setup_human($1,$2,$3,$4,1) value";
    const helper =
      "select kxra_paired_admission.hosted_setup_session_current() value";
    const request =
      "select kxra_paired_admission.request_setup($1,$2,$3,$4,$5) value";
    const guardedRequest =
      "select case when kxra_paired_admission.hosted_setup_session_current() then kxra_paired_admission.request_setup($1,$2,$3,$4,$5) end value";
    const cancel = "select kxra_paired_admission.cancel_setup($1) value";
    const guardedCancel =
      "select case when kxra_paired_admission.hosted_setup_session_current() then kxra_paired_admission.cancel_setup($1) end value";
    const requestArgs = (id = uuid(), changes: unknown[] = []) => [
      id,
      f.room,
      intent,
      "CUSTOMER_API_KEY",
      "Synthetic held setup",
      ...changes,
    ];
    const heldArgs = requestArgs();
    let held: any;
    await check(
      "genuine original session passes helper, direct RPC, OPTIONS and exact idempotency",
      async () => {
        assert.equal(await call(helper), true);
        assert.equal(await call(human, [f.org, f.actor, f.room, 1]), true);
        held = await call(guardedRequest, heldArgs);
        assert.equal(held.reason, "TRANSPORT_REVIEW_REQUIRED");
        assert.equal(held.activation_allowed, false);
        assert.equal(held.credential_issued, false);
        assert.deepEqual(await call(request, heldArgs), held);
        for (const [i, v] of [
          [1, uuid()],
          [2, uuid()],
          [3, "CHATGPT_SUBSCRIPTION"],
          [4, "Changed label"],
        ] as [number, string][]) {
          const changed = [...heldArgs];
          changed[i] = v;
          await assert.rejects(call(request, changed), { code: "42501" });
        }
        assert.equal(
          (await call("select kxra_paired_admission.setup_options() value"))
            .requests[0].id,
          heldArgs[0],
        );
        assert.deepEqual(
          await call("select kxra_paired_admission.setup_status($1) value", [
            heldArgs[0],
          ]),
          held,
        );
        assert.equal(
          (
            await admin.query(
              "select count(*)::int n from kxra_paired_admission.setup_requests where id=$1",
              [heldArgs[0]],
            )
          ).rows[0].n,
          1,
        );
        const row = (
          await admin.query(
            "select enabled from kxra_paired_admission.agents where id=$1",
            [held.agent_id],
          )
        ).rows[0];
        assert.equal(row.enabled, false);
      },
    );
    async function deniedEverywhere(who: Identity) {
      assert.equal(await call(helper, [], who), false);
      assert.equal(
        await call(
          human,
          [f.org, f.actor, f.room, who.session_version ?? 1],
          who,
        ),
        false,
      );
      assert.equal(await call(guardedRequest, requestArgs(), who), null);
      for (const [q, args] of [
        [request, requestArgs()],
        [cancel, [heldArgs[0]]],
        ["select kxra_paired_admission.setup_status($1) value", [heldArgs[0]]],
        ["select kxra_paired_admission.setup_options() value", []],
      ] as [string, unknown[]][])
        await assert.rejects(call(q, args, who), { code: "42501" });
      assert.equal(
        await call(
          "select count(id)::int value from kxra_paired_admission.setup_requests",
          [],
          who,
        ),
        0,
      );
    }
    await check(
      "missing, malformed, preexisting unbound, null-time, foreign and expired sessions fail closed",
      async () => {
        const nullTime = await newSession(f.actor, false),
          foreign = await newSession(outsider),
          expired = await newSession();
        await provider.query(
          "update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=$1",
          [expired],
        );
        for (const who of [
          claims(initial, { provider_session_id: undefined }),
          claims("not-a-session"),
          claims(uuid()),
          claims(preexisting),
          claims(nullTime),
          claims(foreign),
          claims(expired),
          claims(initial, { provider_session_version: 2 }),
          claims(initial, { provider_session_version: undefined }),
        ])
          await deniedEverywhere(who);
      },
    );
    await check(
      "deleted session and revoked account deny all direct RPC, helper and RLS reads",
      async () => {
        const deleted = await newSession();
        await provider.query("delete from auth.sessions where id=$1", [
          deleted,
        ]);
        await deniedEverywhere(claims(deleted));
        await admin.query(
          "update kxra.account_identities set state='REVOKED' where account_id=$1",
          [f.actor],
        );
        await deniedEverywhere(claims());
        await admin.query(
          "update kxra.account_identities set state='ACTIVE' where account_id=$1",
          [f.actor],
        );
      },
    );
    await check(
      "helper cannot bypass login identity, private ACL, owner scope or room authority",
      async () => {
        await assert.rejects(app.query(helper), { code: "42501" });
        await begin(app);
        try {
          await assert.rejects(
            app.query(
              "select kxra_private.custom_app_original_session_current()",
            ),
            { code: "42501" },
          );
        } finally {
          await app.query("rollback");
        }
        const untrusted = await connect();
        await begin(untrusted);
        try {
          assert.equal((await untrusted.query(helper)).rows[0].value, false);
        } finally {
          await untrusted.query("rollback");
        }
        const outside = await newSession(outsider);
        const outsideClaims = claims(outside, { sub: outsider });
        assert.equal(await call(helper, [], outsideClaims), true);
        await assert.rejects(call(request, requestArgs(), outsideClaims), {
          code: "42501",
        });
        await assert.rejects(call(cancel, [heldArgs[0]], outsideClaims), {
          code: "42501",
        });
        await assert.rejects(
          call(request, requestArgs(), claims(initial, { aal: "aal1" })),
          { code: "42501" },
        );
        await assert.rejects(
          call(
            request,
            requestArgs(),
            claims(initial, { auth_time: Math.floor(Date.now() / 1000) - 901 }),
          ),
          { code: "42501" },
        );
      },
    );
    const pid = async (c: pg.Client) =>
      (await c.query("select pg_backend_pid() pid")).rows[0].pid as number;
    const providerPid = await pid(provider),
      racerPid = await pid(racer);
    async function blocked(waiter: number, holder: number) {
      for (let i = 0; i < 100; i++) {
        const r = (
          await observer.query(
            "select wait_event,pg_blocking_pids(pid) blockers from pg_stat_activity where pid=$1",
            [waiter],
          )
        ).rows[0];
        if (r?.wait_event === "advisory" && r.blockers.includes(holder)) return;
        await new Promise((r) => setTimeout(r, 20));
      }
      throw Error("EXPECTED_AUTH_PAIRED_ADVISORY_WAIT_NOT_OBSERVED");
    }
    const outcome = (p: Promise<pg.QueryResult>) =>
      p.then(
        (value) => ({ value, error: undefined }),
        (error) => ({ value: undefined, error }),
      );
    for (const guarded of [false, true]) {
      for (const action of ["REQUEST", "CANCEL"] as const) {
        await check(
          `Auth deletion wins against ${guarded ? "guarded" : "direct"} ${action}: waiting RPC rechecks, rolls back and issues nothing`,
          async () => {
            const session = await newSession(),
              args = requestArgs();
            if (action === "CANCEL") await call(request, args, claims(session));
            const beforeRequests = (
              await admin.query(
                "select id,cancelled_at from kxra_paired_admission.setup_requests order by id",
              )
            ).rows;
            await provider.query("begin");
            await provider.query("delete from auth.sessions where id=$1", [
              session,
            ]);
            await begin(racer, claims(session));
            // Guarded preflight and direct mutation both wait before their live-session check.
            const pending = outcome(
              racer.query(
                action === "REQUEST"
                  ? guarded
                    ? guardedRequest
                    : request
                  : guarded
                    ? guardedCancel
                    : cancel,
                action === "REQUEST" ? args : [args[0]],
              ),
            );
            try {
              await blocked(racerPid, providerPid);
              await provider.query("commit");
              const result = await pending;
              if (guarded) {
                assert.equal(result.error, undefined);
                assert.equal(result.value!.rows[0].value, null);
              } else assert.equal(result.error?.code, "42501");
            } finally {
              await provider.query("rollback");
              await racer.query("rollback");
              await pending;
            }
            assert.deepEqual(
              (
                await admin.query(
                  "select id,cancelled_at from kxra_paired_admission.setup_requests order by id",
                )
              ).rows,
              beforeRequests,
            );
          },
        );
        await check(
          `${guarded ? "guarded" : "direct"} ${action} wins against Auth deletion: ordered writer waits and all subsequent access is denied`,
          async () => {
            const session = await newSession(),
              args = requestArgs();
            if (action === "CANCEL") await call(request, args, claims(session));
            await begin(racer, claims(session));
            const value = (
              await racer.query(
                action === "REQUEST"
                  ? guarded
                    ? guardedRequest
                    : request
                  : guarded
                    ? guardedCancel
                    : cancel,
                action === "REQUEST" ? args : [args[0]],
              )
            ).rows[0].value;
            assert.equal(value.activation_allowed, false);
            assert.equal(value.credential_issued, false);
            await provider.query("begin");
            const pending = outcome(
              provider.query("delete from auth.sessions where id=$1", [
                session,
              ]),
            );
            try {
              await blocked(providerPid, racerPid);
              await racer.query("commit");
              const result = await pending;
              assert.equal(result.error, undefined);
              await provider.query("commit");
            } finally {
              await racer.query("rollback");
              await provider.query("rollback");
              await pending;
            }
            await assert.rejects(
              call(
                "select kxra_paired_admission.setup_status($1) value",
                [args[0]],
                claims(session),
              ),
              { code: "42501" },
            );
            const stored = (
              await admin.query(
                "select cancelled_at from kxra_paired_admission.setup_requests where id=$1",
                [args[0]],
              )
            ).rows[0];
            assert.equal(stored.cancelled_at !== null, action === "CANCEL");
          },
        );
      }
    }
    await check(
      "valid cancellation is idempotent and account epoch changes require a genuinely new original session",
      async () => {
        const cancelled = await call(cancel, [heldArgs[0]]);
        assert.equal(cancelled.reason, "CANCELLED");
        const cancelledAt = (
          await admin.query(
            "select cancelled_at from kxra_paired_admission.setup_requests where id=$1",
            [heldArgs[0]],
          )
        ).rows[0];
        assert.deepEqual(await call(cancel, [heldArgs[0]]), cancelled);
        assert.deepEqual(
          (
            await admin.query(
              "select cancelled_at from kxra_paired_admission.setup_requests where id=$1",
              [heldArgs[0]],
            )
          ).rows[0],
          cancelledAt,
        );
        await admin.query(
          "update kxra.account_identities set session_version=session_version+1 where account_id=$1",
          [f.actor],
        );
        await deniedEverywhere(claims());
        await deniedEverywhere(
          claims(initial, { session_version: 2, provider_session_version: 2 }),
        );
        const fresh = await newSession(),
          current = claims(fresh, {
            session_version: 2,
            provider_session_version: 2,
          });
        assert.equal(await call(helper, [], current), true);
        assert.equal(
          await call(human, [f.org, f.actor, f.room, 2], current),
          true,
        );
        assert.equal(
          (
            await call(
              "select kxra_paired_admission.setup_options() value",
              [],
              current,
            )
          ).requests.length,
          0,
        );
        await assert.rejects(
          call(
            "select kxra_paired_admission.setup_status($1) value",
            [heldArgs[0]],
            current,
          ),
          { code: "42501" },
        );
        // New reviewed intent belongs to epoch 2; preserve exact request tuple semantics.
        const nextIntent = uuid();
        await f.appCall(
          "select kxra.ai_connection_admission($1,'OPENAI','synthetic-model','',$2,$3) value",
          [
            nextIntent,
            crypto
              .createHash("sha256")
              .update("SYNTHETIC_NOT_A_KEY")
              .digest("hex"),
            crypto
              .createHash("sha256")
              .update("https://api.openai.com/v1/chat/completions")
              .digest("hex"),
          ],
          f.actor,
          f.org,
          2,
        );
        await f.reviewAi(nextIntent);
        const nextArgs = requestArgs();
        nextArgs[2] = nextIntent;
        const freshHeld = await call(request, nextArgs, current);
        assert.equal(freshHeld.activation_allowed, false);
        assert.equal(freshHeld.credential_issued, false);
        assert.deepEqual(await call(request, nextArgs, current), freshHeld);
      },
    );
    await check(
      "setup remains request-only without activation, devices, credentials or authorities",
      async () => {
        assert.equal(
          (
            await admin.query(
              "select count(*)::int n from kxra_paired_admission.agents where enabled",
            )
          ).rows[0].n,
          0,
        );
        for (const name of ["devices", "authorities", "consumptions"])
          assert.equal(
            (
              await admin.query(
                `select count(*)::int n from kxra_paired_admission.${name}`,
              )
            ).rows[0].n,
            0,
          );
      },
    );
    receipt.passed = true;
  } finally {
    write("receipt.json", receipt);
    const closes = await Promise.allSettled(clients.map((c) => c.end()));
    const dir = path.join(runtime, "postgres"),
      pidFile = path.join(dir, "postmaster.pid");
    const pid = fs.existsSync(pidFile)
      ? Number(fs.readFileSync(pidFile, "utf8").split("\n")[0])
      : undefined;
    const installed = fs.existsSync(path.join(dir, "PG_VERSION"));
    const stop = installed
      ? spawnSync(
          path.join(bin, "pg_ctl"),
          ["-D", dir, "-m", "fast", "-w", "stop"],
          { timeout: 30000 },
        )
      : { status: 0 };
    const status = installed
      ? spawnSync(path.join(bin, "pg_ctl"), ["-D", dir, "status"], {
          timeout: 5000,
        })
      : { status: 3 };
    let absent = !pid;
    if (pid) {
      try {
        process.kill(pid, 0);
      } catch (e) {
        absent = (e as NodeJS.ErrnoException).code === "ESRCH";
      }
    }
    const clean =
      started &&
      closes.every((r) => r.status === "fulfilled") &&
      stop.status === 0 &&
      status.status === 3 &&
      !fs.existsSync(pidFile) &&
      absent;
    write("cleanup.json", {
      clean,
      resourceCloses: closes.map((r) => r.status),
      postgresStop: stop.status,
      postgresStatus: status.status,
      postgresPid: pid,
      postgresProcessAbsent: absent,
    });
    assert.ok(clean, "OWNED_CLEANUP_UNCERTAIN");
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
