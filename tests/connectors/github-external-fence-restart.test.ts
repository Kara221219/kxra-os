import { GithubProductionExecutor } from "../../packages/connectors/github-production-transport";
import { githubFake } from "../support/github-production-fake";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { GithubDurableFence } from "../../packages/connectors/github-production-fence";
test("external ledger unavailable or restarted never replaces an existing witness", async () => {
  const runtime = fs.realpathSync(process.env.KXRA_RUNTIME!);
  assert.match(
    runtime,
    /^\/(?:private\/)?tmp\/kxra-gho-[A-Za-z0-9]+\/\.runtime\/github-outbox$/,
  );
  const root = path.join(runtime, "external-fence"),
    cfg = JSON.parse(fs.readFileSync(path.join(root, "database.json"), "utf8")),
    state = JSON.parse(
      fs.readFileSync(path.join(root, "restart-context.json"), "utf8"),
    );
  const pool = new pg.Pool({
    ...cfg,
    user: "kxra_gh_fence",
    connectionTimeoutMillis: 300,
  });
  pool.on("error", () => {});
  try {
    const fence = new GithubDurableFence(pool, state.realm, state.epoch);
    await assert.rejects(
      fence.reserve(state.input, new AbortController().signal),
    );
    let appConsumptions = 0;
    const fake = githubFake(state.input.binding),
      executor = new GithubProductionExecutor(state.input.binding, {
        rollbackFence: fence,
        authority: {
          current: async (i) => ({
            state: i.operation.kind === "COMMENT" ? "DISPATCHING" : "ACTIVE",
            binding_sha256: i.binding_sha256,
            operation_sha256: i.operation_sha256,
            ...(i.operation.kind === "COMMENT"
              ? {
                  write_id: i.operation.write_id,
                  attempt_id: i.operation.attempt_id,
                }
              : {}),
          }),
          consume: async () => {
            appConsumptions++;
            throw Error("must remain unconsumed");
          },
        },
        broker: fake.broker,
        request: fake.request,
        lookup: async () => [{ address: "8.8.8.8" }],
        enabled: () => true,
      });
    assert.equal(
      (await executor.execute({ kind: "REPOSITORY" })).outcome,
      "READ",
    );
    assert.equal((await executor.execute({ kind: "ISSUE" })).outcome, "READ");
    assert.equal(
      (await executor.execute(state.input.operation)).outcome,
      "REFUSED",
    );
    assert.equal(fake.posts(), 0);
    assert.equal(appConsumptions, 0);
  } finally {
    await pool.end();
  }
  console.log(
    process.env.KXRA_FENCE_UNAVAILABLE === "true"
      ? "EXTERNAL_FENCE_UNAVAILABLE_FAIL_CLOSED"
      : "EXTERNAL_FENCE_RESTART_NO_NEW_RESERVATION",
  );
});
