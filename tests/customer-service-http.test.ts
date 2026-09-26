import { after, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import { runtimeFile, testOrigin } from "./support/runtime";

const config = JSON.parse(
  fs.readFileSync(runtimeFile("database.json"), "utf8"),
);
const admin = new pg.Pool({ ...config, user: os.userInfo().username });
const base = testOrigin;

after(() => admin.end());

type Jar = Map<string, string>;

function remember(jar: Jar, response: Response) {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const values =
    headers.getSetCookie?.() ||
    (response.headers.get("set-cookie")
      ? [response.headers.get("set-cookie") as string]
      : []);
  for (const header of values) {
    const pair = header.split(";", 1)[0];
    const index = pair.indexOf("=");
    if (index > 0) jar.set(pair.slice(0, index), pair.slice(index + 1));
  }
}

async function request(jar: Jar, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (jar.size)
    headers.set(
      "cookie",
      [...jar].map(([key, value]) => `${key}=${value}`).join("; "),
    );
  if ((init.method || "GET") !== "GET" && !headers.has("origin"))
    headers.set("origin", base);
  const response = await fetch(base + path, {
    ...init,
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  });
  remember(jar, response);
  return response;
}

async function json(jar: Jar, path: string, payload: unknown) {
  return request(jar, path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function login(fixture: "owner" | "partner" | "viewer") {
  const jar: Jar = new Map();
  const response = await request(jar, "/api/auth", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ fixture }),
  });
  assert.equal(response.status, 303);
  return jar;
}

test("AT-46 HTTP customer service lifecycle enforces identity, exact versions and private notes", async () => {
  const partner = await login("partner");
  const owner = await login("owner");
  const viewer = await login("viewer");
  const anonymous = new Map<string, string>();

  assert.equal((await request(anonymous, "/api/customer-service")).status, 401);
  const malformed = await json(partner, "/api/customer-service", {
    request_type: "SUPPORT",
    subject: "Synthetic API support",
    description: "A bounded HTTP support request.",
    related_subscription_id: null,
    request_id: crypto.randomUUID(),
    user_id: crypto.randomUUID(),
  });
  assert.equal(malformed.status, 400);

  const createdResponse = await json(partner, "/api/customer-service", {
    request_type: "DATA_RECTIFICATION",
    subject: "Correct synthetic profile data",
    description: "Please review a synthetic profile correction request.",
    related_subscription_id: null,
    request_id: crypto.randomUUID(),
  });
  assert.equal(
    createdResponse.status,
    201,
    await createdResponse.clone().text(),
  );
  const created = (await createdResponse.json()) as { id: string };

  const partnerRows = (await (
    await request(partner, "/api/customer-service")
  ).json()) as Array<{
    id: string;
    request_hash: string;
    version: number;
    events: unknown[];
    internal_notes: unknown[];
  }>;
  const requestRow = partnerRows.find((item) => item.id === created.id);
  assert.ok(requestRow);
  assert.equal(requestRow.version, 1);
  assert.equal(requestRow.events.length, 1);
  assert.deepEqual(requestRow.internal_notes, []);

  const viewerRows = (await (
    await request(viewer, "/api/customer-service")
  ).json()) as Array<{ id: string }>;
  assert.equal(
    viewerRows.some((item) => item.id === created.id),
    false,
  );
  assert.deepEqual(
    await (await request(partner, "/api/customer-service/authority")).json(),
    { can_manage: false },
  );
  assert.deepEqual(
    await (await request(owner, "/api/customer-service/authority")).json(),
    { can_manage: true },
  );

  const forgedTransition = await json(
    partner,
    `/api/customer-service/${created.id}/transition`,
    {
      request_hash: requestRow.request_hash,
      expected_version: 1,
      request_id: crypto.randomUUID(),
      next_state: "ACKNOWLEDGED",
      message: "Forged manager action",
    },
  );
  assert.equal(forgedTransition.status, 409);

  const transition = await json(
    owner,
    `/api/customer-service/${created.id}/transition`,
    {
      request_hash: requestRow.request_hash,
      expected_version: 1,
      request_id: crypto.randomUUID(),
      next_state: "ACKNOWLEDGED",
      message:
        "KXRA received the request. Identity verification is required before action.",
    },
  );
  assert.equal(transition.status, 200, await transition.clone().text());
  assert.deepEqual(await transition.json(), { version: 2 });

  const note = await json(owner, `/api/customer-service/${created.id}/notes`, {
    request_id: crypto.randomUUID(),
    note: "Do not disclose data before the controlled identity check.",
    evidence_reference: "synthetic://identity-check-required",
  });
  assert.equal(note.status, 201, await note.clone().text());

  const partnerAfter = (await (
    await request(partner, "/api/customer-service")
  ).json()) as Array<{
    id: string;
    version: number;
    events: unknown[];
    internal_notes: unknown[];
  }>;
  const afterRow = partnerAfter.find((item) => item.id === created.id);
  assert.ok(afterRow);
  assert.equal(afterRow.version, 2);
  assert.equal(afterRow.events.length, 2);
  assert.deepEqual(afterRow.internal_notes, []);

  const ownerAfter = (await (
    await request(owner, "/api/customer-service")
  ).json()) as Array<{
    id: string;
    internal_notes: unknown[];
  }>;
  assert.equal(
    ownerAfter.find((item) => item.id === created.id)?.internal_notes.length,
    1,
  );

  const stale = await json(
    partner,
    `/api/customer-service/${created.id}/reply`,
    {
      request_hash: requestRow.request_hash,
      expected_version: 1,
      request_id: crypto.randomUUID(),
      message: "Stale reply",
    },
  );
  assert.equal(stale.status, 409);
  const reply = await json(
    partner,
    `/api/customer-service/${created.id}/reply`,
    {
      request_hash: requestRow.request_hash,
      expected_version: 2,
      request_id: crypto.randomUUID(),
      message: "I can complete the identity check through the account portal.",
    },
  );
  assert.equal(reply.status, 200, await reply.clone().text());
  assert.deepEqual(await reply.json(), { version: 3 });

  const crafted = await json(
    partner,
    `/api/customer-service/${crypto.randomUUID()}/cancel`,
    {
      request_hash: requestRow.request_hash,
      expected_version: 3,
      request_id: crypto.randomUUID(),
      message: "Crafted target",
    },
  );
  assert.equal(crafted.status, 409);
});
