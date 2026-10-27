import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = path.resolve(import.meta.dirname, "..");
const approved = {
  os: "16.4.3",
  marketing: "15.5.28",
  "email-worker": "15.5.28",
};

export function applicationNext(application, workspace = root) {
  assert.ok(
    Object.hasOwn(approved, application),
    "NEXT_APPLICATION_UNREVIEWED",
  );
  const packageFile = path.join(workspace, "apps", application, "package.json");
  const manifest = JSON.parse(fs.readFileSync(packageFile, "utf8"));
  assert.equal(
    manifest.dependencies?.next,
    approved[application],
    "NEXT_DECLARED_VERSION_UNREVIEWED",
  );
  const require = createRequire(packageFile);
  const installed = JSON.parse(
    fs.readFileSync(require.resolve("next/package.json"), "utf8"),
  );
  assert.equal(
    installed.version,
    approved[application],
    "NEXT_INSTALLED_VERSION_MISMATCH",
  );
  return {
    version: installed.version,
    binary: require.resolve("next/dist/bin/next"),
    webpackArguments: application === "os" ? ["--webpack"] : [],
  };
}
