import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import zlib from "node:zlib";
import {
  pageBudgetAssets,
  parseClientManifest,
  compressedPageBytes,
} from "../scripts/build-budget-assets.mjs";

function fixture() {
  const app = fs.mkdtempSync(path.join(os.tmpdir(), "kxra-budget-"));
  const build = path.join(app, ".next");
  const write = (relative: string, value: unknown) => {
    const file = path.join(build, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      typeof value === "string" ? value : JSON.stringify(value),
    );
  };
  fs.mkdirSync(path.join(app, "app"));
  fs.writeFileSync(
    path.join(app, "app/page.tsx"),
    "export default function Page() { return null; }",
  );
  fs.writeFileSync(path.join(app, "app/layout.tsx"), 'import "./globals.css";');
  const manifest = {
    clientModules: { client: { chunks: [1, "static/chunks/page.js"] } },
    entryCSSFiles: {
      [path.join(app, "app/layout")]: [
        { path: "static/css/layout.css", inlined: false },
      ],
    },
  };
  const wrapper = (route = "/page", value = manifest) =>
    `globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});globalThis.__RSC_MANIFEST[${JSON.stringify(route)}]=${JSON.stringify(value)};`;
  write("routes-manifest.json", { deploymentId: "synthetic-id" });
  write("build-manifest.json", {
    rootMainFiles: ["static/chunks/bootstrap.js"],
    rootMainFilesTree: {},
  });
  write("server/app-paths-manifest.json", { "/page": "app/page.js" });
  write("server/app/page_client-reference-manifest.js", wrapper());
  for (const file of [
    "static/chunks/bootstrap.js",
    "static/chunks/page.js",
    "static/css/layout.css",
  ])
    write(file, `SYNTHETIC ${file}`);
  return {
    app,
    build,
    write,
    manifest,
    wrapper,
    close: () => fs.rmSync(app, { recursive: true }),
  };
}

test("Next16 budgets include bootstrap, page chunks and ancestor CSS with canonical deduplication", () => {
  const f = fixture();
  try {
    f.manifest.clientModules.client.chunks.push(
      2,
      "static/chunks/page.js?dpl=synthetic-id",
    );
    f.write("server/app/page_client-reference-manifest.js", f.wrapper());
    const pages = pageBudgetAssets(f.app);
    assert.equal(pages.length, 1);
    assert.equal(pages[0].files.length, 3);
    const bytes = pages[0].files.reduce(
      (sum: number, file: string) =>
        sum + zlib.gzipSync(fs.readFileSync(file), { level: 9 }).length,
      0,
    );
    assert.equal(compressedPageBytes(pages[0], bytes), bytes);
    assert.throws(() => compressedPageBytes(pages[0], bytes - 1), /exceeds/);
  } finally {
    f.close();
  }
});

test("client manifest parsing never evaluates trailing code or accepts another page", () => {
  const f = fixture();
  try {
    assert.throws(() =>
      parseClientManifest(f.wrapper() + "globalThis.unreviewed=true;", "/page"),
    );
    assert.throws(() => parseClientManifest(f.wrapper(), "/other"), /WRAPPER/);
    assert.throws(
      () =>
        parseClientManifest(
          f.wrapper("/page", {
            ...f.manifest,
            clientModules: { client: { chunks: [1] } },
          }),
          "/page",
        ),
      /CHUNK_PAIRS/,
    );
  } finally {
    f.close();
  }
});

for (const failure of [
  "bootstrap",
  "layout-css",
  "page-manifest",
  "source-page",
  "asset-file",
] as const) {
  test(`budget coverage rejects missing ${failure}`, () => {
    const f = fixture();
    try {
      if (failure === "bootstrap")
        f.write("build-manifest.json", {
          rootMainFiles: ["static/chunks/bootstrap.js"],
          rootMainFilesTree: { "/page": [] },
        });
      if (failure === "layout-css")
        f.write(
          "server/app/page_client-reference-manifest.js",
          f.wrapper("/page", { ...f.manifest, entryCSSFiles: {} }),
        );
      if (failure === "page-manifest")
        fs.unlinkSync(
          path.join(f.build, "server/app/page_client-reference-manifest.js"),
        );
      if (failure === "source-page") {
        fs.mkdirSync(path.join(f.app, "app/other"));
        fs.writeFileSync(path.join(f.app, "app/other/page.tsx"), "SYNTHETIC");
      }
      if (failure === "asset-file")
        fs.unlinkSync(path.join(f.build, "static/chunks/page.js"));
      assert.throws(() => pageBudgetAssets(f.app));
    } finally {
      f.close();
    }
  });
}

for (const asset of [
  "../escape.js",
  "https://example.invalid/x.js",
  "static/chunks/%2e%2e/escape.js",
  "static/chunks/a%2fb.js",
  "static/chunks/page.js?token=unapproved",
  "static/chunks/page.js?dpl=wrong",
  "static/chunks/page.js#fragment",
]) {
  test(`budget path rejects ${asset}`, () => {
    const f = fixture();
    try {
      f.manifest.clientModules.client.chunks = [1, asset];
      f.write("server/app/page_client-reference-manifest.js", f.wrapper());
      assert.throws(() => pageBudgetAssets(f.app));
    } finally {
      f.close();
    }
  });
}

test("encoded dynamic paths resolve safely and escaping symlinks fail closed", () => {
  const f = fixture();
  try {
    f.write("static/chunks/[template]/page.js", "SYNTHETIC_DYNAMIC");
    f.manifest.clientModules.client.chunks = [
      1,
      "static/chunks/%5Btemplate%5D/page.js",
    ];
    f.write("server/app/page_client-reference-manifest.js", f.wrapper());
    assert.ok(
      pageBudgetAssets(f.app)[0].files.some((file: string) =>
        file.includes("[template]"),
      ),
    );
    fs.unlinkSync(path.join(f.build, "static/chunks/[template]/page.js"));
    fs.symlinkSync(
      path.join(f.app, "app/page.tsx"),
      path.join(f.build, "static/chunks/[template]/page.js"),
    );
    assert.throws(() => pageBudgetAssets(f.app), /ESCAPE/);
  } finally {
    f.close();
  }
});

test("unknown manifest fields and a replaced static root are rejected", () => {
  const f = fixture();
  try {
    assert.throws(
      () =>
        parseClientManifest(
          f.wrapper("/page", {
            ...f.manifest,
            unreviewedAssets: [],
          } as typeof f.manifest),
          "/page",
        ),
      /UNREVIEWED_MANIFEST_FIELD/,
    );
    fs.renameSync(
      path.join(f.build, "static"),
      path.join(f.app, "outside-static"),
    );
    fs.symlinkSync(
      path.join(f.app, "outside-static"),
      path.join(f.build, "static"),
    );
    assert.throws(() => pageBudgetAssets(f.app), /STATIC_ROOT_ESCAPE/);
  } finally {
    f.close();
  }
});
