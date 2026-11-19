import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import pg from "pg";
import type https from "node:https";
import { GithubPostgresRateCoordinator } from "../../packages/connectors/github-rate-coordinator";
import { GithubRateLimitedExecutor } from "../../packages/connectors/github-rate-limited-executor";
import {
  githubProductionBinding,
  githubCommentApprovalDigest,
} from "../../packages/connectors/github-production-contracts";
import type { GithubExecutionPorts } from "../../packages/connectors/github-production-transport";
import { githubFake } from "../support/github-production-fake";

const file = process.env.KXRA_GHR_DATABASE_FILE;
const enabled = Boolean(file);
let admin: pg.Client;
let runtime: pg.Client;
let cfg: pg.ClientConfig;
const none = { stop: false, not_before: null, reason: "NONE" };
const subject = (kind = "READ") => ({
  reservation_id: crypto.randomUUID(),
  app_id: 11,
  installation_id: 22,
  account_id: 33,
  binding_sha256: "a".repeat(64),
  operation_sha256: "b".repeat(64),
  kind,
});
const invoke = (
  realm: string,
  action: string,
  payload: unknown,
  epoch = 1,
  client = runtime,
) =>
  client.query("select kxra_github_rate.runtime($1,$2,$3,$4) ack", [
    realm,
    epoch,
    action,
    payload,
  ]);
const reserve = (realm: string, value = subject(), client = runtime) =>
  invoke(realm, "RESERVE", value, 1, client);
const complete = (realm: string, id: string, rate: unknown = none) =>
  invoke(realm, "COMPLETE", {
    reservation_id: id,
    rate,
    settlement: "CONFIRMED",
  });
const denies = async (operation: Promise<unknown>) => {
  await assert.rejects(operation);
};
async function realm(phase = "ACTIVE") {
  const id = crypto.randomUUID();
  await admin.query(
    "insert into kxra_github_rate.realms(id,epoch,phase) values($1,1,$2)",
    [id, phase],
  );
  await admin.query(
    "insert into kxra_github_rate.targets values($1,11,22,33,true)",
    [id],
  );
  return id;
}
async function seed(
  id: string,
  count: number,
  age: string,
  kind = "READ",
  completed = true,
) {
  // Trusted fixture-only history. Runtime cannot insert, refund, age, or delete it.
  for (let i = 0; i < count; i++) {
    const s = subject(kind);
    await admin.query(
      `insert into kxra_github_rate.reservations
       (reservation_id,realm,epoch,subject,kind,reserved_at,completed_at,completion,completion_held)
       values($1,$2,1,$3,$4,clock_timestamp()-$5::interval,
       case when $6 then clock_timestamp()-$5::interval else null end,
       case when $6 then $7::jsonb else null end,case when $6 then false else null end)`,
      [
        s.reservation_id,
        id,
        s,
        kind,
        age,
        completed,
        { rate: none, settlement: "CONFIRMED" },
      ],
    );
  }
}
before(async () => {
  if (!enabled) return;
  assert.match(
    fs.realpathSync(file!),
    /^\/(?:private\/)?tmp\/kxra-ghr-[A-Za-z0-9]+\/\.runtime\/github-rate-coordinator\/database\.json$/,
  );
  cfg = JSON.parse(fs.readFileSync(file!, "utf8"));
  assert.equal(cfg.host, path.join(path.dirname(file!), "socket"));
  assert.equal(cfg.database, "github_rate");
  assert.ok(!cfg.password && !cfg.connectionString && !cfg.ssl);
  admin = new pg.Client({ ...cfg, user: os.userInfo().username });
  runtime = new pg.Client({ ...cfg, user: "kxra_gh_rate" });
  await admin.connect();
  await runtime.connect();
});
after(async () => {
  if (runtime) await runtime.end();
  if (admin) await admin.end();
});

test(
  "rate store has no default activation, narrow session-user authority, and private RLS tables",
  { skip: !enabled },
  async () => {
    assert.equal(
      (await admin.query("select count(*)::int n from kxra_github_rate.realms"))
        .rows[0].n,
      0,
    );
    for (const table of ["realms", "targets", "reservations"]) {
      assert.equal(
        (
          await admin.query(
            "select relrowsecurity from pg_class where oid=$1::regclass",
            [`kxra_github_rate.${table}`],
          )
        ).rows[0].relrowsecurity,
        true,
      );
      for (const privilege of [
        "SELECT",
        "INSERT",
        "UPDATE",
        "DELETE",
        "TRUNCATE",
        "REFERENCES",
        "TRIGGER",
      ])
        for (const role of [
          "kxra_gh_rate",
          "rate_unrelated",
          "rate_impersonator",
        ])
          assert.equal(
            (
              await admin.query("select has_table_privilege($1,$2,$3) ok", [
                role,
                `kxra_github_rate.${table}`,
                privilege,
              ])
            ).rows[0].ok,
            false,
          );
      await denies(runtime.query(`select * from kxra_github_rate.${table}`));
    }
    const functions = (
      await admin.query(
        "select proname,prosecdef,proconfig from pg_proc where pronamespace='kxra_github_rate'::regnamespace order by proname",
      )
    ).rows;
    assert.deepEqual(
      functions.map((f) => f.proname),
      ["immutable", "runtime"],
    );
    assert.equal(functions[1].prosecdef, true);
    assert.deepEqual(functions[1].proconfig, ['search_path=""']);
    const id = await realm();
    await denies(invoke(id, "RESERVE", subject(), 1, admin));
    const imp = new pg.Client({ ...cfg, user: "rate_impersonator" });
    await imp.connect();
    try {
      await imp.query("set role kxra_gh_rate");
      await denies(invoke(id, "RESERVE", subject(), 1, imp));
    } finally {
      await imp.end();
    }
  },
);

test(
  "unconfigured, held, disabled, wrong epoch and target mismatch deny",
  { skip: !enabled },
  async () => {
    await denies(reserve(crypto.randomUUID()));
    const held = await realm("HOLD");
    await denies(reserve(held));
    const id = await realm();
    await denies(invoke(id, "RESERVE", subject(), 2));
    await denies(reserve(id, { ...subject(), account_id: 34 }));
    await denies(reserve(id, { ...subject(), app_id: 12 }));
    await denies(reserve(id, { ...subject(), installation_id: 23 }));
    await admin.query(
      "update kxra_github_rate.targets set enabled=false where realm=$1",
      [id],
    );
    await denies(reserve(id));
    for (const action of [
      "RESET",
      "PRUNE",
      "RESUME",
      "HOLD",
      "DELETE",
      "reserve",
      "RESERVE';drop schema kxra_github_rate cascade;--",
    ])
      await denies(invoke(id, action, subject()));
  },
);

test(
  "strict reserve shape/types reject injection, nulls, coercion and unsafe identities",
  { skip: !enabled },
  async () => {
    const id = await realm();
    const s = subject();
    for (const bad of [
      null,
      [],
      {},
      { ...s, extra: true },
      { ...s, kind: null },
      { ...s, kind: "WRITE" },
      { ...s, reservation_id: s.reservation_id.toUpperCase() },
      { ...s, app_id: "11" },
      { ...s, app_id: 0 },
      { ...s, installation_id: 9007199254740992 },
      { ...s, account_id: 1.5 },
      { ...s, binding_sha256: "' OR true --" },
      { ...s, operation_sha256: "B".repeat(64) },
    ])
      await denies(invoke(id, "RESERVE", bad));
    assert.equal(
      (
        await admin.query(
          "select count(*)::int n from kxra_github_rate.reservations where realm=$1",
          [id],
        )
      ).rows[0].n,
      0,
    );
  },
);

test(
  "reserve ack is exact, duplicate never permits and completion is exact-once evidence",
  { skip: !enabled },
  async () => {
    const id = await realm();
    const s = subject();
    assert.deepEqual((await reserve(id, s)).rows[0].ack, {
      ...s,
      realm: id,
      epoch: 1,
      reserved: true,
    });
    await denies(reserve(id, s));
    await denies(reserve(id));
    for (const bad of [
      null,
      {},
      { ...none, extra: false },
      { ...none, stop: "false" },
      { ...none, reason: "RATE_LIMIT" },
      { ...none, not_before: new Date().toISOString() },
      { stop: true, not_before: 123, reason: "RATE_LIMIT" },
    ])
      await denies(complete(id, s.reservation_id, bad));
    await denies(
      invoke(id, "COMPLETE", {
        reservation_id: s.reservation_id,
        rate: none,
        settlement: "CONFIRMED",
        extra: 1,
      }),
    );
    await denies(complete(await realm(), s.reservation_id));
    assert.equal(
      (
        await admin.query(
          "select completed_at from kxra_github_rate.reservations where reservation_id=$1",
          [s.reservation_id],
        )
      ).rows[0].completed_at,
      null,
    );
    const expected = {
      realm: id,
      epoch: 1,
      reservation_id: s.reservation_id,
      completed: true,
      held: false,
    };
    assert.deepEqual(
      (await complete(id, s.reservation_id)).rows[0].ack,
      expected,
    );
    assert.deepEqual(
      (await complete(id, s.reservation_id)).rows[0].ack,
      expected,
    );
    await denies(
      complete(id, s.reservation_id, {
        stop: true,
        not_before: null,
        reason: "RATE_LIMIT",
      }),
    );
    await denies(reserve(id, s));
    await denies(
      admin.query(
        "delete from kxra_github_rate.reservations where reservation_id=$1",
        [s.reservation_id],
      ),
    );
    await denies(
      admin.query(
        "update kxra_github_rate.reservations set reserved_at=clock_timestamp()-interval '1 hour' where reservation_id=$1",
        [s.reservation_id],
      ),
    );
  },
);

test(
  "independent connections have exactly one durable winner, including lock wait config recheck",
  { skip: !enabled },
  async () => {
    const id = await realm();
    const clients = await Promise.all(
      Array.from({ length: 8 }, async () => {
        const c = new pg.Client({ ...cfg, user: "kxra_gh_rate" });
        await c.connect();
        return c;
      }),
    );
    try {
      const results = await Promise.allSettled(
        clients.map((c) => reserve(id, subject(), c)),
      );
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(
        (
          await admin.query(
            "select count(*)::int n from kxra_github_rate.reservations where realm=$1",
            [id],
          )
        ).rows[0].n,
        1,
      );
    } finally {
      await Promise.all(clients.map((c) => c.end()));
    }
    const waitRealm = await realm();
    await admin.query("begin");
    await admin.query(
      "select 1 from kxra_github_rate.realms where id=$1 for update",
      [waitRealm],
    );
    const waiting = reserve(waitRealm);
    await new Promise((resolve) => setTimeout(resolve, 75));
    // Config changes while the caller waits must be observed after it gets the lock.
    await admin.query(
      "update kxra_github_rate.realms set not_before=clock_timestamp()+interval '1 hour' where id=$1",
      [waitRealm],
    );
    await admin.query("commit");
    await denies(waiting);
  },
);

test(
  "rolling request budgets, global spacing and stricter-only operator configuration",
  { skip: !enabled },
  async () => {
    for (const [count, age] of [
      [60, "10 seconds"],
      [3000, "10 minutes"],
    ] as const) {
      const id = await realm();
      await seed(id, count, age);
      await denies(reserve(id));
    }
    const strict = await realm();
    await admin.query(
      "update kxra_github_rate.realms set requests_60s=1,requests_3600s=2,min_spacing_ms=2000 where id=$1",
      [strict],
    );
    await seed(strict, 1, "3 seconds");
    await denies(reserve(strict));
    for (const change of [
      "requests_60s=61",
      "requests_3600s=3001",
      "comments_60s=2",
      "comments_3600s=31",
      "min_spacing_ms=999",
    ])
      await denies(
        admin.query(
          `update kxra_github_rate.realms set ${change} where id=$1`,
          [strict],
        ),
      );
    const space = await realm();
    const s = subject();
    await reserve(space, s);
    await complete(space, s.reservation_id);
    await denies(reserve(space));
    await new Promise((resolve) => setTimeout(resolve, 1050));
    const next = subject();
    await reserve(space, next);
    await complete(space, next.reservation_id);
    assert.equal(
      (
        await admin.query(
          "select count(*)::int n from kxra_github_rate.reservations where realm=$1",
          [space],
        )
      ).rows[0].n,
      2,
    );
  },
);

test(
  "comment limits are additive and READ traffic never consumes comment quotas",
  { skip: !enabled },
  async () => {
    for (const [count, age] of [
      [1, "5 seconds"],
      [30, "10 minutes"],
    ] as const) {
      const id = await realm();
      await seed(id, count, age, "COMMENT");
      await denies(reserve(id, subject("COMMENT")));
      const s = subject();
      await reserve(id, s);
      await complete(id, s.reservation_id);
    }
    const id = await realm();
    await seed(id, 20, "5 seconds", "READ");
    const s = subject("COMMENT");
    await reserve(id, s);
    await complete(id, s.reservation_id);
    assert.equal(
      (
        await admin.query(
          "select count(*)::int n from kxra_github_rate.reservations where realm=$1 and kind='COMMENT'",
          [id],
        )
      ).rows[0].n,
      1,
    );
  },
);

test(
  "rate response persists minimum cooldown and monotonic extension across completion",
  { skip: !enabled },
  async () => {
    for (const offset of [-1000, 120000]) {
      const id = await realm();
      const s = subject();
      await reserve(id, s);
      const providerDate = new Date(Date.now() + offset).toISOString();
      const ack = await complete(id, s.reservation_id, {
        stop: true,
        not_before: providerDate,
        reason: "RATE_LIMIT",
      });
      assert.equal(ack.rows[0].ack.held, false);
      const row = (
        await admin.query(
          "select r.not_before,w.completed_at from kxra_github_rate.realms r join kxra_github_rate.reservations w on w.realm=r.id where r.id=$1",
          [id],
        )
      ).rows[0];
      assert.ok(row.not_before.getTime() >= row.completed_at.getTime() + 60000);
      assert.ok(row.not_before.getTime() >= new Date(providerDate).getTime());
      await denies(reserve(id));
    }
    const id = await realm();
    const s = subject();
    await reserve(id, s);
    await admin.query(
      "update kxra_github_rate.realms set not_before=clock_timestamp()+interval '2 hours' where id=$1",
      [id],
    );
    const before = (
      await admin.query(
        "select not_before from kxra_github_rate.realms where id=$1",
        [id],
      )
    ).rows[0].not_before;
    await complete(id, s.reservation_id, {
      stop: true,
      not_before: new Date().toISOString(),
      reason: "RATE_LIMIT",
    });
    assert.deepEqual(
      (
        await admin.query(
          "select not_before from kxra_github_rate.realms where id=$1",
          [id],
        )
      ).rows[0].not_before,
      before,
    );
  },
);

test(
  "missing, malformed, stale and invalid rate controls durably HOLD without automatic resume",
  { skip: !enabled },
  async () => {
    for (const rate of [
      { stop: true, not_before: null, reason: "RATE_LIMIT" },
      { stop: true, not_before: "tomorrow", reason: "RATE_LIMIT" },
      {
        stop: true,
        not_before: "2026-02-30T00:00:00.000Z",
        reason: "RATE_LIMIT",
      },
      {
        stop: true,
        not_before: "2026-11-08T24:00:00.000Z",
        reason: "RATE_LIMIT",
      },
      {
        stop: true,
        not_before: new Date(Date.now() - 3600000).toISOString(),
        reason: "RATE_LIMIT",
      },
      {
        stop: true,
        not_before: new Date(Date.now() + 60000).toISOString(),
        reason: "RATE_CONTROL_INVALID",
      },
    ]) {
      const id = await realm();
      const s = subject();
      await reserve(id, s);
      const ack = (await complete(id, s.reservation_id, rate)).rows[0].ack;
      assert.equal(ack.held, true);
      assert.deepEqual(
        (await complete(id, s.reservation_id, rate)).rows[0].ack,
        ack,
      );
      assert.equal(
        (
          await admin.query(
            "select phase from kxra_github_rate.realms where id=$1",
            [id],
          )
        ).rows[0].phase,
        "HOLD",
      );
      await denies(reserve(id));
      await denies(invoke(id, "RESUME", {}));
    }
  },
);

test(
  "outstanding reservations never age out; operator HOLD does not prevent truthful completion",
  { skip: !enabled },
  async () => {
    const id = await realm();
    await seed(id, 1, "100 days", "READ", false);
    await denies(reserve(id));
    const pending = (
      await admin.query(
        "select reservation_id from kxra_github_rate.reservations where realm=$1",
        [id],
      )
    ).rows[0].reservation_id;
    await admin.query(
      "update kxra_github_rate.realms set phase='HOLD' where id=$1",
      [id],
    );
    assert.equal((await complete(id, pending)).rows[0].ack.held, true);
    await denies(reserve(id));
  },
);

test(
  "clock regression fails closed and quota history is retained across epoch changes",
  { skip: !enabled },
  async () => {
    const id = await realm();
    await admin.query(
      "update kxra_github_rate.realms set last_seen=clock_timestamp()+interval '1 hour' where id=$1",
      [id],
    );
    await denies(reserve(id));
    const budget = await realm();
    await seed(budget, 60, "5 seconds");
    await admin.query(
      "update kxra_github_rate.realms set epoch=2 where id=$1",
      [budget],
    );
    await denies(invoke(budget, "RESERVE", subject(), 2));
    const pending = await realm();
    const s = subject();
    await reserve(pending, s);
    await admin.query(
      "update kxra_github_rate.realms set epoch=2 where id=$1",
      [pending],
    );
    await denies(invoke(pending, "RESERVE", subject(), 2));
    await denies(
      invoke(
        pending,
        "COMPLETE",
        {
          reservation_id: s.reservation_id,
          rate: none,
          settlement: "CONFIRMED",
        },
        2,
      ),
    );
  },
);

test(
  "unconfirmed settlement holds even without provider rate signals; duplicate evidence includes settlement",
  { skip: !enabled },
  async () => {
    const id = await realm();
    const s = subject();
    await reserve(id, s);
    const payload = {
      reservation_id: s.reservation_id,
      rate: none,
      settlement: "UNCONFIRMED",
    };
    const ack = (await invoke(id, "COMPLETE", payload)).rows[0].ack;
    assert.equal(ack.held, true);
    assert.deepEqual((await invoke(id, "COMPLETE", payload)).rows[0].ack, ack);
    await denies(complete(id, s.reservation_id));
    await denies(reserve(id));
  },
);

test(
  "delayed completion retains a full quota window and spacing after settlement",
  { skip: !enabled },
  async () => {
    const id = await realm();
    await seed(id, 1, "100 days", "COMMENT", false);
    const s = (
      await admin.query(
        "select reservation_id from kxra_github_rate.reservations where realm=$1",
        [id],
      )
    ).rows[0];
    await complete(id, s.reservation_id);
    await denies(reserve(id));
    await new Promise((r) => setTimeout(r, 1050));
    await denies(reserve(id, subject("COMMENT")));
    const next = subject();
    await reserve(id, next);
    await complete(id, next.reservation_id);
    const stricter = await realm();
    await admin.query(
      "update kxra_github_rate.realms set requests_60s=1 where id=$1",
      [stricter],
    );
    await seed(stricter, 1, "100 days", "READ", false);
    const late = (
      await admin.query(
        "select reservation_id from kxra_github_rate.reservations where realm=$1",
        [stricter],
      )
    ).rows[0];
    await complete(stricter, late.reservation_id);
    await new Promise((r) => setTimeout(r, 1050));
    await denies(reserve(stricter));
  },
);

async function integratedFixture(
  afterCommit?: (action: "RESERVE" | "COMPLETE") => Promise<void>,
) {
  const id = await realm();
  const pool = new pg.Pool({
    ...cfg,
    user: "kxra_gh_rate",
    max: 4,
    connectionTimeoutMillis: 1000,
    idleTimeoutMillis: 1000,
  });
  const binding = githubProductionBinding.parse({
    provider: "github",
    api_version: "2026-03-10",
    org_id: crypto.randomUUID(),
    user_id: crypto.randomUUID(),
    connection_id: crypto.randomUUID(),
    session_version: 1,
    grant_version: 1,
    credential_ref: "vault:github:offline-rate-native",
    credential_version: 1,
    app_id: 11,
    installation_id: 22,
    account_id: 33,
    repository_id: 44,
    issue_id: 55,
    issue_number: 1,
    author_id: 66,
    owner: "Offline-Org",
    repo: "rate-native",
    expires_at: new Date(Date.now() + 600000).toISOString(),
  });
  const fake = githubFake(binding);
  const calls = { authority: 0, broker: 0, lookup: 0, request: 0 };
  const ports: GithubExecutionPorts = {
    enabled: () => true,
    deadlineMs: 1000,
    lookup: async () => {
      calls.lookup++;
      return [{ address: "8.8.8.8" }];
    },
    request: ((...args: any[]) => {
      calls.request++;
      return (fake.request as any)(...args);
    }) as typeof https.request,
    broker: {
      resolve: async (input) => {
        calls.broker++;
        return fake.broker.resolve(input);
      },
    },
    rollbackFence: fake.rollbackFence,
    authority: {
      current: async (i) => {
        calls.authority++;
        // First authority access must be behind a COMMITTED durable reservation.
        if (calls.authority === 1)
          assert.equal(
            (
              await admin.query(
                "select count(*)::int n from kxra_github_rate.reservations where realm=$1 and completed_at is null",
                [id],
              )
            ).rows[0].n,
            1,
          );
        return {
          state: i.operation.kind === "COMMENT" ? "DISPATCHING" : "ACTIVE",
          binding_sha256: i.binding_sha256,
          operation_sha256: i.operation_sha256,
          ...(i.operation.kind === "COMMENT"
            ? {
                write_id: i.operation.write_id,
                attempt_id: i.operation.attempt_id,
              }
            : {}),
        };
      },
      consume: async (i) => {
        assert.equal(i.operation.kind, "COMMENT");
        if (i.operation.kind !== "COMMENT") throw Error("not comment");
        return {
          consumed: true,
          binding_sha256: i.binding_sha256,
          operation_sha256: i.operation_sha256,
          write_id: i.operation.write_id,
          attempt_id: i.operation.attempt_id,
        };
      },
    },
  };
  const coordinator = new GithubPostgresRateCoordinator(
    pool,
    id,
    1,
    afterCommit,
  );
  const make = () =>
    new GithubRateLimitedExecutor(binding, ports, coordinator, {
      enabled: () => true,
    });
  const comment = () => {
    const fields = {
      write_id: crypto.randomUUID(),
      body: "Synthetic rate proof only",
      approved_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60000).toISOString(),
    };
    return {
      kind: "COMMENT",
      ...fields,
      attempt_id: crypto.randomUUID(),
      approval_digest: githubCommentApprovalDigest(binding, fields),
    };
  };
  return { id, pool, coordinator, fake, calls, make, comment };
}

test(
  "native adapter and competing wrapped executors agree on committed SQL contract",
  { skip: !enabled },
  async () => {
    const f = await integratedFixture();
    try {
      const results = await Promise.all([
        f.make().execute({ kind: "REPOSITORY" }),
        f.make().execute({ kind: "REPOSITORY" }),
      ]);
      assert.equal(
        results.filter((r) => r.execution?.outcome === "READ").length,
        1,
      );
      assert.equal(results.filter((r) => !r.executor_invoked).length, 1);
      assert.equal(f.calls.request, 1);
      const row = (
        await admin.query(
          "select completion,completed_at from kxra_github_rate.reservations where realm=$1",
          [f.id],
        )
      ).rows;
      assert.equal(row.length, 1);
      assert.ok(row[0].completed_at);
      assert.deepEqual(row[0].completion, {
        rate: none,
        settlement: "CONFIRMED",
      });
    } finally {
      await f.pool.end();
    }
  },
);

test(
  "native adapter lost reserve acknowledgement strands committed reservation without provider work",
  { skip: !enabled },
  async () => {
    const f = await integratedFixture(async (action) => {
      if (action === "RESERVE") throw Error("synthetic postcommit loss");
    });
    try {
      const r = await f.make().execute({ kind: "REPOSITORY" });
      assert.equal(r.executor_invoked, false);
      assert.equal(r.coordination.state, "UNCONFIRMED");
      assert.deepEqual(f.calls, {
        authority: 0,
        broker: 0,
        lookup: 0,
        request: 0,
      });
      assert.equal(
        (
          await admin.query(
            "select count(*)::int n from kxra_github_rate.reservations where realm=$1 and completed_at is null",
            [f.id],
          )
        ).rows[0].n,
        1,
      );
      await denies(reserve(f.id));
    } finally {
      await f.pool.end();
    }
  },
);

test(
  "native wrapper preserves accepted write when completion ack is lost, retaining quota",
  { skip: !enabled },
  async () => {
    let completions = 0;
    const f = await integratedFixture(async (action) => {
      if (action === "COMPLETE" && ++completions === 3)
        throw Error("synthetic postcommit loss");
    });
    try {
      const executor = f.make();
      await prepareComment(executor);
      const r = await executor.execute(f.comment());
      assert.equal(r.execution?.outcome, "ACCEPTED");
      assert.equal(r.coordination.state, "UNCONFIRMED");
      assert.equal(f.fake.posts(), 1);
      const row = (
        await admin.query(
          "select completion,completed_at from kxra_github_rate.reservations where realm=$1 and kind='COMMENT'",
          [f.id],
        )
      ).rows[0];
      assert.ok(row.completed_at);
      assert.equal(row.completion.settlement, "CONFIRMED");
      await denies(reserve(f.id, subject("COMMENT")));
    } finally {
      await f.pool.end();
    }
  },
);

test(
  "native wrapper uncertain provider write forces durable shared HOLD and no replay",
  { skip: !enabled },
  async () => {
    const f = await integratedFixture();
    f.fake.setMode("drop");
    try {
      const executor = f.make();
      await prepareComment(executor);
      const r = await executor.execute(f.comment());
      assert.equal(r.execution?.outcome, "UNCERTAIN");
      assert.equal(r.coordination.state, "HELD");
      assert.equal(f.fake.posts(), 1);
      assert.equal(f.fake.effects.length, 1);
      const row = (
        await admin.query(
          "select r.phase,w.completion from kxra_github_rate.realms r join kxra_github_rate.reservations w on w.realm=r.id where r.id=$1 and w.kind='COMMENT'",
          [f.id],
        )
      ).rows[0];
      assert.equal(row.phase, "HOLD");
      assert.equal(row.completion.settlement, "UNCONFIRMED");
      const again = await f.make().execute(f.comment());
      assert.equal(again.executor_invoked, false);
      assert.equal(f.fake.posts(), 1);
    } finally {
      await f.pool.end();
    }
  },
);

test(
  "bounded rolling counts preserve long spacing and future-clock denial outside quota windows",
  { skip: !enabled },
  async () => {
    const id = await realm();
    await seed(id, 1, "90 minutes");
    await admin.query(
      "update kxra_github_rate.realms set min_spacing_ms=7200000 where id=$1",
      [id],
    );
    await denies(reserve(id));
    const old = await realm();
    await seed(old, 1, "2 days");
    const s = subject();
    await reserve(old, s);
    await complete(old, s.reservation_id);
    const future = await realm();
    await seed(future, 1, "-1 hour");
    await denies(reserve(future));
  },
);

test(
  "waiting reservation rechecks wall clock after locking, not transaction start",
  { skip: !enabled },
  async () => {
    const id = await realm();
    await admin.query("begin");
    await admin.query(
      "update kxra_github_rate.realms set not_before=clock_timestamp()+interval '200 milliseconds' where id=$1",
      [id],
    );
    const s = subject();
    const waiting = reserve(id, s);
    await new Promise((r) => setTimeout(r, 300));
    await admin.query("commit");
    assert.equal((await waiting).rows[0].ack.reserved, true);
    await complete(id, s.reservation_id);
  },
);

async function prepareComment(executor: GithubRateLimitedExecutor) {
  assert.equal(
    (await executor.execute({ kind: "REPOSITORY" })).execution?.outcome,
    "READ",
  );
  await new Promise((r) => setTimeout(r, 1050));
  assert.equal(
    (await executor.execute({ kind: "ISSUE" })).execution?.outcome,
    "READ",
  );
  await new Promise((r) => setTimeout(r, 1050));
}
