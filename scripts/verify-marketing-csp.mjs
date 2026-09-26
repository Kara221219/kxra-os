import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const build = path.resolve(import.meta.dirname, "../apps/marketing/.next");

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory()
      ? files(target)
      : entry.name.endsWith(".html")
        ? [target]
        : [];
  });
}

const manifest = JSON.parse(
  fs.readFileSync(path.join(build, "routes-manifest.json"), "utf8"),
);
const policy = manifest.headers
  .flatMap((entry) => entry.headers)
  .find(
    (header) => header.key.toLowerCase() === "content-security-policy",
  )?.value;
assert.ok(policy, "Marketing CSP header is missing");
const script = policy
  .split(";")
  .map((directive) => directive.trim())
  .find((directive) => directive.startsWith("script-src "));
assert.ok(script, "Marketing script-src is missing");
assert.doesNotMatch(script, /'unsafe-inline'|'unsafe-eval'/);
assert.match(policy, /script-src-attr 'none'/);

const allowed = new Set(
  [...script.matchAll(/'sha256-([^']+)'/g)].map((match) => match[1]),
);
const actual = new Set();
let externalScripts = 0;
for (const file of files(path.join(build, "server", "app"))) {
  const html = fs.readFileSync(file, "utf8");
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (match[1].includes("src=")) {
      externalScripts += 1;
      assert.match(match[1], /integrity="sha256-[A-Za-z0-9+/]+=*"/);
      continue;
    }
    const hash = crypto.createHash("sha256").update(match[2]).digest("base64");
    actual.add(hash);
    assert.ok(allowed.has(hash), `${path.relative(build, file)} hash missing`);
  }
}
assert.ok(
  externalScripts > 0,
  "No external scripts found for SRI verification",
);
assert.deepEqual(
  allowed,
  actual,
  "CSP contains stale or missing script hashes",
);
assert.ok(
  policy.length < 6_000,
  `Marketing CSP is too large (${policy.length})`,
);
console.log(
  `Marketing CSP PASS (${actual.size} exact inline hashes, ${externalScripts} SRI script references, ${policy.length} header characters).`,
);
