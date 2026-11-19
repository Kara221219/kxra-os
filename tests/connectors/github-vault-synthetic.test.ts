import { after, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { fixtureUsers } from "../../packages/authz/session";
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
  type GithubWrite,
} from "../../packages/connectors/github-contracts";
import {
  SyntheticVaultCipher,
  SyntheticVaultBroker,
  FixtureInstallationObserver,
  verifySyntheticInstallation,
  type VaultControl,
} from "../../packages/connectors/github-vault-synthetic";
import { syntheticReceiptScope } from "../../packages/connectors/github-receipt-synthetic";
const runtime = process.env.KXRA_RUNTIME!;
assert.ok(runtime.startsWith("/tmp/kxra-vault-proof-"));
const cfg = JSON.parse(
  fs.readFileSync(path.join(runtime, "database.json"), "utf8"),
);
assert.ok(cfg.host.startsWith("/") && !cfg.password);
const app = new pg.Pool(cfg),
  admin = new pg.Pool({ ...cfg, user: os.userInfo().username });
const owner: string = fixtureUsers.owner,
  org = "10000000-0000-4000-8000-000000000001";
const origin = process.env.KXRA_GITHUB_FAKE_ORIGIN!;
async function call(
  sql: string,
  args: unknown[],
  kind = "worker",
  user = owner,
  tenant = org,
  identity = true,
) {
  const db = await app.connect();
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
    return r.rows[0]?.result;
  } catch (e) {
    await db.query("rollback");
    throw e;
  } finally {
    db.release();
  }
}
const scopeFor =
  (user = owner, tenant = org): ScopeCall =>
  (kind, action, input) =>
    call(
      "select kxra.github_connector($1,$2::jsonb) result",
      [action, JSON.stringify(input)],
      kind,
      user,
      tenant,
    );
const vaultFor =
  (user = owner, tenant = org): VaultControl =>
  (action, input) =>
    call(
      "select kxra.github_vault_fixture($1,$2::jsonb) result",
      [action, JSON.stringify(input)],
      "vault",
      user,
      tenant,
    );
const scope = scopeFor(),
  vault = vaultFor();
const hash = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const cipher = new SyntheticVaultCipher(crypto.randomBytes(32));
const broker = new SyntheticVaultBroker(vault, cipher);
const atomic = (input: Record<string, unknown>, tokenHash: string) =>
  call("select kxra.github_receipted_claim($1::jsonb,$2) result", [
    JSON.stringify(input),
    tokenHash,
  ]);
const publish = (
  token: string,
  attempt: string,
  digest: string,
  outcome: string,
  evidence: Record<string, unknown>,
) =>
  call(
    "select kxra_github_receipt.publish($1,$2::uuid,$3,$4,$5::jsonb) result",
    [token, attempt, digest, outcome, JSON.stringify(evidence)],
    "receipt",
    owner,
    org,
    false,
  );
const secured = syntheticReceiptScope(scope, atomic, publish);
const service = new GithubConnectorService(
  secured,
  new LocalGithubAdapter(origin, broker),
);
async function connect(write = true, user = owner, tenant = org) {
  const scope = scopeFor(user, tenant);
  const publicConnection = githubConnection.parse(
    await scope("human", "connect_fixture", { allow_write: write }),
  );
  assert.equal(publicConnection.credential_ref, undefined);
  return githubConnection.parse(
    await scope("worker", "context", { connection_id: publicConnection.id }),
  );
}
async function provision(c: GithubConnection) {
  await broker.attest(c);
  for (const s of c.allow_write
    ? (["issues:read", "issues:write"] as const)
    : (["issues:read"] as const))
    await broker.provision(c, s, new Date(Date.now() + 120000).toISOString());
}
async function queue(c: GithubConnection) {
  const read = (await service.command({
    action: "read",
    connection_id: c.id,
  })) as { receipt: { id: string } };
  const w = githubWrite.parse(
    await service.command({
      action: "prepare",
      connection_id: c.id,
      read_id: read.receipt.id,
      note: "Approved synthetic vault comment",
    }),
  );
  for (const action of ["approve", "enqueue"])
    await service.command({
      action,
      connection_id: c.id,
      write_id: w.id,
      digest: w.digest,
    });
  return w;
}
const args = (w: GithubWrite) => ({
  connection_id: w.connection_id,
  write_id: w.id,
});
const provider = () =>
  JSON.parse(
    fs.readFileSync(path.join(runtime, "github-provider-store.json"), "utf8"),
  );
const state = async (w: GithubWrite) =>
  (
    await admin.query(
      "select state from kxra_private.github_writes where id=$1",
      [w.id],
    )
  ).rows[0].state;
function evidence(w: GithubWrite) {
  return {
    status: 201,
    comment_id: 1000 + Number.parseInt(hash(w.id).slice(0, 10), 16),
    body_sha256: hash(w.payload.body),
    author_id: 202,
    issue_url: "https://api.github.com/repos/fixture-org/fixture-repo/issues/1",
  };
}
async function claim(w: GithubWrite) {
  const token = crypto.randomBytes(32).toString("base64url");
  const r = (await atomic({ ...args(w), digest: w.digest }, hash(token))) as {
    write: GithubWrite;
    claimed: boolean;
  };
  assert.equal(r.claimed, true);
  return { token, attempt: r.write.attempt_id!, digest: w.digest };
}
const report = (
  p: Awaited<ReturnType<typeof claim>>,
  outcome: string,
  e: Record<string, unknown>,
) => publish(p.token, p.attempt, p.digest, outcome, e);
after(async () => {
  cipher.dispose();
  await app.end();
  await admin.end();
});

test("synthetic envelope authenticates exact tenant/user/session/connection/ref/grant/scope/expiry and fails closed on key loss", async () => {
  const c = await connect(),
    expiry = new Date(Date.now() + 60000).toISOString(),
    e = cipher.seal(c, "issues:read", expiry);
  assert.equal(cipher.open(c, "issues:read", expiry, e), fixtureGithubToken);
  assert.ok(!JSON.stringify(e).includes(fixtureGithubToken));
  const variants = [
    { ...c, org_id: crypto.randomUUID() },
    { ...c, user_id: crypto.randomUUID() },
    { ...c, session_version: 2 },
    { ...c, id: crypto.randomUUID() },
    { ...c, credential_ref: `fixture:github:${crypto.randomUUID()}:v1` },
    { ...c, grant_version: 2 },
  ];
  for (const v of variants)
    assert.throws(() => cipher.open(v, "issues:read", expiry, e));
  assert.throws(() => cipher.open(c, "issues:write", expiry, e));
  assert.throws(() =>
    cipher.open(
      c,
      "issues:read",
      new Date(Date.parse(expiry) + 1000).toISOString(),
      e,
    ),
  );
  assert.throws(() =>
    cipher.open(c, "issues:read", expiry, { ...e, tag: "A".repeat(22) }),
  );
  const lost = new SyntheticVaultCipher(crypto.randomBytes(32));
  assert.throws(() => lost.open(c, "issues:read", expiry, e));
  lost.dispose();
  assert.throws(() => lost.seal(c, "issues:read", expiry));
});
test("installation observation rejects wrong account, installation, repo, author, issue, permissions and stale challenge", async () => {
  const c = await connect(),
    ch = {
      id: crypto.randomUUID(),
      connection_id: c.id,
      grant_version: 1,
      expires_at: new Date(Date.now() + 60000).toISOString(),
    };
  const a = await new FixtureInstallationObserver().observe(ch, c);
  verifySyntheticInstallation(c, ch, a);
  for (const change of [
    { verified_account_id: 999 },
    { verified_author_id: 999 },
    { repository_ids: [999] },
    { issue_is_pull_request: true },
    { issue_id: 999 },
    { issues: "read" },
    { repository_selection: "all" },
    { binding: { ...c.binding, installation_id: 999 } },
    { challenge_id: crypto.randomUUID() },
    { org_id: crypto.randomUUID() },
  ])
    assert.throws(() =>
      verifySyntheticInstallation(c, ch, { ...a, ...change }),
    );
  assert.throws(() =>
    verifySyntheticInstallation(
      c,
      { ...ch, expires_at: new Date(0).toISOString() },
      a,
    ),
  );
});
test("vault requires one-use installation binding and exact active authority, scopes, lease expiry and grant version", async () => {
  const c = await connect();
  await assert.rejects(broker.resolve(c, "issues:read"));
  const ch = (await vault("begin", {
    connection_id: c.id,
    grant_version: 1,
  })) as {
    id: string;
    connection_id: string;
    grant_version: number;
    expires_at: string;
  };
  const a = await new FixtureInstallationObserver().observe(ch, c);
  await assert.rejects(
    vault("confirm", {
      connection_id: c.id,
      grant_version: 1,
      challenge_id: ch.id,
      attestation: { ...a, verified_account_id: 999 },
    }),
  );
  await vault("confirm", {
    connection_id: c.id,
    grant_version: 1,
    challenge_id: ch.id,
    attestation: a,
  });
  await assert.rejects(
    vault("confirm", {
      connection_id: c.id,
      grant_version: 1,
      challenge_id: ch.id,
      attestation: a,
    }),
  );
  await broker.provision(
    c,
    "issues:read",
    new Date(Date.now() + 60000).toISOString(),
  );
  assert.equal(
    (await broker.resolve(c, "issues:read")).token,
    fixtureGithubToken,
  );
  await assert.rejects(broker.resolve(c, "issues:write"));
  await assert.rejects(broker.provision(c, "issues:read", "bad-date"));
  await assert.rejects(
    broker.provision(
      c,
      "issues:read",
      new Date(Date.parse(c.expires_at) + 1000).toISOString(),
    ),
  );
  await assert.rejects(
    call(
      "select kxra.github_vault_fixture($1,$2::jsonb) result",
      [
        "resolve",
        JSON.stringify({
          connection_id: c.id,
          grant_version: 1,
          scope: "issues:read",
        }),
      ],
      "human",
    ),
  );
  await scope("human", "rotate_fixture_grant", { connection_id: c.id });
  await assert.rejects(broker.resolve(c, "issues:read"));
  const ro = await connect(false);
  await provision(ro);
  await assert.rejects(broker.resolve(ro, "issues:write"));
  const rev = await connect();
  await provision(rev);
  await broker.revoke(rev);
  await assert.rejects(broker.resolve(rev, "issues:read"));
  const exp = await connect();
  await provision(exp);
  await admin.query(
    "update kxra_private.github_vault_leases set expires_at=clock_timestamp()-interval '1 second' where connection_id=$1",
    [exp.id],
  );
  await assert.rejects(broker.resolve(exp, "issues:read"));
});
test("stale JWT cannot bind a newly created connection or mint receipt authority", async () => {
  try {
    await admin.query(
      "update kxra.account_identities set session_version=2 where account_id=$1",
      [owner],
    );
    const c = await connect();
    assert.equal(c.session_version, 2);
    await assert.rejects(
      vault("begin", { connection_id: c.id, grant_version: c.grant_version }),
    );
    await assert.rejects(
      atomic(
        {
          connection_id: c.id,
          write_id: crypto.randomUUID(),
          digest: "0".repeat(64),
        },
        "0".repeat(64),
      ),
      /Current session required/,
    );
  } finally {
    await admin.query(
      "update kxra.account_identities set session_version=1 where account_id=$1",
      [owner],
    );
  }
});

test("two tenants cannot resolve, attest or modify another customer's encrypted lease", async () => {
  const tenant = crypto.randomUUID(),
    user = crypto.randomUUID();
  await admin.query(
    "insert into kxra.organisations(id,name,slug,organisation_kind) values($1,'Vault fixture',$2,'CUSTOMER')",
    [tenant, `vault-${tenant}`],
  );
  await admin.query(
    "insert into kxra.account_identities(account_id,auth_provider,auth_subject,state,email_verified_at) values($1,'FIXTURE',$2,'ACTIVE',clock_timestamp())",
    [user, `vault-${user}`],
  );
  await admin.query(
    "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_ADMIN','CUSTOMER','ACTIVE','Fixture','LOCAL_TEST')",
    [tenant, user],
  );
  const a = await connect(),
    b = await connect(true, user, tenant);
  await provision(a);
  const foreign = vaultFor(user, tenant);
  await assert.rejects(
    foreign("resolve", {
      connection_id: a.id,
      grant_version: 1,
      scope: "issues:read",
    }),
  );
  await assert.rejects(
    vault("begin", { connection_id: b.id, grant_version: 1 }),
  );
  await assert.rejects(
    vaultFor(owner, tenant)("begin", { connection_id: a.id, grant_version: 1 }),
  );
  const fb = new SyntheticVaultBroker(foreign, cipher);
  await fb.attest(b);
  await fb.provision(
    b,
    "issues:read",
    new Date(Date.now() + 60000).toISOString(),
  );
  assert.equal((await fb.resolve(b, "issues:read")).token, fixtureGithubToken);
});
test("encrypted lease powers scoped loopback read and one approved comment; no secret in customer result", async () => {
  const c = await connect();
  await provision(c);
  const w = await queue(c),
    before = provider().posts;
  const result = await service.command({ action: "dispatch", ...args(w) });
  assert.deepEqual(result, { recorded: true, state: "ACCEPTED" });
  assert.equal(provider().posts, before + 1);
  await service.command({ action: "dispatch", ...args(w) });
  assert.equal(provider().posts, before + 1);
  const list = JSON.stringify(await service.list());
  for (const word of [
    fixtureGithubToken,
    "ciphertext",
    "token_sha256",
    "synthetic-memory-key",
  ])
    assert.ok(!list.includes(word));
  assert.throws(() => new LocalGithubAdapter("https://api.github.com", broker));
});
test("receipt-only publication survives session withdrawal with blank identity, cannot authorize reads or replay", async () => {
  const c = await connect();
  await provision(c);
  const w = await queue(c),
    before = provider().posts;
  const original = globalThis.fetch;
  let withdrawn = false;
  globalThis.fetch = async (input, init) => {
    const result = await original(input, init);
    if (init?.method === "POST") {
      await admin.query(
        "update kxra.account_identities set session_version=2 where account_id=$1",
        [owner],
      );
      withdrawn = true;
    }
    return result;
  };
  try {
    assert.deepEqual(
      await service.command({ action: "dispatch", ...args(w) }),
      { recorded: true, state: "ACCEPTED" },
    );
    assert.equal(withdrawn, true);
    assert.equal(provider().posts, before + 1);
    await assert.rejects(broker.resolve(c, "issues:read"));
    await assert.rejects(
      service.command({ action: "read", connection_id: c.id }),
    );
    await service.command({ action: "dispatch", ...args(w) });
    assert.equal(provider().posts, before + 1);
    await assert.rejects(
      call(
        "select kxra.github_connector('list','{}') result",
        [],
        "receipt",
        owner,
        org,
        false,
      ),
    );
    await assert.rejects(
      call(
        "select kxra.github_vault_fixture('begin',$1) result",
        [JSON.stringify({ connection_id: c.id, grant_version: 1 })],
        "vault",
        owner,
        org,
        false,
      ),
    );
  } finally {
    globalThis.fetch = original;
    await admin.query(
      "update kxra.account_identities set session_version=1 where account_id=$1",
      [owner],
    );
  }
  assert.equal(await state(w), "ACCEPTED");
});
test("attempt-only receipts reject tampering, duplicates are idempotent, and terminal conflicts cannot regress state", async () => {
  const c = await connect();
  await provision(c);
  const w = await queue(c),
    p = await claim(w),
    e = evidence(w);
  for (const bad of [
    { ...p, token: crypto.randomBytes(32).toString("base64url") },
    { ...p, attempt: crypto.randomUUID() },
    { ...p, digest: "0".repeat(64) },
  ])
    await assert.rejects(report(bad, "ACCEPTED", e));
  for (const bad of [
    { ...e, body_sha256: "0".repeat(64) },
    { ...e, author_id: 999 },
    { ...e, issue_url: "https://evil.invalid" },
    { ...e, comment_id: 9007199254740992 },
  ])
    await assert.rejects(report(p, "ACCEPTED", bad));
  await admin.query(
    "update kxra_private.github_writes set payload=jsonb_set(payload,'{body}',to_jsonb('changed after claim'::text)) where id=$1",
    [w.id],
  );
  await assert.rejects(
    report(p, "ACCEPTED", { ...e, body_sha256: hash("changed after claim") }),
  );
  await admin.query(
    "update kxra_private.github_writes set payload=$2::jsonb where id=$1",
    [w.id, JSON.stringify(w.payload)],
  );
  await assert.rejects(
    secured("worker", "record_outcome", {
      ...args(w),
      attempt_id: p.attempt,
      digest: p.digest,
      outcome: "ACCEPTED",
      evidence: e,
    }),
    /RECEIPT_PERMIT_UNAVAILABLE/,
  );
  await report(p, "UNCERTAIN", { reason: "ACK_LOSS" });
  await report(p, "ACCEPTED", e);
  await report(p, "ACCEPTED", e);
  await assert.rejects(report(p, "REJECTED", { reason: "LATE" }));
  await assert.rejects(report(p, "ACCEPTED", { ...e, comment_id: 124 }));
  assert.equal(await state(w), "ACCEPTED");
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
  const retry = (await atomic(
    { ...args(w), digest: w.digest },
    hash(crypto.randomBytes(32).toString("base64url")),
  )) as { claimed: boolean };
  assert.equal(retry.claimed, false);
});
test("receipt-only capability survives membership/account/connection revocation without granting new authority", async () => {
  const c = await connect();
  await provision(c);
  const w = await queue(c),
    p = await claim(w);
  await scope("human", "revoke", { connection_id: c.id });
  try {
    await admin.query(
      "update kxra.organisation_memberships set state='REVOKED',revoked_at=clock_timestamp() where account_id=$1 and org_id=$2",
      [owner, org],
    );
    await admin.query(
      "update kxra.account_identities set state='REVOKED',session_version=2 where account_id=$1",
      [owner],
    );
    await assert.rejects(broker.resolve(c, "issues:read"));
    assert.deepEqual(await report(p, "ACCEPTED", evidence(w)), {
      recorded: true,
      state: "ACCEPTED",
    });
    await assert.rejects(
      call(
        "select kxra.github_connector('context',$1::jsonb) result",
        [JSON.stringify({ connection_id: c.id })],
        "worker",
        owner,
        org,
        false,
      ),
    );
  } finally {
    await admin.query(
      "update kxra.account_identities set state='ACTIVE',session_version=1 where account_id=$1",
      [owner],
    );
    await admin.query(
      "update kxra.organisation_memberships set state='ACTIVE',revoked_at=null where account_id=$1 and org_id=$2",
      [owner, org],
    );
  }
  assert.equal(
    (
      await admin.query(
        "select cancel_requested from kxra_private.github_writes where id=$1",
        [w.id],
      )
    ).rows[0].cancel_requested,
    true,
  );
});

test("receipt expiry is rechecked after waiting for a connection lock", async () => {
  const c = await connect();
  await provision(c);
  const w = await queue(c),
    p = await claim(w);
  const lock = await admin.connect();
  try {
    await lock.query("begin");
    await lock.query(
      "select id from kxra_private.github_connections where id=$1 for update",
      [c.id],
    );
    await admin.query(
      "update kxra_private.github_receipt_permits set expires_at=clock_timestamp()+interval '250 milliseconds' where write_id=$1",
      [w.id],
    );
    const pending = assert.rejects(report(p, "ACCEPTED", evidence(w)));
    await new Promise((r) => setTimeout(r, 350));
    await lock.query("commit");
    await pending;
    assert.equal(await state(w), "DISPATCHING");
  } finally {
    await lock.query("rollback");
    lock.release();
    await admin.query(
      "update kxra_private.github_writes set state='NOT_EXECUTED' where id=$1",
      [w.id],
    );
  }
});

test("receipt limits, expiry and revocation deny new observations; uncertainty never permits automatic resend", async () => {
  const c = await connect();
  await provision(c);
  const w = await queue(c),
    p = await claim(w);
  for (let i = 0; i < 8; i++)
    await report(p, "UNCERTAIN", { reason: `OBS_${i}` });
  await report(p, "UNCERTAIN", { reason: "OBS_0" });
  await assert.rejects(report(p, "ACCEPTED", evidence(w)));
  const before = provider().posts;
  await service.command({ action: "dispatch", ...args(w) });
  assert.equal(provider().posts, before);
  // A separate connection targets the same fixture issue; resolve prior uncertainty by
  // admin-only fixture reset so the production hold is never bypassed by an API.
  await admin.query(
    "update kxra_private.github_writes set state='NOT_EXECUTED' where id=$1",
    [w.id],
  );
  const expired = await queue(c),
    ep = await claim(expired);
  await admin.query(
    "update kxra_private.github_receipt_permits set expires_at=clock_timestamp()-interval '1 second' where write_id=$1",
    [expired.id],
  );
  await assert.rejects(report(ep, "ACCEPTED", evidence(expired)));
  await admin.query(
    "update kxra_private.github_writes set state='NOT_EXECUTED' where id=$1",
    [expired.id],
  );
  const revoked = await queue(c),
    rp = await claim(revoked);
  await admin.query(
    "update kxra_private.github_receipt_permits set revoked=true where write_id=$1",
    [revoked.id],
  );
  await assert.rejects(report(rp, "ACCEPTED", evidence(revoked)));
});
test("new private state and receipt schema are inaccessible to anonymous and authenticated direct DML", async () => {
  for (const table of [
    "github_binding_challenges",
    "github_vault_bindings",
    "github_vault_leases",
    "github_receipt_permits",
  ]) {
    await assert.rejects(
      call(`select to_jsonb(t) result from kxra_private.${table} t`, []),
    );
  }
  const db = await app.connect();
  try {
    await db.query("begin");
    await db.query("set local role anon");
    await assert.rejects(
      db.query("select kxra_github_receipt.publish('x',null,null,null,null)"),
    );
    await db.query("rollback");
  } finally {
    db.release();
  }
});
test("synthetic broker and receipt scope fail closed outside explicit fixture mode", async () => {
  const prior = process.env.KXRA_AUTH_MODE;
  try {
    process.env.KXRA_AUTH_MODE = "supabase";
    assert.throws(() => new SyntheticVaultCipher(crypto.randomBytes(32)));
    await assert.rejects(secured("human", "list", {}));
  } finally {
    process.env.KXRA_AUTH_MODE = prior;
  }
});

test("receipt worker reserves capacity for concurrent claims and releases failures", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered = 0;
  const limited = syntheticReceiptScope(
    scope,
    async () => {
      entered++;
      await gate;
      throw Error("EXPECTED_CLAIM_FAILURE");
    },
    publish,
  );
  const pending = Array.from({ length: 100 }, () =>
    assert.rejects(limited("worker", "claim", {}), /EXPECTED_CLAIM_FAILURE/),
  );
  try {
    await assert.rejects(
      limited("worker", "claim", {}),
      /RECEIPT_WORKER_CAPACITY/,
    );
    assert.equal(entered, 100);
  } finally {
    release();
    await Promise.all(pending);
  }
  await assert.rejects(
    limited("worker", "claim", {}),
    /EXPECTED_CLAIM_FAILURE/,
  );
  assert.equal(entered, 101);
});
