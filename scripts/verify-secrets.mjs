import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const publicationCandidates = execFileSync(
  "git",
  ["ls-files", "-co", "--exclude-standard", "-z"],
  {
    cwd: root,
    encoding: "utf8",
  },
)
  .split("\0")
  .filter(Boolean);

const forbiddenPaths = publicationCandidates.filter(
  (file) =>
    file.startsWith(".runtime/") ||
    (/^\.env(?:\.|$)/.test(file) && file !== ".env.example") ||
    /^(?:Pasted text\.txt|KXRA-GENESIS-PACK\.zip)$/i.test(file) ||
    /\.(?:docx|pptx|xlsx)$/i.test(file) ||
    (file.startsWith("KXRA-GENESIS/") &&
      !file.startsWith("KXRA-GENESIS/registers/")),
);
assert.deepEqual(
  forbiddenPaths,
  [],
  `Private or generated publication candidates: ${forbiddenPaths.join(", ")}`,
);

const patterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["AWS access key", /AKIA[0-9A-Z]{16}/],
  [
    "GitHub token",
    /(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/,
  ],
  ["OpenAI secret", /sk-(?:proj-)?[A-Za-z0-9_-]{24,}/],
  ["Stripe live secret", /(?:sk_live|rk_live)_[A-Za-z0-9]{16,}/],
  ["webhook secret", /whsec_[A-Za-z0-9]{16,}/],
];
const findings = [];
for (const file of publicationCandidates) {
  const target = path.join(root, file);
  if (!fs.statSync(target).isFile()) continue;
  const bytes = fs.readFileSync(target);
  if (bytes.includes(0)) continue;
  const content = bytes.toString("utf8");
  for (const [label, pattern] of patterns)
    if (pattern.test(content)) findings.push(`${file}: ${label}`);
}
assert.deepEqual(
  findings,
  [],
  `Potential secrets in publication candidates:\n${findings.join("\n")}`,
);
console.log(
  `Publication and secret scan PASS (${publicationCandidates.length} files, ${patterns.length} credential patterns).`,
);
