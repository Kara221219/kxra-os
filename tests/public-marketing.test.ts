import { after, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import { marketingOrigin, runtimeFile } from "./support/runtime";

const config = JSON.parse(
  fs.readFileSync(runtimeFile("database.json"), "utf8"),
);
const admin = new pg.Pool({ ...config, user: os.userInfo().username });
const org = "10000000-0000-4000-8000-000000000001";
const owner = "20000000-0000-4000-8000-000000000001";
const partner = "20000000-0000-4000-8000-000000000002";
after(() => admin.end());

async function role(db: pg.PoolClient, actor: string | null) {
  await db.query("reset role");
  await db.query(`set local role ${actor ? "authenticated" : "anon"}`);
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true)",
    [
      actor || "",
      JSON.stringify({ sub: actor, aal: "aal2" }),
      actor ? org : "",
    ],
  );
}

test("AT-26 write-only public RPC stores one owner-only unverified row", async () => {
  const db = await admin.connect();
  try {
    await db.query("begin");
    await role(db, null);
    const key = crypto.randomUUID();
    const digest = crypto.randomBytes(32).toString("hex");
    const fingerprint = crypto.randomBytes(32).toString("hex");
    const submitted = await db.query(
      "select * from kxra.submit_public_enquiry($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
      [
        "CONTACT",
        "Public Test",
        "public-test@example.invalid",
        "Example",
        "A synthetic marketing enquiry with sufficient detail.",
        "/contact",
        true,
        digest,
        fingerprint,
        key,
        "",
      ],
    );
    assert.equal(submitted.rows[0].accepted, true);
    const discarded = await db.query(
      "select * from kxra.submit_public_enquiry($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
      [
        "CONTACT",
        "Bot Test",
        "bot@example.invalid",
        "Example",
        "A synthetic bot request with sufficient detail.",
        "/contact",
        true,
        crypto.randomBytes(32).toString("hex"),
        crypto.randomBytes(32).toString("hex"),
        crypto.randomUUID(),
        "filled-by-bot",
      ],
    );
    assert.equal(discarded.rows[0].accepted, false);
    assert.equal(
      (await db.query("select * from kxra.public_enquiry_submissions"))
        .rowCount,
      0,
    );
    await role(db, partner);
    assert.equal(
      (await db.query("select * from kxra.public_enquiry_submissions"))
        .rowCount,
      0,
    );
    await role(db, owner);
    const row = (
      await db.query(
        "select status,email from kxra.public_enquiry_submissions where id=$1",
        [submitted.rows[0].receipt_id],
      )
    ).rows[0];
    assert.deepEqual(row, {
      status: "UNVERIFIED",
      email: "public-test@example.invalid",
    });
    assert.equal(
      (
        await db.query(
          "select * from kxra.public_enquiry_submissions where id=$1",
          [discarded.rows[0].receipt_id],
        )
      ).rowCount,
      0,
    );
  } finally {
    await db.query("rollback");
    db.release();
  }
});

test("AT-26 HTTP validates origin, shape, deduplicates and rate limits", async () => {
  const payload = {
    kind: "CONTACT",
    name: "HTTP Test",
    email: `marketing-${crypto.randomUUID()}@example.invalid`,
    company: "Example",
    message: "A synthetic public request that contains enough detail.",
    sourcePath: "/contact",
    consent: true,
    website: "",
  };
  const idempotency = crypto.randomUUID();
  const call = (body: unknown, headers: Record<string, string> = {}) =>
    fetch(marketingOrigin + "/api/enquiries", {
      method: "POST",
      headers: {
        origin: marketingOrigin,
        "content-type": "application/json",
        "idempotency-key": idempotency,
        "x-forwarded-for": crypto.randomUUID(),
        ...headers,
      },
      body: JSON.stringify(body),
    });
  assert.equal(
    (await call(payload, { origin: "https://forged.invalid" })).status,
    403,
  );
  assert.equal((await call({ ...payload, message: "short" })).status, 400);
  const first = await call(payload);
  assert.equal(first.status, 202, await first.clone().text());
  const receipt = (await first.json()).receipt;
  const replay = await call(payload);
  assert.equal(replay.status, 202);
  assert.equal((await replay.json()).receipt, receipt);

  const fixedIp = `fixture-${crypto.randomUUID()}`;
  for (let index = 0; index < 5; index += 1) {
    const response = await fetch(marketingOrigin + "/api/enquiries", {
      method: "POST",
      headers: {
        origin: marketingOrigin,
        "content-type": "application/json",
        "idempotency-key": crypto.randomUUID(),
        "x-forwarded-for": fixedIp,
      },
      body: JSON.stringify({
        ...payload,
        email: `rate-${index}-${crypto.randomUUID()}@example.invalid`,
        message: `Synthetic rate request ${index} with sufficient detail.`,
      }),
    });
    assert.equal(response.status, 202);
  }
  const blocked = await fetch(marketingOrigin + "/api/enquiries", {
    method: "POST",
    headers: {
      origin: marketingOrigin,
      "content-type": "application/json",
      "idempotency-key": crypto.randomUUID(),
      "x-forwarded-for": fixedIp,
    },
    body: JSON.stringify({
      ...payload,
      email: "rate-blocked@example.invalid",
      message: "Synthetic rate request blocked with sufficient detail.",
    }),
  });
  assert.equal(blocked.status, 429);
});

test("AT-26 concurrent public ingress permits exactly one bounded window", async () => {
  const source = `concurrent-${crypto.randomUUID()}`;
  const tag = crypto.randomUUID();
  const responses = await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      fetch(marketingOrigin + "/api/enquiries", {
        method: "POST",
        headers: {
          origin: marketingOrigin,
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
          "x-forwarded-for": source,
        },
        body: JSON.stringify({
          kind: "CONTACT",
          name: "Concurrent Test",
          email: `concurrent-${tag}-${index}@example.invalid`,
          company: "Example",
          message: `Synthetic concurrent request ${index} with sufficient detail.`,
          sourcePath: "/contact",
          consent: true,
          website: "",
        }),
      }),
    ),
  );
  const statuses = responses.map((response) => response.status).sort();
  assert.equal(statuses.filter((status) => status === 202).length, 5);
  assert.equal(statuses.filter((status) => status === 429).length, 15);
  assert.equal(
    statuses.filter((status) => status !== 202 && status !== 429).length,
    0,
  );
  const persisted = await admin.query(
    "select count(*)::integer as count from kxra.public_enquiry_submissions where email like $1",
    [`concurrent-${tag}-%`],
  );
  assert.equal(persisted.rows[0].count, 5);
});

test("AT-17 login route redirects only to the configured private application", async () => {
  const response = await fetch(marketingOrigin + "/login", {
    redirect: "manual",
  });
  assert.equal(response.status, 307);
  assert.equal(
    response.headers.get("location"),
    `${process.env.KXRA_ORIGIN || "http://127.0.0.1:3210"}/login`,
  );
  assert.equal(response.headers.get("cache-control"), "no-store");
});
