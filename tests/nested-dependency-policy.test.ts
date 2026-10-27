import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

function policy(
  override: Record<string, unknown> = {},
  packageName = "synthetic",
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kxra-nested-policy-"));
  try {
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ overrides: { postcss: "8.5.28" } }),
    );
    fs.mkdirSync(path.join(root, "scripts"));
    fs.copyFileSync(
      path.resolve("scripts/verify-dependencies.mjs"),
      path.join(root, "scripts/verify-dependencies.mjs"),
    );
    for (const app of ["os", "marketing"]) {
      fs.mkdirSync(path.join(root, "apps", app), { recursive: true });
      fs.writeFileSync(
        path.join(root, "apps", app, "package.json"),
        JSON.stringify({
          dependencies: Object.fromEntries(
            [
              "@types/node",
              "@types/pg",
              "@types/react",
              "@types/react-dom",
              "typescript",
            ].map((name) => [name, "SYNTHETIC"]),
          ),
        }),
      );
    }
    fs.mkdirSync(path.join(root, "packages"));
    fs.writeFileSync(
      path.join(root, "package-lock.json"),
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          ["apps/marketing/node_modules/" + packageName]: {
            version: "1.0.0",
            license: "MIT",
            resolved:
              "https://registry.npmjs.org/synthetic/-/synthetic-1.0.0.tgz",
            integrity: "sha512-SYNTHETIC_NOT_FETCHED",
            ...override,
          },
        },
      }),
    );
    return spawnSync(process.execPath, ["scripts/verify-dependencies.mjs"], {
      cwd: root,
      env: { PATH: path.dirname(process.execPath), NODE_ENV: "test" },
      encoding: "utf8",
      timeout: 10_000,
    });
  } finally {
    fs.rmSync(root, { recursive: true });
  }
}

test("nested application dependencies participate in policy counts", () => {
  const result = policy();
  assert.equal(result.status, 0);
  assert.match(result.stdout, /1 locked packages/);
});
for (const [label, value] of Object.entries({
  source: { resolved: "https://unapproved.invalid/synthetic.tgz" },
  license: { license: "UNREVIEWED_SYNTHETIC" },
  script: { hasInstallScript: true },
  integrity: { integrity: undefined },
})) {
  test(`nested application dependency rejects unreviewed ${label}`, () => {
    const result = policy(value);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Dependency policy violations/);
  });
}

test("nested PostCSS cannot retain an older copy despite the root override", () => {
  const stale = policy({ version: "8.4.31" }, "postcss");
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /PostCSS patch pin mismatch/);
  assert.equal(policy({ version: "8.5.28" }, "postcss").status, 0);
});
