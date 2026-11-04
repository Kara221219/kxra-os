// Actual full-database dump/restore on the owned synthetic cluster only.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import pg from "pg";
import { integrationCatalog, integrationData } from "./integration-catalog.mjs";
import { postgresBin } from "./postgres-bin.mjs";
import {
  GithubConnectorService,
  LocalGithubAdapter,
  type ScopeCall,
} from "../packages/connectors/github";
import { verifyRestoredVault } from "./integration-vault-proof";
async function main() {
  const root = fs.realpathSync(path.resolve(__dirname, ".."));
  const runtime = fs.realpathSync(process.env.KXRA_RUNTIME!);
  assert.ok(runtime.startsWith(path.join(root, ".runtime") + path.sep));
  assert.equal(process.env.KXRA_AUTH_MODE, "fixture");
  assert.ok(
    !process.env.DATABASE_URL && !process.env.VERCEL && !process.env.VERCEL_ENV,
  );
  const cfg = JSON.parse(
    fs.readFileSync(path.join(runtime, "database.json"), "utf8"),
  );
  assert.equal(cfg.host, path.join(runtime, "socket"));
  assert.equal(cfg.database, "postgres");
  assert.equal(fs.realpathSync(cfg.host), cfg.host);
  assert.ok(!cfg.password && !cfg.ssl && !cfg.connectionString);
  const source = new pg.Client({ ...cfg, user: os.userInfo().username });
  await source.connect();
  try {
    assert.equal(
      fs.realpathSync(
        (await source.query("show data_directory")).rows[0].data_directory,
      ),
      path.join(runtime, "postgres"),
    );
    const target =
      "kxra_integration_restore_" + crypto.randomBytes(6).toString("hex");
    const dump = path.join(runtime, "extension-installed.dump");
    const catalogue = await integrationCatalog(source),
      data = await integrationData(source, catalogue);
    const expectedPrivate = [
      "paired_delegations",
      "paired_connector_reads",
      "paired_connector_writes",
      "paired_app_proposals",
      "customer_connectors",
      "connector_requests",
      "connector_notes",
      "github_connections",
      "github_reads",
      "github_writes",
      "github_receipts",
      "github_binding_challenges",
      "github_vault_bindings",
      "github_vault_leases",
      "github_receipt_permits",
      "paired_sessions",
      "paired_invitations",
    ];
    for (const name of expectedPrivate)
      assert.ok(
        catalogue.tables.some(
          (t: { schema: string; name: string; kind: string; rls: boolean }) =>
            t.schema === "kxra_private" && t.name === name,
        ),
      );
    assert.deepEqual(
      catalogue.tables
        .filter((t: { kind: string; rls: boolean }) => t.kind === "r" && !t.rls)
        .map((t: { schema: string; name: string }) => t.schema + "." + t.name),
      ["kxra_private.deployment"],
    );
    // The sole baseline exception is server deployment configuration. It is
    // unexposed and its complete owner/ACL/definition inventory is compared.
    // Check every private/resolver function rather than only the new ones.
    const expectedAcl = JSON.parse(
      fs.readFileSync(
        path.join(
          root,
          "packages/integration/canonical-private-function-acl.json",
        ),
        "utf8",
      ),
    );
    for (const role of ["app", "authenticated", "anon"]) {
      const reachable = catalogue.functions
        .filter(
          (f: Record<string, unknown>) =>
            ["kxra_private", "kxra_pairing", "kxra_github_receipt"].includes(
              String(f.schema),
            ) && f[role + "_reachable"],
        )
        .map(
          (f: Record<string, unknown>) =>
            f.schema + "." + f.name + "(" + f.arguments + ")",
        );
      assert.deepEqual(
        reachable,
        [
          ...expectedAcl.roles[role],
          ...expectedAcl.extensionRoles[role],
        ].sort(),
      );
    }
    for (const t of catalogue.tables.filter(
      (t: Record<string, unknown>) =>
        t.schema === "kxra_private" && t.kind === "r",
    ))
      assert.deepEqual(
        t.effective_table_privileges.filter(
          (p: { reachable: boolean }) => p.reachable,
        ),
        [],
        t.name,
      );
    assert.deepEqual(
      catalogue.columnAcls.filter(
        (c: { schema: string; acl: unknown }) =>
          c.schema === "kxra_private" && c.acl !== null,
      ),
      [],
      "No private table may acquire a column-level ACL",
    );
    const journey = JSON.parse(
      fs.readFileSync(path.join(runtime, "integration-journey.json"), "utf8"),
    );
    const providerFile = path.join(
      process.env.KXRA_GITHUB_FAKE_RUNTIME!,
      "github-provider-store.json",
    );
    const beforeProvider = JSON.parse(fs.readFileSync(providerFile, "utf8"));
    assert.equal(
      (
        await source.query(
          "select state from kxra_private.github_writes where id=$1",
          [journey.uncertain],
        )
      ).rows[0].state,
      "UNCERTAIN",
    );
    const passfile = path.join(runtime, "empty-libpq-passfile");
    fs.writeFileSync(passfile, "", { mode: 0o600, flag: "wx" });
    const subprocessEnv = {
      NODE_ENV: "production" as const,
      PATH: process.env.PATH,
      HOME: runtime,
      PGPASSFILE: passfile,
      PGSERVICEFILE: passfile,
      PGSYSCONFDIR: runtime,
    };
    const options = [
      "--no-password",
      "-h",
      cfg.host,
      "-p",
      String(cfg.port),
      "-U",
      os.userInfo().username,
    ];
    execFileSync(
      path.join(postgresBin(), "pg_dump"),
      [...options, "-d", "postgres", "--format=custom", "--file", dump],
      { stdio: "inherit", env: subprocessEnv },
    );
    await source.query(`create database "${target}" template template0`);
    const restored = new pg.Client({
      ...cfg,
      database: target,
      user: os.userInfo().username,
    });
    await restored.connect();
    try {
      assert.equal(
        (
          await restored.query(
            "select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not like 'pg_%' and n.nspname<>'information_schema'",
          )
        ).rows[0].n,
        0,
      );
      assert.equal(
        (
          await restored.query(
            "select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not like 'pg_%' and n.nspname<>'information_schema'",
          )
        ).rows[0].n,
        0,
        "Fresh target must contain no user routines",
      );
      execFileSync(
        path.join(postgresBin(), "pg_restore"),
        [
          ...options,
          "-d",
          target,
          "--single-transaction",
          "--exit-on-error",
          dump,
        ],
        { stdio: "inherit", env: subprocessEnv },
      );
      assert.deepEqual(await integrationCatalog(restored), catalogue);
      assert.deepEqual(await integrationData(restored, catalogue), data);
      const app = new pg.Pool({ ...cfg, database: target });
      const scope: ScopeCall = async (kind, action, input) => {
        const db = await app.connect();
        try {
          await db.query("begin");
          await db.query("set local role authenticated");
          await db.query(
            "select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true),set_config('request.kxra.org_id','10000000-0000-4000-8000-000000000001',true),set_config('request.kxra.execution_mode','fixture',true),set_config('request.kxra.connector_actor',$1,true),set_config('request.jwt.claims',$2,true)",
            [
              kind,
              JSON.stringify({
                aal: "aal2",
                auth_time: Math.floor(Date.now() / 1000),
                session_version: 1,
              }),
            ],
          );
          const r = await db.query(
            "select kxra.github_connector($1,$2::jsonb) result",
            [action, JSON.stringify(input)],
          );
          await db.query("commit");
          return r.rows[0].result;
        } catch (e) {
          await db.query("rollback");
          throw e;
        } finally {
          db.release();
        }
      };
      try {
        await verifyRestoredVault(app, runtime);
        const service = new GithubConnectorService(
          scope,
          new LocalGithubAdapter(process.env.KXRA_GITHUB_FAKE_ORIGIN!),
        );
        const args = {
          connection_id: journey.connection,
          write_id: journey.uncertain,
        };
        const quarantined = (await service.command({
          action: "dispatch",
          ...args,
        })) as { state: string };
        assert.equal(quarantined.state, "UNCERTAIN");
        assert.equal(
          JSON.parse(fs.readFileSync(providerFile, "utf8")).posts,
          beforeProvider.posts,
        );
        const reconciled = (await service.command({
          action: "reconcile",
          ...args,
        })) as { state: string; provider_comment_id: number };
        assert.equal(reconciled.state, "ACCEPTED");
        assert.equal(
          JSON.parse(fs.readFileSync(providerFile, "utf8")).posts,
          beforeProvider.posts,
        );
        assert.ok(
          beforeProvider.comments.some(
            (c: { id: number }) => c.id === reconciled.provider_comment_id,
          ),
        );
        assert.equal(
          (
            await restored.query(
              "select count(*)::int n from kxra_private.connector_notes where connector_id=$1",
              [journey.mock],
            )
          ).rows[0].n,
          1,
        );
        const restoredApp = (
          await restored.query(
            "select revision,latest_version,active_version from kxra.custom_apps where id=$1",
            [journey.app],
          )
        ).rows[0];
        assert.deepEqual(restoredApp, {
          revision: 5,
          latest_version: 2,
          active_version: 1,
        });
        assert.equal(
          (
            await restored.query(
              "select count(*)::int n from kxra.custom_app_releases where app_id=$1",
              [journey.app],
            )
          ).rows[0].n,
          3,
        );
        const history = (
          await restored.query(
            "select version,data from kxra.custom_app_record_versions where record_id=$1 order by version",
            [journey.record],
          )
        ).rows;
        assert.equal(history.length, 2);
        assert.equal(
          history[1].data.brief,
          "Revised integrated persistent value",
        );
        fs.writeFileSync(
          path.join(runtime, "extension-recovery-proof.json"),
          JSON.stringify(
            {
              status: "PASS",
              target,
              tableCount: catalogue.tables.filter(
                (t: {
                  schema: string;
                  name: string;
                  kind: string;
                  rls: boolean;
                }) => t.kind === "r",
              ).length,
              functionCount: catalogue.functions.length,
              data,
              catalogue,
              providerPosts: beforeProvider.posts,
              reconciledComment: reconciled.provider_comment_id,
              appHistory: history,
              dumpSha256: crypto
                .createHash("sha256")
                .update(fs.readFileSync(dump))
                .digest("hex"),
            },
            null,
            2,
          ) + "\n",
          { mode: 0o600 },
        );
        console.log(
          "EXTENSION_INSTALLED_RESTORE_QUARANTINE_RECONCILIATION_PASS",
        );
      } finally {
        await app.end();
      }
    } finally {
      await restored.end();
    }
  } finally {
    await source.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
