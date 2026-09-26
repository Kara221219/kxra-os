import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const root = path.resolve(import.meta.dirname, "..");
const applications = [
  { name: "marketing", maximum: 140 * 1024 },
  { name: "os", maximum: 200 * 1024 },
];

for (const application of applications) {
  const build = path.join(root, "apps", application.name, ".next");
  const manifestPath = path.join(build, "app-build-manifest.json");
  assert.ok(
    fs.existsSync(manifestPath),
    `${application.name}: production build manifest is missing`,
  );
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const layout = manifest.pages?.["/layout"] || [];
  const pages = Object.entries(manifest.pages || {}).filter(
    ([route]) => route === "/page" || route.endsWith("/page"),
  );
  assert.ok(pages.length > 0, `${application.name}: no page routes found`);

  let largest = { route: "", bytes: 0 };
  for (const [route, routeFiles] of pages) {
    const assets = [...new Set([...layout, ...routeFiles])].filter((file) =>
      /\.(?:css|js)$/.test(file),
    );
    assert.ok(assets.length > 0, `${application.name}${route}: no assets`);
    let bytes = 0;
    for (const asset of assets) {
      const target = path.join(build, asset);
      assert.ok(
        fs.existsSync(target),
        `${application.name}${route}: missing ${asset}`,
      );
      bytes += zlib.gzipSync(fs.readFileSync(target), { level: 9 }).length;
    }
    if (bytes > largest.bytes) largest = { route, bytes };
    assert.ok(
      bytes <= application.maximum,
      `${application.name}${route}: ${bytes} compressed bytes exceeds ${application.maximum}`,
    );
  }
  console.log(
    `${application.name} build budget PASS (${pages.length} pages; largest ${largest.route} ${(largest.bytes / 1024).toFixed(1)} KiB gzip of JS/CSS; limit ${application.maximum / 1024} KiB).`,
  );
}
