import assert from "node:assert/strict";
import test from "node:test";
import {
  assertGlobalAddress,
  fetchPublicSnapshot,
  type PinnedPublicTransport,
} from "../packages/integrations/public-web";

test("AT-27 public source fetch pins validated addresses and revalidates redirects", async () => {
  const calls: { url: string; addresses: readonly string[] }[] = [];
  const transport: PinnedPublicTransport = async (url, addresses) => {
    calls.push({ url: url.toString(), addresses });
    if (url.hostname === "example.com")
      return new Response(null, {
        status: 302,
        headers: { location: "https://www.example.com/final#fragment" },
      });
    return new Response("Approved public source", {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  };
  const result = await fetchPublicSnapshot({
    inputUrl: "https://example.com/start",
    resolve: async (hostname) =>
      hostname === "example.com"
        ? ["93.184.216.34"]
        : ["2606:2800:220:1:248:1893:25c8:1946"],
    transport,
  });
  assert.equal(result.final_url, "https://www.example.com/final");
  assert.equal(result.redirects, 1);
  assert.equal(result.body.toString(), "Approved public source");
  assert.equal(result.sha256.length, 64);
  assert.deepEqual(calls[0].addresses, ["93.184.216.34"]);
  assert.equal(calls[1].addresses[0].startsWith("2606:"), true);
});

test("AT-27 public source fetch rejects private DNS and private redirect targets", async () => {
  let calls = 0;
  await assert.rejects(
    fetchPublicSnapshot({
      inputUrl: "https://example.com",
      resolve: async () => ["127.0.0.1"],
      transport: async () => {
        calls += 1;
        return new Response("must not run");
      },
    }),
    /PUBLIC_WEB_ADDRESS_NOT_GLOBAL/,
  );
  assert.equal(calls, 0);

  await assert.rejects(
    fetchPublicSnapshot({
      inputUrl: "https://example.com",
      resolve: async (hostname) =>
        hostname === "example.com" ? ["93.184.216.34"] : ["10.0.0.5"],
      transport: async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://internal.example/metadata" },
        }),
    }),
    /PUBLIC_WEB_ADDRESS_NOT_GLOBAL/,
  );
});

test("AT-27 public source fetch rejects reserved ranges, loops, types and size", async () => {
  for (const address of [
    "0.0.0.0",
    "10.1.2.3",
    "100.64.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.1.1",
    "198.51.100.1",
    "224.0.0.1",
    "::",
    "::1",
    "fc00::1",
    "fe80::1",
    "2001:db8::1",
  ])
    assert.throws(() => assertGlobalAddress(address));

  const base = {
    inputUrl: "https://example.com",
    resolve: async () => ["93.184.216.34"],
  };
  await assert.rejects(
    fetchPublicSnapshot({
      ...base,
      maximumRedirects: 1,
      transport: async () =>
        new Response(null, { status: 302, headers: { location: "/again" } }),
    }),
    /PUBLIC_WEB_REDIRECT_LIMIT/,
  );
  await assert.rejects(
    fetchPublicSnapshot({
      ...base,
      transport: async () =>
        new Response("binary", {
          headers: { "content-type": "application/octet-stream" },
        }),
    }),
    /PUBLIC_WEB_CONTENT_TYPE_REJECTED/,
  );
  await assert.rejects(
    fetchPublicSnapshot({
      ...base,
      maximumBytes: 4,
      transport: async () =>
        new Response("too large", { headers: { "content-type": "text/html" } }),
    }),
    /PUBLIC_WEB_CONTENT_TOO_LARGE/,
  );
});
