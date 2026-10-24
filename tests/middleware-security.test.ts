import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { middleware } from "../apps/os/middleware";

test("AT-27 OS middleware issues a unique strict nonce policy", async () => {
  const first = await middleware(
    new NextRequest("https://os.example.test/login"),
  );
  const second = await middleware(
    new NextRequest("https://os.example.test/login"),
  );
  const firstPolicy = first.headers.get("content-security-policy") || "";
  const secondPolicy = second.headers.get("content-security-policy") || "";
  const noncePattern = /'nonce-([0-9a-f-]{36})'/i;
  const firstNonce = firstPolicy.match(noncePattern)?.[1];
  const secondNonce = secondPolicy.match(noncePattern)?.[1];

  assert.ok(firstNonce);
  assert.ok(secondNonce);
  assert.notEqual(firstNonce, secondNonce);
  assert.match(firstPolicy, /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  assert.match(firstPolicy, /script-src-attr 'none'/);
  assert.doesNotMatch(
    firstPolicy.match(/script-src[^;]*/)?.[0] || "",
    /'unsafe-inline'/,
  );
  assert.match(firstPolicy, /frame-ancestors 'none'/);
  assert.match(firstPolicy, /object-src 'none'/);
  assert.equal(first.headers.get("cache-control"), "private, no-store");
  assert.equal(first.headers.get("x-content-type-options"), "nosniff");
  assert.equal(first.headers.get("x-frame-options"), "DENY");
  assert.match(
    first.headers.get("permissions-policy") || "",
    /microphone=\(\)/,
  );
});

test("AT-27 invitation routes prevent token referral and caching", async () => {
  const response = await middleware(
    new NextRequest("https://os.example.test/join?token=secret"),
  );
  assert.ok(response.headers.get("content-security-policy"));
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
});

test("exact workspace terms path retains plain-text deny-all policy through middleware", async () => {
  const response = await middleware(
    new NextRequest(
      "https://os.example.test/legal/workspace-terms?sha256=" + "a".repeat(64),
    ),
  );
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(
    response.headers.get("content-security-policy"),
    "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  );
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  for (const sibling of [
    "/legal/workspace-terms-other",
    "/legal/privacy",
    "/billing",
  ]) {
    const ordinary = await middleware(
      new NextRequest("https://os.example.test" + sibling),
    );
    assert.equal(ordinary.headers.get("referrer-policy"), "same-origin");
    assert.match(
      ordinary.headers.get("content-security-policy") || "",
      /script-src 'self' 'nonce-/,
    );
  }
});
