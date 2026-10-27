import path from "node:path";
import {
  pageBudgetAssets,
  compressedPageBytes,
} from "./build-budget-assets.mjs";

const root = path.resolve(import.meta.dirname, "..");
for (const application of [
  { name: "marketing", maximum: 140 * 1024 },
  { name: "os", maximum: 200 * 1024 },
]) {
  const pages = pageBudgetAssets(path.join(root, "apps", application.name));
  let largest = { route: "", bytes: 0 };
  for (const page of pages) {
    const bytes = compressedPageBytes(page, application.maximum);
    if (bytes > largest.bytes) largest = { route: page.route, bytes };
  }
  console.log(
    `${application.name} build budget PASS (${pages.length} pages; largest ${largest.route} ${(largest.bytes / 1024).toFixed(1)} KiB gzip of JS/CSS; limit ${application.maximum / 1024} KiB).`,
  );
}
