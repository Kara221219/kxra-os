// Owned synthetic PostgreSQL only; no application DB, hosted URLs, or credentials.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import pg from "pg";
import { postgresBin } from "./postgres-bin.mjs";

async function main() {
  assert.equal(process.argv.length, 2, "NO_ARGUMENTS_ACCEPTED");
  const root = fs.realpathSync(process.cwd());
  assert.match(root, /^\/(?:private\/)?tmp\/kxra-ghr-[A-Za-z0-9]+$/);
  const lease = JSON.parse(
    fs.readFileSync("/tmp/kxra-native-serial.lock", "utf8"),
  );
  assert.equal(lease.owner, "github-rate-coordinator");
  assert.equal(lease.token, process.env.KXRA_GHR_LEASE_TOKEN);
  assert.equal(lease.pid, process.ppid);
  const runtime = path.join(root, ".runtime/github-rate-coordinator");
  assert.ok(!fs.existsSync(runtime), "NEW_OWNED_RUNTIME_REQUIRED");
  fs.mkdirSync(runtime, { recursive: true, mode: 0o700 });
  const data = path.join(runtime, "postgres");
  const socket = path.join(runtime, "socket");
  fs.mkdirSync(socket, { mode: 0o700 });
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: runtime,
    USER: os.userInfo().username,
    TMPDIR: process.env.TMPDIR,
    NODE_ENV: "production",
  };
  const bin = postgresBin(env);
  const port = 55432; // Unique owned Unix socket; no TCP listener or shared port.
  const cfg = { host: socket, port, database: "github_rate" };
  const write = (name: string, value: unknown) =>
    fs.writeFileSync(
      path.join(runtime, name),
      JSON.stringify(value, null, 2) + "\n",
      { mode: 0o600 },
    );
  const run = (name: string, args: string[]) =>
    execFileSync(path.join(bin, name), args, {
      env,
      timeout: 60000,
      stdio: "inherit",
    });
  const connect = async (
    database = "github_rate",
    user = os.userInfo().username,
  ) => {
    const client = new pg.Client({ ...cfg, database, user });
    await client.connect();
    return client;
  };
  const source = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    env,
  }).trim();
  const sourceClean =
    execFileSync("git", ["status", "--porcelain"], {
      cwd: root,
      encoding: "utf8",
      env,
    }).trim() === "";
  const sql = fs.readFileSync(
    path.join(root, "database/production/github-rate-coordinator-v1.sql"),
    "utf8",
  );
  const digest = (value: unknown) =>
    crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
  let admin: pg.Client | undefined;
  let ownedPid: number | undefined;
  const owned = () => {
    const lines = fs
      .readFileSync(path.join(data, "postmaster.pid"), "utf8")
      .split("\n");
    assert.equal(fs.realpathSync(lines[1]), data);
    const pid = Number(lines[0]);
    assert.ok(Number.isInteger(pid) && pid > 1);
    if (ownedPid) assert.equal(pid, ownedPid, "POSTMASTER_OWNERSHIP_CHANGED");
    const command = execFileSync("ps", ["-p", String(pid), "-o", "command="], {
      encoding: "utf8",
      env,
    }).trim();
    assert.ok(
      command.includes(data) && command.includes("postgres"),
      "OWNED_POSTMASTER_COMMAND_REQUIRED",
    );
    return pid;
  };
  const start = () => {
    run("pg_ctl", [
      "-D",
      data,
      "-l",
      path.join(runtime, "postgres.log"),
      "-w",
      "start",
    ]);
    ownedPid = owned();
  };
  const stop = () => {
    const pid = owned();
    run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
    assert.ok(!fs.existsSync(path.join(data, "postmaster.pid")));
    assert.ok(!fs.existsSync(path.join(socket, `.s.PGSQL.${port}`)));
    assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
    ownedPid = undefined;
  };
  const inspect = async (client: pg.Client) => {
    const catalog = (
      await client.query(`select c.relname,c.relkind,c.relrowsecurity,coalesce(c.relacl,acldefault('r',c.relowner))::text relacl,pg_get_userbyid(c.relowner) owner
      from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='kxra_github_rate' and c.relkind='r' order by c.relname`)
    ).rows;
    const functions = (
      await client.query(`select p.proname,pg_get_functiondef(p.oid) definition,p.proacl::text,pg_get_userbyid(p.proowner) owner
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='kxra_github_rate' order by p.proname`)
    ).rows;
    const constraints = (
      await client.query(
        `select c.relname,x.conname,pg_get_constraintdef(x.oid,true) definition from pg_constraint x join pg_class c on c.oid=x.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='kxra_github_rate' order by 1,2`,
      )
    ).rows;
    const indexes = (
      await client.query(
        "select * from pg_indexes where schemaname='kxra_github_rate' order by indexname",
      )
    ).rows;
    const triggers = (
      await client.query(
        `select c.relname,t.tgname,pg_get_triggerdef(t.oid) definition from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='kxra_github_rate' and not t.tgisinternal order by 1,2`,
      )
    ).rows;
    const values: Record<string, unknown> = {};
    for (const table of ["realms", "targets", "reservations"])
      values[table] = (
        await client.query(
          `select to_jsonb(t) value from kxra_github_rate.${table} t order by to_jsonb(t)::text`,
        )
      ).rows;
    return { catalog, functions, constraints, indexes, triggers, values };
  };
  try {
    run("initdb", [
      "-D",
      data,
      "--auth=trust",
      "--no-locale",
      "--encoding=UTF8",
    ]);
    fs.appendFileSync(
      path.join(data, "postgresql.conf"),
      `\nlisten_addresses = ''\nport = ${port}\nunix_socket_directories = '${socket}'\nfsync = on\nsynchronous_commit = on\nfull_page_writes = on\n`,
    );
    start();
    admin = await connect("postgres");
    assert.equal(
      fs.realpathSync(
        (await admin.query("show data_directory")).rows[0].data_directory,
      ),
      data,
    );
    assert.equal(
      (await admin.query("show listen_addresses")).rows[0].listen_addresses,
      "",
    );
    for (const setting of ["fsync", "synchronous_commit", "full_page_writes"])
      assert.equal(
        (await admin.query(`show ${setting}`)).rows[0][setting],
        "on",
      );
    await admin.query(
      "create role kxra_gh_rate login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls",
    );
    await admin.query("create role rate_unrelated login noinherit");
    await admin.query("create role rate_impersonator login noinherit");
    await admin.query("grant kxra_gh_rate to rate_impersonator");
    await admin.query("create database github_rate template template0");
    await admin.end();
    admin = await connect();
    const body = sql
      .replace(/^([\s\S]*?)\bbegin;\s*/i, "$1")
      .replace(/commit;\s*$/i, "");
    await admin.query("begin");
    await admin.query(body);
    await assert.rejects(admin.query("select 1/0"), { code: "22012" });
    await admin.query("rollback");
    assert.equal(
      (await admin.query("select to_regnamespace('kxra_github_rate') present"))
        .rows[0].present,
      null,
    );
    await admin.query(sql);
    write("database.json", cfg);
    await admin.end();
    admin = undefined;
    const tests = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--test",
        "--test-concurrency=1",
        "tests/connectors/github-rate-coordinator.db.test.ts",
      ],
      {
        cwd: root,
        env: {
          ...env,
          KXRA_GHR_DATABASE_FILE: path.join(runtime, "database.json"),
        },
        stdio: "inherit",
        timeout: 240000,
      },
    );
    assert.equal(tests.status, 0, "RATE_NATIVE_ACCEPTANCE_FAILED");
    admin = await connect();
    const snapshot = await inspect(admin);
    await admin.end();
    admin = undefined;
    stop();
    start();
    admin = await connect();
    assert.deepEqual(
      await inspect(admin),
      snapshot,
      "RESTART_CHANGED_RATE_HISTORY_OR_AUTHORITY",
    );
    const persistedCases = (
      await admin.query(`
      select 'OUTSTANDING' reason,r.id,r.epoch from kxra_github_rate.realms r where exists(select 1 from kxra_github_rate.reservations w where w.realm=r.id and w.completed_at is null)
      union all select 'COOLDOWN',r.id,r.epoch from kxra_github_rate.realms r where r.not_before>clock_timestamp()
      union all select 'UNCONFIRMED_HOLD',r.id,r.epoch from kxra_github_rate.realms r where r.phase='HOLD' and exists(select 1 from kxra_github_rate.reservations w where w.realm=r.id and w.completion->>'settlement'='UNCONFIRMED')
      union all select 'HOURLY_QUOTA',r.id,r.epoch from kxra_github_rate.realms r where (select count(*) from kxra_github_rate.reservations w where w.realm=r.id and greatest(w.reserved_at,w.completed_at)>clock_timestamp()-interval '1 hour')>=r.requests_3600s
    `)
    ).rows;
    const restartedWorker = await connect("github_rate", "kxra_gh_rate");
    try {
      assert.deepEqual(
        [...new Set(persistedCases.map((r) => r.reason))].sort(),
        ["COOLDOWN", "HOURLY_QUOTA", "OUTSTANDING", "UNCONFIRMED_HOLD"],
      );
      for (const r of persistedCases)
        await assert.rejects(
          restartedWorker.query(
            "select kxra_github_rate.runtime($1,$2,'RESERVE',$3)",
            [
              r.id,
              r.epoch,
              {
                reservation_id: crypto.randomUUID(),
                app_id: 11,
                installation_id: 22,
                account_id: 33,
                binding_sha256: "a".repeat(64),
                operation_sha256: "b".repeat(64),
                kind: "READ",
              },
            ],
          ),
        );
    } finally {
      await restartedWorker.end();
    }
    // Simulate externally fenced workers with a new trusted pinned epoch before
    // restoring stale ACTIVE state. An in-store HOLD alone does not survive restore.
    const staleBackup = path.join(runtime, "stale-active-rate.dump");
    run("pg_dump", [
      "-h",
      socket,
      "-p",
      String(port),
      "-U",
      os.userInfo().username,
      "-d",
      "github_rate",
      "-Fc",
      "-f",
      staleBackup,
    ]);
    await admin.query(
      "update kxra_github_rate.realms set phase='HOLD',epoch=epoch+1",
    );
    const externallyPinnedEpochs = (
      await admin.query(
        "select id,epoch from kxra_github_rate.realms order by id",
      )
    ).rows;
    await admin.query(
      "create database github_rate_stale_active template template0",
    );
    run("pg_restore", [
      "--exit-on-error",
      "-h",
      socket,
      "-p",
      String(port),
      "-U",
      os.userInfo().username,
      "-d",
      "github_rate_stale_active",
      staleBackup,
    ]);
    const staleAdmin = await connect("github_rate_stale_active");
    const newlyPinnedWorker = await connect(
      "github_rate_stale_active",
      "kxra_gh_rate",
    );
    try {
      assert.ok(
        (
          await staleAdmin.query(
            "select count(*)::int n from kxra_github_rate.realms where phase='ACTIVE'",
          )
        ).rows[0].n > 0,
      );
      for (const r of externallyPinnedEpochs)
        await assert.rejects(
          newlyPinnedWorker.query(
            "select kxra_github_rate.runtime($1,$2,'RESERVE',$3)",
            [
              r.id,
              r.epoch,
              {
                reservation_id: crypto.randomUUID(),
                app_id: 11,
                installation_id: 22,
                account_id: 33,
                binding_sha256: "a".repeat(64),
                operation_sha256: "b".repeat(64),
                kind: "READ",
              },
            ],
          ),
        );
    } finally {
      await newlyPinnedWorker.end();
      await staleAdmin.end();
    }
    const heldSnapshot = await inspect(admin);
    const backup = path.join(runtime, "held-rate.dump");
    run("pg_dump", [
      "-h",
      socket,
      "-p",
      String(port),
      "-U",
      os.userInfo().username,
      "-d",
      "github_rate",
      "-Fc",
      "-f",
      backup,
    ]);
    await admin.query(
      "create database github_rate_restored template template0",
    );
    run("pg_restore", [
      "--exit-on-error",
      "-h",
      socket,
      "-p",
      String(port),
      "-U",
      os.userInfo().username,
      "-d",
      "github_rate_restored",
      backup,
    ]);
    const restored = await connect("github_rate_restored");
    try {
      assert.deepEqual(
        await inspect(restored),
        heldSnapshot,
        "RESTORE_CHANGED_RATE_HISTORY_OR_AUTHORITY",
      );
      const realms = (
        await restored.query(
          "select id,epoch from kxra_github_rate.realms order by id",
        )
      ).rows;
      const worker = await connect("github_rate_restored", "kxra_gh_rate");
      try {
        for (const r of realms) {
          const payload = {
            reservation_id: crypto.randomUUID(),
            app_id: 11,
            installation_id: 22,
            account_id: 33,
            binding_sha256: "a".repeat(64),
            operation_sha256: "b".repeat(64),
            kind: "READ",
          };
          for (const epoch of [Number(r.epoch), Number(r.epoch) - 1])
            await assert.rejects(
              worker.query(
                "select kxra_github_rate.runtime($1,$2,'RESERVE',$3)",
                [r.id, epoch, payload],
              ),
            );
        }
      } finally {
        await worker.end();
      }
      const states = (
        await restored.query(
          "select count(*)::int total,count(*) filter(where phase='HOLD')::int held from kxra_github_rate.realms",
        )
      ).rows[0];
      assert.equal(states.total, states.held);
      write("proof.json", {
        source_commit: source,
        source_clean: sourceClean,
        restart_durable_denials: [
          ...new Set(persistedCases.map((r) => r.reason)),
        ].sort(),
        restore_scope:
          "HOLD/epoch-prepared backup retained; stale ACTIVE snapshot denies new externally pinned epoch. Old workers require external fencing; the store cannot detect its own rollback",
        stale_active_restore_new_pinned_epoch_denied: true,
        external_worker_fence_and_epoch_advance_required: true,
        sql_sha256: crypto.createHash("sha256").update(sql).digest("hex"),
        scope:
          "Synthetic installation-authenticated rate store only. All five observer calls remain unwired: four App-JWT/public-IP calls need distinct quota handling; its installation-token repository GET would share this class. Conservative policy is not a guarantee against GitHub limits.",
        rolled_back_installation_absent: true,
        native_acceptance: "PASS",
        restart_snapshot_sha256: digest(snapshot),
        held_restore_snapshot_sha256: digest(heldSnapshot),
        restore_realms: states.total,
        restore_all_held: true,
        old_and_current_epoch_dispatch_denied: true,
        restore_auto_resume: false,
        network: "Owned Unix socket only; listen_addresses empty",
        durability: {
          fsync: true,
          synchronous_commit: true,
          full_page_writes: true,
        },
        hosted_calls: 0,
        real_credentials: false,
        activation: false,
      });
    } finally {
      await restored.end();
    }
    console.log(
      "GITHUB_RATE_COORDINATOR_NATIVE_PASS " + path.join(runtime, "proof.json"),
    );
  } finally {
    if (admin) await admin.end();
    let clean = false;
    if (fs.existsSync(path.join(data, "postmaster.pid"))) {
      stop();
      clean = true;
    } else {
      // No postmaster ownership record means cleanup cannot safely stop anything.
      clean =
        ownedPid === undefined &&
        !fs.existsSync(path.join(socket, `.s.PGSQL.${port}`));
    }
    write("cleanup.json", {
      clean,
      root,
      lease_token: lease.token,
      source_commit: source,
      owned_postgres_stopped: clean,
      owned_socket_removed: clean,
    });
    assert.equal(clean, true, "OWNED_RATE_CLEANUP_UNCERTAIN");
  }
}
main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
