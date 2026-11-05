import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import vm from "node:vm";
import { createRequire } from "node:module";
const id = "11111111-1111-4111-8111-111111111111";
async function harness() {
  const state = {
    actor: {
      security_role: "KXRA_OWNER",
      organisation_kind: "KXRA",
      verified: "SERVER",
    },
    calls: [] as any[][],
    rows: [{ value: { items: [], next_cursor: null } }] as any[],
    denied: false,
  };
  const env: Record<string, string> = {};
  const out = await build({
    entryPoints: ["apps/os/app/api/review-operations/route.ts"],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    packages: "external",
    plugins: [
      {
        name: "verified-identity-query-seams",
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
          b.onResolve({ filter: /^auth$/ }, () => ({
            path: "auth",
            namespace: "mock",
          }));
          b.onLoad({ filter: /.*/, namespace: "mock" }, (a) => ({
            loader: "js",
            contents:
              a.path === "auth"
                ? `export class HttpError extends Error {constructor(status,message){super(message);this.status=status}};export async function actor(){if(__state.denied)throw new HttpError(401,'Sign in required');return __state.actor};export function sameOrigin(r){if(r.headers.get('origin')!==new URL(r.url).origin)throw new HttpError(403,'Origin denied')}`
                : a.path === "db"
                  ? `export async function query(...args){__state.calls.push(args);return __state.rows}`
                  : `import{HttpError}from'auth';export function privateJson(d,status=200){return new Response(JSON.stringify(d),{status,headers:{'cache-control':'private, no-store'}})};export async function readJson(r,max){const s=await r.text();if(s.length>max)throw new HttpError(413,'Too large');return JSON.parse(s)};export function safeHttpError(e){return privateJson({error:e instanceof HttpError?e.message:'Request unavailable'},e.status||(e.name==='ZodError'?400:503))}`,
          }));
        },
      },
    ],
  });
  const module = {
    exports: {} as {
      GET: (r: Request) => Promise<Response>;
      POST: (r: Request) => Promise<Response>;
    },
  };
  vm.runInNewContext(out.outputFiles[0].text, {
    module,
    exports: module.exports,
    require: createRequire(import.meta.url),
    __state: state,
    process: { env },
    Response,
    Request,
    URL,
    console,
  });
  return { state, env, route: module.exports };
}
const get = (query = "") =>
  new Request("https://local.test/api/review-operations" + query);
const post = (data: unknown, origin = "https://local.test") =>
  new Request("https://local.test/api/review-operations", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(data),
  });
test("operator API remains off without exact server configuration and denies customer identities without a query", async () => {
  const { state, env, route } = await harness();
  assert.equal((await route.GET(get())).status, 503);
  env.KXRA_REVIEW_OPERATIONS_ENABLED = "true";
  env.KXRA_REVIEW_OPERATIONS_POLICY_SHA256 = "bad";
  assert.equal((await route.GET(get())).status, 503);
  env.KXRA_REVIEW_OPERATIONS_POLICY_SHA256 = "a".repeat(64);
  state.actor.security_role = "ORG_ADMIN";
  state.actor.organisation_kind = "CUSTOMER";
  assert.equal((await route.GET(get())).status, 403);
  assert.equal(state.calls.length, 0);
});
test("operator API rejects forged authority, duplicate selectors and cross-origin commands before mutation", async () => {
  const { state, env, route } = await harness();
  Object.assign(env, {
    KXRA_REVIEW_OPERATIONS_ENABLED: "true",
    KXRA_REVIEW_OPERATIONS_POLICY_SHA256: "a".repeat(64),
  });
  for (const q of [
    "?request_id=" + id + "&request_id=" + id,
    "?org_id=" + id,
    "?after=AI:" + id + "&request_id=" + id,
  ])
    assert.equal((await route.GET(get(q))).status, 400);
  assert.equal(
    (
      await route.POST(
        post(
          { action: "OPEN", kind: "AI", subject_id: id },
          "https://wrong.invalid",
        ),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await route.POST(
        post({ action: "OPEN", kind: "AI", subject_id: id, reviewer_id: id }),
      )
    ).status,
    400,
  );
  assert.equal(state.calls.length, 0);
});
test("operator API forwards server identity and pinned policy only, rejects secret-bearing database responses", async () => {
  const { state, env, route } = await harness();
  Object.assign(env, {
    KXRA_REVIEW_OPERATIONS_ENABLED: "true",
    KXRA_REVIEW_OPERATIONS_POLICY_SHA256: "b".repeat(64),
  });
  let r = await route.GET(get());
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await r.json(), {
    result: { items: [], next_cursor: null },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(state.calls[0])), [
    state.actor,
    "select kxra.review_operations($1,$2::jsonb,$3) value",
    ["LIST", "{}", "b".repeat(64)],
  ]);
  state.rows = [
    { value: { items: [], next_cursor: null, encrypted_key: "DO_NOT_RETURN" } },
  ];
  r = await route.GET(get());
  assert.equal(r.status, 503);
  assert.ok(!(await r.text()).includes("DO_NOT_RETURN"));
});
