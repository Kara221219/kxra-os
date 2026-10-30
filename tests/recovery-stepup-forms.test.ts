import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { transformSync } from "esbuild";
const sentinel = "SyntheticPassword-PLANTED_SECRET";
function harness(responses: Array<{ status: number; body: unknown }>) {
  const states: unknown[] = [];
  let cursor = 0;
  const calls: Record<string, unknown>[] = [];
  const navigations: string[] = [];
  const input = { value: "123456" };
  let codeCleared = false;
  const JSX = (type: unknown, props: Record<string, unknown>) => ({
    type,
    props,
  });
  const module = {
    exports: {} as { PasswordResetConfirmForm: (props: unknown) => any },
  };
  const source = readFileSync(
    "apps/os/components/PasswordResetForms.tsx",
    "utf8",
  );
  const code = transformSync(source, {
    loader: "tsx",
    format: "cjs",
    jsx: "automatic",
    target: "node22",
  }).code;
  class Input {
    value = "123456";
  }
  const mfaInput = new Input();
  vm.runInNewContext(
    `(function(require,module,exports,fetch,FormData,window,HTMLInputElement){${code}\n})`,
    {},
  )(
    (name: string) =>
      name === "react"
        ? {
            useState: (initial: unknown) => {
              const i = cursor++;
              if (!(i in states)) states[i] = initial;
              return [
                states[i],
                (v: unknown) => {
                  states[i] = v;
                },
              ];
            },
          }
        : { jsx: JSX, jsxs: JSX },
    module,
    module.exports,
    async (_url: string, options: { body: string }) => {
      calls.push(JSON.parse(options.body));
      const response = responses.shift();
      assert.ok(response, "no unexpected or automatic request");
      return {
        ok: response.status >= 200 && response.status < 300,
        json: async () => response.body,
      };
    },
    class {
      constructor(private form: { values: Record<string, unknown> }) {}
      get(name: string) {
        return this.form.values[name] ?? null;
      }
    },
    { location: { assign: (path: string) => navigations.push(path) } },
    Input,
  );
  const recoverySession = {
    accessToken: "SYNTHETIC_ACCESS",
    refreshToken: "SYNTHETIC_REFRESH",
    intent: "SYNTHETIC_INTENT",
  };
  const render = () => {
    cursor = 0;
    return module.exports.PasswordResetConfirmForm({ recoverySession });
  };
  const submit = async (values: Record<string, unknown> = {}) => {
    const form = render();
    const event = {
      preventDefault() {},
      currentTarget: {
        values: { password: sentinel, confirmation: sentinel, ...values },
        elements: { namedItem: () => mfaInput },
      },
    };
    const pending = form.props.onSubmit(event);
    event.currentTarget = null as never;
    await pending;
  };
  function all(node: any): any[] {
    if (!node || typeof node !== "object") return [];
    return [node, ...[].concat(node.props?.children ?? []).flatMap(all)];
  }
  const nonceButton = () =>
    all(render()).find(
      (node) => node.type === "button" && node.props.type === "button",
    );
  return {
    render,
    submit,
    calls,
    navigations,
    nonceButton,
    all,
    mfaInput,
    states,
  };
}
test("nonce requirement never sends email automatically; explicit button excludes password/code", async () => {
  const x = harness([
    {
      status: 409,
      body: {
        error: "Additional email verification is required",
        recoveryStep: "NONCE",
      },
    },
    { status: 202, body: { accepted: true } },
  ]);
  await x.submit();
  assert.equal(x.calls.length, 1);
  assert.equal(x.calls[0].action, "confirm");
  const button = x.nonceButton();
  assert.ok(button);
  await button.props.onClick();
  assert.equal(x.calls.length, 2);
  const nonce = x.calls[1];
  assert.equal(nonce.action, "reauthenticate");
  assert.equal(nonce.password, undefined);
  assert.equal(nonce.confirmation, undefined);
  assert.equal(nonce.mfaCode, undefined);
  assert.equal(nonce.nonce, undefined);
  assert.equal(x.navigations.length, 0);
});
test("MFA response presents code input, clears attempted code, and never retries", async () => {
  const x = harness([
    {
      status: 409,
      body: {
        error: "Verify your existing authenticator to continue",
        recoveryStep: "TOTP",
      },
    },
  ]);
  await x.submit();
  assert.equal(x.calls.length, 1);
  assert.equal(x.mfaInput.value, "");
  assert.ok(
    x
      .all(x.render())
      .some((n) => n.type === "input" && n.props.name === "mfaCode"),
  );
  assert.equal(x.nonceButton(), undefined);
});
test("MFA+nonce sequence submits original proof, both explicit proofs and password only on confirm", async () => {
  const x = harness([
    { status: 409, body: { error: "MFA required", recoveryStep: "TOTP" } },
    {
      status: 409,
      body: { error: "Additional verification", recoveryStep: "NONCE" },
    },
    { status: 202, body: { accepted: true } },
    { status: 200, body: { next: "/login?reset=1" } },
  ]);
  await x.submit();
  await x.submit({ mfaCode: "123456" });
  await x.nonceButton().props.onClick();
  await x.submit({ mfaCode: "654321", nonce: "123456" });
  assert.equal(x.calls.length, 4);
  assert.equal(x.calls[3].mfaCode, "654321");
  assert.equal(x.calls[3].nonce, "123456");
  assert.equal(x.calls[3].accessToken, x.calls[0].accessToken);
  assert.deepEqual(x.navigations, ["/login?reset=1"]);
});
test("nonce send failure does not auto retry or navigate", async () => {
  const x = harness([
    {
      status: 409,
      body: { error: "Need verification", recoveryStep: "NONCE" },
    },
    { status: 429, body: { error: "Verification request unavailable" } },
  ]);
  await x.submit();
  await x.nonceButton().props.onClick();
  assert.equal(x.calls.length, 2);
  assert.equal(x.navigations.length, 0);
  assert.equal(x.states.includes(true), true);
});
test("unknown step/error does not enable nonce or MFA", async () => {
  const x = harness([
    {
      status: 409,
      body: { error: "Reset unavailable", recoveryStep: "INJECTED_STEP" },
    },
  ]);
  await x.submit();
  assert.equal(x.nonceButton(), undefined);
  assert.equal(
    x.all(x.render()).some((n) => n.props?.name === "mfaCode"),
    false,
  );
  assert.equal(x.calls.length, 1);
});
test("password mismatch makes no request", async () => {
  const x = harness([]);
  await x.submit({ confirmation: "DifferentSyntheticPassword" });
  assert.equal(x.calls.length, 0);
});
test("component never calls logging or durable credential storage", () => {
  const source = readFileSync(
    "apps/os/components/PasswordResetForms.tsx",
    "utf8",
  );
  for (const forbidden of [
    "console.",
    "localStorage",
    "sessionStorage",
    "document.cookie",
    "indexedDB",
  ])
    assert.equal(source.includes(forbidden), false);
});
