import { after, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import { runtimeFile, testOrigin } from "./support/runtime";

const nativeFetch = globalThis.fetch;
const fetch: typeof nativeFetch = (input, init) =>
  nativeFetch(input, { ...init, signal: AbortSignal.timeout(20000) });
const base = testOrigin;
const config = JSON.parse(
  fs.readFileSync(runtimeFile("database.json"), "utf8"),
);
const admin = new pg.Pool({ ...config, user: os.userInfo().username });

after(() => admin.end());

async function login(fixture: string) {
  const response = await fetch(base + "/api/auth", {
    method: "POST",
    headers: { origin: base },
    body: new URLSearchParams({ fixture }),
    redirect: "manual",
  });
  assert.equal(response.status, 303);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  return cookie;
}

async function req(path: string, cookie?: string, payload?: unknown) {
  return fetch(`${base}/api/${path}`, {
    method: payload === undefined ? "GET" : "POST",
    headers: {
      ...(cookie ? { cookie } : {}),
      origin: base,
      "Content-Type": "application/json",
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
}

test("AT-15 HTTP pairing challenge is one-use, redacted and transport-disabled", async () => {
  assert.equal((await req("whatsapp")).status, 401);
  const partner = await login("partner");
  const registry = await req("whatsapp", partner);
  assert.equal(registry.status, 200);
  assert.equal((await registry.json()).transport, "DISABLED");

  const requestId = crypto.randomUUID();
  let challengeId: string | null = null;
  try {
    const response = await req("whatsapp/pairing-challenges", partner, {
      phone_e164: "+447700900111",
      waba_id: "WABA-SYNTHETIC-HTTP",
      phone_number_id: "NUMBER-SYNTHETIC-HTTP",
      request_id: requestId,
    });
    assert.equal(response.status, 201, await response.clone().text());
    const challenge = await response.json();
    challengeId = challenge.challenge_id;
    assert.match(challenge.pairing_code, /^[A-Za-z0-9_-]{32}$/);
    assert.equal(challenge.transport, "DISABLED");

    const stored = (
      await admin.query(
        `select phone_digest,challenge_digest,state
         from kxra.whatsapp_pairing_challenges where id=$1`,
        [challengeId],
      )
    ).rows[0];
    assert.match(stored.phone_digest, /^[a-f0-9]{64}$/);
    assert.match(stored.challenge_digest, /^[a-f0-9]{64}$/);
    assert.equal(stored.state, "PENDING");
    assert.notEqual(stored.phone_digest, "+447700900111");

    const crafted = await req(
      `whatsapp/pairings/${crypto.randomUUID()}/project`,
      partner,
      {
        project_id: "30000000-0000-4000-8000-000000000003",
        request_id: crypto.randomUUID(),
      },
    );
    assert.equal(crafted.status, 409);
  } finally {
    if (challengeId)
      await admin.query(
        "delete from kxra.whatsapp_pairing_challenges where id=$1",
        [challengeId],
      );
  }
});
