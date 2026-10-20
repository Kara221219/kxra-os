import { test } from "node:test";
import assert from "node:assert/strict";
import { testOrigin as base } from "./support/runtime";
test("retired studios deny all authenticated API operations and pause new checkout", async () => {
  assert.equal((await fetch(base + "/api/brand-studio")).status, 401);
  const signed = await fetch(base + "/api/auth", {
    method: "POST",
    headers: { origin: base },
    body: new URLSearchParams({ fixture: "owner" }),
    redirect: "manual",
  });
  const cookie = signed.headers
    .getSetCookie()
    .map((x) => x.split(";", 1)[0])
    .join("; ");
  for (const path of [
    "/api/brand-studio",
    "/api/brand-studio/sources",
    "/api/brand-studio/generate",
    "/api/brand-studio/exports/example",
    "/api/video-studio",
  ]) {
    for (const method of ["GET", "POST", "PATCH"]) {
      const r = await fetch(base + path, {
        method,
        headers: { cookie, origin: base, "content-type": "application/json" },
        ...(method !== "GET" ? { body: "{}" } : {}),
      });
      assert.equal(r.status, 410, path);
    }
  }
  assert.deepEqual(
    await (await fetch(base + "/api/plans", { headers: { cookie } })).json(),
    [],
  );
  assert.equal(
    (
      await fetch(base + "/api/billing-sessions/checkout", {
        method: "POST",
        headers: { cookie, origin: base, "content-type": "application/json" },
        body: "{}",
      })
    ).status,
    410,
  );
});
