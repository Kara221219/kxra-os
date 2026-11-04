import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import vm from "node:vm";
import { createRequire } from "node:module";
const id = "11111111-1111-4111-8111-111111111111";
const status = {
  admission_id: id,
  provider: "OPENAI",
  model: "synthetic-model",
  endpoint_id: "",
  state: "REVIEW_REQUIRED",
  reason: "AWAITING_PROVIDER_REVIEW",
  next_action: "WAIT_FOR_REVIEW",
  expires_at: "2026-11-05T00:00:00Z",
};
async function harness() {
  const state: {
    rows: unknown[];
    denied: boolean;
    calls: unknown[][];
    actors: number;
  } = { rows: [{ value: status }], denied: false, calls: [], actors: 0 };
  const output = await build({
    entryPoints: ["apps/os/app/api/ai-connection-admission/route.ts"],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    packages: "external",
    plugins: [
      {
        name: "mock-identity-and-transport",
        setup(b) {
          b.onResolve({ filter: /\/auth$/ }, () => ({
            path: "auth",
            namespace: "mock",
          }));
          b.onResolve({ filter: /packages\/db$/ }, () => ({
            path: "db",
            namespace: "mock",
          }));
          b.onResolve({ filter: /\/http$/ }, () => ({
            path: "http",
            namespace: "mock",
          }));
          b.onLoad({ filter: /.*/, namespace: "mock" }, (a) => ({
            loader: "js",
            contents:
              a.path === "auth"
                ? `export class HttpError extends Error{constructor(status,message){super(message);this.status=status}};export async function actor(){__state.actors++;if(__state.denied)throw new HttpError(401,'Sign in required');return {verified:'SERVER'}}`
                : a.path === "db"
                  ? `export async function query(...args){__state.calls.push(args);return __state.rows}`
                  : `import{HttpError}from'auth';export function privateJson(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Cache-Control':'private, no-store'}})};export function safeHttpError(e){return privateJson({error:e instanceof HttpError?e.message:'Request unavailable'},e.status|| (e.name==='ZodError'?400:503))}`,
          }));
          b.onResolve({ filter: /^auth$/ }, () => ({
            path: "auth",
            namespace: "mock",
          }));
        },
      },
    ],
  });
  const module = {
    exports: {} as { GET: (r: Request) => Promise<Response>; POST?: unknown },
  };
  vm.runInNewContext(output.outputFiles[0].text, {
    module,
    exports: module.exports,
    require: createRequire(import.meta.url),
    __state: state,
    Response,
    Request,
    URL,
    console,
  });
  return { state, route: module.exports };
}
test("resume GET forwards only server identity and optional UUID; projection has no secret metadata", async () => {
  const { state, route } = await harness();
  assert.equal(route.POST, undefined);
  let r = await route.GET(
    new Request("https://local.test/api/ai-connection-admission?id=" + id),
  );
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await r.json(), { admission: status });
  assert.deepEqual(JSON.parse(JSON.stringify(state.calls)), [
    [
      { verified: "SERVER" },
      "select kxra.ai_connection_status($1::uuid) value",
      [id],
    ],
  ]);
  state.rows = [{ value: null }];
  r = await route.GET(
    new Request("https://local.test/api/ai-connection-admission"),
  );
  assert.deepEqual(await r.json(), { admission: null });
  assert.equal(Array.isArray(state.calls[1][2]), true);
  assert.equal(state.actors, 2);
});
test("resume GET denies invalid/caller-authority fields before querying and rechecks actor", async () => {
  const { state, route } = await harness();
  for (const q of [
    "id=bad",
    "id=" + id + "&id=" + id,
    "org_id=forged",
    "actor_id=forged",
  ])
    assert.equal(
      (await route.GET(new Request("https://local.test/?" + q))).status,
      400,
    );
  assert.equal(state.calls.length, 0);
  state.denied = true;
  assert.equal(
    (await route.GET(new Request("https://local.test/"))).status,
    401,
  );
  assert.equal(state.calls.length, 0);
});
test("resume rejects secret-bearing/malformed database projections without returning them", async () => {
  const { state, route } = await harness();
  for (const rows of [
    [{ value: { ...status, fingerprint: "SECRET" } }],
    [],
    [{ value: { ...status, admission_id: "bad" } }],
  ]) {
    state.rows = rows;
    const r = await route.GET(new Request("https://local.test/"));
    assert.equal(r.status, 503);
    assert.ok(!JSON.stringify(await r.json()).includes("SECRET"));
  }
});
