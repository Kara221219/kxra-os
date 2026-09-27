import assert from "node:assert/strict";
import { test } from "node:test";
import {
  executeStagingProbes,
  stagingEvidence,
  stagingProbePlan,
  validateStagingAcceptanceConfiguration,
} from "../scripts/staging-acceptance-core.mjs";

const sha = "a".repeat(40);
const repository = {
  branch: "codex/phase-2-completion",
  head: sha,
  remoteHead: sha,
  dirty: false,
};
const environment = {
  KXRA_ENVIRONMENT: "staging",
  KXRA_STAGING_OS_ORIGIN: "https://kxra-os-preview.vercel.app",
  KXRA_STAGING_MARKETING_ORIGIN: "https://kxra-marketing-preview.vercel.app",
  KXRA_STAGING_EXPECTED_COMMIT: sha,
  KXRA_STAGING_ACCEPTANCE_CONFIRMATION: `VERIFY:kxra-os-preview.vercel.app:kxra-marketing-preview.vercel.app:${sha}`,
};

type Probe = {
  id: string;
  surface: "os" | "marketing";
  path: string;
  url: string;
  method: string;
  statuses: number[];
  html: boolean;
  json?: boolean;
  private: boolean;
  noIndex?: boolean;
  noCors?: boolean;
  location?: string;
};

test("staging acceptance requires clean exact non-production authority", () => {
  const accepted = validateStagingAcceptanceConfiguration(
    environment,
    repository,
    true,
  );
  assert.equal(accepted.ok, true);
  assert.ok(accepted.config);
  const rejected = validateStagingAcceptanceConfiguration(
    {
      ...environment,
      KXRA_ENVIRONMENT: "production",
      KXRA_STAGING_OS_ORIGIN: "https://app.kxra-group.com",
      KXRA_STAGING_ACCEPTANCE_CONFIRMATION: "VERIFY:wrong",
    },
    { ...repository, dirty: true, remoteHead: "b".repeat(40) },
    true,
  );
  for (const expected of [
    "KXRA_ENVIRONMENT: staging required",
    "KXRA_STAGING_OS_ORIGIN: staging or Vercel preview host required",
    "repository: clean working tree required",
    "repository: pushed branch tip required",
    "KXRA_STAGING_ACCEPTANCE_CONFIRMATION: exact verification phrase required",
  ])
    assert.ok(rejected.findings.includes(expected), expected);
});

function headers(surface: "os" | "marketing", noIndex = false) {
  const os = surface === "os";
  return {
    "content-security-policy": os
      ? "default-src 'self'; script-src 'self' 'nonce-safe' 'strict-dynamic'; frame-ancestors 'none'; object-src 'none'"
      : "default-src 'self'; script-src 'self' 'sha256-safe'; frame-ancestors 'none'; object-src 'none'",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "strict-transport-security": "max-age=63072000; includeSubDomains",
    "referrer-policy": os ? "same-origin" : "strict-origin-when-cross-origin",
    "permissions-policy": os
      ? "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
      : "camera=(), microphone=(), geolocation=()",
    ...(noIndex ? { "x-robots-tag": "noindex" } : {}),
  };
}

test("staging smoke plan proves anonymous and public/private route boundaries", async () => {
  const config = validateStagingAcceptanceConfiguration(
    environment,
    repository,
    true,
  ).config!;
  const plan = stagingProbePlan(config) as Probe[];
  assert.equal(plan.length, 18);
  const results = await executeStagingProbes(config, async (input) => {
    const url = new URL(String(input));
    const probe = plan.find((item) => item.url === url.toString());
    assert.ok(probe);
    const responseHeaders = new Headers({
      ...headers(probe.surface, probe.noIndex),
      ...(probe.private ? { "cache-control": "private, no-store" } : {}),
      ...(probe.html ? { "content-type": "text/html; charset=utf-8" } : {}),
      ...(probe.json ? { "content-type": "application/json" } : {}),
      ...(probe.location ? { location: probe.location } : {}),
    });
    return new Response(
      probe.html ? "<!doctype html><main>Safe staged response</main>" : "{}",
      { status: probe.statuses[0], headers: responseHeaders },
    );
  });
  assert.equal(results.length, 18);
  assert.ok(results.every((result) => result.outcome === "PASS"));
  const evidence = stagingEvidence(
    config,
    results,
    "2026-09-27T00:00:00.000Z",
    "2026-09-27T00:01:00.000Z",
  );
  assert.equal(evidence.outcome, "PASS");
  assert.equal(
    JSON.stringify(evidence).includes("Safe staged response"),
    false,
  );
  assert.equal(JSON.stringify(evidence).includes("protectionBypass"), false);
});

test("staging smoke fails closed on leaked markers, indexing and permissive CORS", async () => {
  const config = validateStagingAcceptanceConfiguration(
    environment,
    repository,
    true,
  ).config!;
  const plan = stagingProbePlan(config) as Probe[];
  const results = await executeStagingProbes(config, async (input) => {
    const probe = plan.find((item) => item.url === String(input));
    assert.ok(probe);
    const responseHeaders = new Headers({
      ...headers(probe.surface, false),
      ...(probe.private ? { "cache-control": "private, no-store" } : {}),
      ...(probe.html ? { "content-type": "text/html" } : {}),
      ...(probe.json ? { "content-type": "application/json" } : {}),
      ...(probe.noCors ? { "access-control-allow-origin": "*" } : {}),
      ...(probe.location ? { location: probe.location } : {}),
      "x-debug-marker": probe.html ? "safe" : "owner@fixture.invalid",
    });
    return new Response(
      probe.html
        ? "<main>owner@fixture.invalid</main>"
        : '{"marker":"owner@fixture.invalid"}',
      { status: probe.statuses[0], headers: responseHeaders },
    );
  });
  assert.ok(results.every((result) => result.outcome === "FAIL"));
  assert.ok(
    results.some((result) =>
      result.findings.includes("private marker exposed"),
    ),
  );
  assert.ok(
    results.some((result) =>
      result.findings.includes("staging indexing is not disabled"),
    ),
  );
  assert.ok(
    results.some((result) =>
      result.findings.includes("private API exposes cross-origin access"),
    ),
  );
});
