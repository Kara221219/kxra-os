import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import ts from "typescript";

function assetFile(build, value, deploymentId) {
  assert.ok(
    typeof value === "string" && !/[\\\x00-\x20#]/.test(value),
    "BUDGET_ASSET_PATH",
  );
  const [encoded, query, ...extra] = value.split("?");
  assert.equal(extra.length, 0, "BUDGET_ASSET_QUERY");
  if (query !== undefined) {
    const params = new URLSearchParams(query);
    assert.ok(
      deploymentId &&
        [...params].length === 1 &&
        params.get("dpl") === deploymentId,
      "BUDGET_ASSET_QUERY",
    );
  }
  assert.ok(!/%2f|%5c/i.test(encoded), "BUDGET_ASSET_PATH");
  const decoded = decodeURIComponent(encoded);
  assert.ok(
    !decoded.includes("\\") &&
      !decoded.split("/").some((part) => part === "." || part === ".."),
    "BUDGET_ASSET_PATH",
  );
  assert.match(
    decoded,
    /^static\/(?:chunks|css)\/.+\.(?:js|css)$/,
    "BUDGET_ASSET_PATH",
  );
  const file = path.resolve(build, decoded);
  assert.equal(
    fs.realpathSync(path.join(build, "static")),
    path.join(fs.realpathSync(build), "static"),
    "BUDGET_STATIC_ROOT_ESCAPE",
  );
  assert.ok(fs.statSync(file).isFile(), "BUDGET_ASSET_MISSING");
  assert.ok(
    fs
      .realpathSync(file)
      .startsWith(fs.realpathSync(path.join(build, "static")) + path.sep),
    "BUDGET_ASSET_ESCAPE",
  );
  return file;
}

export function parseClientManifest(text, page, requiredCssEntries = []) {
  const prefix = `globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});globalThis.__RSC_MANIFEST[${JSON.stringify(page)}]=`;
  assert.ok(
    text.startsWith(prefix) && text.endsWith(";"),
    "BUDGET_CLIENT_MANIFEST_WRAPPER",
  );
  const manifest = JSON.parse(text.slice(prefix.length, -1));
  assert.ok(
    Object.keys(manifest).every((key) =>
      [
        "moduleLoading",
        "ssrModuleMapping",
        "edgeSSRModuleMapping",
        "clientModules",
        "entryCSSFiles",
        "rscModuleMapping",
        "edgeRscModuleMapping",
        "entryJSFiles",
      ].includes(key),
    ),
    "BUDGET_UNREVIEWED_MANIFEST_FIELD",
  );
  assert.ok(
    manifest.clientModules &&
      typeof manifest.clientModules === "object" &&
      !Array.isArray(manifest.clientModules),
    "BUDGET_CLIENT_MODULES",
  );
  assert.ok(
    manifest.entryCSSFiles &&
      typeof manifest.entryCSSFiles === "object" &&
      !Array.isArray(manifest.entryCSSFiles),
    "BUDGET_LAYOUT_CSS",
  );
  for (const entry of requiredCssEntries) {
    assert.ok(
      Array.isArray(manifest.entryCSSFiles[entry]) &&
        manifest.entryCSSFiles[entry].length > 0,
      "BUDGET_LAYOUT_CSS_OMITTED",
    );
  }
  const assets = [];
  for (const module of Object.values(manifest.clientModules)) {
    assert.ok(
      Array.isArray(module.chunks) && module.chunks.length % 2 === 0,
      "BUDGET_CHUNK_PAIRS",
    );
    for (let i = 0; i < module.chunks.length; i += 2) {
      assert.ok(
        ["string", "number"].includes(typeof module.chunks[i]) &&
          typeof module.chunks[i + 1] === "string",
        "BUDGET_CHUNK_PAIRS",
      );
      assets.push(module.chunks[i + 1]);
    }
  }
  for (const files of Object.values(manifest.entryCSSFiles)) {
    assert.ok(Array.isArray(files), "BUDGET_LAYOUT_CSS");
    for (const file of files) {
      assert.ok(file && typeof file.path === "string", "BUDGET_LAYOUT_CSS");
      assets.push(file.path);
    }
  }
  if (manifest.entryJSFiles !== undefined) {
    assert.ok(
      manifest.entryJSFiles &&
        typeof manifest.entryJSFiles === "object" &&
        !Array.isArray(manifest.entryJSFiles),
      "BUDGET_ENTRY_JS",
    );
    for (const files of Object.values(manifest.entryJSFiles)) {
      assert.ok(
        Array.isArray(files) && files.every((file) => typeof file === "string"),
        "BUDGET_ENTRY_JS",
      );
      assets.push(...files);
    }
  }
  return assets;
}

function sourcePages(directory) {
  const pages = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const file = path.join(directory, entry.name);
    assert.ok(!entry.isSymbolicLink(), "BUDGET_SOURCE_SYMLINK");
    if (entry.isDirectory()) pages.push(...sourcePages(file));
    else if (/^page\.(?:tsx?|jsx?)$/.test(entry.name)) pages.push(file);
  }
  return pages;
}

export function pageBudgetAssets(application) {
  const build = path.join(application, ".next");
  const read = (relative) =>
    JSON.parse(fs.readFileSync(path.join(build, relative), "utf8"));
  const deploymentId = read("routes-manifest.json").deploymentId;
  const legacy = path.join(build, "app-build-manifest.json");
  if (fs.existsSync(legacy)) {
    const manifest = read("app-build-manifest.json");
    const pages = Object.entries(manifest.pages || {}).filter(
      ([route]) => route === "/page" || route.endsWith("/page"),
    );
    assert.ok(pages.length, "BUDGET_PAGES_MISSING");
    return pages.map(([route, assets]) => ({
      route,
      files: [
        ...new Set(
          [...(manifest.pages["/layout"] || []), ...assets]
            .filter((file) => /\.(?:css|js)(?:\?|$)/.test(file))
            .map((file) => assetFile(build, file, deploymentId)),
        ),
      ],
    }));
  }
  const paths = read("server/app-paths-manifest.json");
  const pages = Object.entries(paths).filter(([route]) =>
    route.endsWith("/page"),
  );
  assert.ok(pages.length, "BUDGET_PAGES_MISSING");
  for (const file of sourcePages(path.join(application, "app"))) {
    const page =
      "/" +
      path
        .relative(path.join(application, "app"), file)
        .replaceAll(path.sep, "/")
        .replace(/\.(?:tsx?|jsx?)$/, "");
    assert.ok(Object.hasOwn(paths, page), "BUDGET_SOURCE_PAGE_OMITTED");
  }
  const bootstrap = read("build-manifest.json");
  const layout = ["tsx", "ts", "jsx", "js"]
    .map((extension) => path.join(application, "app", `layout.${extension}`))
    .find((file) => fs.existsSync(file));
  assert.ok(layout, "BUDGET_ROOT_LAYOUT_MISSING");
  const layoutSource = ts.createSourceFile(
    layout,
    fs.readFileSync(layout, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  assert.equal(
    layoutSource.parseDiagnostics.length,
    0,
    "BUDGET_ROOT_LAYOUT_PARSE",
  );
  const importsCss = layoutSource.statements.some(
    (statement) =>
      ts.isImportDeclaration(statement) &&
      !statement.importClause?.isTypeOnly &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text.endsWith(".css"),
  );
  const requiredCssEntries = importsCss
    ? [path.resolve(application, "app/layout")]
    : [];
  return pages.map(([route, serverFile]) => {
    assert.ok(
      typeof serverFile === "string" &&
        /^app\/.+\.js$/.test(serverFile) &&
        !serverFile.split("/").includes(".."),
      "BUDGET_SERVER_MANIFEST_PATH",
    );
    const file = path.join(
      build,
      "server",
      serverFile.replace(/\.js$/, "_client-reference-manifest.js"),
    );
    const assets = parseClientManifest(
      fs.readFileSync(file, "utf8"),
      route,
      requiredCssEntries,
    );
    const main = Object.hasOwn(bootstrap.rootMainFilesTree || {}, route)
      ? bootstrap.rootMainFilesTree[route]
      : bootstrap.rootMainFiles;
    assert.ok(
      Array.isArray(main) &&
        main.length > 0 &&
        main.every((entry) => typeof entry === "string"),
      "BUDGET_BOOTSTRAP_MISSING",
    );
    return {
      route,
      files: [
        ...new Set(
          [...main, ...assets].map((entry) =>
            assetFile(build, entry, deploymentId),
          ),
        ),
      ],
    };
  });
}

export function compressedPageBytes(page, maximum) {
  assert.ok(page.files.length > 0, "BUDGET_ASSETS_MISSING");
  const bytes = page.files.reduce(
    (sum, file) =>
      sum + zlib.gzipSync(fs.readFileSync(file), { level: 9 }).length,
    0,
  );
  assert.ok(
    bytes <= maximum,
    `${page.route}: ${bytes} compressed bytes exceeds ${maximum}`,
  );
  return bytes;
}
