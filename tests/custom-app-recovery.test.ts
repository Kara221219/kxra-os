import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import {
  loadCustomAppExtension,
  assertRecoveryConfiguration,
  assertExtensionCatalog,
  assertFreshRestoreTarget,
  recoveryNativeOptions,
  cleanupRecoveryCluster,
  waitForRecoveryLease,
} from "../scripts/custom-app-recovery-evidence.mjs";
const root = process.cwd(),
  manifest = loadCustomAppExtension(root);
function catalogs() {
  const baseline = {
    tables: Array.from({ length: 214 }, (_, n) => ({
      identity: `kxra.base_${n}`,
      sha256: "canonical",
    })),
    relations: [],
    routines: [],
    functions: Array.from({ length: 207 }, (_, n) => ({
      identity: `kxra.base_${n}()`,
      sha256: "canonical",
    })),
  };
  const current = {
    relations: [],
    routines: [],
    tables: [
      ...baseline.tables,
      ...manifest.tables.map((identity: string) => ({
        identity,
        sha256: "extension",
        owner: os.userInfo().username,
        acl: [
          {
            grantee: os.userInfo().username,
            privilege: "SELECT",
            grantable: false,
          },
          { grantee: "authenticated", privilege: "SELECT", grantable: false },
        ],
        rls: true,
        policies: 1,
        authenticated_select: true,
        authenticated_write: false,
        anon_access: false,
      })),
    ],
    functions: [
      ...baseline.functions,
      ...manifest.functions.map(
        (f: {
          identity: string;
          security_definer: boolean;
          authenticated_execute: boolean;
        }) => ({
          ...f,
          sha256: "extension",
          owner: os.userInfo().username,
          acl: [
            {
              grantee: os.userInfo().username,
              privilege: "EXECUTE",
              grantable: false,
            },
            ...(f.authenticated_execute
              ? [
                  {
                    grantee: "authenticated",
                    privilege: "EXECUTE",
                    grantable: false,
                  },
                ]
              : []),
          ],
          anon_execute: false,
          public_execute: false,
        }),
      ),
    ],
  };
  return { baseline, current };
}
test("extension manifest pins both proposal bytes and refuses unreviewed source changes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kxra-recovery-manifest-"));
  try {
    fs.mkdirSync(path.join(dir, "packages/custom-apps"), { recursive: true });
    for (const file of [
      "packages/custom-apps/local-extension-manifest.json",
      ...manifest.sources.map((s: { file: string }) => s.file),
    ])
      fs.copyFileSync(path.join(root, file), path.join(dir, file));
    assert.deepEqual(loadCustomAppExtension(dir), manifest);
    fs.appendFileSync(
      path.join(dir, manifest.sources[0].file),
      "\n-- changed\n",
    );
    assert.throws(
      () => loadCustomAppExtension(dir),
      /changed without manifest review/,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("explicit extension catalog rejects extra, missing, swapped and changed canonical objects", () => {
  const { baseline, current } = catalogs();
  assert.doesNotThrow(() =>
    assertExtensionCatalog(baseline, current, manifest),
  );
  const copy = () => structuredClone(current);
  let bad = copy();
  bad.tables.push({ identity: "kxra.unreviewed", sha256: "unexpected" });
  assert.throws(() => assertExtensionCatalog(baseline, bad, manifest));
  bad = copy();
  bad.functions.push({ identity: "public.unreviewed()", sha256: "unexpected" });
  assert.throws(() => assertExtensionCatalog(baseline, bad, manifest));
  bad = copy();
  bad.tables[0].identity = "kxra.swapped";
  assert.throws(() => assertExtensionCatalog(baseline, bad, manifest));
  bad = copy();
  bad.functions[0].sha256 = "changed definition";
  assert.throws(() => assertExtensionCatalog(baseline, bad, manifest));
  bad = copy();
  bad.functions.pop();
  assert.throws(() => assertExtensionCatalog(baseline, bad, manifest));
});
test("extension recovery rejects weakened RLS, direct writes, anon execution and definer changes", () => {
  const { baseline, current } = catalogs();
  for (const [kind, field, value] of [
    ["tables", "rls", false],
    ["tables", "authenticated_write", true],
    ["tables", "anon_access", true],
    ["functions", "anon_execute", true],
    ["functions", "public_execute", true],
    ["functions", "security_definer", true],
  ] as const) {
    const bad = structuredClone(current);
    const item = bad[kind].find((x: { identity: string }) =>
      manifest[kind].some(
        (m: string | { identity: string }) =>
          (typeof m === "string" ? m : m.identity) === x.identity,
      ),
    );
    Object.assign(item!, { [field]: value });
    assert.throws(() => assertExtensionCatalog(baseline, bad, manifest));
  }
});
test("recovery configuration admits only the exact fresh checkout socket without credentials", () => {
  const runtime = path.join(root, ".runtime/cr-aabbcc"),
    config = {
      host: path.join(runtime, "socket"),
      port: 55555,
      database: "postgres",
      user: "kxra_app",
    };
  assert.doesNotThrow(() => assertRecoveryConfiguration(root, runtime, config));
  for (const value of [
    { ...config, host: "localhost" },
    { ...config, password: "forbidden" },
    { ...config, database: "existing_customer_database" },
    { ...config, user: "postgres" },
    { ...config, port: 0 },
  ])
    assert.throws(() => assertRecoveryConfiguration(root, runtime, value));
  assert.throws(() =>
    assertRecoveryConfiguration(
      root,
      path.join(root, ".runtime/existing"),
      config,
    ),
  );
  assert.throws(() =>
    assertRecoveryConfiguration(
      root,
      `${root}/.runtime/../foreign/cr-aabbcc`,
      config,
    ),
  );
});
test("restore target must be generated and absent; existing names are never reusable", () => {
  const name = "kxra_app_restore_aabbcc112233";
  assert.doesNotThrow(() =>
    assertFreshRestoreTarget(name, ["postgres", "template0", "template1"]),
  );
  assert.throws(() => assertFreshRestoreTarget(name, [name]));
  for (const value of [
    "postgres",
    "customer",
    "kxra_app_restore_aabbcc112233;drop database postgres",
    "kxra_app_restore_../other",
  ])
    assert.throws(() => assertFreshRestoreTarget(value, []));
});

test("catalog rejects views, sequences, aggregates, owner drift and direct app-role grants", () => {
  const { baseline, current } = catalogs();
  for (const kind of ["relations", "routines"] as const) {
    const bad = structuredClone(current);
    (bad[kind] as unknown[]).push({
      identity: "kxra.unreviewed",
      sha256: "new",
    });
    assert.throws(() => assertExtensionCatalog(baseline, bad, manifest));
  }
  for (const kind of ["tables", "functions"] as const) {
    let bad = structuredClone(current);
    const item = bad[kind].find((x: { identity: string }) =>
      x.identity.includes("custom_app"),
    )!;
    Object.assign(item, { owner: "kxra_app" });
    assert.throws(() => assertExtensionCatalog(baseline, bad, manifest));
    bad = structuredClone(current);
    const granted = bad[kind].find((x: { identity: string }) =>
      x.identity.includes("custom_app"),
    )! as { acl: unknown[] };
    granted.acl.push({
      grantee: "kxra_app",
      privilege: "SELECT",
      grantable: false,
    });
    assert.throws(() => assertExtensionCatalog(baseline, bad, manifest));
  }
});
test("native recovery commands receive explicit environment without ambient libpq options", () => {
  const old = process.env.PGHOSTADDR;
  process.env.PGHOSTADDR = "untrusted.invalid";
  try {
    const options = recoveryNativeOptions({ PATH: process.env.PATH });
    assert.ok(!Object.hasOwn(options.env, "PGHOSTADDR"));
    const output = execFileSync(
      process.execPath,
      ["-e", "process.stdout.write(process.env.PGHOSTADDR || 'unset')"],
      { ...options, stdio: "pipe" },
    );
    assert.equal(output.toString(), "unset");
    for (const name of [
      "PGHOSTADDR",
      "PGSERVICE",
      "PGOPTIONS",
      "PGPASSFILE",
      "PGSERVICEFILE",
    ])
      assert.throws(
        () => recoveryNativeOptions({ [name]: "forbidden" }),
        /libpq|passfile|runtime/,
      );
  } finally {
    if (old === undefined) delete process.env.PGHOSTADDR;
    else process.env.PGHOSTADDR = old;
  }
});
test("partial startup failure still stops the owned cluster; uncertainty cannot release lease", () => {
  let running = true,
    stops = 0;
  cleanupRecoveryCluster(
    true,
    () => (running ? 0 : 3),
    () => {
      stops++;
      running = false;
      return 0;
    },
  );
  assert.equal(stops, 1);
  assert.equal(running, false);
  cleanupRecoveryCluster(
    true,
    () => 3,
    () => {
      throw Error("must not stop an absent cluster");
    },
  );
  assert.throws(
    () =>
      cleanupRecoveryCluster(
        true,
        () => 4,
        () => 0,
      ),
    /uncertain/,
  );
  assert.throws(
    () =>
      cleanupRecoveryCluster(
        true,
        () => 0,
        () => 1,
      ),
    /still active or uncertain/,
  );
  assert.throws(
    () =>
      cleanupRecoveryCluster(
        true,
        (() => {
          let n = 0;
          return () => (n++ === 0 ? 0 : 3);
        })(),
        () => 1,
      ),
    /stop failed/,
  );
});

test("frozen installed catalog rejects extension definition and policy changes", () => {
  const { baseline, current } = catalogs();
  for (const kind of ["tables", "functions"] as const) {
    const changed = structuredClone(current);
    changed[kind].find((x: { identity: string }) =>
      x.identity.includes("custom_app"),
    )!.sha256 = "changed logic";
    assert.throws(
      () => assertExtensionCatalog(baseline, changed, manifest, current),
      /Installed extension/,
    );
  }
});
test("native tools accept only the private empty fixture passfile", () => {
  const dir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "kxra-passfile-unit-")),
    ),
    file = path.join(dir, "empty.pgpass");
  try {
    fs.writeFileSync(file, "", { flag: "wx", mode: 0o600 });
    assert.equal(
      recoveryNativeOptions({ KXRA_RUNTIME: dir, PGPASSFILE: file }).env
        .PGPASSFILE,
      file,
    );
    fs.writeFileSync(file, "not-empty");
    assert.throws(
      () => recoveryNativeOptions({ KXRA_RUNTIME: dir, PGPASSFILE: file }),
      /empty fixture/,
    );
    assert.throws(
      () =>
        recoveryNativeOptions({
          KXRA_RUNTIME: dir,
          PGPASSFILE: "/other/credential",
        }),
      /passfile/,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("native lease wait never acquires while held and times out without starting a fixture", async () => {
  let clock = 0,
    attempts = 0;
  const release = () => {};
  assert.equal(
    await waitForRecoveryLease(
      () => {
        attempts++;
        return release;
      },
      () => clock < 2,
      {
        now: () => clock,
        wait: async () => {
          clock++;
        },
        timeoutMs: 3,
      },
    ),
    release,
  );
  assert.equal(attempts, 1);
  await assert.rejects(
    waitForRecoveryLease(
      () => {
        attempts++;
        return release;
      },
      () => true,
      {
        now: () => clock,
        wait: async () => {
          clock++;
        },
        timeoutMs: 2,
      },
    ),
    /remained held/,
  );
  assert.equal(attempts, 1);
});
