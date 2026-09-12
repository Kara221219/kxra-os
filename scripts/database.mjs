import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import pg from "pg";
const root = path.resolve(import.meta.dirname, "..");
const runtime = path.join(root, ".runtime");
const data = path.join(runtime, "postgres");
const socket = path.join(runtime, "socket");
const bin = process.env.KXRA_PG_BIN || "/opt/homebrew/opt/postgresql@14/bin";
fs.mkdirSync(socket, { recursive: true, mode: 0o700 });
fs.chmodSync(runtime, 0o700);
const adminUser = os.userInfo().username;
const config = {
  host: socket,
  port: 55439,
  user: adminUser,
  database: "postgres",
};
function running() {
  try {
    execFileSync(path.join(bin, "pg_ctl"), ["-D", data, "status"], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}
async function start() {
  if (!fs.existsSync(path.join(data, "PG_VERSION")))
    execFileSync(
      path.join(bin, "initdb"),
      [
        "-D",
        data,
        "--auth-local=trust",
        "--auth-host=reject",
        "--encoding=UTF8",
        "--no-locale",
      ],
      { stdio: "ignore" },
    );
  if (!running())
    execFileSync(
      path.join(bin, "pg_ctl"),
      [
        "-D",
        data,
        "-l",
        path.join(runtime, "postgres.log"),
        "-o",
        `-k '${socket}' -p 55439 -h ''`,
        "-w",
        "start",
      ],
      { stdio: "inherit" },
    );
  const db = new pg.Client(config);
  await db.connect();
  for (const role of ["anon", "authenticated", "kxra_app"]) {
    const x = await db.query("select 1 from pg_roles where rolname=$1", [role]);
    if (!x.rowCount)
      await db.query(
        `create role ${role} ${role === "kxra_app" ? "login noinherit" : "nologin"} nobypassrls`,
      );
  }
  await db.query("grant authenticated,anon to kxra_app");
  await db.query(
    `create schema if not exists auth; create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;grant usage on schema auth to anon,authenticated;grant execute on all functions in schema auth to anon,authenticated;`,
  );
  const result = await db.query(
    "select to_regclass('kxra.projects') as exists",
  );
  if (!result.rows[0].exists) {
    await db.query(
      fs.readFileSync(
        path.join(root, "supabase/migrations/0001_core.sql"),
        "utf8",
      ),
    );
    await seed(db);
  }
  await db.query(
    "create table if not exists public.kxra_local_migrations(name text primary key)",
  );
  for (const name of fs
    .readdirSync(path.join(root, "supabase/migrations"))
    .sort()
    .filter((x) => x.endsWith(".sql") && !x.startsWith("0001"))) {
    const applied = await db.query(
      "select 1 from public.kxra_local_migrations where name=$1",
      [name],
    );
    if (!applied.rowCount) {
      await db.query(
        fs.readFileSync(path.join(root, "supabase/migrations", name), "utf8"),
      );
      await db.query("insert into public.kxra_local_migrations values($1)", [
        name,
      ]);
    }
  }
  await db.end();
  fs.writeFileSync(
    path.join(runtime, "database.json"),
    JSON.stringify({ ...config, user: "kxra_app" }),
  );
  console.log("Isolated local PostgreSQL ready (Unix socket only).");
}
export const org = "10000000-0000-4000-8000-000000000001";
export const ids = {
  owner: "20000000-0000-4000-8000-000000000001",
  partner: "20000000-0000-4000-8000-000000000002",
  viewer: "20000000-0000-4000-8000-000000000003",
  revoked: "20000000-0000-4000-8000-000000000004",
};
async function seed(db) {
  await db.query("insert into kxra.organisations values($1,$2)", [
    org,
    "KXRA Group",
  ]);
  for (const [key, id] of Object.entries(ids))
    await db.query(
      "insert into kxra.members(id,org_id,display_name,role,active) values($1,$2,$3,$4,$5)",
      [id, org, `Local ${key}`, key === "owner" ? "owner" : "partner", true],
    );
  const dir = path.join(root, "KXRA-GENESIS/registers");
  const projects = JSON.parse(
    fs.readFileSync(path.join(dir, "projects.json"), "utf8"),
  );
  const pid = {};
  for (let i = 0; i < projects.length; i++) {
    const pr = projects[i],
      id = `30000000-0000-4000-8000-00000000000${i + 1}`;
    pid[pr.id] = id;
    await db.query(
      "insert into kxra.projects(id,org_id,code,name,stage,status,next_action) values($1,$2,$3,$4,$5,$6,$7)",
      [id, org, pr.id, pr.name, pr.stage, pr.status, pr.next_action],
    );
    await db.query(
      "insert into kxra.records(org_id,project_id,kind,title,body,classification,visibility,status,source_code) values($1,$2,'knowledge',$3,$4,'USER-SUPPLIED INFORMATION','project_shared','accepted',$5)",
      [org, id, "Project brief", pr.next_action, pr.id + "-BRIEF"],
    );
  }
  for (const [who, pr, role, active] of [
    ["partner", "PROJECT-002", "contributor", true],
    ["viewer", "PROJECT-003", "viewer", true],
    ["revoked", "PROJECT-002", "contributor", false],
  ])
    await db.query(
      "insert into kxra.project_memberships(org_id,project_id,user_id,role,active) values($1,$2,$3,$4,$5)",
      [org, pid[pr], ids[who], role, active],
    );
  const mapping = {
    assumptions: "assumption",
    experiments: "experiment",
    decisions: "decision",
    risks: "risk",
    "research-sources": "source",
    blockers: "blocker",
    "ai-agents": "agent",
    skills: "skill",
    routines: "routine",
    "work-log": "work_log",
  };
  for (const [file, kind] of Object.entries(mapping))
    for (const row of JSON.parse(
      fs.readFileSync(path.join(dir, file + ".json"), "utf8"),
    )) {
      const classification = [
        "FACT",
        "USER-SUPPLIED INFORMATION",
        "EXTERNAL RESEARCH",
        "ASSUMPTION",
        "HYPOTHESIS",
        "ESTIMATE",
        "AI INFERENCE",
        "DECISION",
        "UNRESOLVED QUESTION",
      ].includes(row.classification)
        ? row.classification
        : "USER-SUPPLIED INFORMATION";
      await db.query(
        "insert into kxra.records(org_id,project_id,kind,title,body,data,classification,source_code) values($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          org,
          pid[row.project_scope] || null,
          kind,
          row.title ||
            row.name ||
            row.role ||
            row.hypothesis ||
            row.missing ||
            row.action ||
            row.id,
          row.statement ||
            row.summary ||
            row.objective ||
            row.test ||
            row.decision ||
            row.why ||
            "",
          row,
          classification,
          row.id,
        ],
      );
    }
  console.log(
    "Seeded five projects and classified registers. Synthetic accounts are local only.",
  );
}
const action = process.argv[2] || "start";
if (action === "stop") {
  if (running())
    execFileSync(
      path.join(bin, "pg_ctl"),
      ["-D", data, "-m", "fast", "-w", "stop"],
      { stdio: "inherit" },
    );
} else if (action === "reset") {
  throw Error(
    "Reset disabled to preserve local work. Use a fresh runtime directory for destructive tests.",
  );
} else await start();
