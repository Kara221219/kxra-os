import {
  mintConnectorCapability,
  verifyConnectorCapability,
} from "../../packages/connectors/agent-capability";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import { runtimeFile, testOrigin } from "../support/runtime";
import { fixtureUsers, signSession } from "../../packages/authz/session";
import { localModeConfiguration } from "../../packages/authz/local-guard";
import { connectorCommand } from "../../packages/connectors/contracts";

assert.ok(localModeConfiguration(process.env) && !process.env.VERCEL_ENV);
const config = JSON.parse(
  fs.readFileSync(runtimeFile("database.json"), "utf8"),
);
assert.ok(config.host.startsWith("/") && !config.password);
const pool = new pg.Pool(config);
const admin = new pg.Pool({ ...config, user: os.userInfo().username });
const org = "10000000-0000-4000-8000-000000000001";
const created: string[] = [];
after(async () => {
  try {
    await admin.query(
      "delete from kxra_private.connector_notes where connector_id=any($1::uuid[])",
      [created],
    );
    await admin.query(
      "delete from kxra_private.connector_requests where connector_id=any($1::uuid[])",
      [created],
    );
    await admin.query(
      "delete from kxra_private.customer_connectors where id=any($1::uuid[])",
      [created],
    );
  } finally {
    await pool.end();
    await admin.end();
  }
});
async function sql(
  text: string,
  values: unknown[] = [],
  user = fixtureUsers.owner,
  tenant = org,
  mode = "fixture",
) {
  const db = await pool.connect();
  try {
    await db.query("begin");
    await db.query("set local role authenticated");
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.kxra.org_id',$2,true),set_config('request.kxra.execution_mode',$3,true),set_config('request.jwt.claims',$4,true)",
      [
        user,
        tenant,
        mode,
        JSON.stringify({
          sub: user,
          aal: "aal2",
          auth_time: Math.floor(Date.now() / 1000),
          session_version: 1,
        }),
      ],
    );
    await db.query(
      "select set_config('request.kxra.connector_actor','human',true)",
    );
    const result = await db.query(text, values);
    await db.query("commit");
    return result;
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    db.release();
  }
}
async function rpc(
  action: string,
  input: unknown,
  user = fixtureUsers.owner,
  tenant = org,
  mode = "fixture",
) {
  return (
    await sql(
      "select kxra.customer_connector($1,$2::jsonb) result",
      [action, JSON.stringify(input)],
      user,
      tenant,
      mode,
    )
  ).rows[0].result;
}
async function connect(allow_write = true) {
  const c = await rpc("connect", { allow_write });
  created.push(c.id);
  return c.id as string;
}
async function proposal(
  connector_id: string,
  note = "Synthetic customer note",
) {
  const read = await rpc("read", { connector_id });
  return rpc("prepare", { connector_id, read_id: read.read_id, note });
}

test("database scopes connections to current active tenant and user; no direct table mutation", async () => {
  const id = await connect();
  for (const [user, tenant] of [
    [fixtureUsers.partner, org],
    [fixtureUsers.revoked, org],
    [fixtureUsers.owner, "10000000-0000-4000-8000-000000000002"],
  ]) {
    await assert.rejects(rpc("read", { connector_id: id }, user, tenant));
    await assert.rejects(rpc("revoke", { connector_id: id }, user, tenant));
  }
  for (const table of [
    "customer_connectors",
    "connector_requests",
    "connector_notes",
  ]) {
    await assert.rejects(
      sql(`select * from kxra_private.${table}`),
      /permission denied/,
    );
    await assert.rejects(
      sql(`delete from kxra_private.${table}`),
      /permission denied/,
    );
  }
  await assert.rejects(rpc("list", {}, fixtureUsers.owner, org, "hosted"));
  assert.equal(
    (
      await admin.query(
        "select has_function_privilege('anon','kxra.customer_connector(text,jsonb)','execute') allowed",
      )
    ).rows[0].allowed,
    false,
  );
  await assert.rejects(
    rpc("connect", { allow_write: true, user_id: fixtureUsers.partner }),
  );
  await assert.rejects(rpc("connect", { allow_write: null }));
});

test("scoped read -> immutable proposal -> digest approval -> atomic single-use synthetic write", async () => {
  const connector_id = await connect();
  const p = await proposal(connector_id);
  assert.equal(p.state, "PENDING");
  assert.deepEqual(p.payload, {
    tool: "notes.append",
    note: "Synthetic customer note",
  });
  await assert.rejects(rpc("execute", { connector_id, request_id: p.id }));
  await assert.rejects(
    rpc("approve", { connector_id, request_id: p.id, digest: "0".repeat(64) }),
  );
  await assert.rejects(
    rpc(
      "approve",
      { connector_id, request_id: p.id, digest: p.digest },
      fixtureUsers.partner,
    ),
  );
  await rpc("approve", { connector_id, request_id: p.id, digest: p.digest });
  const results = await Promise.allSettled([
    rpc("execute", { connector_id, request_id: p.id }),
    rpc("execute", { connector_id, request_id: p.id }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const read = await rpc("read", { connector_id });
  assert.equal(read.notes.length, 1);
  assert.equal(read.untrusted_content, true);
  assert.equal(read.notes[0].note, p.payload.note);
});

test("read-only grants, cross-connection receipts, expiry, rejection and stale snapshots fail closed", async () => {
  const connector_id = await connect(false);
  const read = await rpc("read", { connector_id });
  await assert.rejects(
    rpc("prepare", { connector_id, read_id: read.read_id, note: "denied" }),
  );
  const writable = await connect();
  await assert.rejects(
    rpc("prepare", {
      connector_id: writable,
      read_id: (await rpc("read", { connector_id: writable })).read_id,
      note: " ".repeat(3000) + "x",
    }),
  );
  await assert.rejects(
    rpc("prepare", {
      connector_id: writable,
      read_id: read.read_id,
      note: "denied",
    }),
  );
  const p = await proposal(writable),
    stale = await proposal(writable);
  await rpc("approve", {
    connector_id: writable,
    request_id: p.id,
    digest: p.digest,
  });
  await rpc("execute", { connector_id: writable, request_id: p.id });
  await assert.rejects(
    rpc("approve", {
      connector_id: writable,
      request_id: stale.id,
      digest: stale.digest,
    }),
  );
  const rejected = await proposal(writable);
  await rpc("reject", { connector_id: writable, request_id: rejected.id });
  await assert.rejects(
    rpc("approve", {
      connector_id: writable,
      request_id: rejected.id,
      digest: rejected.digest,
    }),
  );
  const expired = await proposal(writable);
  await admin.query(
    "update kxra_private.connector_requests set expires_at=now()-interval '1 second' where id=$1",
    [expired.id],
  );
  await assert.rejects(
    rpc("approve", {
      connector_id: writable,
      request_id: expired.id,
      digest: expired.digest,
    }),
  );
  await admin.query(
    "update kxra_private.customer_connectors set expires_at=now()-interval '1 second' where id=$1",
    [writable],
  );
  await assert.rejects(rpc("read", { connector_id: writable }));
});

test("revocation invalidates approved writes and cannot reactivate; reconnect has a new identity", async () => {
  const connector_id = await connect();
  const p = await proposal(connector_id);
  await rpc("approve", { connector_id, request_id: p.id, digest: p.digest });
  await rpc("revoke", { connector_id });
  await rpc("revoke", { connector_id });
  await assert.rejects(rpc("execute", { connector_id, request_id: p.id }));
  await assert.rejects(rpc("read", { connector_id }));
  const fresh = await connect();
  assert.notEqual(fresh, connector_id);
  await assert.rejects(
    rpc("execute", { connector_id: fresh, request_id: p.id }),
  );
});

const secret = fs.readFileSync(runtimeFile("session-key"), "utf8");
async function http(
  input?: unknown,
  user: string | null = fixtureUsers.owner,
  origin = testOrigin,
) {
  const headers: Record<string, string> = {};
  if (user) headers.cookie = `kxra_local_session=${signSession(user, secret)}`;
  if (input !== undefined) {
    headers.origin = origin;
    headers["content-type"] = "application/json";
  }
  return fetch(`${testOrigin}/api/customer-connectors`, {
    method: input === undefined ? "GET" : "POST",
    headers,
    body: input === undefined ? undefined : JSON.stringify(input),
    redirect: "manual",
    signal: AbortSignal.timeout(30000),
  });
}
test("HTTP authenticates, rejects foreign origins and spoofed fields, and returns private responses", async () => {
  const unauth = await http(undefined, null);
  assert.equal(unauth.status, 401);
  assert.equal(
    (
      await http(
        { action: "connect", allow_write: true },
        fixtureUsers.owner,
        "https://foreign.invalid",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await http({
        action: "connect",
        allow_write: true,
        user_id: fixtureUsers.partner,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await http({
        action: "connect",
        allow_write: true,
        provider: "https://foreign.invalid",
      })
    ).status,
    400,
  );
  const response = await http({ action: "connect", allow_write: true });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") || "", /no-store/);
  const c = (await response.json()).result;
  created.push(c.id);
  assert.equal(c.user_id, fixtureUsers.owner);
  assert.equal(c.org_id, org);
  assert.equal(
    (await http({ action: "read", connector_id: c.id }, fixtureUsers.partner))
      .status,
    403,
  );
  const read = (
    await (await http({ action: "read", connector_id: c.id })).json()
  ).result;
  const p = (
    await (
      await http({
        action: "prepare",
        connector_id: c.id,
        read_id: read.read_id,
        note: "HTTP synthetic write",
      })
    ).json()
  ).result;
  assert.equal(
    (await http({ action: "execute", connector_id: c.id, request_id: p.id }))
      .status,
    409,
  );
  assert.equal(
    (
      await http({
        action: "approve",
        connector_id: c.id,
        request_id: p.id,
        digest: p.digest,
      })
    ).status,
    200,
  );
  assert.equal(
    (await http({ action: "execute", connector_id: c.id, request_id: p.id }))
      .status,
    200,
  );
  assert.equal(
    (await http({ action: "execute", connector_id: c.id, request_id: p.id }))
      .status,
    409,
  );
});

test("tool contract accepts no identity, endpoint, credentials, payload override or implicit write grant", () => {
  assert.equal(
    connectorCommand.safeParse({ action: "connect" }).success,
    false,
  );
  assert.equal(
    connectorCommand.safeParse({
      action: "connect",
      allow_write: true,
      token: "synthetic",
    }).success,
    false,
  );
  assert.equal(
    connectorCommand.safeParse({
      action: "execute",
      connector_id: crypto.randomUUID(),
      request_id: crypto.randomUUID(),
      note: "replacement",
    }).success,
    false,
  );
});

async function agentHttp(capability: string, input: unknown) {
  return fetch(`${testOrigin}/api/customer-connectors/agent`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${capability}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(30000),
  });
}
test("agent capability permits read/prepare/execute only, bound to connection, tenant, user and human approval", async () => {
  const connected = await (
    await http({ action: "connect", allow_write: true })
  ).json();
  const connector_id = connected.result.id;
  created.push(connector_id);
  const token = connected.agent_capability;
  assert.equal(
    (await agentHttp(token + "tampered", { action: "read", connector_id }))
      .status,
    401,
  );
  const other = await connect();
  assert.equal(
    (await agentHttp(token, { action: "read", connector_id: other })).status,
    403,
  );
  const read = (
    await (await agentHttp(token, { action: "read", connector_id })).json()
  ).result;
  assert.ok(read.read_id);
  const p = (
    await (
      await agentHttp(token, {
        action: "prepare",
        connector_id,
        read_id: read.read_id,
        note: "Agent proposal",
      })
    ).json()
  ).result;
  for (const command of [
    { action: "approve", connector_id, request_id: p.id, digest: p.digest },
    { action: "connect", allow_write: true },
    { action: "revoke", connector_id },
  ])
    assert.equal((await agentHttp(token, command)).status, 403);
  assert.equal(
    (
      await agentHttp(token, {
        action: "execute",
        connector_id,
        request_id: p.id,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await http({
        action: "approve",
        connector_id,
        request_id: p.id,
        digest: p.digest,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await agentHttp(token, {
        action: "execute",
        connector_id,
        request_id: p.id,
      })
    ).status,
    200,
  );
  await http({ action: "revoke", connector_id });
  assert.equal(
    (await agentHttp(token, { action: "read", connector_id })).status,
    409,
  );
});

test("capability expires, rejects wrong secret and cannot be extended by tampering", () => {
  const now = Date.now(),
    claims = {
      user_id: fixtureUsers.owner,
      org_id: org,
      connector_id: crypto.randomUUID(),
      session_version: 1,
    };
  const token = mintConnectorCapability(claims, secret, now);
  assert.ok(verifyConnectorCapability(token, secret, now));
  assert.equal(verifyConnectorCapability(token, secret, now + 300000), null);
  assert.equal(verifyConnectorCapability(token, "x".repeat(96), now), null);
  assert.equal(verifyConnectorCapability(token, secret, now - 1), null);
});
test("expiry is checked after a blocked execution obtains the connection lock", async () => {
  const connector_id = await connect(),
    p = await proposal(connector_id);
  await rpc("approve", { connector_id, request_id: p.id, digest: p.digest });
  const locker = await admin.connect();
  try {
    await locker.query("begin");
    await locker.query(
      "update kxra_private.customer_connectors set expires_at=clock_timestamp()+interval '300 milliseconds' where id=$1",
      [connector_id],
    );
    // Attach rejection immediately, before releasing the lock.
    const denied = assert.rejects(
      rpc("execute", { connector_id, request_id: p.id }),
      /Connector inactive/,
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    await locker.query("commit");
    await denied;
  } finally {
    await locker.query("rollback");
    locker.release();
  }
});
test("concurrent revocation and execution serialize; no writes follow revocation", async () => {
  const connector_id = await connect(),
    p = await proposal(connector_id);
  await rpc("approve", { connector_id, request_id: p.id, digest: p.digest });
  const results = await Promise.allSettled([
    rpc("revoke", { connector_id }),
    rpc("execute", { connector_id, request_id: p.id }),
  ]);
  assert.equal(results[0].status, "fulfilled");
  await assert.rejects(rpc("execute", { connector_id, request_id: p.id }));
  const count = Number(
    (
      await admin.query(
        "select count(*) from kxra_private.connector_notes where connector_id=$1",
        [connector_id],
      )
    ).rows[0].count,
  );
  assert.equal(count, results[1].status === "fulfilled" ? 1 : 0);
});

test("agent capability cannot approve through customer route and account session revocation invalidates it", async () => {
  const connected = await (
    await http({ action: "connect", allow_write: true })
  ).json();
  const connector_id = connected.result.id;
  created.push(connector_id);
  const token = connected.agent_capability;
  const response = await fetch(`${testOrigin}/api/customer-connectors`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      origin: testOrigin,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      action: "approve",
      connector_id,
      request_id: crypto.randomUUID(),
      digest: "0".repeat(64),
    }),
  });
  assert.equal(response.status, 401);
  const original = (
    await admin.query(
      "select session_version from kxra.account_identities where account_id=$1",
      [fixtureUsers.owner],
    )
  ).rows[0].session_version;
  try {
    await admin.query(
      "update kxra.account_identities set session_version=session_version+1 where account_id=$1",
      [fixtureUsers.owner],
    );
    assert.equal(
      (await agentHttp(token, { action: "read", connector_id })).status,
      403,
    );
  } finally {
    await admin.query(
      "update kxra.account_identities set session_version=$2 where account_id=$1",
      [fixtureUsers.owner, original],
    );
  }
});
