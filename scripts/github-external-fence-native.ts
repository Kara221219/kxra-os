import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import pg from "pg";
import { execFileSync, spawnSync } from "node:child_process";
import { postgresBin } from "./postgres-bin.mjs";
async function main() {
  const runtime = fs.realpathSync(process.env.KXRA_RUNTIME!);
  assert.match(
    runtime,
    /^\/(?:private\/)?tmp\/kxra-gho-[A-Za-z0-9]+\/\.runtime\/github-outbox$/,
  );
  const root = path.join(runtime, "external-fence");
  assert.ok(!fs.existsSync(root));
  fs.mkdirSync(root, { mode: 0o700 });
  const data = path.join(root, "postgres"),
    socket = path.join(root, "socket");
  fs.mkdirSync(socket, { mode: 0o700 });
  const bin = postgresBin(process.env),
    cfg = JSON.parse(
      fs.readFileSync(path.join(runtime, "database.json"), "utf8"),
    );
  let admin: pg.Client | undefined;
  const run = (name: string, args: string[]) =>
    execFileSync(path.join(bin, name), args, {
      stdio: "inherit",
      timeout: 30000,
    });
  try {
    run("initdb", [
      "-D",
      data,
      "--auth=trust",
      "--no-locale",
      "--encoding=UTF8",
    ]);
    run("pg_ctl", [
      "-D",
      data,
      "-l",
      path.join(root, "postgres.log"),
      "-o",
      `-k ${socket} -p ${cfg.port} -h '' -c fsync=on -c synchronous_commit=on -c full_page_writes=on`,
      "-w",
      "start",
    ]);
    admin = new pg.Client({
      host: socket,
      port: cfg.port,
      database: "postgres",
      user: os.userInfo().username,
    });
    await admin.connect();
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
    await admin.query("create role kxra_gh_fence login noinherit");
    await admin.query("create role kxra_gh_reconcile login noinherit");
    await admin.query("create database github_fence template template0");
    await admin.end();
    admin = undefined;
    admin = new pg.Client({
      host: socket,
      port: cfg.port,
      database: "github_fence",
      user: os.userInfo().username,
    });
    await admin.connect();
    await admin.query(
      fs.readFileSync(
        "database/production/github-external-fence-v1.sql",
        "utf8",
      ),
    );
    assert.equal(
      (
        await admin.query(
          "select count(*)::int n from kxra_github_fence.realms",
        )
      ).rows[0].n,
      0,
    );
    fs.writeFileSync(
      path.join(root, "database.json"),
      JSON.stringify({
        host: socket,
        port: cfg.port,
        database: "github_fence",
      }),
      { mode: 0o600 },
    );
    await admin.end();
    admin = undefined;
    const test = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--test",
        "tests/connectors/github-external-fence.db.test.ts",
      ],
      {
        env: {
          ...process.env,
          KXRA_FENCE_DATABASE_FILE: path.join(root, "database.json"),
        },
        stdio: "inherit",
        timeout: 240000,
      },
    );
    assert.equal(test.status, 0, "EXTERNAL_FENCE_ACCEPTANCE_FAILED");
    const inspect = async () => {
      const a = new pg.Client({
        host: socket,
        port: cfg.port,
        database: "github_fence",
        user: os.userInfo().username,
      });
      await a.connect();
      try {
        const tables = (
          await a.query(
            "select c.relname,c.relkind,c.relrowsecurity,c.relacl::text,pg_get_userbyid(c.relowner) owner from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='kxra_github_fence' and c.relkind in('r','S') order by c.relname",
          )
        ).rows;
        const functions = (
          await a.query(
            "select p.proname,pg_get_functiondef(p.oid) definition,p.proacl::text,pg_get_userbyid(p.proowner) owner from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='kxra_github_fence' order by p.proname",
          )
        ).rows;
        const data: any = {};
        for (const table of ["realms", "writes", "observations", "events"])
          data[table] = (
            await a.query(
              "select to_jsonb(t) value from kxra_github_fence." +
                table +
                " t order by to_jsonb(t)::text",
            )
          ).rows;
        data.sequence = (
          await a.query(
            "select last_value,is_called from kxra_github_fence.events_id_seq",
          )
        ).rows;
        return { tables, functions, data };
      } finally {
        await a.end();
      }
    };
    const before = await inspect();
    fs.writeFileSync(
      path.join(root, "ledger-before-restart.json"),
      JSON.stringify(before, null, 2) + "\n",
      { mode: 0o600 },
    );
    run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
    const verify = (unavailable = false) => {
      const r = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--test",
          "tests/connectors/github-external-fence-restart.test.ts",
        ],
        {
          env: {
            ...process.env,
            KXRA_FENCE_UNAVAILABLE: unavailable ? "true" : "false",
          },
          stdio: "inherit",
          timeout: 15000,
        },
      );
      assert.equal(r.status, 0);
    };
    verify(true);
    run("pg_ctl", [
      "-D",
      data,
      "-l",
      path.join(root, "postgres.log"),
      "-w",
      "start",
    ]);
    assert.deepEqual(await inspect(), before);
    verify();
    fs.writeFileSync(
      path.join(root, "restart-proof.json"),
      JSON.stringify({
        exactCatalogueOwnerAclRowsSequencesPreserved: true,
        unavailableFailClosed: true,
        restartedWitnessCannotReissue: true,
      }) + "\n",
      { mode: 0o600 },
    );
  } finally {
    try {
      await admin?.end();
    } catch {}
    const stop = spawnSync(
        path.join(bin, "pg_ctl"),
        ["-D", data, "-m", "fast", "-w", "stop"],
        { stdio: "inherit", timeout: 30000 },
      ),
      status = spawnSync(path.join(bin, "pg_ctl"), ["-D", data, "status"], {
        stdio: "ignore",
        timeout: 5000,
      });
    const clean =
      stop.status === 0 &&
      status.status === 3 &&
      !fs.existsSync(path.join(data, "postmaster.pid"));
    fs.writeFileSync(
      path.join(root, "cleanup.json"),
      JSON.stringify({
        clean,
        stop: stop.status,
        status: status.status,
        postmasterPidAbsent: !fs.existsSync(path.join(data, "postmaster.pid")),
      }) + "\n",
      { mode: 0o600 },
    );
    assert.ok(clean, "EXTERNAL_FENCE_CLEANUP_UNCERTAIN");
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
