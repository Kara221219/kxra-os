import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { scriptElements } from "./marketing-script-elements.mjs";
const build = path.resolve(import.meta.dirname, "../apps/marketing/.next"),
  base = path.join(build, "server", "app");
function files(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? files(path.join(dir, e.name))
        : e.name.endsWith(".html")
          ? [path.join(dir, e.name)]
          : [],
    );
}
const manifest = JSON.parse(
  fs.readFileSync(path.join(build, "routes-manifest.json"), "utf8"),
);
const policies = manifest.headers.flatMap((e) =>
  e.headers
    .filter((h) => h.key.toLowerCase() === "content-security-policy")
    .map((h) => ({ source: e.source, value: h.value })),
);
assert(policies.length, "Missing marketing CSP");
let maxLength = 0,
  externalScripts = 0,
  pages = 0;
for (const p of policies) {
  assert(
    !/'unsafe-inline'|'unsafe-eval'/.test(
      p.value.split(";").find((s) => s.trim().startsWith("script-src ")),
    ),
  );
  assert.match(p.value, /script-src-attr 'none'/);
  assert(
    p.value.length < 6000,
    `CSP too large for ${p.source}: ${p.value.length}`,
  );
  maxLength = Math.max(maxLength, p.value.length);
}
for (const file of files(base)) {
  const rel = path
    .relative(base, file)
    .split(path.sep)
    .join("/")
    .replace(/\.html$/, "");
  const route = rel === "index" ? "/" : "/" + rel;
  const policy =
    policies.findLast((p) => p.source === route)?.value ||
    policies.find((p) => p.source === "/:path*")?.value;
  assert(policy, "No policy for " + route);
  const allowed = new Set(
      [...policy.matchAll(/'sha256-([^']+)'/g)].map((m) => m[1]),
    ),
    actual = new Set();
  for (const script of scriptElements(fs.readFileSync(file, "utf8"))) {
    if (script.attributes.has("src")) {
      const src = script.attributes.get("src"),
        sri = script.attributes.get("integrity");
      assert(
        src.startsWith("/_next/") && sri,
        "Missing local script SRI at " + route,
      );
      const asset = decodeURIComponent(
        src.slice("/_next/".length).split(/[?#]/, 1)[0],
      );
      const digest =
        "sha256-" +
        crypto
          .createHash("sha256")
          .update(fs.readFileSync(path.join(build, asset)))
          .digest("base64");
      assert.equal(sri, digest, "SRI mismatch at " + route);
      externalScripts++;
    } else {
      const digest = crypto
        .createHash("sha256")
        .update(script.body)
        .digest("base64");
      actual.add(digest);
      assert(allowed.has(digest), "Missing inline hash for " + route);
    }
  }
  assert.deepEqual(
    allowed,
    actual,
    "Stale or unrelated inline hashes for " + route,
  );
  pages++;
}
assert(externalScripts > 0);
console.log(
  `Marketing CSP/SRI PASS (${pages} static routes, ${externalScripts} verified script references, maximum ${maxLength} header characters).`,
);
