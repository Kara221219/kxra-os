import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import https from "node:https";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import {
  GithubInstallationObserver,
  type GithubInstallationObservationPorts,
} from "../packages/connectors/github-installation-observer";
import {
  githubBindingDigest,
  githubProductionBinding,
} from "../packages/connectors/github-production-contracts";

type RecordRequest = { url: URL; options: any; body?: string };
type Reply = {
  status?: number;
  data?: any;
  bytes?: Buffer;
  chunks?: Buffer[];
  headers?: any;
  complete?: boolean;
  hang?: boolean;
  error?: boolean;
  close?: boolean;
};
function setup() {
  let now = Math.floor(Date.now() / 1000) * 1000;
  const binding = githubProductionBinding.parse({
    provider: "github",
    api_version: "2026-03-10",
    org_id: crypto.randomUUID(),
    user_id: crypto.randomUUID(),
    connection_id: crypto.randomUUID(),
    session_version: 1,
    grant_version: 2,
    credential_ref: "vault:github:offline-observer",
    credential_version: 3,
    app_id: 901,
    installation_id: 902,
    account_id: 903,
    repository_id: 904,
    issue_id: 905,
    issue_number: 7,
    author_id: 906,
    owner: "Example-Org",
    repo: "work-plans",
    expires_at: new Date(now + 600000).toISOString(),
  });
  const client = "Iv1.offlineObserver";
  const header = { alg: "RS256", typ: "JWT" };
  const claims = { iss: client, iat: now / 1000 - 60, exp: now / 1000 + 300 };
  const jwt = (h = header, c: any = claims) =>
    `${Buffer.from(JSON.stringify(h)).toString("base64url")}.${Buffer.from(JSON.stringify(c)).toString("base64url")}.${crypto.randomBytes(32).toString("base64url")}`;
  const appLease = {
    mode: "GITHUB_APP_JWT",
    binding_sha256: githubBindingDigest(binding),
    app_id: binding.app_id,
    client_id: client,
    expires_at: new Date(claims.exp * 1000).toISOString(),
    jwt: jwt(),
  };
  const lease = {
    mode: "GITHUB_APP_INSTALLATION",
    binding_sha256: githubBindingDigest(binding),
    app_id: binding.app_id,
    installation_id: binding.installation_id,
    credential_ref: binding.credential_ref,
    credential_version: binding.credential_version,
    repository_ids: [binding.repository_id],
    permissions: { metadata: "read", issues: "read" },
    expires_at: new Date(now + 300000).toISOString(),
    token: "offline_observer_" + crypto.randomBytes(24).toString("hex"),
  };
  const app = {
    id: binding.app_id,
    slug: "kxra-offline",
    client_id: client,
    permissions: { metadata: "read", issues: "write" },
    ignored: "provider-private-data",
  };
  const installation = {
    id: binding.installation_id,
    app_id: binding.app_id,
    app_slug: app.slug,
    account: {
      id: binding.account_id,
      login: binding.owner,
      type: "Organization",
    },
    target_id: binding.account_id,
    target_type: "Organization",
    repository_selection: "selected",
    permissions: { metadata: "read", issues: "write" },
    suspended_at: null,
    suspended_by: null,
  };
  const repository = {
    id: binding.repository_id,
    name: binding.repo,
    full_name: `${binding.owner}/${binding.repo}`,
    owner: installation.account,
    archived: false,
    disabled: false,
    temp_clone_token: "discard-sensitive-provider-field",
  };
  const bot = { id: binding.author_id, login: `${app.slug}[bot]`, type: "Bot" };
  const requests: RecordRequest[] = [];
  const state = {
    enabled: true,
    authorityCalls: 0,
    brokerCalls: 0,
    lookups: 0,
    invalid: false,
    authorityHook: undefined as undefined | ((n: number) => void),
    lookupHook: undefined as undefined | (() => Promise<{ address: string }[]>),
    responseHook: undefined as undefined | ((n: number, reply: Reply) => Reply),
    advance: (n: number) => {
      now += n;
    },
  };
  const replies = [
    app,
    installation,
    structuredClone(installation),
    repository,
    bot,
  ];
  const ports: GithubInstallationObservationPorts = {
    enabled: () => state.enabled,
    now: () => now,
    deadlineMs: 1000,
    authority: {
      current: async (s) => {
        state.authorityHook?.(++state.authorityCalls);
        assert.equal(s.purpose, "GITHUB_IDENTITY_OBSERVATION");
        assert.ok(Object.isFrozen(s.binding));
        if (state.invalid) throw Error(appLease.jwt);
        return {
          purpose: s.purpose,
          active: true,
          binding_sha256: s.binding_sha256,
        };
      },
    },
    appBroker: {
      resolve: async () => {
        state.brokerCalls++;
        return appLease;
      },
    },
    installationBroker: {
      resolve: async (input) => {
        state.brokerCalls++;
        assert.equal(input.scope, "issues:read");
        return lease;
      },
    },
    lookup: async (host) => {
      state.lookups++;
      assert.equal(host, "api.github.com");
      return state.lookupHook ? state.lookupHook() : [{ address: "8.8.8.8" }];
    },
    request: ((url: URL, options: any, callback: any) => {
      const req = new EventEmitter() as any;
      req.destroyed = false;
      req.destroy = () => {
        req.destroyed = true;
        return req;
      };
      req.end = (body?: string) => {
        requests.push({ url, options, body });
        const n = requests.length - 1;
        queueMicrotask(() => {
          const reply = state.responseHook?.(n, { data: replies[n] }) ?? {
            data: replies[n],
          };
          if (reply.error) {
            req.emit("error", Error(appLease.jwt + lease.token));
            return;
          }
          if (reply.hang) return;
          const r = Readable.from(
            reply.chunks ?? [
              reply.bytes ?? Buffer.from(JSON.stringify(reply.data)),
            ],
          ) as any;
          r.statusCode = reply.status ?? 200;
          r.headers = { "content-type": "application/json", ...reply.headers };
          r.complete = reply.complete ?? true;
          callback(r);
          if (reply.close) r.emit("close");
        });
        return req;
      };
      return req;
    }) as typeof https.request,
  };
  return {
    binding,
    appLease,
    lease,
    app,
    installation,
    repository,
    bot,
    claims,
    header,
    jwt,
    requests,
    state,
    ports,
    replies,
    observe: (signal?: AbortSignal) =>
      new GithubInstallationObserver(binding, ports).observe(signal),
  };
}
const denied = (r: unknown) =>
  assert.deepEqual(r, {
    outcome: "UNAVAILABLE",
    reason: "IDENTITY_OBSERVATION_UNAVAILABLE",
  });

test("five exact fixed-origin GETs bind provider identity without issuing or leaking credentials", async () => {
  const f = setup();
  const result = await f.observe();
  assert.equal(result.outcome, "OBSERVED");
  if (result.outcome !== "OBSERVED") return;
  assert.equal(result.purpose, "IDENTITY_OBSERVATION_ONLY");
  assert.equal(result.repository_id, f.binding.repository_id);
  assert.equal(result.author_id, f.binding.author_id);
  assert.ok(Object.isFrozen(result.installation_permissions));
  assert.equal(f.state.brokerCalls, 2);
  assert.deepEqual(
    f.requests.map((r) => r.url.pathname),
    [
      "/app",
      "/app/installations/902",
      "/repos/Example-Org/work-plans/installation",
      "/repos/Example-Org/work-plans",
      "/users/kxra-offline%5Bbot%5D",
    ],
  );
  for (let n = 0; n < f.requests.length; n++) {
    const r = f.requests[n];
    assert.equal(r.url.origin, "https://api.github.com");
    assert.equal(r.url.search, "");
    assert.equal(r.body, undefined);
    assert.equal(r.options.method, "GET");
    assert.equal(r.options.port, 443);
    assert.equal(r.options.servername, "api.github.com");
    assert.equal(r.options.rejectUnauthorized, true);
    assert.equal(r.options.minVersion, "TLSv1.2");
    assert.equal(r.options.agent, false);
    assert.equal(r.options.autoSelectFamily, false);
    assert.equal(
      r.options.headers.authorization,
      n < 3
        ? `Bearer ${f.appLease.jwt}`
        : n === 3
          ? `Bearer ${f.lease.token}`
          : undefined,
    );
    assert.equal(r.options.headers["x-github-api-version"], "2026-03-10");
    r.options.lookup(
      "api.github.com",
      { all: false },
      (e: unknown, address: string, family: number) => {
        assert.equal(e, null);
        assert.equal(address, "8.8.8.8");
        assert.equal(family, 4);
      },
    );
    r.options.lookup(
      "api.github.com",
      { all: true },
      (e: unknown, a: unknown) => {
        assert.equal(e, null);
        assert.deepEqual(a, [{ address: "8.8.8.8", family: 4 }]);
      },
    );
    r.options.lookup("attacker.invalid", {}, (e: unknown) => assert.ok(e));
  }
  const output = JSON.stringify(result);
  for (const secret of [
    f.appLease.jwt,
    f.lease.token,
    f.binding.credential_ref,
    "provider-private-data",
    "discard-sensitive-provider-field",
    f.app.client_id,
  ])
    assert.ok(!output.includes(secret));
});

test("numeric App ID JWT issuer also works", async () => {
  const f = setup();
  f.appLease.jwt = f.jwt(f.header, { ...f.claims, iss: f.binding.app_id });
  assert.equal((await f.observe()).outcome, "OBSERVED");
});

test("default off, explicitly disabled and already aborted do not touch authority, broker or network", async () => {
  for (const mode of ["default", "disabled", "aborted"]) {
    const f = setup();
    if (mode === "default") {
      delete f.ports.enabled;
      assert.notEqual(
        process.env.KXRA_GITHUB_IDENTITY_OBSERVATION_ENABLED,
        "true",
      );
    }
    if (mode === "disabled") f.state.enabled = false;
    const controller = new AbortController();
    if (mode === "aborted") controller.abort();
    denied(await f.observe(controller.signal));
    assert.equal(
      f.state.authorityCalls +
        f.state.brokerCalls +
        f.state.lookups +
        f.requests.length,
      0,
    );
  }
});

test("one instance cannot run twice or concurrently", async () => {
  const f = setup();
  const observer = new GithubInstallationObserver(f.binding, f.ports);
  const running = observer.observe();
  denied(await observer.observe());
  assert.equal((await running).outcome, "OBSERVED");
  denied(await observer.observe());
  assert.equal(f.requests.length, 5);
});

const mismatches: [string, (f: ReturnType<typeof setup>) => void, number][] = [
  [
    "App ID",
    (f) => {
      f.app.id++;
    },
    1,
  ],
  [
    "App client",
    (f) => {
      f.app.client_id += "x";
    },
    1,
  ],
  [
    "unsafe slug",
    (f) => {
      f.app.slug = "../app";
    },
    1,
  ],
  [
    "App extra permission",
    (f) => {
      (f.app.permissions as any).contents = "read";
    },
    1,
  ],
  [
    "App read-only issues",
    (f) => {
      f.app.permissions.issues = "read";
    },
    1,
  ],
  [
    "installation ID",
    (f) => {
      f.installation.id++;
    },
    2,
  ],
  [
    "installation App",
    (f) => {
      f.installation.app_id++;
    },
    2,
  ],
  [
    "installation slug",
    (f) => {
      f.installation.app_slug += "x";
    },
    2,
  ],
  [
    "account ID",
    (f) => {
      f.installation.account.id++;
    },
    2,
  ],
  [
    "account login",
    (f) => {
      f.installation.account.login += "x";
    },
    2,
  ],
  [
    "target ID",
    (f) => {
      f.installation.target_id++;
    },
    2,
  ],
  [
    "target type",
    (f) => {
      f.installation.target_type = "User";
    },
    2,
  ],
  [
    "all repositories",
    (f) => {
      f.installation.repository_selection = "all";
    },
    2,
  ],
  [
    "suspended timestamp",
    (f) => {
      (f.installation as any).suspended_at = new Date().toISOString();
    },
    2,
  ],
  [
    "suspended actor",
    (f) => {
      (f.installation as any).suspended_by = { id: 7 };
    },
    2,
  ],
  [
    "installation extra permission",
    (f) => {
      (f.installation.permissions as any).administration = "write";
    },
    2,
  ],
  [
    "repository installation permission drift",
    (f) => {
      (f.replies[2] as typeof f.installation).permissions.issues = "read";
    },
    3,
  ],
  [
    "repository installation ID drift",
    (f) => {
      f.replies[2].id++;
    },
    3,
  ],
  [
    "repository numeric identity",
    (f) => {
      f.repository.id++;
    },
    4,
  ],
  [
    "repository transfer",
    (f) => {
      f.repository.full_name = "Other/work-plans";
    },
    4,
  ],
  [
    "repository rename",
    (f) => {
      f.repository.name += "x";
    },
    4,
  ],
  [
    "repository archived",
    (f) => {
      f.repository.archived = true;
    },
    4,
  ],
  [
    "repository disabled",
    (f) => {
      f.repository.disabled = true;
    },
    4,
  ],
  [
    "bot ID",
    (f) => {
      f.bot.id++;
    },
    5,
  ],
  [
    "bot login",
    (f) => {
      f.bot.login += "x";
    },
    5,
  ],
  [
    "bot type",
    (f) => {
      f.bot.type = "User";
    },
    5,
  ],
];
for (const [name, mutate, requests] of mismatches)
  test(`refuse mismatched ${name}`, async () => {
    const f = setup();
    mutate(f);
    denied(await f.observe());
    assert.equal(f.requests.length, requests);
  });

const badLeases: [string, (f: ReturnType<typeof setup>) => void][] = [
  [
    "App binding",
    (f) => {
      f.appLease.binding_sha256 = "0".repeat(64);
    },
  ],
  [
    "App ID",
    (f) => {
      f.appLease.app_id++;
    },
  ],
  [
    "JWT mode",
    (f) => {
      f.appLease.mode = "GITHUB_APP_INSTALLATION";
    },
  ],
  [
    "JWT algorithm",
    (f) => {
      f.appLease.jwt = f.jwt({ ...f.header, alg: "none" });
    },
  ],
  [
    "JWT external key",
    (f) => {
      f.appLease.jwt = f.jwt({
        ...f.header,
        jku: "https://attacker.invalid",
      } as any);
    },
  ],
  [
    "JWT wrong issuer",
    (f) => {
      f.appLease.jwt = f.jwt(f.header, { ...f.claims, iss: "wrong" });
    },
  ],
  [
    "JWT future issuance",
    (f) => {
      f.appLease.jwt = f.jwt(f.header, { ...f.claims, iat: f.claims.iat + 61 });
    },
  ],
  [
    "JWT old issuance",
    (f) => {
      f.appLease.jwt = f.jwt(f.header, {
        ...f.claims,
        iat: f.claims.iat - 661,
      });
    },
  ],
  [
    "JWT long expiry",
    (f) => {
      f.appLease.jwt = f.jwt(f.header, {
        ...f.claims,
        exp: f.claims.exp + 301,
      });
    },
  ],
  [
    "JWT expired",
    (f) => {
      f.appLease.jwt = f.jwt(f.header, { ...f.claims, exp: f.claims.iat });
    },
  ],
  [
    "JWT mismatched expiry",
    (f) => {
      f.appLease.expires_at = new Date(
        Date.parse(f.appLease.expires_at) + 1000,
      ).toISOString();
    },
  ],
  [
    "JWT malformed",
    (f) => {
      f.appLease.jwt = "a.b.c";
    },
  ],
  [
    "installation binding",
    (f) => {
      f.lease.binding_sha256 = "0".repeat(64);
    },
  ],
  [
    "installation ID",
    (f) => {
      f.lease.installation_id++;
    },
  ],
  [
    "installation App",
    (f) => {
      f.lease.app_id++;
    },
  ],
  [
    "credential reference",
    (f) => {
      f.lease.credential_ref += "x";
    },
  ],
  [
    "credential epoch",
    (f) => {
      f.lease.credential_version++;
    },
  ],
  [
    "repository ID",
    (f) => {
      f.lease.repository_ids = [999];
    },
  ],
  [
    "multiple repositories",
    (f) => {
      f.lease.repository_ids.push(999);
    },
  ],
  [
    "write lease for read",
    (f) => {
      f.lease.permissions.issues = "write";
    },
  ],
  [
    "extra token permission",
    (f) => {
      (f.lease.permissions as any).contents = "read";
    },
  ],
  [
    "expired installation lease",
    (f) => {
      f.lease.expires_at = new Date(1).toISOString();
    },
  ],
  [
    "binding deadline exceeded",
    (f) => {
      f.lease.expires_at = new Date(
        Date.parse(f.binding.expires_at) + 1,
      ).toISOString();
    },
  ],
  [
    "header injection",
    (f) => {
      f.lease.token += "\r\n";
    },
  ],
];
for (const [name, mutate] of badLeases)
  test(`reject invalid ${name} before DNS or HTTP`, async () => {
    const f = setup();
    mutate(f);
    denied(await f.observe());
    assert.equal(f.state.lookups + f.requests.length, 0);
  });

for (const addresses of [
  [],
  [{ address: "127.0.0.1" }],
  [{ address: "8.8.8.8" }, { address: "10.0.0.1" }],
  [{ address: "::1" }],
])
  test(`reject unsafe DNS ${JSON.stringify(addresses)}`, async () => {
    const f = setup();
    f.state.lookupHook = async () => addresses;
    denied(await f.observe());
    assert.equal(f.requests.length, 0);
  });

for (let n = 1; n <= 18; n++)
  test(`fresh authority withdrawal at checkpoint ${n} prevents success and later calls`, async () => {
    const f = setup();
    f.state.authorityHook = (call) => {
      if (call === n) f.state.invalid = true;
    };
    denied(await f.observe());
    assert.equal(f.state.authorityCalls, n);
    assert.ok(f.requests.length <= 5);
  });

test("wrong-purpose and wrong-binding authority cannot grant observations", async () => {
  for (const ack of [
    { purpose: "REPOSITORY_READ", active: true },
    { purpose: "GITHUB_IDENTITY_OBSERVATION", active: false },
    {
      purpose: "GITHUB_IDENTITY_OBSERVATION",
      active: true,
      binding_sha256: "0".repeat(64),
    },
  ]) {
    const f = setup();
    f.ports.authority.current = async () => ({
      binding_sha256: githubBindingDigest(f.binding),
      ...ack,
    });
    denied(await f.observe());
    assert.equal(f.state.brokerCalls, 0);
  }
});

const badResponses: [string, Reply][] = [
  [
    "redirect",
    { status: 302, headers: { location: "https://attacker.invalid" } },
  ],
  ["private bot or missing", { status: 404 }],
  ["rate limit", { status: 429 }],
  ["exhausted quota", { headers: { "x-ratelimit-remaining": "0" } }],
  ["malformed quota", { headers: { "x-ratelimit-remaining": ["5", "5"] } }],
  ["retry after", { headers: { "retry-after": "1" } }],
  ["compressed", { headers: { "content-encoding": "gzip" } }],
  ["wrong media", { headers: { "content-type": "text/html" } }],
  ["declared oversized", { headers: { "content-length": "262145" } }],
  ["body oversized", { bytes: Buffer.alloc(262145) }],
  [
    "many chunks",
    { chunks: Array.from({ length: 513 }, () => Buffer.from(" ")) },
  ],
  ["invalid JSON", { bytes: Buffer.from("{") }],
  ["invalid UTF8", { bytes: Buffer.from([255]) }],
  ["incomplete", { complete: false, close: true }],
  ["wrong length", { headers: { "content-length": "0" } }],
  ["transport exception", { error: true }],
];
for (const [name, reply] of badResponses)
  test(`bounded transport rejects ${name} without follow-up or secrets`, async () => {
    const f = setup();
    f.state.responseHook = (_, base) => ({ ...base, ...reply });
    denied(await f.observe());
    assert.equal(f.requests.length, 1);
  });

test("expiry or disable after a provider reply prevents follow-up", async () => {
  for (const mode of ["appExpiry", "bindingExpiry", "disable"]) {
    const f = setup();
    f.state.responseHook = (_, reply) => {
      if (mode === "disable") f.state.enabled = false;
      else f.state.advance(mode === "appExpiry" ? 300000 : 600000);
      return reply;
    };
    denied(await f.observe());
    assert.equal(f.requests.length, 1);
  }
});

test("deadline cancels hanging request and late broker resolution cannot send", async () => {
  const f = setup();
  f.ports.deadlineMs = 15;
  f.state.responseHook = () => ({ hang: true });
  denied(await f.observe());
  assert.equal(f.requests.length, 1);
  const g = setup();
  g.ports.deadlineMs = 15;
  let resolve!: (v: unknown) => void;
  g.ports.appBroker.resolve = () =>
    new Promise((r) => {
      resolve = r;
    });
  denied(await g.observe());
  resolve(g.appLease);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(g.requests.length + g.state.lookups, 0);
});

test("abort while DNS pending, invalid monotonic clock and invalid wall clock fail closed", async () => {
  const f = setup();
  const controller = new AbortController();
  f.state.lookupHook = async () => {
    controller.abort();
    return [{ address: "8.8.8.8" }];
  };
  denied(await f.observe(controller.signal));
  assert.equal(f.requests.length, 0);
  for (const value of [NaN, Infinity]) {
    const g = setup();
    g.ports.now = () => value;
    denied(await g.observe());
    assert.equal(g.requests.length, 0);
  }
  const g = setup();
  let ticks = 0;
  g.ports.monotonic = () => (++ticks === 1 ? 100 : 99);
  denied(await g.observe());
  assert.equal(g.state.brokerCalls, 0);
});

test("invalid constructor inputs expose only a generic error", () => {
  const f = setup();
  assert.throws(
    () =>
      new GithubInstallationObserver(
        { ...f.binding, secret: f.lease.token },
        f.ports,
      ),
    /^Error: GITHUB_IDENTITY_OBSERVATION_UNAVAILABLE$/,
  );
  assert.throws(
    () =>
      new GithubInstallationObserver(f.binding, {
        ...f.ports,
        deadlineMs: 10001,
      }),
    /^Error: GITHUB_IDENTITY_OBSERVATION_UNAVAILABLE$/,
  );
});

for (let endpoint = 0; endpoint < 5; endpoint++) {
  test(`404 on endpoint ${endpoint + 1} never produces partial identity evidence`, async () => {
    const f = setup();
    f.state.responseHook = (n, reply) =>
      n === endpoint ? { ...reply, status: 404 } : reply;
    denied(await f.observe());
    assert.equal(f.requests.length, endpoint + 1);
  });
  test(`abort on endpoint ${endpoint + 1} prevents any later observation`, async () => {
    const f = setup(),
      controller = new AbortController();
    f.state.responseHook = (n, reply) => {
      if (n === endpoint) controller.abort();
      return reply;
    };
    denied(await f.observe(controller.signal));
    assert.equal(f.requests.length, endpoint + 1);
  });
}
test("installation lease expiry during DNS prevents HTTP even with a valid App JWT", async () => {
  const f = setup();
  f.lease.expires_at = new Date(
    Date.parse(f.appLease.expires_at) - 120000,
  ).toISOString();
  f.state.lookupHook = async () => {
    f.state.advance(180000);
    return [{ address: "8.8.8.8" }];
  };
  denied(await f.observe());
  assert.equal(f.requests.length, 0);
});
test("late installation broker resolution after deadline cannot send", async () => {
  const f = setup();
  f.ports.deadlineMs = 15;
  let resolve!: (v: unknown) => void;
  f.ports.installationBroker.resolve = () =>
    new Promise((r) => {
      resolve = r;
    });
  denied(await f.observe());
  resolve(f.lease);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(f.requests.length + f.state.lookups, 0);
});
