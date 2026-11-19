import { EventEmitter } from "node:events";
import { stopOwnedFixtureChild } from "../../scripts/owned-fixture-child.mjs";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fork, type ChildProcess } from "node:child_process";
import pg from "pg";
import {
  GithubConnectorService,
  LocalGithubAdapter,
  fixtureGithubToken,
  type ScopeCall,
} from "../../packages/connectors/github";
import {
  githubConnection,
  githubWrite,
  type GithubConnection,
} from "../../packages/connectors/github-contracts";
import {
  SyntheticVaultBroker,
  type VaultControl,
  type Envelope,
} from "../../packages/connectors/github-vault-synthetic";
import { LoopbackSyntheticCustody } from "../../packages/connectors/github-custody-synthetic";
const runtime = process.env.KXRA_RUNTIME!;
assert.ok(runtime.startsWith("/tmp/kxra-vault-proof-"));
const cfg = JSON.parse(
  fs.readFileSync(path.join(runtime, "database.json"), "utf8"),
);
assert.ok(cfg.host.startsWith("/") && !cfg.password);
const app = new pg.Pool(cfg),
  admin = new pg.Pool({ ...cfg, user: os.userInfo().username }),
  user = crypto.randomUUID(),
  tenant = crypto.randomUUID();
const processes: ChildProcess[] = [];
const children: {
  process: ChildProcess;
  origin: string;
  authorization: string;
  client: LoopbackSyntheticCustody;
}[] = [];
let custody: Awaited<ReturnType<typeof start>>;
async function message(
  p: ChildProcess,
  match: (v: any) => boolean,
  timeout = 5000,
) {
  return new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => {
      clean();
      reject(Error("Custody fixture IPC timed out"));
    }, timeout);
    const receive = (v: any) => {
      if (match(v)) {
        clean();
        resolve(v);
      }
    };
    const exit = () => {
      clean();
      reject(Error("Custody fixture exited"));
    };
    function clean() {
      clearTimeout(timer);
      p.off("message", receive);
      p.off("exit", exit);
    }
    p.on("message", receive);
    p.on("exit", exit);
  });
}
async function stopProcess(p: ChildProcess) {
  const stopped = await stopOwnedFixtureChild(p, {
    onUncertain: () => {
      fs.writeFileSync(
        path.join(runtime, "native-child-cleanup-uncertain.json"),
        JSON.stringify({ pid: p.pid, purpose: "custody" }),
        { mode: 0o600 },
      );
    },
  });
  assert.equal(stopped, true, "Owned custody exit must be confirmed");
}

async function start(failure?: "validate" | "timeout") {
  const p = fork("scripts/github-custody-fixture.ts", [], {
    execArgv: ["--import", "tsx"],
    stdio: ["ignore", "ignore", "inherit", "ipc"],
  });
  processes.push(p);
  try {
    const ready = await message(
      p,
      (v) => failure !== "timeout" && v.type === "ready",
      failure === "timeout" ? 200 : 5000,
    );
    assert.notEqual(p.pid, process.pid);
    const value = {
      process: p,
      origin: ready.origin as string,
      authorization: ready.authorization as string,
      client: new LoopbackSyntheticCustody(
        ready.origin + (failure === "validate" ? "/invalid" : ""),
        ready.authorization,
      ),
    };
    children.push(value);
    return value;
  } catch (e) {
    await stopProcess(p);
    throw e;
  }
}
async function control(action: string, extra: Record<string, unknown> = {}) {
  const request_id = crypto.randomUUID(),
    pending = message(
      custody.process,
      (v) => v.type === "control" && v.request_id === request_id,
    );
  custody.process.send({ request_id, action, ...extra });
  const r = await pending;
  if (r.error) throw Error(r.error);
  return r.result;
}
async function stop(c: typeof custody) {
  await stopProcess(c.process);
  await assert.rejects(fetch(c.origin, { signal: AbortSignal.timeout(300) }));
}
async function call(sql: string, args: unknown[], kind = "worker") {
  const db = await app.connect();
  try {
    await db.query("begin");
    await db.query("set local role authenticated");
    await db.query(
      "select set_config('request.kxra.execution_mode','fixture',true),set_config('request.kxra.connector_actor',$1,true),set_config('request.jwt.claim.sub',$2,true),set_config('request.kxra.org_id',$3,true),set_config('request.jwt.claims',$4,true)",
      [
        kind,
        user,
        tenant,
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
const broker = () => new SyntheticVaultBroker(vault, custody.client);
async function connection() {
  const p = githubConnection.parse(
    await scope("human", "connect_fixture", { allow_write: true }),
  );
  return githubConnection.parse(
    await scope("worker", "context", { connection_id: p.id }),
  );
}
async function provision(
  c: GithubConnection,
  expiry = new Date(Date.now() + 120000).toISOString(),
) {
  const b = broker();
  await b.attest(c);
  for (const s of ["issues:read", "issues:write"] as const)
    await b.provision(c, s, expiry);
  return expiry;
}
async function envelope(c: GithubConnection) {
  return (
    await admin.query(
      "select envelope from kxra_private.github_vault_leases where connection_id=$1 and scope='issues:read'",
      [c.id],
    )
  ).rows[0].envelope as Envelope;
}
const posts = () =>
  JSON.parse(
    fs.readFileSync(path.join(runtime, "github-provider-store.json"), "utf8"),
  ).posts;
before(async () => {
  await admin.query(
    "insert into kxra.organisations(id,name,slug,organisation_kind) values($1,'Custody fixture',$2,'CUSTOMER')",
    [tenant, `custody-${tenant}`],
  );
  await admin.query(
    "insert into kxra.account_identities(account_id,auth_provider,auth_subject,state,email_verified_at) values($1,'FIXTURE',$2,'ACTIVE',clock_timestamp())",
    [user, `custody-${user}`],
  );
  await admin.query(
    "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_ADMIN','CUSTOMER','ACTIVE','Custody fixture','LOCAL_SYNTHETIC')",
    [tenant, user],
  );
  custody = await start();
});
after(async () => {
  const cleanup = await Promise.allSettled(processes.map(stopProcess));
  try {
    assert.ok(
      cleanup.every((v) => v.status === "fulfilled"),
      "Every owned custody process must confirm exit",
    );
    for (const c of children) await stop(c);
  } finally {
    await app.end();
    await admin.end();
  }
  console.log(
    `Synthetic custody cleanup: ${processes.length} child processes exited; no key files created`,
  );
});

test("separate custody process seals leases and wires existing provider read and one explicitly approved local comment", async () => {
  const c = await connection();
  await provision(c);
  const e = await envelope(c);
  assert.equal(e.key_id, "synthetic-custody-key-v1");
  assert.ok(!JSON.stringify(e).includes(fixtureGithubToken));
  const service = new GithubConnectorService(
      scope,
      new LocalGithubAdapter(process.env.KXRA_GITHUB_FAKE_ORIGIN!, broker()),
    ),
    read = (await service.command({ action: "read", connection_id: c.id })) as {
      receipt: { id: string };
    };
  const w = githubWrite.parse(
    await service.command({
      action: "prepare",
      connection_id: c.id,
      read_id: read.receipt.id,
      note: "Approved process-separated synthetic custody",
    }),
  );
  const args = { connection_id: c.id, write_id: w.id };
  await assert.rejects(
    service.command({ action: "enqueue", ...args, digest: w.digest }),
  );
  for (const action of ["approve", "enqueue"])
    await service.command({ action, ...args, digest: w.digest });
  const n = posts();
  await service.command({ action: "dispatch", ...args });
  await service.command({ action: "dispatch", ...args });
  assert.equal(posts(), n + 1);
  const list = JSON.stringify(await service.list());
  for (const value of [custody.authorization, fixtureGithubToken, "ciphertext"])
    assert.ok(!list.includes(value));
  assert.deepEqual((await control("stats")).versions, [1]);
});
test("key rotation keeps old decrypt authority until explicit retirement; application reconstruction needs no key", async () => {
  const c = await connection();
  await provision(c);
  assert.equal(
    (await broker().resolve(c, "issues:read")).token,
    fixtureGithubToken,
  );
  await control("rotate");
  const c2 = await connection();
  await provision(c2);
  assert.equal((await envelope(c2)).key_id, "synthetic-custody-key-v2");
  assert.equal(
    (await broker().resolve(c, "issues:read")).token,
    fixtureGithubToken,
  );
  await assert.rejects(control("retire", { version: 2 }));
  await control("retire", { version: 1 });
  await assert.rejects(broker().resolve(c, "issues:read"));
  assert.equal(
    (await broker().resolve(c2, "issues:read")).token,
    fixtureGithubToken,
  );
});
test("custody process/key loss fails closed; restart never mints a replacement lease or dispatches", async () => {
  const c = await connection();
  await provision(c);
  const makeService = () =>
    new GithubConnectorService(
      scope,
      new LocalGithubAdapter(process.env.KXRA_GITHUB_FAKE_ORIGIN!, broker()),
    );
  const service = makeService(),
    read = (await service.command({ action: "read", connection_id: c.id })) as {
      receipt: { id: string };
    };
  const w = githubWrite.parse(
    await service.command({
      action: "prepare",
      connection_id: c.id,
      read_id: read.receipt.id,
      note: "Must not send after custody key loss",
    }),
  );
  const args = { connection_id: c.id, write_id: w.id };
  for (const action of ["approve", "enqueue"])
    await service.command({ action, ...args, digest: w.digest });
  const n = posts(),
    old = custody;
  await stop(old);
  custody = await start();
  await assert.rejects(broker().resolve(c, "issues:read"));
  const resumed = makeService();
  assert.equal(
    githubWrite.parse(await resumed.command({ action: "dispatch", ...args }))
      .state,
    "NOT_EXECUTED",
  );
  await resumed.command({ action: "dispatch", ...args });
  assert.equal(posts(), n);
  assert.equal((await control("stats")).seal, 0);
  const fresh = await connection();
  await provision(fresh);
  assert.equal(
    (await broker().resolve(fresh, "issues:read")).token,
    fixtureGithubToken,
  );
});
test("custody binds tenant/user/reference/version/session/scope/expiry and rejects ciphertext or key-label substitution", async () => {
  const c = await connection(),
    expiry = await provision(c),
    e = await envelope(c);
  for (const v of [
    { ...c, org_id: crypto.randomUUID() },
    { ...c, user_id: crypto.randomUUID() },
    { ...c, session_version: 2 },
  ])
    await assert.rejects(custody.client.open(v, "issues:read", expiry, e));
  await assert.rejects(custody.client.open(c, "issues:write", expiry, e));
  await assert.rejects(
    custody.client.open(
      c,
      "issues:read",
      new Date(Date.parse(expiry) - 1000).toISOString(),
      e,
    ),
  );
  await assert.rejects(
    custody.client.open(c, "issues:read", expiry, {
      ...e,
      key_id: "synthetic-custody-key-v2",
    }),
  );
  await assert.rejects(
    custody.client.open(c, "issues:read", expiry, {
      ...e,
      tag: "A".repeat(22),
    }),
  );
});
test("authority or exact lease changed during asynchronous decrypt never releases broker authority", async () => {
  for (const change of ["revoke", "session", "lease", "grant", "connection"]) {
    const c = await connection();
    await provision(c);
    await control("delay_open", { delay: 400 });
    const waiting = message(custody.process, (v) => v.type === "open_waiting"),
      pending = assert.rejects(
        broker().resolve(c, "issues:read"),
        /GRANT_UNAVAILABLE/,
      );
    await waiting;
    try {
      if (change === "revoke")
        await vault("revoke", { connection_id: c.id, grant_version: 1 });
      else if (change === "session")
        await admin.query(
          "update kxra.account_identities set session_version=2 where account_id=$1",
          [user],
        );
      else if (change === "grant")
        await scope("human", "rotate_fixture_grant", { connection_id: c.id });
      else if (change === "connection")
        await scope("human", "revoke", { connection_id: c.id });
      else
        await admin.query(
          "update kxra_private.github_vault_leases set expires_at=expires_at-interval '1 second' where connection_id=$1",
          [c.id],
        );
      await pending;
    } finally {
      if (change === "session")
        await admin.query(
          "update kxra.account_identities set session_version=1 where account_id=$1",
          [user],
        );
    }
  }
});
test("retirement fences an already-decrypted delayed response", async () => {
  const c = await connection();
  await provision(c);
  await control("rotate");
  await control("delay_open", { delay: 400 });
  const waiting = message(custody.process, (v) => v.type === "open_waiting"),
    pending = assert.rejects(broker().resolve(c, "issues:read"));
  await waiting;
  await control("retire", { version: 1 });
  await pending;
});

test("lease expiry while custody is responding cannot produce a valid token lease", async () => {
  const c = await connection();
  await provision(c, new Date(Date.now() + 300).toISOString());
  await control("delay_open", { delay: 500 });
  await assert.rejects(broker().resolve(c, "issues:read"));
});
test("fake custody requires ephemeral IPC-provided authorization, denies browser Origin, and exposes no administration route", async () => {
  for (const extra of [
    { authorization: "Bearer wrong" },
    {
      authorization: `Bearer ${custody.authorization}`,
      origin: "http://browser.invalid",
    },
  ]) {
    const r = await fetch(custody.origin + "/v1/synthetic/leases/open", {
      method: "POST",
      headers: new Headers({
        "content-type": "application/json",
        ...extra,
      } as Record<string, string>),
      body: "{}",
    });
    assert.equal(r.status, 403);
    assert.ok(!(await r.text()).includes(custody.authorization));
  }
  const r = await fetch(custody.origin + "/rotate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${custody.authorization}`,
    },
    body: "{}",
  });
  assert.equal(r.status, 403);
  for (const origin of [
    "https://api.github.com",
    "https://vault.example",
    "http://localhost:1234",
    "http://127.0.0.1.evil:1234",
    "http://user@127.0.0.1:1234",
    "http://127.0.0.1:1234/path",
  ])
    assert.throws(
      () => new LoopbackSyntheticCustody(origin, custody.authorization),
    );
});
test("malformed, oversized, redirected or mismatched custody replies fail without retry or foreign requests", async () => {
  const c = await connection(),
    expiry = new Date(Date.now() + 60000).toISOString(),
    real = globalThis.fetch;
  try {
    for (const make of [
      () =>
        new Response("{}", { headers: { "content-type": "application/json" } }),
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            pull(controller) {
              controller.enqueue(new Uint8Array());
            },
          }),
          { headers: { "content-type": "application/json" } },
        ),
      () =>
        new Response("x".repeat(2049), {
          headers: { "content-type": "application/json" },
        }),
      () =>
        new Response("", {
          status: 302,
          headers: { location: "https://vault.example" },
        }),
      () =>
        new Response(
          JSON.stringify({
            mode: "synthetic",
            request_id: crypto.randomUUID(),
            context_sha256: "0".repeat(64),
            token: fixtureGithubToken,
          }),
          { headers: { "content-type": "application/json" } },
        ),
    ]) {
      let requests = 0;
      globalThis.fetch = async (input, init) => {
        requests++;
        assert.equal(
          String(input),
          custody.origin + "/v1/synthetic/leases/seal",
        );
        assert.equal(init?.redirect, "manual");
        return make();
      };
      await assert.rejects(custody.client.seal(c, "issues:read", expiry));
      assert.equal(requests, 1);
    }
  } finally {
    globalThis.fetch = real;
  }
});
test("stalled custody response is bounded by an end-to-end deadline with no retry", async () => {
  let requests = 0;
  const server = http.createServer((req, res) => {
    requests++;
    req.resume();
    res.writeHead(200, { "content-type": "application/json" });
    res.flushHeaders();
    res.write(" ");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    const client = new LoopbackSyntheticCustody(
        `http://127.0.0.1:${address.port}`,
        custody.authorization,
      ),
      c = await connection(),
      start = performance.now();
    await assert.rejects(
      client.seal(c, "issues:read", new Date(Date.now() + 60000).toISOString()),
    );
    assert.ok(performance.now() - start < 2500);
    assert.equal(requests, 1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
test("ephemeral workload revocation fences delayed plaintext release", async () => {
  const previous = custody;
  custody = await start();
  try {
    const c = await connection();
    await provision(c);
    await control("delay_open", { delay: 400 });
    const waiting = message(custody.process, (v) => v.type === "open_waiting"),
      pending = assert.rejects(broker().resolve(c, "issues:read"));
    await waiting;
    await control("revoke_client");
    await pending;
    await assert.rejects(broker().resolve(c, "issues:read"));
  } finally {
    await stop(custody);
    custody = previous;
  }
});
test("owner IPC disconnect destroys custody availability rather than leaving a background service", async () => {
  const previous = custody,
    isolated = await start();
  const exited = new Promise<void>((r) =>
    isolated.process.once("exit", () => r()),
  );
  isolated.process.disconnect();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      exited,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(Error("Owner disconnect exit timed out")),
          5000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
  assert.equal(isolated.process.exitCode, 0);
  await assert.rejects(
    fetch(isolated.origin, { signal: AbortSignal.timeout(300) }),
  );
  assert.equal(custody, previous);
});

test("startup timeout or invalid handshake always stops the tracked child", async () => {
  for (const failure of ["validate", "timeout"] as const) {
    await assert.rejects(start(failure));
    const p = processes.at(-1)!;
    assert.ok(p.exitCode !== null || p.signalCode !== null);
  }
});
test("stalled authenticated request-body timeout leaves custody alive and key material usable", async () => {
  await new Promise<void>((resolve, reject) => {
    const request = http.request(custody.origin + "/v1/synthetic/leases/seal", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${custody.authorization}`,
      },
    });
    const timer = setTimeout(() => {
      request.destroy();
      reject(Error("Request body timeout did not close connection"));
    }, 3000);
    request.on("response", (r) => r.resume());
    request.on("error", () => {});
    request.on("close", () => {
      clearTimeout(timer);
      resolve();
    });
    request.write("{");
    request.flushHeaders();
  });
  assert.ok((await control("stats")).versions.length > 0);
  const c = await connection();
  await provision(c);
  assert.equal(
    (await broker().resolve(c, "issues:read")).token,
    fixtureGithubToken,
  );
});

test("custody client and broker remain disabled outside explicit local fixture mode", async () => {
  const prior = process.env.KXRA_AUTH_MODE;
  try {
    process.env.KXRA_AUTH_MODE = "supabase";
    assert.throws(
      () => new LoopbackSyntheticCustody(custody.origin, custody.authorization),
    );
  } finally {
    process.env.KXRA_AUTH_MODE = prior;
  }
});

test("owned child cleanup bounds escalation and marks unconfirmed exit without signaling unknown PIDs", async () => {
  for (const exitAt of ["SIGTERM", "SIGKILL", null]) {
    const child = new EventEmitter() as EventEmitter & {
      exitCode: number | null;
      signalCode: NodeJS.Signals | null;
      kill: (signal: NodeJS.Signals) => boolean;
    };
    child.exitCode = null;
    child.signalCode = null;
    const signals: string[] = [];
    let uncertain = false;
    child.kill = (signal) => {
      signals.push(String(signal));
      if (signal === exitAt)
        queueMicrotask(() => {
          child.signalCode = signal;
          child.emit("exit", null, signal);
        });
      return signal !== "SIGTERM"; // A false return is never accepted as exit evidence.
    };
    const stopped = await stopOwnedFixtureChild(child as ChildProcess, {
      termMs: 5,
      killMs: 5,
      onUncertain: () => {
        uncertain = true;
      },
    });
    assert.equal(stopped, exitAt !== null);
    assert.equal(uncertain, exitAt === null);
    assert.deepEqual(
      signals,
      exitAt === "SIGTERM" ? ["SIGTERM"] : ["SIGTERM", "SIGKILL"],
    );
    assert.equal(child.listenerCount("exit"), 0);
    assert.equal(child.listenerCount("error"), 0);
  }
});
