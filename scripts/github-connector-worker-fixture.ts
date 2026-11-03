// Disposable test process only: never reads credential stores or provider secrets.
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { localModeConfiguration } from "../packages/authz/local-guard";
import { fixtureUsers } from "../packages/authz/session";
import {
  GithubConnectorService,
  LocalGithubAdapter,
} from "../packages/connectors/github";
async function main() {
  if (!localModeConfiguration(process.env) || process.env.VERCEL_ENV)
    throw Error("LOCAL_FIXTURE_REQUIRED");
  const config = JSON.parse(
    fs.readFileSync(
      path.join(process.env.KXRA_RUNTIME!, "database.json"),
      "utf8",
    ),
  );
  if (
    typeof config.host !== "string" ||
    !config.host.startsWith("/") ||
    config.password
  )
    throw Error("PRIVATE_SOCKET_REQUIRED");
  const pool = new pg.Pool(config);
  const scope = async (
    kind: "human" | "worker",
    action: string,
    input: Record<string, unknown>,
  ) => {
    const db = await pool.connect();
    try {
      await db.query("begin");
      await db.query("set local role authenticated");
      await db.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({
          aal: "aal2",
          auth_time: Math.floor(Date.now() / 1000),
          session_version: 1,
        }),
      ]);
      await db.query(
        "select set_config('request.jwt.claim.sub',$1,true),set_config('request.kxra.org_id',$2,true),set_config('request.kxra.execution_mode','fixture',true),set_config('request.kxra.connector_actor',$3,true)",
        [fixtureUsers.owner, "10000000-0000-4000-8000-000000000001", kind],
      );
      const r = await db.query(
        "select kxra.github_connector($1,$2::jsonb) result",
        [action, JSON.stringify(input)],
      );
      await db.query("commit");
      return r.rows[0].result;
    } catch (error) {
      await db.query("rollback");
      throw error;
    } finally {
      db.release();
    }
  };
  try {
    const service = new GithubConnectorService(
      scope,
      new LocalGithubAdapter(process.env.KXRA_GITHUB_FAKE_ORIGIN!),
    );
    const action = process.argv[2],
      connection_id = process.argv[3],
      write_id = process.argv[4];
    const result = (await service.command(
      action === "recover"
        ? { action, connection_id }
        : { action, connection_id, write_id },
    )) as { state?: string };
    console.log(JSON.stringify({ state: result.state || "RECOVERED" }));
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error("GITHUB_FIXTURE_WORKER_FAILED");
  process.exitCode = 1;
});
