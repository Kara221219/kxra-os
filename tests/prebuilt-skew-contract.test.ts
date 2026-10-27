import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  validateDeploymentId,
  verifyPrebuiltSkew,
  verifySkewHttpEvidence,
} from "../scripts/prebuilt-skew-contract.mjs";

const id = "kxra1643-generated-local";
test("custom deployment IDs reject reserved, empty, oversized and unsafe values", () => {
  for (const value of ["", "dpl_reserved", "x".repeat(33), "a/b", "a b", "a\n"])
    assert.throws(() => validateDeploymentId(value), /INVALID_DEPLOYMENT_ID/);
  assert.equal(validateDeploymentId(id), id);
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kxra-skew-contract-"));
  const applicationDirectory = path.join(root, "app");
  const outputDirectory = path.join(root, "output");
  const functionDirectory = path.join(outputDirectory, "functions", "app.func");
  fs.mkdirSync(path.join(applicationDirectory, ".next"), { recursive: true });
  fs.mkdirSync(functionDirectory, { recursive: true });
  const write = (file: string, data: object) =>
    fs.writeFileSync(file, JSON.stringify(data));
  write(path.join(applicationDirectory, ".next/routes-manifest.json"), {
    deploymentId: id,
  });
  write(path.join(applicationDirectory, ".next/required-server-files.json"), {
    config: {
      deploymentId: id,
      experimental: { runtimeServerDeploymentId: false },
    },
  });
  write(path.join(outputDirectory, "config.json"), {
    version: 3,
    deploymentId: id,
  });
  write(path.join(functionDirectory, ".vc-config.json"), {
    runtime: "nodejs22.x",
    handler: "launcher.cjs",
  });
  fs.writeFileSync(
    path.join(functionDirectory, "launcher.cjs"),
    `const conf = ${JSON.stringify({ deploymentId: id, experimental: { runtimeServerDeploymentId: false } })};\n`,
  );
  return {
    root,
    applicationDirectory,
    outputDirectory,
    functionDirectory,
    write,
  };
}

test("all independent manifest and launcher IDs must agree", () => {
  const f = fixture();
  try {
    assert.equal(verifyPrebuiltSkew({ ...f, expectedId: id }).nodeFunctions, 1);
    for (const [file, changed] of [
      [path.join(f.applicationDirectory, ".next/routes-manifest.json"), {}],
      [
        path.join(f.outputDirectory, "config.json"),
        { version: 3, deploymentId: "other" },
      ],
    ] as const) {
      const original = fs.readFileSync(file);
      f.write(file, changed);
      assert.throws(
        () => verifyPrebuiltSkew({ ...f, expectedId: id }),
        /ID_MISMATCH/,
      );
      fs.writeFileSync(file, original);
    }
    fs.writeFileSync(
      path.join(f.functionDirectory, "launcher.cjs"),
      'const conf = {"deploymentId":"other"};\n',
    );
    assert.throws(
      () => verifyPrebuiltSkew({ ...f, expectedId: id }),
      /LAUNCHER_ID_MISMATCH/,
    );
  } finally {
    fs.rmSync(f.root, { recursive: true });
  }
});

test("rendered assets and navigation headers reject missing or mixed versions", () => {
  const html = `<html data-dpl-id="${id}"><head><script src="/_next/static/a.js?dpl=${id}"></script></head></html>`;
  const headers = { "x-nextjs-deployment-id": id };
  assert.equal(
    verifySkewHttpEvidence({ html, headers, expectedId: id }).staticAssets,
    1,
  );
  for (const changed of [
    html.replace(`?dpl=${id}`, ""),
    html.replace("a.js?dpl=", "a.js?dpl=other"),
    html.replace('data-dpl-id="', 'data-dpl-id="other'),
  ])
    assert.throws(
      () => verifySkewHttpEvidence({ html: changed, headers, expectedId: id }),
      /RENDERED_ID_MISMATCH/,
    );
  assert.throws(
    () => verifySkewHttpEvidence({ html, headers: {}, expectedId: id }),
    /NAVIGATION_ID_MISMATCH/,
  );
});

const rejectionCases: Array<
  [string, (value: ReturnType<typeof fixture>) => void, RegExp]
> = [
  [
    "missing server ID",
    (f) =>
      f.write(
        path.join(f.applicationDirectory, ".next/required-server-files.json"),
        { config: {} },
      ),
    /DEPLOYMENT_ID_MISMATCH/,
  ],
  [
    "wrong runtime",
    (f) =>
      f.write(path.join(f.functionDirectory, ".vc-config.json"), {
        runtime: "python3.12",
        handler: "launcher.cjs",
      }),
    /UNREVIEWED_HANDLER/,
  ],
  [
    "absolute handler",
    (f) =>
      f.write(path.join(f.functionDirectory, ".vc-config.json"), {
        runtime: "nodejs22.x",
        handler: "/outside.cjs",
      }),
    /UNREVIEWED_HANDLER/,
  ],
  [
    "parent handler",
    (f) =>
      f.write(path.join(f.functionDirectory, ".vc-config.json"), {
        runtime: "nodejs22.x",
        handler: "../outside.cjs",
      }),
    /UNREVIEWED_HANDLER/,
  ],
  [
    "escaping symlink",
    (f) =>
      fs.symlinkSync(
        f.applicationDirectory,
        path.join(f.outputDirectory, "functions", "escape"),
      ),
    /SYMLINK_ESCAPE/,
  ],
  [
    "missing Node functions",
    (f) => fs.rmSync(f.functionDirectory, { recursive: true }),
    /NODE_FUNCTIONS_MISSING/,
  ],
  [
    "malformed launcher",
    (f) =>
      fs.writeFileSync(
        path.join(f.functionDirectory, "launcher.cjs"),
        "module.exports = {};\n",
      ),
    /LAUNCHER_CONFIG_UNREADABLE/,
  ],
];
for (const [name, mutate, expected] of rejectionCases)
  test(`prebuilt provenance rejects ${name}`, () => {
    const f = fixture();
    try {
      assert.equal(
        verifyPrebuiltSkew({ ...f, expectedId: id }).nodeFunctions,
        1,
      );
      mutate(f);
      assert.throws(
        () => verifyPrebuiltSkew({ ...f, expectedId: id }),
        expected,
      );
    } finally {
      fs.rmSync(f.root, { recursive: true });
    }
  });

test("the real Next production configuration retains a baked custom ID on Vercel", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const script = `
    import loadConfig from 'next/dist/server/config.js';
    import { PHASE_PRODUCTION_BUILD } from 'next/constants.js';
    const config = await loadConfig.default(PHASE_PRODUCTION_BUILD, './apps/os');
    console.log(JSON.stringify({ id: config.deploymentId, runtime: config.experimental.runtimeServerDeploymentId, mcpServer: config.experimental.mcpServer }));
  `;
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", script],
    {
      cwd: root,
      env: {
        PATH: path.dirname(process.execPath),
        NODE_ENV: "production",
        NEXT_TELEMETRY_DISABLED: "1",
        VERCEL: "1",
        NEXT_DEPLOYMENT_ID: id,
      },
      encoding: "utf8",
      timeout: 20_000,
    },
  );
  assert.equal(result.status, 0, "Next configuration load must succeed");
  const lines = result.stdout.trim().split("\n");
  assert.deepEqual(JSON.parse(lines.at(-1)!), {
    id,
    runtime: false,
    mcpServer: false,
  });
});

for (const target of ["required", "launcher"] as const) {
  for (const value of [true, undefined]) {
    test(`runtime deployment-ID override cannot be accepted in ${target}: ${String(value)}`, () => {
      const f = fixture();
      try {
        const configuration = {
          deploymentId: id,
          experimental:
            value === undefined ? {} : { runtimeServerDeploymentId: value },
        };
        if (target === "required")
          f.write(
            path.join(
              f.applicationDirectory,
              ".next/required-server-files.json",
            ),
            { config: configuration },
          );
        else
          fs.writeFileSync(
            path.join(f.functionDirectory, "launcher.cjs"),
            `const conf = ${JSON.stringify(configuration)};\n`,
          );
        assert.throws(
          () => verifyPrebuiltSkew({ ...f, expectedId: id }),
          /PREBUILT_RUNTIME_ID_OVERRIDE/,
        );
      } finally {
        fs.rmSync(f.root, { recursive: true });
      }
    });
  }
}
