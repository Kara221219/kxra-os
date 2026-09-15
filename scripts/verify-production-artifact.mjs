import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "apps/os/.next");
const forbidden = [
  "Local fixture identities",
  "Synthetic identity",
  "owner@fixture.invalid",
  "partner@fixture.invalid",
  "viewer@fixture.invalid",
  "revoked@fixture.invalid",
  "invitee@fixture.invalid",
  "20000000-0000-4000-8000-000000000001",
  "20000000-0000-4000-8000-000000000002",
  "20000000-0000-4000-8000-000000000003",
  "20000000-0000-4000-8000-000000000004",
  "20000000-0000-4000-8000-000000000005",
  "KXRA_LOCAL_SECRET",
  "KXRA_AUTH_MODE",
  "fake-auth.json",
  "fake-email.json",
];

if (!fs.existsSync(output))
  throw new Error("Production artifact is missing; run the build first");

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? files(target) : [target];
  });
}

const findings = [];
for (const file of files(output)) {
  const content = fs.readFileSync(file);
  for (const value of forbidden)
    if (content.includes(Buffer.from(value)))
      findings.push(`${path.relative(output, file)}: ${value}`);
}

if (findings.length)
  throw new Error(
    `Production artifact contains local authentication material:\n${findings.join("\n")}`,
  );

console.log(
  `Production artifact excludes ${forbidden.length} fixture identity, selector, state and secret markers.`,
);
