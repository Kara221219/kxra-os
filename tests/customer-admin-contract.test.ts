import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  CustomerDirectoryError,
  customerDirectoryInputV1,
  customerDirectoryPageV1,
  customerDirectorySql,
  readCustomerDirectory,
  type CustomerDirectoryActor,
  type CustomerDirectoryPorts,
} from "../packages/workspace/customer-admin-contract";

const enabled = { KXRA_OWNER_CUSTOMER_DIRECTORY_ENABLED: "true" };
const id = (n: number) =>
  `10000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const identity = (): CustomerDirectoryActor => ({
  id: id(100),
  organisation_id: id(101),
  org_id: id(101),
  membership_id: id(102),
  provider_session_id: id(103),
  access_version: 2,
  session_version: 3,
  provider_session_version: 3,
  source: "supabase",
  aal: "aal2",
  auth_time: Math.floor(Date.now() / 1000),
  security_role: "KXRA_OWNER",
  organisation_kind: "KXRA",
  relationship_type: "INTERNAL",
  account_state: "ACTIVE",
});
const item = (n = 1) => ({
  organisation_id: id(n),
  name: `Organisation ${n}`,
  slug: `organisation-${n}`,
  organisation_kind: "CUSTOMER",
  relationship_type: "CUSTOMER",
  organisation_state: "ACTIVE",
  updated_at: "2026-11-08T10:00:00.123456Z",
});
const page = (items: unknown[] = [item()], has_more = false) => ({
  version: 1,
  sampled_at: "2026-11-08T10:01:00.123456Z",
  items,
  has_more,
});
function fixture(value: unknown = page(), who: unknown = identity()) {
  const calls: {
    actor: Parameters<CustomerDirectoryPorts["query"]>[0];
    sql: string;
    values: unknown[];
  }[] = [];
  const state = { value, who, identities: 0 };
  const ports: CustomerDirectoryPorts = {
    identity: async () => {
      state.identities++;
      return state.who as CustomerDirectoryActor | null;
    },
    query: async (actor, sql, values) => {
      calls.push({ actor, sql, values });
      return [{ value: state.value }];
    },
  };
  return { ports, state, calls };
}
const denied = (code: CustomerDirectoryError["code"]) => (error: unknown) => {
  assert.ok(error instanceof CustomerDirectoryError);
  assert.equal(error.code, code);
  assert.equal(error.message, `CUSTOMER_DIRECTORY_${code}`);
  return true;
};
function decode(token: string) {
  return JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
}
function encode(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

test("default-off adapter does not resolve identity or access SQL", async () => {
  for (const flag of [undefined, "", "1", "TRUE", "false"]) {
    const f = fixture();
    await assert.rejects(
      readCustomerDirectory({ version: 1 }, f.ports, {
        KXRA_OWNER_CUSTOMER_DIRECTORY_ENABLED: flag,
      }),
      denied("DISABLED"),
    );
    assert.equal(f.state.identities, 0);
    assert.equal(f.calls.length, 0);
  }
});

test("strict versioned input bounds pagination and refuses caller authority", async () => {
  for (const input of [
    null,
    {},
    { version: 2 },
    { version: 1, page_size: 0 },
    { version: 1, page_size: 51 },
    { version: 1, page_size: 1.1 },
    { version: 1, page_size: "10" },
    { version: 1, page_size: Infinity },
    { version: 1, page_size: NaN },
    { version: 1, organisation_state: "REVOKED" },
    { version: 1, cursor: "" },
    { version: 1, cursor: "x".repeat(769) },
    { version: 1, cursor: "not+base64/=" },
    ...[
      "id",
      "org_id",
      "organisation_id",
      "membership_id",
      "security_role",
      "actor",
      "source",
      "offset",
      "sort",
      "search",
      "room_id",
      "provider_session_id",
      "action",
    ].map((key) => ({ version: 1, [key]: "KXRA_OWNER" })),
  ]) {
    const f = fixture();
    await assert.rejects(
      readCustomerDirectory(input, f.ports, enabled),
      denied("INVALID_INPUT"),
    );
    assert.equal(f.state.identities, 0);
    assert.equal(f.calls.length, 0);
  }
  assert.deepEqual(customerDirectoryInputV1.parse({ version: 1 }), {
    version: 1,
    page_size: 25,
  });
});

test("server actor preflight denies tenants, staff, partners and invalid current identity before SQL", async () => {
  const a = identity();
  for (const who of [
    null,
    {},
    ...["ORG_ADMIN", "KXRA_STAFF", "ORG_MEMBER", "owner"].map(
      (security_role) => ({ ...a, security_role }),
    ),
    { ...a, organisation_kind: "CUSTOMER" },
    ...["PARTNER", "CUSTOMER", "CLIENT"].map((relationship_type) => ({
      ...a,
      relationship_type,
    })),
    ...["SUSPENDED", "REVOKED", "ONBOARDING"].map((account_state) => ({
      ...a,
      account_state,
    })),
    ...["fixture", "fake-provider", undefined].map((source) => ({
      ...a,
      source,
    })),
    { ...a, aal: "aal1" },
    { ...a, org_id: id(999) },
    { ...a, id: "invalid" },
    { ...a, organisation_id: undefined },
    { ...a, membership_id: undefined },
    { ...a, access_version: 0 },
    { ...a, access_version: 1.1 },
    { ...a, session_version: 0 },
    { ...a, session_version: 2147483648 },
    { ...a, provider_session_version: 2 },
    { ...a, provider_session_id: undefined },
    { ...a, provider_session_id: "bad" },
    { ...a, auth_time: 0 },
    { ...a, auth_time: a.auth_time! - 901 },
    { ...a, auth_time: a.auth_time! + 62 },
    { ...a, auth_time: Infinity },
  ]) {
    const f = fixture(page(), who);
    await assert.rejects(
      readCustomerDirectory({ version: 1 }, f.ports, enabled),
      denied("IDENTITY_REQUIRED"),
    );
    assert.equal(f.calls.length, 0);
  }
});

test("only the reviewed CASE-guarded RPC surface is called using an immutable actor projection", async () => {
  const a = {
    ...identity(),
    email: "must-not-propagate@example.invalid",
    room_worker_grant: "must-not-propagate",
    arbitrary: true,
  };
  const f = fixture(page(), a);
  const result = await readCustomerDirectory({ version: 1 }, f.ports, enabled);
  assert.equal(f.calls.length, 1);
  const call = f.calls[0];
  assert.equal(call.sql, customerDirectorySql);
  assert.match(
    call.sql,
    /select case\s+when kxra_owner_metadata\.customer_directory_authorized_v1/,
  );
  assert.match(
    call.sql,
    /then kxra_owner_metadata\.customer_directory_page_v1/,
  );
  assert.doesNotMatch(call.sql, /from kxra\.|set role|grant|is_owner\(/i);
  assert.deepEqual(call.values.slice(0, 3), [a.membership_id, 2, 3]);
  assert.deepEqual(JSON.parse(call.values[3] as string), {
    version: 1,
    after_organisation_id: null,
    organisation_state: null,
    limit: 26,
  });
  assert.ok(Object.isFrozen(call.actor));
  assert.notEqual(call.actor, a);
  assert.equal(call.actor.email, undefined);
  assert.equal(call.actor.room_worker_grant, undefined);
  assert.equal((call.actor as Record<string, unknown>).arbitrary, undefined);
  assert.deepEqual(
    Object.keys(result.items[0]).sort(),
    [
      "organisation_id",
      "name",
      "slug",
      "relationship_type",
      "organisation_state",
      "updated_at",
    ].sort(),
  );
  assert.equal(result.consistency, "LIVE");
  assert.equal(result.sampled_at, page().sampled_at);
  assert.equal(result.next_cursor, null);
});

test("input and actor mutation across awaits cannot change captured scope or SQL selectors", async () => {
  const input = { version: 1, page_size: 1 };
  const actor = identity(),
    original = { ...actor };
  const f = fixture(page([item(1), item(2)], true), actor);
  const query = f.ports.query;
  f.ports.identity = async () => {
    input.page_size = 50;
    return actor;
  };
  f.ports.query = async (captured, sql, values) => {
    actor.id = id(999);
    actor.organisation_id = id(998);
    actor.membership_id = id(997);
    actor.provider_session_id = id(996);
    actor.security_role = "ORG_ADMIN";
    await Promise.resolve();
    assert.equal(captured.id, original.id);
    assert.equal(captured.organisation_id, original.organisation_id);
    assert.equal(captured.provider_session_id, original.provider_session_id);
    assert.equal(values[0], original.membership_id);
    assert.equal(JSON.parse(values[3] as string).limit, 2);
    return query(captured, sql, values);
  };
  const result = await readCustomerDirectory(input, f.ports, enabled);
  assert.equal(result.page_size, 1);
  // The bookmark was also built from the captured actor, not the mutated source.
  f.state.who = original;
  f.state.value = page([item(2)]);
  f.ports.identity = async () => original;
  f.ports.query = query;
  const next = await readCustomerDirectory(
    { version: 1, page_size: 1, cursor: result.next_cursor },
    f.ports,
    enabled,
  );
  assert.equal(next.items[0].organisation_id, id(2));
});

test("keyset pagination uses one bounded lookahead and the last exposed UUID", async () => {
  const f = fixture(page([item(1), item(2), item(3)], true));
  const first = await readCustomerDirectory(
    { version: 1, page_size: 2 },
    f.ports,
    enabled,
  );
  assert.deepEqual(
    first.items.map((row) => row.organisation_id),
    [id(1), id(2)],
  );
  assert.equal(first.has_more, true);
  assert.equal(decode(first.next_cursor!).after_organisation_id, id(2));
  assert.doesNotMatch(
    Buffer.from(first.next_cursor!, "base64url").toString(),
    new RegExp((f.state.who as CustomerDirectoryActor).provider_session_id!),
  );
  f.state.value = page([item(3)]);
  const last = await readCustomerDirectory(
    { version: 1, page_size: 2, cursor: first.next_cursor },
    f.ports,
    enabled,
  );
  assert.equal(f.state.identities, 2);
  assert.equal(f.calls.length, 2);
  assert.equal(
    JSON.parse(f.calls[1].values[3] as string).after_organisation_id,
    id(2),
  );
  assert.deepEqual(
    last.items.map((row) => row.organisation_id),
    [id(3)],
  );
  assert.equal(last.next_cursor, null);
});

test("maximum page returns 50 items after validating 51 and does not return counts", async () => {
  const f = fixture(
    page(
      Array.from({ length: 51 }, (_, n) => item(n + 1)),
      true,
    ),
  );
  const result = await readCustomerDirectory(
    { version: 1, page_size: 50 },
    f.ports,
    enabled,
  );
  assert.equal(JSON.parse(f.calls[0].values[3] as string).limit, 51);
  assert.equal(result.items.length, 50);
  assert.equal(decode(result.next_cursor!).after_organisation_id, id(50));
  assert.deepEqual(
    Object.keys(result).sort(),
    [
      "version",
      "consistency",
      "sampled_at",
      "items",
      "page_size",
      "has_more",
      "next_cursor",
    ].sort(),
  );
});

test("empty pages and exact page-size terminal pages do not invent a next cursor", async () => {
  for (const items of [[], [item(1), item(2)]]) {
    const f = fixture(page(items));
    const result = await readCustomerDirectory(
      { version: 1, page_size: 2 },
      f.ports,
      enabled,
    );
    assert.equal(result.has_more, false);
    assert.equal(result.next_cursor, null);
  }
});

test("all stored organisation lifecycle states are metadata, independent of billing or account state", async () => {
  for (const state of ["ACTIVE", "SUSPENDED", "CLOSED"]) {
    for (const relationship of ["INTERNAL", "PARTNER", "CUSTOMER", "CLIENT"]) {
      const f = fixture(
        page([
          {
            ...item(),
            organisation_state: state,
            relationship_type: relationship,
          },
        ]),
      );
      const result = await readCustomerDirectory(
        { version: 1, organisation_state: state },
        f.ports,
        enabled,
      );
      assert.equal(result.items[0].organisation_state, state);
      assert.equal(result.items[0].relationship_type, relationship);
      assert.equal(
        JSON.parse(f.calls[0].values[3] as string).organisation_state,
        state,
      );
    }
  }
});

test("bookmarks reject accidental reuse with a changed actor, selected org, membership, session or filter", async () => {
  const f = fixture(page([item(1), item(2)], true));
  const original = f.state.who as CustomerDirectoryActor;
  const first = await readCustomerDirectory(
    { version: 1, page_size: 1 },
    f.ports,
    enabled,
  );
  for (const actor of [
    { ...original, id: id(301) },
    { ...original, organisation_id: id(302), org_id: id(302) },
    { ...original, membership_id: id(303) },
    { ...original, access_version: 3 },
    { ...original, provider_session_id: id(304) },
    { ...original, session_version: 4, provider_session_version: 4 },
  ]) {
    const changed = fixture(page([item(2)]), actor);
    await assert.rejects(
      readCustomerDirectory(
        { version: 1, page_size: 1, cursor: first.next_cursor },
        changed.ports,
        enabled,
      ),
      denied("CURSOR_REJECTED"),
    );
    assert.equal(changed.calls.length, 0);
  }
  for (const change of [{ page_size: 2 }, { organisation_state: "ACTIVE" }]) {
    const changed = fixture(page([item(2)]), original);
    await assert.rejects(
      readCustomerDirectory(
        { version: 1, page_size: 1, cursor: first.next_cursor, ...change },
        changed.ports,
        enabled,
      ),
      denied("CURSOR_REJECTED"),
    );
    assert.equal(changed.calls.length, 0);
  }
});

test("strict canonical bookmarks enforce purpose, version, age and bounded shape, not signatures", async () => {
  const f = fixture(page([item(1), item(2)], true));
  const result = await readCustomerDirectory(
    { version: 1, page_size: 1 },
    f.ports,
    enabled,
  );
  const token = decode(result.next_cursor!);
  for (const cursor of [
    "eA",
    encode({}),
    encode({ ...token, version: 2 }),
    encode({ ...token, purpose: "room-content" }),
    encode({ ...token, after_organisation_id: "invalid" }),
    encode({ ...token, after_organisation_id: id(15).toUpperCase() }),
    encode({ ...token, scope: "0".repeat(64) }),
    encode({ ...token, unexpected: true }),
    encode({ ...token, issued_at: Date.now() - 900_001 }),
    encode({ ...token, issued_at: Date.now() + 60_000 }),
    encode({ ...token, issued_at: 1.5 }),
    encode({ ...token, issued_at: Number.MAX_SAFE_INTEGER }),
    Buffer.from(" " + JSON.stringify(token)).toString("base64url"),
  ]) {
    const changed = fixture(page([item(2)]), f.state.who);
    await assert.rejects(
      readCustomerDirectory(
        { version: 1, page_size: 1, cursor },
        changed.ports,
        enabled,
      ),
      denied("CURSOR_REJECTED"),
    );
    assert.equal(changed.calls.length, 0);
  }
});

test("an unsigned caller-constructed bookmark is only a boundary and still goes through fresh authorization", async () => {
  const f = fixture(page([item(1), item(2)], true));
  const first = await readCustomerDirectory(
    { version: 1, page_size: 1 },
    f.ports,
    enabled,
  );
  const made = encode({
    ...decode(first.next_cursor!),
    after_organisation_id: id(20),
  });
  f.state.value = page([item(21)]);
  const changed = await readCustomerDirectory(
    { version: 1, page_size: 1, cursor: made },
    f.ports,
    enabled,
  );
  assert.equal(changed.items[0].organisation_id, id(21));
  assert.equal(f.state.identities, 2);
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].sql, customerDirectorySql);
  assert.equal(
    JSON.parse(f.calls[1].values[3] as string).after_organisation_id,
    id(20),
  );
});

test("matching and altered bookmarks cannot skip denied database authorization; fake-port test only", async () => {
  const f = fixture(page([item(1), item(2)], true));
  const first = await readCustomerDirectory(
    { version: 1, page_size: 1 },
    f.ports,
    enabled,
  );
  // This simulates the prepared RPC result. It does NOT execute or prove SQL.
  f.state.value = null;
  for (const cursor of [
    first.next_cursor,
    encode({ ...decode(first.next_cursor!), after_organisation_id: id(20) }),
  ]) {
    const before = f.calls.length;
    await assert.rejects(
      readCustomerDirectory(
        { version: 1, page_size: 1, cursor },
        f.ports,
        enabled,
      ),
      denied("ACCESS_DENIED"),
    );
    assert.equal(f.calls.length, before + 1); // No fallback read after rejection.
    assert.equal(f.calls.at(-1)!.sql, customerDirectorySql);
  }
});

test("changed actor authorization on a later page is rejected before any further SQL", async () => {
  const f = fixture(page([item(1), item(2)], true));
  const first = await readCustomerDirectory(
    { version: 1, page_size: 1 },
    f.ports,
    enabled,
  );
  const original = f.state.who as CustomerDirectoryActor;
  for (const change of [
    { security_role: "ORG_ADMIN" },
    { account_state: "REVOKED" },
    { aal: "aal1" },
    { provider_session_version: 4 },
    { organisation_kind: "CUSTOMER" },
  ]) {
    f.state.who = { ...original, ...change };
    await assert.rejects(
      readCustomerDirectory(
        { version: 1, page_size: 1, cursor: first.next_cursor },
        f.ports,
        enabled,
      ),
      denied("IDENTITY_REQUIRED"),
    );
    assert.equal(f.calls.length, 1);
  }
});

test("response allowlist rejects unrelated/private fields at any level", async () => {
  for (const key of [
    "email",
    "auth_subject",
    "email_digest",
    "room_name",
    "messages",
    "files",
    "prompts",
    "secret",
    "provider_credentials",
    "revenue",
    "billing_status",
    "account_state",
    "membership_state",
    "created_at",
  ]) {
    for (const value of [
      { ...page(), [key]: "private" },
      page([{ ...item(), [key]: "private" }]),
    ]) {
      const f = fixture(value);
      await assert.rejects(
        readCustomerDirectory({ version: 1 }, f.ports, enabled),
        denied("UNAVAILABLE"),
      );
      assert.equal(f.calls.length, 1);
    }
  }
});

test("malformed, oversized or foreign metadata fails closed", async () => {
  for (const value of [
    {},
    undefined,
    [],
    { ...page(), version: 2 },
    { ...page(), sampled_at: "yesterday" },
    { ...page(), sampled_at: "2026-11-08T10:00Z" },
    { ...page(), sampled_at: "2026-11-08T10:00:00.1234567Z" },
    { ...page(), sampled_at: "2026-11-08T10:00:00+01:00" },
    { ...page(), items: null },
    { ...page(), has_more: "false" },
    page([{ ...item(), organisation_kind: "KXRA" }]),
    page([{ ...item(), organisation_kind: undefined }]),
    page([{ ...item(), organisation_id: id(101) }]),
    page([{ ...item(), organisation_id: id(15).toUpperCase() }]),
    page([{ ...item(), name: "" }]),
    page([{ ...item(), name: "x".repeat(241) }]),
    page([{ ...item(), name: "Name\nprivate" }]),
    page([{ ...item(), name: " name " }]),
    page([{ ...item(), slug: "x".repeat(81) }]),
    page([{ ...item(), slug: "BAD" }]),
    page([{ ...item(), updated_at: "invalid" }]),
    page([{ ...item(), organisation_state: "REVOKED" }]),
    page([{ ...item(), relationship_type: "PAID" }]),
    page(
      Array.from({ length: 52 }, (_, n) => item(n + 1)),
      true,
    ),
  ]) {
    const f = fixture(value);
    f.state.value = value; // Preserve an explicitly malformed undefined value.
    await assert.rejects(
      readCustomerDirectory({ version: 1, page_size: 50 }, f.ports, enabled),
      denied("UNAVAILABLE"),
    );
    assert.equal(f.calls.length, 1);
  }
});

test("lookahead claims, duplicates, row ordering and lifecycle escapes are rejected including the hidden extra row", async () => {
  for (const value of [
    page([], true),
    page([item(1)], true),
    page([item(1), item(2)], true),
    page([item(1), item(2), item(3)], false),
    page([item(1), item(2), item(3), item(4)], true),
    page([item(2), item(1)]),
    page([item(1), item(1)]),
    page([item(1), item(2), item(2)], true),
    page([{ ...item(1), organisation_state: "CLOSED" }]),
    page(
      [item(1), item(2), { ...item(3), organisation_state: "CLOSED" }],
      true,
    ),
    page([item(1), item(2), { ...item(3), organisation_kind: "KXRA" }], true),
  ]) {
    const f = fixture(value);
    await assert.rejects(
      readCustomerDirectory(
        { version: 1, page_size: 2, organisation_state: "ACTIVE" },
        f.ports,
        enabled,
      ),
      denied("UNAVAILABLE"),
    );
  }
});

test("continuations reject replayed or backwards rows rather than loop", async () => {
  const f = fixture(page([item(1), item(2), item(3)], true));
  const first = await readCustomerDirectory(
    { version: 1, page_size: 2 },
    f.ports,
    enabled,
  );
  for (const items of [[item(1)], [item(2)], [item(2), item(3)]]) {
    f.state.value = page(items);
    await assert.rejects(
      readCustomerDirectory(
        { version: 1, page_size: 2, cursor: first.next_cursor },
        f.ports,
        enabled,
      ),
      denied("UNAVAILABLE"),
    );
  }
});

test("absent/denied RPCs and transport failures never fall back or expose SQL/provider detail", async () => {
  for (const failure of [
    Object.assign(Error("private missing schema detail"), { code: "3F000" }),
    Object.assign(Error("private missing function detail"), { code: "42883" }),
    Object.assign(Error("private denied detail"), { code: "42501" }),
    Error("provider session secret"),
  ]) {
    const f = fixture();
    let queries = 0;
    f.ports.query = async () => {
      queries++;
      throw failure;
    };
    await assert.rejects(
      readCustomerDirectory({ version: 1 }, f.ports, enabled),
      denied("UNAVAILABLE"),
    );
    assert.equal(queries, 1);
  }
  for (const rows of [[], [{ value: page() }, { value: page() }], [{}], null]) {
    const f = fixture();
    f.ports.query = async () => rows as { value: unknown }[];
    await assert.rejects(
      readCustomerDirectory({ version: 1 }, f.ports, enabled),
      denied("UNAVAILABLE"),
    );
  }
  const f = fixture();
  f.ports.identity = async () => {
    throw Error("private identity detail");
  };
  await assert.rejects(
    readCustomerDirectory({ version: 1 }, f.ports, enabled),
    denied("IDENTITY_REQUIRED"),
  );
  assert.equal(f.calls.length, 0);
});

test("public output schema rejects extras, excess items and inconsistent pagination", () => {
  const output = {
    version: 1,
    consistency: "LIVE",
    sampled_at: page().sampled_at,
    items: [],
    page_size: 1,
    has_more: false,
    next_cursor: null,
  };
  assert.equal(customerDirectoryPageV1.safeParse(output).success, true);
  for (const change of [
    { total_count: 100 },
    { page_size: 51 },
    { consistency: "SNAPSHOT" },
    { has_more: true },
    { next_cursor: "unexpected" },
    { items: [item(1), item(2)] },
  ])
    assert.equal(
      customerDirectoryPageV1.safeParse({ ...output, ...change }).success,
      false,
    );
});

test("preparation explicitly disclaims authority and has no DB or network implementation", () => {
  const source = fs.readFileSync(
    new URL(
      "../packages/workspace/customer-admin-contract.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /DEFAULT-OFF METADATA ONLY/);
  assert.match(
    source,
    /Test doubles exercise adapter behavior, NOT PostgreSQL authorization/,
  );
  assert.match(source, /Bookmarks are UNSIGNED/);
  assert.match(source, /reader must do this itself for direct invocation too/);
  assert.doesNotMatch(
    source,
    /fetch\(|getPool\(|createClient\(|create table|create function|grant execute|alter policy/i,
  );
});

test("feature disabling during awaited identity stops before SQL", async () => {
  const environment = { ...enabled },
    f = fixture();
  let resolve!: (value: CustomerDirectoryActor) => void;
  f.ports.identity = () =>
    new Promise((done) => {
      resolve = done;
    });
  const pending = readCustomerDirectory({ version: 1 }, f.ports, environment);
  environment.KXRA_OWNER_CUSTOMER_DIRECTORY_ENABLED = "false";
  resolve(identity());
  await assert.rejects(pending, denied("DISABLED"));
  assert.equal(f.calls.length, 0);
});

test("feature disabling during awaited query suppresses the metadata result", async () => {
  const environment = { ...enabled },
    f = fixture();
  let resolve!: (value: { value: unknown }[]) => void;
  let started!: () => void;
  const reachedQuery = new Promise<void>((done) => {
    started = done;
  });
  let calls = 0;
  f.ports.query = () => {
    calls++;
    started();
    return new Promise((done) => {
      resolve = done;
    });
  };
  const pending = readCustomerDirectory({ version: 1 }, f.ports, environment);
  await reachedQuery;
  environment.KXRA_OWNER_CUSTOMER_DIRECTORY_ENABLED = "false";
  resolve([{ value: page() }]);
  await assert.rejects(pending, denied("DISABLED"));
  assert.equal(calls, 1);
});
