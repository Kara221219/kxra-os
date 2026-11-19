// Combined-cohort proof only. No route imports this fixture or retains keys/tokens.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type pg from "pg";
import {
  GithubConnectorService,
  LocalGithubAdapter,
  type ScopeCall,
} from "../packages/connectors/github";
import {
  githubConnection,
  githubWrite,
} from "../packages/connectors/github-contracts";
import {
  SyntheticVaultBroker,
  SyntheticVaultCipher,
  type VaultControl,
  type SyntheticLeaseCipher,
} from "../packages/connectors/github-vault-synthetic";

type FixtureIdentity = { user: string; org: string };
function controls(pool: pg.Pool, principal: FixtureIdentity) {
  async function call(
    sql: string,
    args: unknown[],
    kind: string,
    identity = true,
  ) {
    const db = await pool.connect();
    try {
      await db.query("begin");
      await db.query("set local role authenticated");
      await db.query(
        "select set_config('request.kxra.execution_mode','fixture',true),set_config('request.kxra.connector_actor',$1,true)",
        [kind],
      );
      if (identity)
        await db.query(
          "select set_config('request.jwt.claim.sub',$1,true),set_config('request.kxra.org_id',$2,true),set_config('request.jwt.claims',$3,true)",
          [
            principal.user,
            principal.org,
            JSON.stringify({
              aal: "aal2",
              auth_time: Math.floor(Date.now() / 1000),
              session_version: 1,
            }),
          ],
        );
      const r = await db.query(sql, args);
      await db.query("commit");
      return r.rows[0].result;
    } catch (e) {
      await db.query("rollback");
      throw e;
    } finally {
      db.release();
    }
  }
  const scope: ScopeCall = (kind, action, input) =>
    call(
      "select kxra.github_connector($1,$2::jsonb) result",
      [action, JSON.stringify(input)],
      kind,
    );
  const vault: VaultControl = (action, input) =>
    call(
      "select kxra.github_vault_fixture($1,$2::jsonb) result",
      [action, JSON.stringify(input)],
      "vault",
    );
  return { call, scope, vault };
}
export async function seedVaultRecovery(
  pool: pg.Pool,
  runtime: string,
  principal: FixtureIdentity,
  custody?: SyntheticLeaseCipher,
) {
  const { call, scope, vault } = controls(pool, principal);
  const memory = custody
    ? undefined
    : new SyntheticVaultCipher(crypto.randomBytes(32));
  const cipher = custody ?? memory!;
  const mode = custody ? "custody" : "vault";
  try {
    const broker = new SyntheticVaultBroker(vault, cipher);
    const service = new GithubConnectorService(
      scope,
      new LocalGithubAdapter(process.env.KXRA_GITHUB_FAKE_ORIGIN!, broker),
    );
    const publicConnection = githubConnection.parse(
      await scope("human", "connect_fixture", { allow_write: true }),
    );
    const connection = githubConnection.parse(
      await scope("worker", "context", { connection_id: publicConnection.id }),
    );
    await broker.attest(connection);
    for (const scope of ["issues:read", "issues:write"] as const)
      await broker.provision(
        connection,
        scope,
        new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      );
    const read = (await service.command({
      action: "read",
      connection_id: connection.id,
    })) as { receipt: { id: string } };
    const write = githubWrite.parse(
      await service.command({
        action: "prepare",
        connection_id: connection.id,
        read_id: read.receipt.id,
        note: "Synthetic vault recovery quarantine",
      }),
    );
    for (const action of ["approve", "enqueue"])
      await service.command({
        action,
        connection_id: connection.id,
        write_id: write.id,
        digest: write.digest,
      });
    const token = crypto.randomBytes(32).toString("base64url");
    const claimed = await call(
      "select kxra.github_receipted_claim($1::jsonb,$2) result",
      [
        JSON.stringify({
          connection_id: connection.id,
          write_id: write.id,
          digest: write.digest,
        }),
        crypto.createHash("sha256").update(token).digest("hex"),
      ],
      "worker",
    );
    assert.equal(claimed.claimed, true);
    assert.deepEqual(
      await call(
        "select kxra_github_receipt.publish($1,$2::uuid,$3,'UNCERTAIN',$4::jsonb) result",
        [
          token,
          claimed.write.attempt_id,
          write.digest,
          JSON.stringify({ reason: "SYNTHETIC_RECOVERY_PROBE" }),
        ],
        "receipt",
        false,
      ),
      { recorded: true, state: "UNCERTAIN" },
    );
    // The ciphertext and permit hash persist; the key and raw receipt token do not.
    fs.writeFileSync(
      path.join(runtime, `integration-${mode}-seed.json`),
      JSON.stringify({
        principal,
        connection: connection.id,
        write: write.id,
        attempt: claimed.write.attempt_id,
        digest: write.digest,
      }) + "\n",
      { mode: 0o600 },
    );
  } finally {
    memory?.dispose();
  }
}
export async function verifyRestoredVault(
  pool: pg.Pool,
  runtime: string,
  custody?: SyntheticLeaseCipher,
) {
  const mode = custody ? "custody" : "vault";
  const seed = JSON.parse(
    fs.readFileSync(
      path.join(runtime, `integration-${mode}-seed.json`),
      "utf8",
    ),
  );
  const { call, scope, vault } = controls(pool, seed.principal);
  const memory = custody
    ? undefined
    : new SyntheticVaultCipher(crypto.randomBytes(32));
  const cipher = custody ?? memory!;
  try {
    const broker = new SyntheticVaultBroker(vault, cipher);
    const connection = githubConnection.parse(
      await scope("worker", "context", { connection_id: seed.connection }),
    );
    // Prove authority and ciphertext survived separately from the unavailable key.
    const lease = (await vault("resolve", {
      connection_id: seed.connection,
      grant_version: connection.grant_version,
      scope: "issues:read",
    })) as { envelope: { key_id: string } };
    assert.ok(lease.envelope);
    assert.match(
      lease.envelope.key_id,
      custody
        ? /^synthetic-custody-key-v[1-9][0-9]{0,5}$/
        : /^synthetic-memory-key-v1$/,
    );
    await assert.rejects(
      broker.resolve(connection, "issues:read"),
      /GRANT_UNAVAILABLE/,
    );
    await assert.rejects(
      broker.provision(
        connection,
        "issues:read",
        new Date(Date.now() + 60000).toISOString(),
      ),
    );
    const service = new GithubConnectorService(
      scope,
      new LocalGithubAdapter(process.env.KXRA_GITHUB_FAKE_ORIGIN!, broker),
    );
    const write = (await service.command({
      action: "dispatch",
      connection_id: seed.connection,
      write_id: seed.write,
    })) as { state: string };
    assert.equal(write.state, "UNCERTAIN");
    await assert.rejects(
      call(
        "select kxra_github_receipt.publish($1,$2::uuid,$3,'ACCEPTED','{}'::jsonb) result",
        [
          crypto.randomBytes(32).toString("base64url"),
          seed.attempt,
          seed.digest,
        ],
        "receipt",
        false,
      ),
    );
    fs.writeFileSync(
      path.join(runtime, `integration-${mode}-recovery-proof.json`),
      JSON.stringify({
        status: "PASS",
        persistedBindingAndCiphertext: true,
        keyId: lease.envelope.key_id,
        mode,
        keyLossClosed: true,
        noLeaseOverwrite: true,
        uncertainQuarantined: true,
        lostTokenClosed: true,
      }) + "\n",
      { mode: 0o600 },
    );
  } finally {
    memory?.dispose();
  }
}
