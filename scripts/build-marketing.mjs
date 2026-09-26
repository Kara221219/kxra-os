import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const application = path.join(root, "apps", "marketing");
const output = path.join(application, ".next");
const command = [
  path.join(root, "node_modules", "next", "dist", "bin", "next"),
  "build",
];
const buildId =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 40) || crypto.randomUUID();

function build(environment, stdio) {
  fs.rmSync(output, { recursive: true, force: true });
  execFileSync(process.execPath, command, {
    cwd: application,
    env: { ...process.env, ...environment },
    stdio,
  });
}

function htmlFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory()
      ? htmlFiles(target)
      : entry.name.endsWith(".html")
        ? [target]
        : [];
  });
}

function inlineHashes() {
  const hashes = new Set();
  for (const file of htmlFiles(path.join(output, "server", "app"))) {
    const html = fs.readFileSync(file, "utf8");
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))
      if (!match[1].includes("src="))
        hashes.add(
          crypto.createHash("sha256").update(match[2]).digest("base64"),
        );
  }
  return [...hashes].sort();
}

function applyStaticSri() {
  const manifest = JSON.parse(
    fs.readFileSync(
      path.join(output, "server", "subresource-integrity-manifest.json"),
      "utf8",
    ),
  );
  for (const file of htmlFiles(path.join(output, "server", "app"))) {
    const html = fs.readFileSync(file, "utf8");
    const secured = html.replace(
      /<script\b([^>]*\ssrc="\/_next\/([^"]+)"[^>]*)>/g,
      (tag, attributes, asset) => {
        if (attributes.includes(" integrity=")) return tag;
        const integrity = manifest[asset];
        if (!integrity) throw new Error(`Missing SRI for ${asset}`);
        return `<script${attributes} integrity="${integrity}">`;
      },
    );
    fs.writeFileSync(file, secured);
  }
}

console.log("Collecting static marketing script hashes...");
build(
  {
    KXRA_MARKETING_BUILD_ID: buildId,
    KXRA_MARKETING_CSP_MODE: "collect",
  },
  ["ignore", "ignore", "inherit"],
);
const hashes = inlineHashes();
if (hashes.length === 0) throw new Error("No inline marketing scripts found");
console.log(`Building marketing with ${hashes.length} exact script hashes...`);
build(
  {
    KXRA_MARKETING_BUILD_ID: buildId,
    KXRA_MARKETING_CSP_MODE: "enforce",
    KXRA_MARKETING_SCRIPT_HASHES: hashes.join(","),
  },
  "inherit",
);
const finalHashes = inlineHashes();
if (JSON.stringify(finalHashes) !== JSON.stringify(hashes))
  throw new Error("Marketing inline scripts changed between CSP build passes");
applyStaticSri();
