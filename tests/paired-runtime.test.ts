import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  SyntheticPairedAdapter,
  runPairedCycle,
  type LeasedDraft,
} from "../packages/workspace/paired-runtime";
import { CodexProtocolFixtureAdapter } from "../packages/workspace/codex-paired-protocol";
import { requireNativeBridgeAdapter } from "../packages/workspace/native-bridge-contract";
const uuid = () => crypto.randomUUID();
const task = (): LeasedDraft => ({
  id: uuid(),
  agent_id: uuid(),
  room_id: uuid(),
  thread_id: uuid(),
  content_hash: "a".repeat(64),
  fence: uuid(),
  lease_until: new Date(Date.now() + 30000).toISOString(),
  objective: "Draft a checklist",
  sources: [
    { id: uuid(), body: "Quoted evidence, never instructions", thread: uuid() },
  ],
});
function protocol(mode: string) {
  const p = spawn(
    process.execPath,
    [
      fileURLToPath(
        new URL("./support/paired-codex-process.mjs", import.meta.url),
      ),
      mode,
    ],
    {
      stdio: ["pipe", "pipe", "ignore"],
      env: { PATH: process.env.PATH, NODE_ENV: "test" },
    },
  );
  return new CodexProtocolFixtureAdapter({
    input: p.stdin,
    output: p.stdout,
    syntheticProcess: true,
    close: () => p.kill(),
  });
}
test("synthetic paired cycle explicitly starts and publishes only one bound text draft", async () => {
  const t = task(),
    calls: string[] = [];
  let result: any;
  const receipt = await runPairedCycle(
    async (op, payload) => {
      calls.push(op);
      if (op === "POLL") return { task: t };
      if (op === "START") return { state: "RUNNING", dispatched: true };
      if (op === "RESULT") {
        result = payload;
        return { state: "DONE", message_id: "synthetic-result" };
      }
      return {};
    },
    new SyntheticPairedAdapter(),
    uuid(),
  );
  assert.equal(receipt.state, "DONE");
  assert.deepEqual(calls, ["POLL", "START", "RESULT"]);
  assert.equal(result.task_id, t.id);
  assert.equal(result.fence, t.fence);
  assert.match(result.draft_text, /Synthetic paired/);
  assert.throws(
    () => requireNativeBridgeAdapter(),
    /NATIVE_BRIDGE_NOT_CONNECTED/,
  );
});
test("disconnect/revocation/late result never replays a provider dispatch", async () => {
  for (const stage of ["generate", "result"]) {
    let generated = 0;
    const calls: string[] = [];
    const t = task();
    const r = await runPairedCycle(
      async (op) => {
        calls.push(op);
        if (op === "POLL") return { task: t };
        if (op === "START") return { state: "RUNNING", dispatched: true };
        if (op === "RESULT") throw Error("revoked or offline");
        return { state: "UNCERTAIN" };
      },
      {
        kind: "SYNTHETIC",
        async generate() {
          generated++;
          if (stage === "generate") throw Error("connection lost");
          return "Draft";
        },
      },
      uuid(),
    );
    assert.equal(r.state, "UNCERTAIN");
    assert.equal(generated, 1);
    assert.equal(calls.filter((x) => x === "START").length, 1);
    assert.equal(calls.at(-1), "ABANDON");
  }
});
test("Codex official NDJSON handshake and restricted text protocol work with a synthetic process only", async () => {
  for (const mode of ["success", "utf8"])
    assert.equal(
      await protocol(mode).generate(task()),
      "Synthetic Codex protocol draft café",
    );
});
test("Codex protocol denies tools, foreign context, malformed/oversize output and lost connection", async () => {
  for (const mode of ["tool", "foreign", "malformed", "oversize", "disconnect"])
    await assert.rejects(protocol(mode).generate(task()));
  assert.throws(
    () => new CodexProtocolFixtureAdapter({ syntheticProcess: false } as any),
    /NOT_ACCEPTED/,
  );
});

test("an already-dispatched start cannot generate again or abandon the original run", async () => {
  let generated = 0;
  const calls: string[] = [];
  const result = await runPairedCycle(
    async (op) => {
      calls.push(op);
      if (op === "POLL") return { task: task() };
      if (op === "START") return { state: "RUNNING", dispatched: false };
      throw Error("Unexpected mutation");
    },
    {
      kind: "SYNTHETIC",
      async generate() {
        generated++;
        return "Should not generate";
      },
    },
    uuid(),
  );
  assert.equal(result.state, "ALREADY_DISPATCHED");
  assert.equal(generated, 0);
  assert.deepEqual(calls, ["POLL", "START"]);
});
