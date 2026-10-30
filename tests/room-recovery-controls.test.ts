import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { setImmediate as turn } from "node:timers/promises";

// Exercise the actual handler with synthetic hook/fetch/router ports. This is
// not a browser or hydration proof; it verifies synchronous intent ordering.
const source = fs.readFileSync("apps/os/components/Forms.tsx", "utf8");
const ast = ts.createSourceFile(
  "Forms.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const declarations = ast.statements.filter(
  (node) =>
    ts.isFunctionDeclaration(node) && node.name?.text === "ActionButton",
);
assert.equal(declarations.length, 1);
const compiled = ts.transpileModule(declarations[0].getText(ast), {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;
type Element = { type: string; props: Record<string, any> };
function harness(ready = true) {
  let cursor = 0,
    refreshes = 0;
  const slots: any[] = [];
  const requests: {
    url: string;
    payload: unknown;
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
  }[] = [];
  const jsx = (type: string, props: Record<string, any>) => ({ type, props });
  const scope = vm.createContext(
    {
      exports: {},
      useReady: () => ready,
      useState: (initial: unknown) => {
        const index = cursor++;
        if (!(index in slots)) slots[index] = initial;
        return [
          slots[index],
          (value: unknown) => {
            slots[index] = value;
          },
        ];
      },
      useRef: (initial: unknown) => {
        const index = cursor++;
        if (!(index in slots)) slots[index] = { current: initial };
        return slots[index];
      },
      useRouter: () => ({
        refresh: () => {
          refreshes++;
        },
      }),
      fetch: (url: string, options: { body: string }) =>
        new Promise((resolve, reject) => {
          requests.push({
            url,
            payload: JSON.parse(options.body),
            resolve,
            reject,
          });
        }),
      require: (name: string) => {
        assert.equal(name, "react/jsx-runtime");
        return { jsx, jsxs: jsx };
      },
    },
    { codeGeneration: { strings: false, wasm: false } },
  );
  new vm.Script(compiled, {
    filename: "actual-action-button.cjs",
  }).runInContext(scope);
  const props = {
    url: "/api/room-operations/10000000-0000-4000-8000-000000000001",
    payload: {
      action: "APPROVE_CUSTOMER_BYOK",
      connection_id: "synthetic",
      customer_owned: true,
    },
    label: "Approve",
    confirmation: "I accept provider costs",
    disabled: false,
    secondary: {
      payload: { action: "REVOKE_CUSTOMER_BYOK", connection_id: "synthetic" },
      label: "Revoke",
    },
  };
  function render(overrides: Record<string, unknown> = {}) {
    cursor = 0;
    return (
      scope.exports as { ActionButton: (props: unknown) => Element }
    ).ActionButton({ ...props, ...overrides });
  }
  function elements(node: any, type: string): Element[] {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node))
      return node.flatMap((child) => elements(child, type));
    return [
      ...(node.type === type ? [node] : []),
      ...elements(node.props?.children, type),
    ];
  }
  async function settle(index: number, error = false) {
    if (error) requests[index].reject(Error("Synthetic public rejection"));
    else requests[index].resolve({ ok: true, json: async () => ({}) });
    await turn();
    await turn();
  }
  function confirm() {
    elements(render(), "input")[0].props.onChange({
      target: { checked: true },
    });
  }
  return {
    render,
    elements,
    requests,
    settle,
    confirm,
    refreshes: () => refreshes,
  };
}

test("confirmation, readiness and inactive-rollout guards prevent approval fetches", () => {
  for (const ready of [false, true]) {
    const h = harness(ready),
      buttons = h.elements(h.render(), "button");
    assert.equal(buttons[0].props.disabled, true);
    buttons[0].props.onClick();
    assert.equal(h.requests.length, 0);
  }
  const h = harness();
  h.confirm();
  h.elements(h.render({ disabled: true }), "button")[0].props.onClick();
  assert.equal(h.requests.length, 0);
});

test("rapid approval then revocation cannot issue concurrent conflicting requests", async () => {
  const h = harness();
  h.confirm();
  const buttons = h.elements(h.render(), "button");
  buttons[0].props.onClick();
  buttons[1].props.onClick();
  assert.equal(h.requests.length, 1);
  assert.deepEqual(h.requests[0].payload, {
    action: "APPROVE_CUSTOMER_BYOK",
    connection_id: "synthetic",
    customer_owned: true,
  });
  assert.equal(
    h.requests[0].url,
    "/api/room-operations/10000000-0000-4000-8000-000000000001",
  );
  await h.settle(0);
  assert.equal(h.refreshes(), 1);
  h.elements(h.render(), "button")[1].props.onClick();
  assert.equal(h.requests.length, 2);
  assert.deepEqual(h.requests[1].payload, {
    action: "REVOKE_CUSTOMER_BYOK",
    connection_id: "synthetic",
  });
  await h.settle(1);
});

test("rapid revocation then approval is serialized and failure releases the latch", async () => {
  const h = harness();
  h.confirm();
  const buttons = h.elements(h.render(), "button");
  buttons[1].props.onClick();
  buttons[0].props.onClick();
  assert.equal(h.requests.length, 1);
  assert.deepEqual(h.requests[0].payload, {
    action: "REVOKE_CUSTOMER_BYOK",
    connection_id: "synthetic",
  });
  await h.settle(0, true);
  assert.equal(h.refreshes(), 0);
  assert.equal(
    h.elements(h.render(), "span").some((node) => node.props.role === "status"),
    true,
  );
  h.elements(h.render(), "button")[0].props.onClick();
  assert.equal(h.requests.length, 2);
  await h.settle(1);
});

test("revocation does not require approval checkbox or active rollout; ordinary callers remain usable", async () => {
  const h = harness();
  h.elements(h.render({ disabled: true }), "button")[1].props.onClick();
  assert.equal(h.requests.length, 1);
  await h.settle(0);
  const plain = harness();
  const view = plain.render({ confirmation: undefined, secondary: undefined });
  assert.equal(plain.elements(view, "input").length, 0);
  assert.equal(plain.elements(view, "button").length, 1);
  plain.elements(view, "button")[0].props.onClick();
  assert.equal(plain.requests.length, 1);
  await plain.settle(0);
});
