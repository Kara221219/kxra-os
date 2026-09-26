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

test("AT-27 CSP covers non-private OS routes without forcing private caching", async () => {
  const response = await middleware(
    new NextRequest("https://os.example.test/join"),
  );
  assert.ok(response.headers.get("content-security-policy"));
  assert.equal(response.headers.get("cache-control"), null);
});
