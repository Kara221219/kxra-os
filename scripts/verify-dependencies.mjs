import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const lock = JSON.parse(
  fs.readFileSync(path.join(root, "package-lock.json"), "utf8"),
);
assert.equal(lock.lockfileVersion, 3, "Dependency policy requires lockfile v3");

const allowedLicenses = new Set([
  "0BSD",
  "Apache-2.0",
  "Apache-2.0 AND LGPL-3.0-or-later",
  "Apache-2.0 AND LGPL-3.0-or-later AND MIT",
  "BSD-3-Clause",
  "CC-BY-4.0",
  "ISC",
  "LGPL-3.0-or-later",
  "MIT",
]);
const allowedInstallScripts = new Map([
  ["node_modules/esbuild", "0.28.2"],
  ["node_modules/fsevents", "2.3.3"],
]);

const findings = [];
let packages = 0;
let productionPackages = 0;
for (const [location, descriptor] of Object.entries(lock.packages || {})) {
  if (!location.startsWith("node_modules/") || descriptor.link) continue;
  packages += 1;
  if (!descriptor.dev) productionPackages += 1;
  if (!descriptor.version) findings.push(`${location}: missing locked version`);
  if (!allowedLicenses.has(descriptor.license))
    findings.push(
      `${location}: unreviewed license ${descriptor.license || "MISSING"}`,
    );
  if (descriptor.resolved) {
    let resolved;
    try {
      resolved = new URL(descriptor.resolved);
    } catch {
      findings.push(`${location}: invalid resolved source`);
      continue;
    }
    if (
      resolved.protocol !== "https:" ||
      resolved.hostname !== "registry.npmjs.org"
    )
      findings.push(
        `${location}: unapproved package source ${resolved.origin}`,
      );
    if (!descriptor.integrity)
      findings.push(`${location}: registry package lacks integrity`);
  }
  if (
    descriptor.hasInstallScript &&
    allowedInstallScripts.get(location) !== descriptor.version
  )
    findings.push(
      `${location}: unreviewed install script at ${descriptor.version}`,
    );
}

assert.ok(packages > 0, "No locked dependencies found");
assert.deepEqual(
  findings,
  [],
  `Dependency policy violations:\n${findings.join("\n")}`,
);
console.log(
  `Dependency policy PASS (${packages} locked packages, ${productionPackages} production packages, ${allowedLicenses.size} reviewed license expressions, ${allowedInstallScripts.size} reviewed install scripts).`,
);
