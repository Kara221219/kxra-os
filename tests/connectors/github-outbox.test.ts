import { after, afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import pg from "pg";
import { chromium, expect } from "@playwright/test";
import { fixtureUsers, signSession } from "../../packages/authz/session";
import { localModeConfiguration } from "../../packages/authz/local-guard";
import {
  GithubConnectorService,
  LocalGithubAdapter,
  FixtureCredentialBroker,
  type ScopeCall,
} from "../../packages/connectors/github";
import {
  githubConnection,
  githubWrite,
  githubList,
  type GithubConnection,
  type GithubWrite,
} from "../../packages/connectors/github-contracts";
import { runtimeFile, testOrigin } from "../support/runtime";
assert.ok(localModeConfiguration(process.env) && !process.env.VERCEL_ENV);
const cfg = JSON.parse(fs.readFileSync(runtimeFile("database.json"), "utf8"));
assert.ok(cfg.host.startsWith("/") && !cfg.password);
const app = new pg.Pool(cfg),
  admin = new pg.Pool({ ...cfg, user: os.userInfo().username });
const origin = process.env.KXRA_GITHUB_FAKE_ORIGIN!;
const owner = fixtureUsers.owner,
  org = "10000000-0000-4000-8000-000000000001";
let ids: string[] = [];
const retained = new Set<string>();
const storePath = runtimeFile("github-provider-store.json");
const store = () => JSON.parse(fs.readFileSync(storePath, "utf8"));
function mode(value: string) {
  fs.writeFileSync(runtimeFile("github-provider-mode"), value, { mode: 0o600 });
}
function makeScope(user = owner, tenant = org): ScopeCall {
  return async (kind, action, input) => {
    const db = await app.connect();
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
        [user, tenant, kind],
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
}
const scope = makeScope(),
  service = new GithubConnectorService(scope, new LocalGithubAdapter(origin));
async function cmd(input: unknown, s = service) {
  return s.command(input);
}
async function connect(write = true, s = service) {
  const c = githubConnection.parse(
    await cmd({ action: "connect_fixture", allow_write: write }, s),
  );
  ids.push(c.id);
  return c;
}
async function proposal(
  c: GithubConnection,
  s = service,
  note = "Exact approved local GitHub comment",
) {
  const result = (await cmd({ action: "read", connection_id: c.id }, s)) as {
    receipt: { id: string };
  };
  return githubWrite.parse(
    await cmd(
      {
        action: "prepare",
        connection_id: c.id,
        read_id: result.receipt.id,
        note,
      },
      s,
    ),
  );
}
async function queue(c: GithubConnection, s = service) {
  const w = await proposal(c, s);
  await cmd(
    {
      action: "approve",
      connection_id: c.id,
      write_id: w.id,
      digest: w.digest,
    },
    s,
  );
  return githubWrite.parse(
    await cmd(
      {
        action: "enqueue",
        connection_id: c.id,
        write_id: w.id,
        digest: w.digest,
      },
      s,
    ),
  );
}
const args = (w: GithubWrite) => ({
  connection_id: w.connection_id,
  write_id: w.id,
});
async function state(w: GithubWrite) {
  return (
    await admin.query(
      "select to_jsonb(w) result from kxra_private.github_writes w where id=$1",
      [w.id],
    )
  ).rows[0].result as GithubWrite;
}
beforeEach(() => {
  mode("normal");
  fs.writeFileSync(
    storePath,
    JSON.stringify({ comments: [], posts: 0, nextId: 1 }),
    { mode: 0o600 },
  );
});
afterEach(async () => {
  mode("normal");
  const remove = ids.filter((id) => !retained.has(id));
  if (remove.length) {
    await admin.query(
      "delete from kxra_private.github_receipts where write_id in(select id from kxra_private.github_writes where connection_id=any($1::uuid[]))",
      [remove],
    );
    await admin.query(
      "delete from kxra_private.github_writes where connection_id=any($1::uuid[])",
      [remove],
    );
    await admin.query(
      "delete from kxra_private.github_reads where connection_id=any($1::uuid[])",
      [remove],
    );
    await admin.query(
      "delete from kxra_private.github_connections where id=any($1::uuid[])",
      [remove],
    );
  }
  ids = [];
});
after(async () => {
  await app.end();
  await admin.end();
});

test("GitHub outbox binds exact scope and payload, rejects writes without fresh reads/approval, and dispatches only once", async () => {
  const c = await connect(),
    w = await proposal(c);
  assert.equal(w.payload.org_id, org);
  assert.equal(w.payload.user_id, owner);
  assert.equal(w.payload.connection_id, c.id);
  assert.match(w.payload.body, new RegExp(`kxra-write:${w.id}`));
  await assert.rejects(
    cmd({ action: "enqueue", ...args(w), digest: w.digest }),
  );
  await assert.rejects(
    cmd({ action: "approve", ...args(w), digest: "0".repeat(64) }),
  );
  await assert.rejects(
    scope("worker", "approve", { ...args(w), digest: w.digest }),
  );
  await assert.rejects(
    cmd({ action: "dispatch", ...args(w), body: "replacement" }),
  );
  await cmd({ action: "approve", ...args(w), digest: w.digest });
  await Promise.all([
    cmd({ action: "enqueue", ...args(w), digest: w.digest }),
    cmd({ action: "enqueue", ...args(w), digest: w.digest }),
  ]);
  await Promise.all([
    cmd({ action: "dispatch", ...args(w) }),
    cmd({ action: "dispatch", ...args(w) }),
  ]);
  assert.equal((await state(w)).state, "ACCEPTED");
  assert.equal(store().posts, 1);
  assert.equal(store().comments.length, 1);
  await cmd({ action: "dispatch", ...args(w) });
  assert.equal(store().posts, 1);
  const list = githubList.parse(await service.list());
  assert.ok(list.receipts.some((r) => r.event === "ACCEPTED"));
  assert.equal(
    JSON.stringify(list).includes("kxra-local-github-fixture-only"),
    false,
  );
});

test("rejection before dispatch, definite local nonexecution, provider rejection and ambiguous5xx remain distinct", async () => {
  const c = await connect();
  const pre = await queue(c);
  mode("preflight-reject");
  const p = githubWrite.parse(await cmd({ action: "dispatch", ...args(pre) }));
  assert.equal(p.state, "NOT_EXECUTED");
  assert.equal(p.reason, "PROVIDER_PREFLIGHT_REJECTED");
  assert.equal(store().posts, 0);
  mode("normal");
  const rejected = await queue(c);
  mode("post-reject");
  assert.equal(
    githubWrite.parse(await cmd({ action: "dispatch", ...args(rejected) }))
      .state,
    "REJECTED",
  );
  assert.equal(store().posts, 1);
  mode("normal");
  const expired = await queue(c);
  await admin.query(
    "update kxra_private.github_writes set expires_at=clock_timestamp()-interval '1 second' where id=$1",
    [expired.id],
  );
  assert.equal(
    githubWrite.parse(await cmd({ action: "dispatch", ...args(expired) }))
      .state,
    "NOT_EXECUTED",
  );
  assert.equal(store().posts, 1);
  const ambiguous = await queue(c);
  mode("post-500");
  assert.equal(
    githubWrite.parse(await cmd({ action: "dispatch", ...args(ambiguous) }))
      .state,
    "UNCERTAIN",
  );
  assert.equal(store().posts, 2);
  assert.equal(store().comments.length, 0);
  mode("normal");
  assert.equal(
    githubWrite.parse(await cmd({ action: "reconcile", ...args(ambiguous) }))
      .state,
    "UNCERTAIN",
  );
  await cmd({ action: "dispatch", ...args(ambiguous) });
  assert.equal(store().posts, 2);
});

test("lost/malformed acknowledgements reconcile by exact author/body/target read and never POST again", async () => {
  for (const m of [
    "drop-after-commit",
    "malformed-ack",
    "oversized-ack",
    "wrong-author-ack",
  ]) {
    const c = await connect(),
      w = await queue(c);
    const before = store().posts;
    mode(m);
    assert.equal(
      githubWrite.parse(await cmd({ action: "dispatch", ...args(w) })).state,
      "UNCERTAIN",
    );
    assert.equal(store().posts, before + 1);
    mode("normal");
    assert.equal(
      githubWrite.parse(await cmd({ action: "reconcile", ...args(w) })).state,
      "ACCEPTED",
    );
    await cmd({ action: "dispatch", ...args(w) });
    assert.equal(store().posts, before + 1);
  }
});

test("duplicate and reordered receipt delivery is idempotent and cannot downgrade acceptance or cross attempts", async () => {
  const c = await connect(),
    w = await queue(c);
  await cmd({ action: "dispatch", ...args(w) });
  const done = await state(w),
    comment = store().comments[0];
  const evidence = {
    status: 201,
    comment_id: comment.id,
    body_sha256: crypto.createHash("sha256").update(comment.body).digest("hex"),
    author_id: 202,
    issue_url: comment.issue_url,
  };
  const result = {
    ...args(w),
    attempt_id: done.attempt_id,
    digest: w.digest,
    outcome: "ACCEPTED",
    evidence,
  };
  await scope("worker", "record_outcome", result);
  await scope("worker", "record_outcome", result);
  await scope("worker", "record_outcome", {
    ...result,
    outcome: "UNCERTAIN",
    evidence: { reason: "LATE_LOST_ACK" },
  });
  assert.equal((await state(w)).state, "ACCEPTED");
  assert.equal(
    Number(
      (
        await admin.query(
          "select count(*) from kxra_private.github_receipts where write_id=$1 and event='ACCEPTED'",
          [w.id],
        )
      ).rows[0].count,
    ),
    1,
  );
  await assert.rejects(
    scope("worker", "record_outcome", {
      ...result,
      attempt_id: crypto.randomUUID(),
    }),
  );
  await assert.rejects(
    scope("worker", "record_outcome", {
      ...result,
      evidence: { ...evidence, author_id: 999 },
    }),
  );
});

test("previously queued writes across connections are held behind dispatch uncertainty", async () => {
  const c1 = await connect(),
    c2 = await connect(),
    w1 = await queue(c1),
    w2 = await queue(c2);
  mode("drop-after-commit");
  await cmd({ action: "dispatch", ...args(w1) });
  assert.equal((await state(w1)).state, "UNCERTAIN");
  mode("normal");
  const held = githubWrite.parse(
    await cmd({ action: "dispatch", ...args(w2) }),
  );
  assert.equal(held.state, "QUEUED");
  assert.equal(held.reason, "HELD_UNRESOLVED_PRIOR_WRITE");
  assert.equal(store().posts, 1);
  await assert.rejects(proposal(c2));
  await cmd({ action: "reconcile", ...args(w1) });
  await cmd({ action: "dispatch", ...args(w2) });
  assert.equal(store().posts, 2);
  assert.equal((await state(w2)).state, "ACCEPTED");
});

test("cancel/revoke before claim prevents sending; revocation after claim records the possible completed effect", async () => {
  const c = await connect(),
    w = await queue(c);
  await cmd({ action: "cancel", ...args(w) });
  await cmd({ action: "dispatch", ...args(w) });
  assert.equal(store().posts, 0);
  assert.equal((await state(w)).state, "CANCELLED");
  const c2 = await connect(),
    w2 = await queue(c2);
  await cmd({ action: "revoke", connection_id: c2.id });
  await cmd({ action: "dispatch", ...args(w2) });
  assert.equal(store().posts, 0);
  const beforeClaimConnection = await connect(),
    beforeClaimWrite = await queue(beforeClaimConnection);
  let allowClaim!: () => void, claimStarted!: () => void;
  const claimReady = new Promise<void>((r) => (claimStarted = r)),
    claimGate = new Promise<void>((r) => (allowClaim = r));
  const beforeClaimScope: ScopeCall = async (kind, action, input) => {
    if (action === "claim") {
      claimStarted();
      await claimGate;
    }
    return scope(kind, action, input);
  };
  const beforeService = new GithubConnectorService(
    beforeClaimScope,
    new LocalGithubAdapter(origin),
  );
  const beforePending = cmd(
    { action: "dispatch", ...args(beforeClaimWrite) },
    beforeService,
  );
  await claimReady;
  await cmd({ action: "revoke", connection_id: beforeClaimConnection.id });
  allowClaim();
  assert.equal(githubWrite.parse(await beforePending).state, "CANCELLED");
  assert.equal(store().posts, 0);
  const c3 = await connect(),
    w3 = await queue(c3);
  let release!: () => void, claimed!: () => void;
  const ready = new Promise<void>((r) => (claimed = r)),
    gate = new Promise<void>((r) => (release = r));
  const delayed: ScopeCall = async (kind, action, input) => {
    const result = await scope(kind, action, input);
    if (action === "claim" && (result as { claimed?: boolean }).claimed) {
      claimed();
      await gate;
    }
    return result;
  };
  const delayedService = new GithubConnectorService(
    delayed,
    new LocalGithubAdapter(origin),
  );
  const pending = cmd({ action: "dispatch", ...args(w3) }, delayedService);
  await ready;
  await cmd({ action: "revoke", connection_id: c3.id });
  release();
  assert.equal(githubWrite.parse(await pending).state, "ACCEPTED");
  assert.equal((await state(w3)).cancel_requested, true);
  assert.equal(store().posts, 1);
});

test("grant rotation, read-only permissions, expired grants and account-session revocation deny old authority", async () => {
  const ro = await connect(false);
  await assert.rejects(proposal(ro));
  const c = await connect(),
    w = await queue(c);
  await cmd({ action: "rotate_fixture_grant", connection_id: c.id });
  await cmd({ action: "dispatch", ...args(w) });
  assert.equal((await state(w)).state, "CANCELLED");
  const fresh = await connect(),
    expired = await queue(fresh);
  await admin.query(
    "update kxra_private.github_connections set expires_at=clock_timestamp()-interval '1 second' where id=$1",
    [fresh.id],
  );
  await cmd({ action: "dispatch", ...args(expired) });
  assert.equal((await state(expired)).state, "NOT_EXECUTED");
  const session = await connect(),
    sessionWrite = await queue(session);
  const original = (
    await admin.query(
      "select session_version from kxra.account_identities where account_id=$1",
      [owner],
    )
  ).rows[0].session_version;
  try {
    await admin.query(
      "update kxra.account_identities set session_version=session_version+1 where account_id=$1",
      [owner],
    );
    await cmd({ action: "dispatch", ...args(sessionWrite) });
    assert.equal((await state(sessionWrite)).state, "NOT_EXECUTED");
  } finally {
    await admin.query(
      "update kxra.account_identities set session_version=$2 where account_id=$1",
      [owner, original],
    );
  }
  assert.equal(store().posts, 0);
});

test("tampered approved payload and foreign tenant/user/ref scopes cannot dispatch or read outcomes", async () => {
  const c = await connect(),
    w = await queue(c);
  await admin.query(
    "update kxra_private.github_writes set payload=jsonb_set(payload,'{body}',to_jsonb('tampered '||(payload->>'body'))) where id=$1",
    [w.id],
  );
  await assert.rejects(cmd({ action: "dispatch", ...args(w) }));
  assert.equal(store().posts, 0);
  const otherOrg = crypto.randomUUID(),
    otherUser = crypto.randomUUID();
  await admin.query(
    "insert into kxra.organisations(id,name,slug,organisation_kind) values($1,'GitHub fixture tenant',$2,'CUSTOMER')",
    [otherOrg, `github-${otherOrg}`],
  );
  await admin.query(
    "insert into kxra.account_identities(account_id,auth_provider,auth_subject,state,email_verified_at) values($1,'FIXTURE',$2,'ACTIVE',clock_timestamp())",
    [otherUser, `github-${otherUser}`],
  );
  await admin.query(
    "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_ADMIN','CUSTOMER','ACTIVE','Fixture owner','LOCAL_GITHUB_TEST')",
    [otherOrg, otherUser],
  );
  const foreignScope = makeScope(otherUser, otherOrg),
    foreign = new GithubConnectorService(
      foreignScope,
      new LocalGithubAdapter(origin),
    ),
    c2 = await connect(true, foreign);
  assert.equal(githubList.parse(await foreign.list()).writes.length, 0);
  await assert.rejects(cmd({ action: "dispatch", ...args(w) }, foreign));
  await assert.rejects(scope("worker", "context", { connection_id: c2.id }));
  await assert.rejects(
    foreignScope("worker", "context", { connection_id: c.id }),
  );
  const broker = new FixtureCredentialBroker();
  await assert.rejects(
    broker.resolve(
      { ...c, credential_ref: `fixture:github:${c2.id}:v1` },
      "issues:write",
    ),
  );
  await assert.rejects(makeScope(owner, otherOrg)("human", "list", {}));
  const db = await app.connect();
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
    for (const name of [
      "github_connections",
      "github_reads",
      "github_writes",
      "github_receipts",
    ]) {
      await db.query("savepoint denied");
      await assert.rejects(db.query(`select * from kxra_private.${name}`));
      await db.query("rollback to savepoint denied");
    }
    await db.query("rollback");
  } finally {
    db.release();
  }
});

test("incomplete, malformed, foreign or duplicate provider read evidence never proves nonexecution or enables replay", async () => {
  const c = await connect(),
    w = await queue(c);
  mode("post-500");
  await cmd({ action: "dispatch", ...args(w) });
  mode("normal");
  const base = {
    id: 1,
    body: w.payload.body,
    user: { id: 999 },
    issue_url: "https://api.github.com/repos/fixture-org/fixture-repo/issues/1",
    created_at: new Date().toISOString(),
  };
  const provider = store();
  provider.comments = [base];
  fs.writeFileSync(storePath, JSON.stringify(provider));
  assert.equal(
    githubWrite.parse(await cmd({ action: "reconcile", ...args(w) })).state,
    "UNCERTAIN",
  );
  provider.comments = Array.from({ length: 301 }, (_, i) => ({
    ...base,
    id: i + 1,
    user: { id: 202 },
    body: i === 300 ? w.payload.body : "Other fixture comment",
  }));
  fs.writeFileSync(storePath, JSON.stringify(provider));
  assert.equal(
    githubWrite.parse(await cmd({ action: "reconcile", ...args(w) })).state,
    "UNCERTAIN",
  );
  provider.comments = [
    { ...base, user: { id: 202 } },
    { ...base, id: 2, user: { id: 202 } },
  ];
  fs.writeFileSync(storePath, JSON.stringify(provider));
  assert.equal(
    githubWrite.parse(await cmd({ action: "reconcile", ...args(w) })).state,
    "UNCERTAIN",
  );
  mode("read-malformed");
  assert.equal(
    githubWrite.parse(await cmd({ action: "reconcile", ...args(w) })).state,
    "UNCERTAIN",
  );
  assert.equal(store().posts, 1);
  await cmd({ action: "revoke", connection_id: c.id });
  assert.equal(
    githubWrite.parse(await cmd({ action: "reconcile", ...args(w) })).state,
    "UNCERTAIN",
  );
  assert.equal(store().posts, 1);
});

test("redirected provider write remains uncertain and never follows another origin", async () => {
  const c = await connect(),
    w = await queue(c);
  mode("post-redirect");
  const original = globalThis.fetch;
  const foreign: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (!url.startsWith(origin + "/")) {
      foreign.push(url);
      throw Error("External request forbidden");
    }
    return original(input, init);
  };
  try {
    assert.equal(
      githubWrite.parse(await cmd({ action: "dispatch", ...args(w) })).state,
      "UNCERTAIN",
    );
    assert.equal(store().posts, 1);
    assert.equal(store().comments.length, 0);
    assert.deepEqual(foreign, []);
  } finally {
    globalThis.fetch = original;
  }
});

test(
  "actual worker process crash after provider commit survives restart with no automatic POST replay",
  { timeout: 30000 },
  async () => {
    const c = await connect(),
      w = await queue(c);
    mode("hang-after-commit");
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/github-connector-worker-fixture.ts",
        "dispatch",
        c.id,
        w.id,
      ],
      { env: process.env, stdio: "ignore" },
    );
    try {
      for (let i = 0; i < 150 && store().posts === 0; i++) {
        assert.equal(
          child.exitCode,
          null,
          "Fixture worker exited before dispatch",
        );
        await new Promise((r) => setTimeout(r, 20));
      }
      assert.equal(store().comments.length, 1);
      child.kill("SIGKILL");
      await new Promise((resolve) => child.once("exit", resolve));
    } finally {
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL");
    }
    assert.equal((await state(w)).state, "DISPATCHING");
    await admin.query(
      "update kxra_private.github_writes set dispatch_at=clock_timestamp()-interval '10 seconds' where id=$1",
      [w.id],
    );
    async function restart(action: string) {
      const p = spawn(
        process.execPath,
        [
          "--import",
          "tsx",
          "scripts/github-connector-worker-fixture.ts",
          action,
          c.id,
          w.id,
        ],
        { env: process.env, stdio: "ignore" },
      );
      return new Promise<number | null>((resolve) => p.once("exit", resolve));
    }
    assert.equal(await restart("recover"), 0);
    assert.equal((await state(w)).state, "UNCERTAIN");
    assert.equal(await restart("dispatch"), 0);
    assert.equal(store().posts, 1);
    mode("normal");
    assert.equal(
      githubWrite.parse(await cmd({ action: "reconcile", ...args(w) })).state,
      "ACCEPTED",
    );
    assert.equal(store().posts, 1);
  },
);

test(
  "customer UI resumes durable uncertain outcome after reload and reconciles by reading only",
  { timeout: 60000 },
  async () => {
    const browser = await chromium.launch({
      headless: true,
      chromiumSandbox: true,
    });
    const context = await browser.newContext();
    const secret = fs.readFileSync(runtimeFile("session-key"), "utf8");
    await context.addCookies([
      {
        name: "kxra_local_session",
        value: signSession(owner, secret),
        url: testOrigin,
      },
    ]);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    try {
      await page.goto(testOrigin + "/os/connections/github");
      await page.getByLabel("Allow approved issue-comment writes").check();
      const response = page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/customer-connectors/github") &&
          r.request().postDataJSON()?.action === "connect_fixture",
      );
      await page
        .getByRole("button", {
          name: "Create fixture GitHub connection",
          exact: true,
        })
        .click();
      const c = (await (await response).json()).result;
      ids.push(c.id);
      await expect(
        page.getByText("Issues read/write", { exact: false }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Read issue comments", exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "Untrusted comment content",
          exact: true,
        }),
      ).toBeVisible();
      await page
        .getByLabel("Comment to propose")
        .fill("Customer visible durable recovery");
      await page
        .getByRole("button", { name: "Prepare GitHub comment", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "PENDING", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: "Approve exact GitHub comment",
          exact: true,
        }),
      ).toBeDisabled();
      await page
        .getByLabel(
          "I approve this exact GitHub account, target and full comment once.",
        )
        .check();
      await page
        .getByRole("button", {
          name: "Approve exact GitHub comment",
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Queue approved comment", exact: true })
        .click();
      mode("drop-after-commit");
      await page
        .getByRole("button", {
          name: "Dispatch once to local fake",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("heading", { name: "UNCERTAIN", exact: true }),
      ).toBeVisible();
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "UNCERTAIN", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: "Dispatch once to local fake",
          exact: true,
        }),
      ).toHaveCount(0);
      mode("normal");
      await page
        .getByRole("button", { name: "Reconcile by reading only", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "ACCEPTED", exact: true }),
      ).toBeVisible();
      assert.equal(store().posts, 1);
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
      await browser.close();
    }
  },
);

test("retain accepted and uncertain rows and receipts for actual database/provider restart proof", async () => {
  const c = await connect(),
    accepted = await queue(c);
  await cmd({ action: "dispatch", ...args(accepted) });
  const uncertain = await queue(c);
  mode("post-500");
  await cmd({ action: "dispatch", ...args(uncertain) });
  retained.add(c.id);
  assert.equal((await state(accepted)).state, "ACCEPTED");
  assert.equal((await state(uncertain)).state, "UNCERTAIN");
  mode("normal");
});
