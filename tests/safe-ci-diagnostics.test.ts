import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mintDiagnosticsAttestation,
  openSafeDiagnostics,
  exportSafeDiagnostics,
  writeHarnessDiagnostics,
} from "../scripts/safe-ci-diagnostics-core.mjs";

const repository = path.resolve(import.meta.dirname, "..");
const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: repository,
  encoding: "utf8",
}).trim();
const rejected = /^Error: SAFE_DIAGNOSTICS_REJECTED$/;
const action = {
  phase: "ACTION_BEGIN",
  elapsedMs: 0,
  operation: "CASE_PROPOSE",
  ordinal: 0,
};
function fixture() {
  const container = fs.mkdtempSync(
    path.join(os.tmpdir(), "kxra-safe-diagnostic-test-"),
  );
  fs.chmodSync(container, 0o700);
  const root = path.join(fs.realpathSync(container), "source");
  execFileSync(
    "git",
    ["clone", "--shared", "--no-checkout", "--quiet", repository, root],
    { stdio: "ignore" },
  );
  const runtime = path.join(fs.realpathSync(container), "runtime");
  fs.mkdirSync(runtime, { mode: 0o700 });
  const run = crypto.randomUUID();
  const metadata = { sourceSha, githubRunId: "123", githubRunAttempt: "1" };
  const environment = {
    NODE_ENV: "development",
    KXRA_AUTH_MODE: "fixture",
    KXRA_ORIGIN: "http://127.0.0.1:3210",
    KXRA_RUNTIME: runtime,
    KXRA_LOCAL_SECRET: crypto.randomBytes(48).toString("hex"),
    KXRA_CI_RUN_ID: run,
    GITHUB_ACTIONS: "true",
    GITHUB_SHA: sourceSha,
    GITHUB_RUN_ID: "123",
    GITHUB_RUN_ATTEMPT: "1",
  };
  const health = { service: "kxra-os", run_id: run };
  const options = { root, environment, health, freshFixture: true, metadata };
  const destination = path.join(root, "safe-ci-diagnostics-export");
  const cleanup = () => {
    fs.rmSync(container, { recursive: true, force: true });
  };
  const mint = () => mintDiagnosticsAttestation(options);
  const writer = (ordinal = 0) =>
    openSafeDiagnostics({
      ...options,
      suite: "CASES",
      viewport: "MOBILE",
      ordinal,
    });
  const exporting = () =>
    exportSafeDiagnostics({
      root,
      runtime,
      destination,
      environment,
      metadata,
    });
  const input = path.join(runtime, "safe-ci-diagnostics");
  return {
    root,
    runtime,
    metadata,
    environment,
    health,
    options,
    input,
    destination,
    cleanup,
    mint,
    writer,
    exporting,
  };
}

test("allowlisted failed summary exports only bounded source metadata and safe evidence", () => {
  const f = fixture();
  try {
    f.mint();
    const w = f.writer();
    w.record(action);
    w.record({
      phase: "REQUEST_OBSERVED",
      elapsedMs: 5,
      operation: "CASE_PROPOSE",
      ordinal: 0,
      matchesExpected: true,
    });
    w.record({
      phase: "RESPONSE_OBSERVED",
      elapsedMs: 8,
      operation: "CASE_PROPOSE",
      ordinal: 0,
      status: 201,
    });
    w.record({
      phase: "UI_STATE",
      elapsedMs: 9,
      busy: false,
      buttonEnabled: true,
      reviewVisible: true,
      emptyVisible: false,
      matchingCards: 1,
      detailsOpen: true,
      targetValid: true,
      noteValid: true,
      inViewport: true,
    });
    w.record({
      phase: "RESOURCE_SNAPSHOT",
      elapsedMs: 10,
      rssMiB: 256,
      heapMiB: 128,
      load1: 1.5,
      cpuUserMs: 40,
      cpuSystemMs: 10,
      freeMiB: 1024,
      totalMiB: 8192,
      cpuCount: 2,
    });
    const name = w.finish("FAILED", "ASSERTION");
    assert.deepEqual(f.exporting(), {
      files: 1,
      bytes: fs.statSync(path.join(f.destination, name)).size,
    });
    const exported = fs.readFileSync(path.join(f.destination, name), "utf8");
    const d = JSON.parse(exported);
    assert.equal(d.events.length, 5);
    assert.equal(d.outcome, "FAILED");
    assert.equal(exported.includes(f.environment.KXRA_LOCAL_SECRET), false);
    assert.equal(exported.includes(f.environment.KXRA_ORIGIN), false);
    assert.equal(exported.includes(f.runtime), false);
    assert.equal(fs.statSync(path.join(f.destination, name)).mode & 0o077, 0);
  } finally {
    f.cleanup();
  }
});

for (const field of [
  "headers",
  "cookie",
  "token",
  "body",
  "url",
  "query",
  "text",
  "error",
  "filename",
  "credential",
]) {
  test(`unknown ${field} field and poisoned value cannot be recorded or disclosed`, () => {
    const f = fixture();
    try {
      f.mint();
      const w = f.writer();
      const poison = `PRIVATE-POISON-${field}`;
      assert.throws(
        () => w.record({ ...action, [field]: poison }),
        (e) =>
          e instanceof Error &&
          String(e).match(rejected) !== null &&
          !String(e).includes(poison),
      );
      assert.throws(() => w.record({ ...action, elapsedMs: poison }), rejected);
      assert.equal(fs.readdirSync(f.input).length, 1);
    } finally {
      f.cleanup();
    }
  });
}

test("guard rejects hosted/nonloopback settings, stale health, missing fresh proof and identities", () => {
  const variants = [
    { environment: { VERCEL: "1" } },
    { environment: { DATABASE_URL: "PRIVATE-POISON" } },
    { environment: { NEXT_PUBLIC_SUPABASE_URL: "https://example.invalid" } },
    { environment: { KXRA_ORIGIN: "https://example.invalid" } },
    { environment: { KXRA_AUTH_MODE: "hosted" } },
    { environment: { NODE_ENV: "production" } },
    { environment: { KXRA_LOCAL_SECRET: "short" } },
    { health: { service: "kxra-os", run_id: crypto.randomUUID() } },
    { freshFixture: false },
    { environment: { GITHUB_SHA: "a".repeat(40) } },
    { environment: { GITHUB_RUN_ID: "124" } },
    { environment: { GITHUB_RUN_ATTEMPT: "2" } },
  ];
  for (const variant of variants) {
    const f = fixture();
    try {
      const v = {
        ...f.options,
        ...variant,
        environment: { ...f.environment, ...variant.environment },
      };
      assert.throws(() => mintDiagnosticsAttestation(v), rejected);
      assert.equal(fs.existsSync(f.input), false);
    } finally {
      f.cleanup();
    }
  }
});

test("capture requires original attestation and exact fixture/metadata binding", () => {
  const f = fixture();
  try {
    assert.throws(() => f.writer(), rejected);
    f.mint();
    assert.throws(() => mintDiagnosticsAttestation(f.options), rejected);
    assert.throws(
      () =>
        openSafeDiagnostics({
          ...f.options,
          environment: {
            ...f.environment,
            KXRA_ORIGIN: "http://127.0.0.1:3211",
          },
          suite: "CASES",
          viewport: "MOBILE",
          ordinal: 0,
        }),
      rejected,
    );
    const attestation = path.join(f.input, "attestation.json");
    const d = JSON.parse(fs.readFileSync(attestation, "utf8"));
    d.metadata.githubRunId = "125";
    fs.writeFileSync(attestation, JSON.stringify(d));
    assert.throws(() => f.writer(), rejected);
  } finally {
    f.cleanup();
  }
});

test("nonfinite, excessive, backward and excessive-count events fail closed", () => {
  const f = fixture();
  try {
    f.mint();
    const w = f.writer();
    for (const elapsedMs of [NaN, Infinity, -1, 3600001])
      assert.throws(() => w.record({ ...action, elapsedMs }), rejected);
    w.record({ ...action, elapsedMs: 5 });
    assert.throws(() => w.record({ ...action, elapsedMs: 4 }), rejected);
    for (let i = 1; i < 64; i++) w.record({ ...action, elapsedMs: i + 5 });
    assert.throws(() => w.record({ ...action, elapsedMs: 100 }), rejected);
    w.finish("FAILED", "UNKNOWN");
    assert.throws(() => w.finish("FAILED", "UNKNOWN"), rejected);
  } finally {
    f.cleanup();
  }
});

test("fifteen targeted summaries reserve one slot for a generic harness failure", () => {
  const f = fixture();
  try {
    f.mint();
    for (let ordinal = 0; ordinal < 15; ordinal++)
      f.writer(ordinal).finish("PASSED");
    assert.throws(() => f.writer(15).finish("PASSED"), rejected);
    writeHarnessDiagnostics({
      root: f.root,
      runtime: f.runtime,
      environment: f.environment,
      metadata: f.metadata,
      outcome: "FAILED",
      events: [
        {
          phase: "HARNESS_STAGE",
          elapsedMs: 20,
          stage: "PRIVATE_BROWSER",
          state: "FAIL",
          exitCode: 1,
        },
      ],
    });
    assert.equal(f.exporting().files, 16);
    assert.throws(
      () =>
        writeHarnessDiagnostics({
          root: f.root,
          runtime: f.runtime,
          environment: f.environment,
          metadata: f.metadata,
          outcome: "FAILED",
          events: [],
        }),
      rejected,
    );
  } finally {
    f.cleanup();
  }
});

test("export revalidates poisoned JSON, rejects unknown names, identity drift and oversized files before creating output", () => {
  for (const variant of [
    "poison",
    "unexpected",
    "oversize",
    "metadata",
    "backward",
  ]) {
    const f = fixture();
    try {
      f.mint();
      const name = f.writer().finish("FAILED", "UNKNOWN");
      const file = path.join(f.input, name);
      const d = JSON.parse(fs.readFileSync(file, "utf8"));
      if (variant === "poison") {
        d.headers = { authorization: "PRIVATE-POISON" };
        fs.writeFileSync(file, JSON.stringify(d));
      }
      if (variant === "unexpected")
        fs.writeFileSync(
          path.join(f.input, "raw-trace.zip"),
          "PRIVATE-POISON",
          { mode: 0o600 },
        );
      if (variant === "oversize") fs.writeFileSync(file, " ".repeat(16385));
      if (variant === "metadata") {
        d.metadata.githubRunAttempt = "2";
        fs.writeFileSync(file, JSON.stringify(d));
      }
      if (variant === "backward") {
        d.events = [
          { ...action, elapsedMs: 20 },
          { ...action, elapsedMs: 19 },
        ];
        fs.writeFileSync(file, JSON.stringify(d));
      }
      assert.throws(() => f.exporting(), rejected);
      assert.equal(fs.existsSync(f.destination), false);
    } finally {
      f.cleanup();
    }
  }
});

test("symlinks, hardlinks, public permissions, traversal and preexisting export destinations are rejected", () => {
  for (const variant of [
    "file-link",
    "directory-link",
    "hardlink",
    "permissions",
    "traversal",
    "destination",
  ]) {
    const f = fixture();
    try {
      f.mint();
      const name = f.writer().finish("FAILED", "UNKNOWN");
      const file = path.join(f.input, name);
      if (variant === "file-link") {
        fs.renameSync(file, file + ".saved");
        fs.symlinkSync(file + ".saved", file);
        fs.renameSync(file + ".saved", path.join(f.runtime, "saved.json"));
        fs.unlinkSync(file);
        fs.symlinkSync(path.join(f.runtime, "saved.json"), file);
      }
      if (variant === "directory-link") {
        fs.renameSync(f.input, f.input + "-saved");
        fs.symlinkSync(f.input + "-saved", f.input);
      }
      if (variant === "hardlink")
        fs.linkSync(file, path.join(f.runtime, "linked.json"));
      if (variant === "permissions") fs.chmodSync(file, 0o644);
      if (variant === "traversal") {
        assert.throws(
          () =>
            openSafeDiagnostics({
              ...f.options,
              suite: "../../private",
              viewport: "MOBILE",
              ordinal: 0,
            }),
          rejected,
        );
        continue;
      }
      if (variant === "destination")
        fs.mkdirSync(f.destination, { mode: 0o700 });
      assert.throws(() => f.exporting(), rejected);
    } finally {
      f.cleanup();
    }
  }
});

test("export refuses GitHub binding mismatch, hosted settings and arbitrary destination", () => {
  const f = fixture();
  try {
    f.mint();
    f.writer().finish("FAILED", "UNKNOWN");
    for (const changes of [
      { GITHUB_ACTIONS: "false" },
      { GITHUB_SHA: "b".repeat(40) },
      { GITHUB_RUN_ID: "999" },
      { GITHUB_RUN_ATTEMPT: "3" },
      { VERCEL: "1" },
      { DATABASE_URL: "PRIVATE-POISON" },
    ]) {
      assert.throws(
        () =>
          exportSafeDiagnostics({
            root: f.root,
            runtime: f.runtime,
            destination: f.destination,
            environment: { ...f.environment, ...changes },
            metadata: f.metadata,
          }),
        rejected,
      );
    }
    assert.throws(
      () =>
        exportSafeDiagnostics({
          root: f.root,
          runtime: f.runtime,
          destination: path.join(f.runtime, "outside"),
          environment: f.environment,
          metadata: f.metadata,
        }),
      rejected,
    );
  } finally {
    f.cleanup();
  }
});

test("writer rejects observed parent/directory replacement and attestation drift before writing", () => {
  for (const variant of ["input", "parent", "attestation"]) {
    const f = fixture();
    try {
      f.mint();
      const w = f.writer();
      w.record(action);
      if (variant === "input") {
        fs.renameSync(f.input, f.input + "-saved");
        fs.mkdirSync(f.input, { mode: 0o700 });
        fs.copyFileSync(
          path.join(f.input + "-saved", "attestation.json"),
          path.join(f.input, "attestation.json"),
        );
      }
      if (variant === "parent") {
        fs.renameSync(f.runtime, f.runtime + "-saved");
        fs.mkdirSync(f.runtime, { mode: 0o700 });
        fs.renameSync(
          path.join(f.runtime + "-saved", "safe-ci-diagnostics"),
          f.input,
        );
      }
      if (variant === "attestation") {
        const file = path.join(f.input, "attestation.json");
        const a = JSON.parse(fs.readFileSync(file, "utf8"));
        a.fixtureRunId = crypto.randomUUID();
        fs.writeFileSync(file, JSON.stringify(a));
      }
      assert.throws(() => w.finish("FAILED"), rejected);
      assert.deepEqual(fs.readdirSync(f.input), ["attestation.json"]);
    } finally {
      f.cleanup();
    }
  }
});

test("export rejects a directory swap observed during validation before output creation", () => {
  const f = fixture();
  const original = fs.readFileSync;
  try {
    f.mint();
    f.writer().finish("FAILED");
    let reads = 0;
    const mock = test.mock.method(fs, "readFileSync", (...args: any[]) => {
      const result = Reflect.apply(original, fs, args);
      if (typeof args[0] === "number" && ++reads === 2) {
        fs.renameSync(f.input, f.input + "-saved");
        fs.mkdirSync(f.input, { mode: 0o700 });
      }
      return result;
    });
    try {
      assert.throws(() => f.exporting(), rejected);
    } finally {
      mock.mock.restore();
    }
    assert.equal(reads, 2);
    assert.equal(fs.existsSync(f.destination), false);
  } finally {
    f.cleanup();
  }
});

test("manually injected sixteenth targeted file cannot consume the harness reservation", () => {
  const f = fixture();
  try {
    f.mint();
    const name = f.writer().finish("FAILED");
    const d = JSON.parse(fs.readFileSync(path.join(f.input, name), "utf8"));
    for (let ordinal = 1; ordinal < 16; ordinal++) {
      fs.writeFileSync(
        path.join(
          f.input,
          `summary-cases-mobile-${String(ordinal).padStart(2, "0")}.json`,
        ),
        JSON.stringify({ ...d, ordinal }),
        { mode: 0o600 },
      );
    }
    assert.throws(() => f.exporting(), rejected);
    assert.equal(fs.existsSync(f.destination), false);
  } finally {
    f.cleanup();
  }
});
