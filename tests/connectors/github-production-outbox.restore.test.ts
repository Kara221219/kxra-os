import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import pg from "pg";
import { GithubProductionOutbox } from "../../packages/connectors/github-production-outbox";
import { GithubProductionExecutor } from "../../packages/connectors/github-production-transport";
import { githubFake } from "../support/github-production-fake";
test("restored consumption quarantines replay and receipt-only authority cannot regrant current access", async () => {
  const runtime = fs.realpathSync(process.env.KXRA_RUNTIME!);
  assert.match(
    runtime,
    /^\/(?:private\/)?tmp\/kxra-gho-[A-Za-z0-9]+\/\.runtime\/github-outbox$/,
  );
  const cfg = JSON.parse(
    fs.readFileSync(
      path.join(
        runtime,
        process.env.KXRA_OUTBOX_RESTART_ONLY === "true"
          ? "database.json"
          : "restored-database.json",
      ),
      "utf8",
    ),
  );
  assert.equal(cfg.host, path.join(runtime, "socket"));
  const state = JSON.parse(
    fs.readFileSync(
      path.join(runtime, "ephemeral-recovery-state.json"),
      "utf8",
    ),
  );
  assert.equal(state.synthetic_only, true);
  const pool = new pg.Pool(cfg),
    admin = new pg.Client({ ...cfg, user: os.userInfo().username });
  await admin.connect();
  const env: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      KXRA_GITHUB_OUTBOX_ENABLED: "true",
      KXRA_GITHUB_OUTBOX_POLICY_SHA256: state.policy,
    },
    store = new GithubProductionOutbox(pool, { environment: () => env }),
    claim = store.restoreClaim(state.material),
    fake = githubFake(claim.binding, state.effects),
    e = new GithubProductionExecutor(claim.binding, {
      authority: claim.authority(),
      broker: fake.broker,
      request: fake.request,
      lookup: async () => [{ address: "8.8.8.8" }],
      enabled: () => true,
    });
  try {
    assert.equal((await e.execute({ kind: "REPOSITORY" })).outcome, "READ");
    assert.equal((await e.execute({ kind: "ISSUE" })).outcome, "READ");
    assert.equal((await e.execute(claim.operation)).outcome, "REFUSED");
    assert.equal(fake.posts(), 0);
    assert.equal(
      (
        await store.claim(
          state.dispatchWorkerToken,
          claim.operation.kind === "COMMENT" ? claim.operation.write_id : "",
        )
      ).claimed,
      false,
    );
    if (process.env.KXRA_OUTBOX_RESTART_ONLY === "true") {
      console.log("GITHUB_OUTBOX_RESTART_NO_REPLAY_PASS");
      return;
    }
    await store.human(state.actor, {
      action: "RECOVER",
      connection_id: state.connection,
      write_id: (claim.operation as any).write_id,
    });
    await assert.rejects(
      claim.publish({
        outcome: "NOT_EXECUTED",
        evidence: { reason: "AUTHORITY_OR_PREFLIGHT_UNAVAILABLE" },
      }),
    );
    const read = new GithubProductionExecutor(claim.binding, {
      authority: store.authority(state.readToken),
      broker: fake.broker,
      request: fake.request,
      lookup: async () => [{ address: "8.8.8.8" }],
      enabled: () => true,
    });
    const observation = await read.execute({ kind: "COMMENTS", page: 1 });
    assert.equal(observation.outcome, "READ");
    const values = (observation.data as any).comments.filter(
      (v: any) =>
        v.body === (claim.operation as any).body &&
        v.author_id === claim.binding.author_id,
    );
    assert.equal(values.length, 1);
    await store.human(state.actor, {
      action: "REVOKE",
      connection_id: state.connection,
    });
    await admin.query(
      "update kxra_private.ghp_activations set enabled=false where id=$1",
      [state.activation],
    );
    await admin.query(
      "update kxra_private.ghp_capabilities set revoked_at=clock_timestamp() where connection_id=$1 and purpose in('READ_WORKER','DISPATCH_WORKER','ATTEMPT_DISPATCH') and revoked_at is null",
      [state.connection],
    );
    await admin.query(
      "update kxra.account_identities set session_version=session_version+1 where account_id=$1",
      [state.actor.id],
    );
    env.KXRA_GITHUB_OUTBOX_ENABLED = "false";
    const evidence = {
      reason: "MATCHING_RECONCILIATION",
      status: 200,
      comment_id: values[0].id,
      body_sha256: crypto
        .createHash("sha256")
        .update((claim.operation as any).body)
        .digest("hex"),
      author_id: claim.binding.author_id,
      issue_id: claim.binding.issue_id,
    };
    const accepted = await claim.publish({ outcome: "ACCEPTED", evidence });
    assert.equal(accepted.state, "ACCEPTED");
    assert.equal(
      (await claim.publish({ outcome: "ACCEPTED", evidence })).duplicate,
      true,
    );
    await assert.rejects(
      claim.publish({
        outcome: "ACCEPTED",
        evidence: { ...evidence, comment_id: values[0].id + 1 },
      }),
    );
    await assert.rejects(store.readContext(state.readToken));
    assert.equal(fake.posts(), 0);
    assert.equal(
      (
        await admin.query(
          "select count(*)::int n from kxra_private.ghp_consumptions where attempt_id=$1",
          [(claim.operation as any).attempt_id],
        )
      ).rows[0].n,
      1,
    );
    fs.writeFileSync(
      path.join(runtime, "restore-observations.json"),
      JSON.stringify({
        restoredConsumedAttemptRefused: true,
        additionalFakePosts: fake.posts(),
        uniqueExistingEffect: values.length,
        historicalAcceptedAfterWithdrawal: true,
        receiptDuplicateIdempotent: true,
        receiptChangedEffectRejected: true,
        featureFlagDisabled: true,
        noReadOrDispatchAuthorityRestored: true,
      }) + "\n",
      { mode: 0o600 },
    );
    console.log("GITHUB_OUTBOX_RESTORE_RECEIPT_NO_REPLAY_PASS");
  } finally {
    await admin.end();
    await pool.end();
  }
});
