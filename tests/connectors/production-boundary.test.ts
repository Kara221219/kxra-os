import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { transformSync } from "esbuild";

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
test("production conditional runtime denies every connector entry without querying a database or accessing a secret", async () => {
  const manifest = JSON.parse(fs.readFileSync("apps/os/package.json", "utf8"));
  assert.equal(
    manifest.imports["#kxra/customer-connectors-runtime"].default,
    "./lib/customer-connectors.production.ts",
  );
  const module = {
    exports: {} as Record<string, (...args: unknown[]) => Promise<unknown>>,
  };
  vm.runInNewContext(
    transformSync(
      fs.readFileSync("apps/os/lib/customer-connectors.production.ts", "utf8"),
      { loader: "ts", format: "cjs" },
    ).code,
    {
      module,
      exports: module.exports,
      require: (name: string) => {
        assert.equal(name, "./auth");
        return { HttpError };
      },
    },
  );
  for (const name of [
    "listCustomerConnectors",
    "customerConnectorCommand",
    "customerConnectorAgentCommand",
  ])
    await assert.rejects(
      module.exports[name]({}, {}),
      (error: unknown) => error instanceof HttpError && error.status === 503,
    );
});
