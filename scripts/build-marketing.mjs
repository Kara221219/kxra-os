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

function inlineHashesByRoute() {
  const base = path.join(output, "server", "app");
  const entries = htmlFiles(base)
    .sort()
    .map((file) => {
      const relative = path
        .relative(base, file)
        .split(path.sep)
        .join("/")
        .replace(/\.html$/, "");
      const route = relative === "index" ? "/" : "/" + relative;
      const hashes = new Set();
      for (const match of fs
        .readFileSync(file, "utf8")
        .matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi))
        if (!/(?:^|\s)src\s*=/i.test(match[1]))
          hashes.add(
            crypto.createHash("sha256").update(match[2]).digest("base64"),
          );
      return [route, [...hashes].sort()];
    });
  return Object.fromEntries(entries);
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
      /<script\b([^>]*\ssrc\s*=\s*["']\/_next\/([^"']+)["'][^>]*)>/gi,
      (tag, attributes, asset) => {
        if (/(?:^|\s)integrity\s*=/i.test(attributes)) return tag;
        // Vercel appends a deployment cache marker to static asset URLs during
        // hosted builds. SRI manifests are keyed by the immutable asset path.
        const assetPath = asset.split(/[?#]/, 1)[0];
        const integrity =
          manifest[assetPath] || manifest[decodeURIComponent(assetPath)];
        if (!integrity) throw new Error(`Missing SRI for ${assetPath}`);
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
    KXRA_MARKETING_ROUTE_SCRIPT_HASHES: "",
  },
  ["ignore", "ignore", "inherit"],
);
const hashes = inlineHashesByRoute();
if (!Object.keys(hashes).length)
  throw new Error("No static marketing pages found");
console.log(
  `Building marketing with exact hashes for ${Object.keys(hashes).length} static routes...`,
);
build(
  {
    KXRA_MARKETING_BUILD_ID: buildId,
    KXRA_MARKETING_CSP_MODE: "enforce",
    KXRA_MARKETING_SCRIPT_HASHES: "",
    KXRA_MARKETING_ROUTE_SCRIPT_HASHES: JSON.stringify(hashes),
  },
  "inherit",
);
if (JSON.stringify(inlineHashesByRoute()) !== JSON.stringify(hashes))
  throw new Error("Marketing route script hashes changed between build passes");
applyStaticSri();
