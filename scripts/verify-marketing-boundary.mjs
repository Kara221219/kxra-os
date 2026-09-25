import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const marketing = path.join(root, "apps", "marketing");
const forbidden = [
  /(?:from|import\s*)[('\"]+[^'\"]*(?:apps\/os|packages\/)/,
  /KXRA-GENESIS/,
  /fixture\.invalid/,
  /KXRA_AUTH_MODE/,
  /SUPABASE_(?:SERVICE_ROLE|SECRET)_KEY/,
  /STRIPE_SECRET_KEY/,
];

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if ([".next", ".next-dev", "node_modules"].includes(entry.name)) return [];
    return entry.isDirectory() ? files(target) : [target];
  });
}

const findings = [];
for (const file of files(marketing)) {
  const content = fs.readFileSync(file, "utf8");
  for (const pattern of forbidden)
    if (pattern.test(content))
      findings.push(`${path.relative(root, file)}: ${pattern}`);
}
assert.deepEqual(
  findings,
  [],
  `Marketing source crosses the public/private boundary:\n${findings.join("\n")}`,
);
console.log(
  "Marketing source imports only its public snapshot and public-ingress boundary.",
);
