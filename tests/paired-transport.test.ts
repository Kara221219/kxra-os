import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  CodexStdioProcessAdapter,
  codexProcessPlan,
  type SpawnCodex,
} from "../packages/workspace/codex-stdio-transport";
import { PairedDeviceClient } from "../packages/workspace/paired-device-client";
import type { LeasedDraft } from "../packages/workspace/paired-runtime";
const uuid = () => crypto.randomUUID();
const binding = { agent: uuid(), room: uuid() };
const task = (): LeasedDraft => ({
  id: uuid(),
  agent_id: binding.agent,
  room_id: binding.room,
  thread_id: uuid(),
  content_hash: "a".repeat(64),
  fence: uuid(),
  lease_until: new Date(Date.now() + 30000).toISOString(),
  objective: "Draft",
  sources: [{ id: uuid(), body: "Quoted data", thread: uuid() }],
});
const config = {
  executable: "/operator/codex",
  workingDirectory: "/tmp",
  environment: { PATH: "/usr/bin:/bin", HOME: "/tmp", CODEX_HOME: "/tmp" },
};
const peer = fileURLToPath(
  new URL("./support/paired-codex-process.mjs", import.meta.url),
);
export function stubAdapter(
  mode = "success",
  onSpawn: (p: ReturnType<typeof spawn>) => void = () => {},
) {
  const launch: SpawnCodex = (_exe, args, options) => {
    assert.deepEqual(args, ["app-server", "--listen", "stdio://"]);
    assert.equal(options.shell, false);
    assert.deepEqual(Object.keys(options.env).sort(), [
      "CODEX_HOME",
      "HOME",
      "NODE_ENV",
      "PATH",
    ]);
    const child = spawn(process.execPath, [peer, mode, ...args], options);
    onSpawn(child);
    return child;
  };
  return new CodexStdioProcessAdapter(config, launch);
}
const json = (value: unknown, status = 200) =>
  new Response(
    JSON.stringify({
      mode: "FIXTURE_ONLY",
      provider_verified: false,
      ...(value as object),
    }),
    { status },
  );
function server(t = task()) {
  const calls: string[] = [];
  let heartbeatFails = false,
    lostResult = false;
  const request: typeof fetch = async (_url, init) => {
    assert.equal(init?.redirect, "error");
    assert.equal(init?.credentials, "omit");
    const { operation: op } = JSON.parse(String(init?.body));
    calls.push(op);
    if (op === "REDEEM")
      return json({
        session_token: "b".repeat(64),
        agent_id: binding.agent,
        room_id: binding.room,
        expires_in_seconds: 900,
        capability: "TEXT_DRAFT_ONLY",
      });
    if (op === "HEARTBEAT")
      return heartbeatFails ? json({}, 401) : json({ presence: "ONLINE" });
    if (op === "STATUS") return json({ state: "RUNNING" });
    if (op === "POLL") return json({ task: t });
    if (op === "START") return json({ state: "RUNNING", dispatched: true });
    if (op === "RESULT") {
      if (lostResult) throw Error("response lost");
      return json({ state: "DONE", message_id: uuid() });
    }
    return json({ state: "UNCERTAIN" });
  };
  return {
    request,
    calls,
    revoke: () => {
      heartbeatFails = true;
    },
    loseResult: () => {
      lostResult = true;
    },
  };
}
test("operator plan has fixed argv and no inherited credentials; stub subprocess completes and is reaped", async () => {
  assert.throws(() => codexProcessPlan({ ...config, executable: "codex" }));
  assert.throws(() =>
    codexProcessPlan({
      ...config,
      environment: { ...config.environment, OPENAI_API_KEY: "denied" } as any,
    }),
  );
  let child: ReturnType<typeof spawn> | undefined;
  assert.equal(
    await stubAdapter("success", (p) => {
      child = p;
    }).generate(task()),
    "Synthetic Codex protocol draft café",
  );
  assert.ok(child && (child.exitCode !== null || child.signalCode !== null));
});
test("subprocess cancellation escalates ignored TERM, disconnect and bounded stderr fail closed", async () => {
  for (const mode of ["disconnect", "stderr", "hang"]) {
    const controller = new AbortController();
    let child: ReturnType<typeof spawn> | undefined;
    const running = stubAdapter(mode, (p) => {
      child = p;
    }).generate(task(), controller.signal);
    const timer = setTimeout(() => controller.abort(), 100);
    try {
      await assert.rejects(running, (error: Error) => {
        assert.ok(
          child && (child.exitCode !== null || child.signalCode !== null),
          mode + ": " + error.message,
        );
        return true;
      });
    } finally {
      clearTimeout(timer);
    }
    assert.ok(child && (child.exitCode !== null || child.signalCode !== null));
  }
});
test("device setup and explicit reconnect keep tokens in memory and deliver one subprocess draft", async () => {
  const s = server(),
    client = new PairedDeviceClient("http://127.0.0.1:9999", s.request);
  await client.setup("a".repeat(64));
  assert.equal(client.state, "ONLINE");
  await client.reconnect();
  assert.equal((await client.runOnce(stubAdapter())).state, "DONE");
  assert.equal(s.calls.filter((x) => x === "RESULT").length, 1);
  client.close();
  assert.equal(client.state, "CLOSED");
  await assert.rejects(client.reconnect());
});
test("device revocation aborts active provider, lost result remains uncertain and never replays", async () => {
  const s = server(),
    client = new PairedDeviceClient("http://127.0.0.1:9999", s.request);
  await client.setup("a".repeat(64));
  const running = client.runOnce(stubAdapter("hang"));
  setTimeout(s.revoke, 100);
  assert.equal((await running).state, "UNCERTAIN");
  assert.equal(client.state, "REVOKED");
  assert.equal(s.calls.filter((x) => x === "RESULT").length, 0);
  await assert.rejects(client.runOnce(stubAdapter()));
  const other = server(),
    second = new PairedDeviceClient("http://127.0.0.1:9999", other.request);
  await second.setup("a".repeat(64));
  other.loseResult();
  assert.equal((await second.runOnce(stubAdapter())).state, "UNCERTAIN");
  await assert.rejects(second.runOnce(stubAdapter()));
  await second.reconnect();
  assert.equal(other.calls.filter((x) => x === "START").length, 1);
  second.close();
});
test("device rejects foreign bound task, redirect/status/oversize and ambiguous redemption without retry", async () => {
  for (const origin of [
    "https://example.com",
    "http://localhost:1234",
    "http://127.0.0.1:2/foreign",
    "http://user@127.0.0.1:3",
  ])
    assert.throws(() => new PairedDeviceClient(origin));
  const t = task();
  t.room_id = uuid();
  const s = server(t),
    client = new PairedDeviceClient("http://127.0.0.1:1", s.request);
  await client.setup("a".repeat(64));
  await assert.rejects(client.runOnce(stubAdapter()));
  assert.equal(s.calls.includes("START"), false);
  client.close();
  for (const request of [
    async () => {
      throw Error("lost");
    },
    async () => new Response("x".repeat(65537)),
  ]) {
    const c = new PairedDeviceClient("http://127.0.0.1:1", request);
    await assert.rejects(c.setup("a".repeat(64)));
    assert.equal(c.state, "UNCERTAIN");
    await assert.rejects(c.setup("a".repeat(64)));
    c.close();
  }
});

for (const mode of ["descendant", "descendant-no-pipes"])
  test(
    "owned process-group shutdown kills " + mode + " and never hangs",
    async () => {
      let pid = 0;
      const began = Date.now();
      await assert.rejects(
        stubAdapter(mode, (p) => {
          p.stdout?.on("data", (bytes) => {
            for (const line of bytes.toString().split("\n")) {
              try {
                const m = JSON.parse(line);
                if (m.method === "stub/descendant") pid = m.params.pid;
              } catch {}
            }
          });
        }).generate(task()),
      );
      assert.ok(Date.now() - began < 3000);
      assert.ok(pid > 0);
      // A zombie can briefly remain until adopted/reaped; inspect only this stub PID.
      for (let i = 0; i < 20; i++) {
        try {
          process.kill(pid, 0);
        } catch (e) {
          assert.equal((e as NodeJS.ErrnoException).code, "ESRCH");
          return;
        }
        await new Promise((r) => setTimeout(r, 25));
      }
      assert.fail("stub descendant still alive");
    },
  );
test("closing during redemption or reconnect cannot restore local authority", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const s = server();
  const c = new PairedDeviceClient("http://127.0.0.1:1", async (...args) => {
    await gate;
    return s.request(...args);
  });
  const setup = c.setup("a".repeat(64));
  c.close();
  release();
  await assert.rejects(setup);
  assert.equal(c.state, "CLOSED");
});
