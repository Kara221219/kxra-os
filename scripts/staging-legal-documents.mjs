import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { stagingDatabaseConfig } from "./staging-database.mjs";
import {
  applyLegalDocuments,
  legalApproval,
  legalDocumentFindings,
  inspectLegalDocuments,
  unsafeLegalDocumentState,
  validateLegalDocumentOperator,
} from "./staging-legal-documents-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const command = process.argv[2] || "plan";
const validation = validateLegalDocumentOperator(process.env, command);
if (!validation.ok)
  throw Error(
    `Staging legal-document guard rejected:\n- ${validation.findings.join("\n- ")}`,
  );

const branch = execFileSync("git", ["branch", "--show-current"], {
  cwd: root,
  encoding: "utf8",
}).trim();
const head = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
const dirty = execFileSync("git", ["status", "--porcelain"], {
  cwd: root,
  encoding: "utf8",
}).trim();
const remote = execFileSync(
  "git",
  ["rev-parse", "origin/codex/phase-2-completion"],
  { cwd: root, encoding: "utf8" },
).trim();
if (branch !== "codex/phase-2-completion")
  throw Error("STAGING_LEGAL_REQUIRE_PHASE_BRANCH");
if (dirty) throw Error("STAGING_LEGAL_REQUIRE_CLEAN_TREE");
if (head !== remote) throw Error("STAGING_LEGAL_REQUIRE_PUSHED_HEAD");

const database = new pg.Client(
  stagingDatabaseConfig(
    process.env.KXRA_STAGING_MIGRATOR_DATABASE_URL,
    `kxra-staging-legal-${command}`,
  ),
);
await database.connect();
try {
  await database.query("set statement_timeout='30s'");
  const target = (
    await database.query(
      "select current_database() database,current_user username",
    )
  ).rows[0];
  if (target.database !== "postgres" || target.username !== "postgres")
    throw Error("STAGING_LEGAL_OPERATOR_IDENTITY_INVALID");
  const initial = await inspectLegalDocuments(database);
  const blockers = unsafeLegalDocumentState(initial);
  if (blockers.length)
    throw Error(`STAGING_LEGAL_TAKEOVER_REJECTED:${blockers.join(";")}`);
  if (command === "plan") {
    const findings = legalDocumentFindings(initial);
    console.log(
      findings.length
        ? `Staging legal-document plan: ${findings.length} bounded item(s) pending.`
        : "Staging legal-document plan: exact approved pack already active.",
    );
  } else if (command === "apply") {
    await database.query(
      "select pg_advisory_lock(hashtext('kxra-staging-legal-documents'))",
    );
    try {
      await database.query("begin");
      try {
        await applyLegalDocuments(database);
        await database.query("commit");
      } catch (error) {
        await database.query("rollback");
        throw error;
      }
    } finally {
      await database.query(
        "select pg_advisory_unlock(hashtext('kxra-staging-legal-documents'))",
      );
    }
  }
  const findings = legalDocumentFindings(await inspectLegalDocuments(database));
  if (command !== "plan" && findings.length)
    throw Error(`STAGING_LEGAL_MISMATCH:${findings.join(";")}`);
  if (command !== "plan")
    console.log(
      `Staging legal-document verification PASS (${legalApproval.packSha256}; five approved documents; two customer requirements).`,
    );
} finally {
  await database.end();
}
