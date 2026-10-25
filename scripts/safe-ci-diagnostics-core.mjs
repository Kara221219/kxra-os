import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { z } from "zod";
import { localModeConfiguration } from "../packages/authz/local-guard.ts";

export const diagnosticsLimits = Object.freeze({
  events: 64,
  targetedFiles: 15,
  files: 16,
  documentBytes: 16 * 1024,
  totalBytes: 256 * 1024,
});
const fail = () => {
  throw Error("SAFE_DIAGNOSTICS_REJECTED");
};
const integer = (max) => z.number().int().min(0).max(max);
const finite = (max) => z.number().finite().min(0).max(max);
const metadataSchema = z.strictObject({
  sourceSha: z.string().regex(/^[a-f0-9]{40}$/),
  githubRunId: z.string().regex(/^[1-9][0-9]{0,19}$/),
  githubRunAttempt: z.string().regex(/^[1-9][0-9]{0,5}$/),
});
const attestationSchema = z.strictObject({
  kind: z.literal("SYNTHETIC_FRESH_FIXTURE_V1"),
  metadata: metadataSchema,
  fixtureRunId: z.string().uuid(),
  loopbackPort: z.number().int().min(1024).max(65535),
  freshFixture: z.literal(true),
});
const elapsedMs = integer(60 * 60 * 1000);
const operation = z.enum([
  "CASE_PROPOSE",
  "CASE_REVIEW",
  "CASE_EXECUTE",
  "DETACH",
  "WORKSPACE_REFRESH",
]);
const action = { elapsedMs, operation, ordinal: integer(63) };
const stage = z.enum([
  "DEPENDENCIES",
  "SERVICES",
  "MIGRATIONS",
  "PUBLICATION",
  "MARKETING_BOUNDARY",
  "PRIVATE_BROWSER",
  "PUBLIC_BROWSER",
  "RESTART",
  "RESTORE",
  "BUILD",
  "CSP",
  "BUDGET",
  "ARTIFACT",
  "SECRET_SCAN",
  "PERFORMANCE",
  "AUDIT",
]);
export const safeDiagnosticEventSchema = z.discriminatedUnion("phase", [
  z.strictObject({ phase: z.literal("ACTION_BEGIN"), ...action }),
  z.strictObject({ phase: z.literal("ACTION_COMPLETE"), ...action }),
  z.strictObject({
    phase: z.literal("REQUEST_OBSERVED"),
    ...action,
    matchesExpected: z.boolean(),
  }),
  z.strictObject({
    phase: z.literal("RESPONSE_OBSERVED"),
    ...action,
    status: z.number().int().min(100).max(599),
  }),
  z.strictObject({
    phase: z.literal("FIXTURE_READY"),
    elapsedMs,
    healthy: z.literal(true),
    fresh: z.literal(true),
  }),
  z.strictObject({
    phase: z.literal("UI_STATE"),
    elapsedMs,
    busy: z.boolean(),
    buttonEnabled: z.boolean(),
    reviewVisible: z.boolean(),
    emptyVisible: z.boolean(),
    matchingCards: integer(1000),
    detailsOpen: z.boolean(),
    targetValid: z.boolean(),
    noteValid: z.boolean(),
    inViewport: z.boolean(),
  }),
  z.strictObject({
    phase: z.literal("CANONICAL_STATE"),
    elapsedMs,
    records: integer(1000),
    actions: integer(1000),
    matchingActions: integer(1000),
    expectedVersion: z.boolean(),
    expectedStage: z.boolean(),
  }),
  z.strictObject({
    phase: z.literal("RESOURCE_SNAPSHOT"),
    elapsedMs,
    rssMiB: finite(65536),
    heapMiB: finite(65536),
    load1: finite(4096),
    cpuUserMs: finite(60 * 60 * 1000),
    cpuSystemMs: finite(60 * 60 * 1000),
    freeMiB: finite(1048576),
    totalMiB: finite(1048576),
    cpuCount: z.number().int().min(1).max(1024),
  }),
  z.strictObject({
    phase: z.literal("HARNESS_STAGE"),
    elapsedMs,
    stage,
    state: z.enum(["BEGIN", "PASS", "FAIL"]),
    exitCode: z.number().int().min(-1).max(255),
  }),
  z.strictObject({
    phase: z.literal("TEST_RESULT"),
    elapsedMs,
    outcome: z.enum([
      "PASSED",
      "FAILED",
      "TIMED_OUT",
      "INTERRUPTED",
      "SKIPPED",
    ]),
    sourceLine: integer(100000),
    expectedFailure: z.boolean(),
  }),
]);
const outcomeSchema = z.enum(["PASSED", "FAILED", "INTERRUPTED"]);
const failureSchema = z.enum([
  "NONE",
  "ASSERTION",
  "ACTION_TIMEOUT",
  "REQUEST_TIMEOUT",
  "RESPONSE_TIMEOUT",
  "HARNESS_GUARD",
  "UNKNOWN",
]);
const summarySchema = z
  .strictObject({
    kind: z.literal("SAFE_SYNTHETIC_FAILURE_SUMMARY_V1"),
    metadata: metadataSchema,
    fixtureRunId: z.string().uuid(),
    suite: z.enum(["CASES", "KNOWLEDGE", "WORKSPACE", "OTHER", "HARNESS"]),
    viewport: z.enum(["DESKTOP", "MOBILE", "NONE"]),
    ordinal: integer(63),
    outcome: outcomeSchema,
    failureKind: failureSchema,
    events: z.array(safeDiagnosticEventSchema).max(diagnosticsLimits.events),
  })
  .refine(
    (value) =>
      (value.outcome === "PASSED") === (value.failureKind === "NONE") &&
      value.events.every(
        (event, index) =>
          index === 0 || event.elapsedMs >= value.events[index - 1].elapsedMs,
      ),
  );
function parse(schema, value) {
  try {
    return schema.parse(value);
  } catch {
    return fail();
  }
}
function head(root) {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"],
      env: {
        PATH: process.env.PATH || "",
        LANG: "C",
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: "/dev/null",
      },
    }).trim();
  } catch {
    return fail();
  }
}
function metadataFor(root, environment, input, exporting = false) {
  if (!environment || typeof environment !== "object") fail();
  const metadata = parse(metadataSchema, input);
  if (head(root) !== metadata.sourceSha) fail();
  if (exporting || environment.GITHUB_ACTIONS === "true") {
    if (
      environment.GITHUB_ACTIONS !== "true" ||
      environment.GITHUB_SHA !== metadata.sourceSha ||
      environment.GITHUB_RUN_ID !== metadata.githubRunId ||
      environment.GITHUB_RUN_ATTEMPT !== metadata.githubRunAttempt
    )
      fail();
  }
  return metadata;
}
function directory(name, create = false) {
  try {
    if (create) fs.mkdirSync(name, { mode: 0o700 });
    const s = fs.lstatSync(name);
    if (
      !s.isDirectory() ||
      s.isSymbolicLink() ||
      s.uid !== process.getuid() ||
      (s.mode & 0o077) !== 0
    )
      fail();
    return { real: fs.realpathSync(name), dev: s.dev, ino: s.ino };
  } catch {
    return fail();
  }
}
function unchanged(name, before) {
  const after = directory(name);
  if (
    after.real !== before.real ||
    after.dev !== before.dev ||
    after.ino !== before.ino
  )
    fail();
}
function context(runtime, create = false) {
  const parent = directory(runtime);
  const input = path.join(runtime, "safe-ci-diagnostics");
  let child;
  try {
    child = directory(input, create);
  } catch {
    return fail();
  }
  unchanged(runtime, parent);
  return { runtime, input, parent, child };
}
function unchangedContext(c) {
  unchanged(c.runtime, c.parent);
  unchanged(c.input, c.child);
}
function privateRead(file, limit = diagnosticsLimits.documentBytes) {
  let fd;
  try {
    fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const s = fs.fstatSync(fd);
    if (
      !s.isFile() ||
      s.nlink !== 1 ||
      s.uid !== process.getuid() ||
      (s.mode & 0o077) !== 0 ||
      s.size > limit
    )
      fail();
    const bytes = fs.readFileSync(fd);
    if (bytes.length !== s.size || bytes.length > limit) fail();
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    return fail();
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
function privateWrite(file, value) {
  const data = JSON.stringify(value) + "\n";
  if (Buffer.byteLength(data) > diagnosticsLimits.documentBytes) fail();
  let fd;
  try {
    fd = fs.openSync(
      file,
      fs.constants.O_WRONLY |
        fs.constants.O_CREAT |
        fs.constants.O_EXCL |
        fs.constants.O_NOFOLLOW,
      0o600,
    );
    fs.writeFileSync(fd, data);
  } catch {
    return fail();
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
function fixture(environment, health) {
  if (!environment || typeof environment !== "object") fail();
  if (!localModeConfiguration(environment) || !environment.KXRA_CI_RUN_ID)
    fail();
  const identity = parse(
    z.strictObject({
      service: z.literal("kxra-os"),
      run_id: z.string().uuid(),
    }),
    health,
  );
  if (identity.run_id !== environment.KXRA_CI_RUN_ID) fail();
  return {
    fixtureRunId: identity.run_id,
    loopbackPort: Number(new URL(environment.KXRA_ORIGIN).port),
  };
}
function same(a, b) {
  if (JSON.stringify(a) !== JSON.stringify(b)) fail();
}
function attest(contextValue, metadata) {
  unchangedContext(contextValue);
  const a = parse(
    attestationSchema,
    privateRead(path.join(contextValue.input, "attestation.json")),
  );
  same(a.metadata, metadata);
  unchangedContext(contextValue);
  return a;
}
function filename(summary) {
  if (summary.suite === "HARNESS") {
    if (summary.viewport !== "NONE" || summary.ordinal !== 0) fail();
    return "summary-harness-none-00.json";
  }
  if (summary.viewport === "NONE") fail();
  return `summary-${summary.suite.toLowerCase()}-${summary.viewport.toLowerCase()}-${String(summary.ordinal).padStart(2, "0")}.json`;
}
function entries(input) {
  let files;
  try {
    files = fs.readdirSync(input);
  } catch {
    return fail();
  }
  if (
    !files.includes("attestation.json") ||
    files.length > diagnosticsLimits.files + 1 ||
    files.some(
      (n) =>
        n !== "attestation.json" &&
        !/^summary-(?:cases|knowledge|workspace|other)-(?:desktop|mobile)-(?:[0-5][0-9]|6[0-3])\.json$/.test(
          n,
        ) &&
        n !== "summary-harness-none-00.json",
    )
  )
    fail();
  if (
    files.filter(
      (n) => n !== "attestation.json" && n !== "summary-harness-none-00.json",
    ).length > diagnosticsLimits.targetedFiles
  )
    fail();
  return files.filter((n) => n !== "attestation.json");
}
function persist(c, summary, expectedAttestation) {
  const document = parse(summarySchema, summary);
  unchangedContext(c);
  same(attest(c, document.metadata), expectedAttestation);
  const files = entries(c.input);
  const name = filename(document);
  if (
    files.length >= diagnosticsLimits.files ||
    (document.suite !== "HARNESS" &&
      files.filter((f) => f !== "summary-harness-none-00.json").length >=
        diagnosticsLimits.targetedFiles)
  )
    fail();
  unchangedContext(c);
  privateWrite(path.join(c.input, name), document);
  unchangedContext(c);
  same(attest(c, document.metadata), expectedAttestation);
  return name;
}

/** Call only after the reviewed harness created a fresh fixture and checked health. */
export function mintDiagnosticsAttestation({
  root,
  environment,
  health,
  freshFixture,
  metadata,
}) {
  if (freshFixture !== true) fail();
  const identity = fixture(environment, health);
  const bound = metadataFor(root, environment, metadata);
  const c = context(environment.KXRA_RUNTIME, true);
  const value = parse(attestationSchema, {
    kind: "SYNTHETIC_FRESH_FIXTURE_V1",
    metadata: bound,
    ...identity,
    freshFixture: true,
  });
  privateWrite(path.join(c.input, "attestation.json"), value);
  unchanged(c.input, c.child);
  return value;
}
export function openSafeDiagnostics({
  root,
  environment,
  health,
  metadata,
  suite,
  viewport,
  ordinal,
}) {
  const identity = fixture(environment, health);
  const bound = metadataFor(root, environment, metadata);
  const c = context(environment.KXRA_RUNTIME);
  const a = attest(c, bound);
  if (
    a.fixtureRunId !== identity.fixtureRunId ||
    a.loopbackPort !== identity.loopbackPort
  )
    fail();
  const base = parse(summarySchema, {
    kind: "SAFE_SYNTHETIC_FAILURE_SUMMARY_V1",
    metadata: bound,
    fixtureRunId: a.fixtureRunId,
    suite,
    viewport,
    ordinal,
    outcome: "INTERRUPTED",
    failureKind: "UNKNOWN",
    events: [],
  });
  filename(base);
  const events = [];
  let done = false;
  return {
    record(event) {
      if (done || events.length >= diagnosticsLimits.events) fail();
      const value = parse(safeDiagnosticEventSchema, event);
      if (
        events.length &&
        value.elapsedMs < events[events.length - 1].elapsedMs
      )
        fail();
      events.push(value);
    },
    finish(outcome, failureKind = outcome === "PASSED" ? "NONE" : "UNKNOWN") {
      if (done) fail();
      done = true;
      return persist(c, { ...base, outcome, failureKind, events }, a);
    },
  };
}
export function writeHarnessDiagnostics({
  root,
  runtime,
  environment,
  metadata,
  events,
  outcome,
}) {
  const bound = metadataFor(root, environment, metadata, true);
  const c = context(runtime),
    a = attest(c, bound);
  if (
    environment.VERCEL ||
    environment.DATABASE_URL ||
    environment.NEXT_PUBLIC_SUPABASE_URL
  )
    fail();
  return persist(
    c,
    {
      kind: "SAFE_SYNTHETIC_FAILURE_SUMMARY_V1",
      metadata: bound,
      fixtureRunId: a.fixtureRunId,
      suite: "HARNESS",
      viewport: "NONE",
      ordinal: 0,
      outcome,
      failureKind: outcome === "PASSED" ? "NONE" : "UNKNOWN",
      events,
    },
    a,
  );
}
export function exportSafeDiagnostics({
  root,
  runtime,
  destination,
  environment,
  metadata,
}) {
  const bound = metadataFor(root, environment, metadata, true);
  if (
    environment.VERCEL ||
    environment.DATABASE_URL ||
    environment.NEXT_PUBLIC_SUPABASE_URL ||
    path.resolve(destination) !==
      path.join(path.resolve(root), "safe-ci-diagnostics-export")
  )
    fail();
  const c = context(runtime),
    a = attest(c, bound),
    files = entries(c.input);
  if (!files.length) fail();
  const validated = [];
  let bytes = 0;
  for (const name of files.sort()) {
    const document = parse(
      summarySchema,
      privateRead(path.join(c.input, name)),
    );
    same(document.metadata, bound);
    if (document.fixtureRunId !== a.fixtureRunId || filename(document) !== name)
      fail();
    let last = -1;
    for (const event of document.events) {
      if (event.elapsedMs < last) fail();
      last = event.elapsedMs;
    }
    const encoded = JSON.stringify(document) + "\n";
    bytes += Buffer.byteLength(encoded);
    if (bytes > diagnosticsLimits.totalBytes) fail();
    validated.push([name, document]);
  }
  unchangedContext(c);
  same(attest(c, bound), a);
  same(entries(c.input).sort(), files.sort());
  const out = directory(destination, true);
  for (const [name, document] of validated)
    privateWrite(path.join(destination, name), document);
  unchanged(destination, out);
  unchangedContext(c);
  same(attest(c, bound), a);
  return { files: validated.length, bytes };
}
