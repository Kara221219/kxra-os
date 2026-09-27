import crypto from "node:crypto";

export const stagingEvidenceSchema = "kxra-staging-acceptance-v1";

const forbiddenMarkers = [
  "Local fixture identities",
  "Synthetic identity",
  "owner@fixture.invalid",
  "partner@fixture.invalid",
  "viewer@fixture.invalid",
  "revoked@fixture.invalid",
  "invitee@fixture.invalid",
  "20000000-0000-4000-8000-000000000001",
  "20000000-0000-4000-8000-000000000002",
  "20000000-0000-4000-8000-000000000003",
  "20000000-0000-4000-8000-000000000004",
  "20000000-0000-4000-8000-000000000005",
  "KXRA_LOCAL_SECRET",
  "KXRA_AUTH_MODE",
  "fake-auth.json",
  "fake-email.json",
  "uniqueisolationmarker",
  "isolationevidence",
  "KXRA-GENESIS",
  "Customer One confidential marker",
  "Customer Two confidential marker",
];

const publicRoutes = [
  "/",
  "/platform",
  "/industries",
  "/approach",
  "/brand-studio",
  "/custom-projects",
  "/contact",
  "/legal/privacy",
  "/legal/terms",
  "/legal/cookies",
];

function exactStagingOrigin(value, name, findings) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      findings.push(`${name}: exact HTTPS origin required`);
    if (
      !url.hostname.endsWith(".vercel.app") &&
      !/(?:^|[.-])(?:staging|preview)(?:[.-]|$)/i.test(url.hostname)
    )
      findings.push(`${name}: staging or Vercel preview host required`);
    return url;
  } catch {
    findings.push(`${name}: invalid URL`);
    return null;
  }
}

export function validateStagingAcceptanceConfiguration(
  environment,
  repository,
  requireConfirmation = false,
) {
  const findings = [];
  if (environment.KXRA_ENVIRONMENT !== "staging")
    findings.push("KXRA_ENVIRONMENT: staging required");
  const os = exactStagingOrigin(
    environment.KXRA_STAGING_OS_ORIGIN || "",
    "KXRA_STAGING_OS_ORIGIN",
    findings,
  );
  const marketing = exactStagingOrigin(
    environment.KXRA_STAGING_MARKETING_ORIGIN || "",
    "KXRA_STAGING_MARKETING_ORIGIN",
    findings,
  );
  if (os && marketing && os.origin === marketing.origin)
    findings.push("staging applications must use separate origins");
  const expectedCommit = environment.KXRA_STAGING_EXPECTED_COMMIT || "";
  if (!/^[a-f0-9]{40}$/.test(expectedCommit))
    findings.push("KXRA_STAGING_EXPECTED_COMMIT: exact Git SHA required");
  if (repository.branch !== "codex/phase-2-completion")
    findings.push("repository: phase completion branch required");
  if (repository.dirty)
    findings.push("repository: clean working tree required");
  if (repository.head !== repository.remoteHead)
    findings.push("repository: pushed branch tip required");
  if (expectedCommit && repository.head !== expectedCommit)
    findings.push("repository: expected commit does not match HEAD");
  const bypass = environment.KXRA_STAGING_PROTECTION_BYPASS;
  if (
    bypass &&
    (bypass.length < 20 ||
      /^(?:replace|your_|change|example|test|todo)/i.test(bypass))
  )
    findings.push("KXRA_STAGING_PROTECTION_BYPASS: invalid secret format");
  if (requireConfirmation && os && marketing && expectedCommit) {
    const exact = `VERIFY:${os.hostname}:${marketing.hostname}:${expectedCommit}`;
    if (environment.KXRA_STAGING_ACCEPTANCE_CONFIRMATION !== exact)
      findings.push(
        "KXRA_STAGING_ACCEPTANCE_CONFIRMATION: exact verification phrase required",
      );
  }
  return {
    ok: findings.length === 0,
    findings: [...new Set(findings)].sort(),
    config:
      os && marketing && /^[a-f0-9]{40}$/.test(expectedCommit)
        ? {
            osOrigin: os.origin,
            marketingOrigin: marketing.origin,
            commit: expectedCommit,
            branch: repository.branch,
            protectionBypass: bypass || null,
          }
        : null,
  };
}

export function stagingProbePlan(config) {
  const probes = [
    {
      id: "os-login-boundary",
      surface: "os",
      path: "/login",
      method: "GET",
      statuses: [200],
      html: true,
      private: true,
    },
    ...["/api/projects", "/api/files", "/api/search?q=staging-probe"].map(
      (path) => ({
        id: `os-anonymous-${path.split(/[/?]/).filter(Boolean)[1]}`,
        surface: "os",
        path,
        method: "GET",
        statuses: [401],
        html: false,
        json: true,
        private: true,
        noCors: true,
      }),
    ),
    ...publicRoutes.map((path) => ({
      id: `marketing-${path === "/" ? "home" : path.slice(1).replaceAll("/", "-")}`,
      surface: "marketing",
      path,
      method: "GET",
      statuses: [200],
      html: true,
      private: false,
      noIndex: true,
    })),
    {
      id: "marketing-login-separation",
      surface: "marketing",
      path: "/login",
      method: "GET",
      statuses: [307, 308],
      html: false,
      private: false,
      location: `${config.osOrigin}/login`,
      noIndex: true,
    },
    ...["/api/projects", "/api/files", "/api/ask"].map((path) => ({
      id: `marketing-no-private-${path.split("/").at(-1)}`,
      surface: "marketing",
      path,
      method: "GET",
      statuses: [404],
      html: true,
      private: false,
      noIndex: true,
    })),
  ];
  return probes.map((probe) => ({
    ...probe,
    url: `${probe.surface === "os" ? config.osOrigin : config.marketingOrigin}${probe.path}`,
  }));
}

function directive(policy, name) {
  return policy
    .split(";")
    .map((value) => value.trim())
    .find((value) => value === name || value.startsWith(`${name} `));
}

function validateHeaders(probe, response, findings) {
  const get = (name) => response.headers.get(name) || "";
  const csp = get("content-security-policy");
  if (get("x-content-type-options").toLowerCase() !== "nosniff")
    findings.push("missing nosniff");
  if (get("x-frame-options").toUpperCase() !== "DENY")
    findings.push("missing frame denial");
  if (!/^max-age=\d+/.test(get("strict-transport-security")))
    findings.push("HSTS missing");
  if (!directive(csp, "default-src")?.includes("'self'"))
    findings.push("CSP default-src is not self");
  if (!directive(csp, "frame-ancestors")?.includes("'none'"))
    findings.push("CSP frame-ancestors is not none");
  if (!directive(csp, "object-src")?.includes("'none'"))
    findings.push("CSP object-src is not none");
  const script = directive(csp, "script-src") || "";
  if (probe.surface === "os") {
    if (!/'nonce-[^']+'/.test(script) || !script.includes("'strict-dynamic'"))
      findings.push("OS CSP nonce/strict-dynamic missing");
    if (script.includes("'unsafe-eval'"))
      findings.push("OS production CSP permits unsafe-eval");
    if (get("referrer-policy") !== "same-origin")
      findings.push("OS referrer policy mismatch");
    if (!get("permissions-policy").includes("payment=()"))
      findings.push("OS permissions policy mismatch");
  } else {
    if (script.includes("'unsafe-inline'") || script.includes("'unsafe-eval'"))
      findings.push("marketing production CSP permits unsafe scripts");
    if (get("referrer-policy") !== "strict-origin-when-cross-origin")
      findings.push("marketing referrer policy mismatch");
  }
  if (probe.private && !get("cache-control").includes("no-store"))
    findings.push("private response is cacheable");
  if (probe.noIndex && !get("x-robots-tag").toLowerCase().includes("noindex"))
    findings.push("staging indexing is not disabled");
  if (probe.noCors && get("access-control-allow-origin"))
    findings.push("private API exposes cross-origin access");
  if (get("x-powered-by")) findings.push("framework header exposed");
}

async function boundedBody(response, maximum = 1_500_000) {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.byteLength;
    if (size > maximum) {
      await reader.cancel();
      throw new Error("response exceeds evidence limit");
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function executeStagingProbes(config, fetchImpl = fetch) {
  const probes = stagingProbePlan(config);
  const results = [];
  for (const probe of probes) {
    const findings = [];
    let response;
    let bytes = new Uint8Array();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      try {
        response = await fetchImpl(probe.url, {
          method: probe.method,
          redirect: "manual",
          signal: controller.signal,
          headers: {
            Accept: probe.html ? "text/html" : "application/json",
            "User-Agent": "KXRA-Staging-Acceptance/1",
            ...(probe.noCors ? { Origin: config.marketingOrigin } : {}),
            ...(config.protectionBypass
              ? { "x-vercel-protection-bypass": config.protectionBypass }
              : {}),
          },
        });
        bytes = await boundedBody(response);
      } finally {
        clearTimeout(timer);
      }
      if (!probe.statuses.includes(response.status))
        findings.push(`unexpected status ${response.status}`);
      validateHeaders(probe, response, findings);
      if (probe.location && response.headers.get("location") !== probe.location)
        findings.push("login redirect target mismatch");
      if (
        probe.json &&
        !response.headers.get("content-type")?.startsWith("application/json")
      )
        findings.push("JSON content type missing");
      const content = new TextDecoder().decode(bytes);
      const responseHeaders = [...response.headers.entries()]
        .map(([name, value]) => `${name}:${value}`)
        .join("\n");
      for (const marker of forbiddenMarkers)
        if (content.includes(marker) || responseHeaders.includes(marker))
          findings.push("private marker exposed");
      if (probe.html && response.status !== 404) {
        if (!response.headers.get("content-type")?.startsWith("text/html"))
          findings.push("HTML content type missing");
        if (!/<main(?:\s|>)/i.test(content))
          findings.push("main landmark missing");
      }
    } catch (error) {
      findings.push(
        error instanceof Error
          ? `request failed: ${error.message}`
          : "request failed",
      );
    }
    results.push({
      id: probe.id,
      surface: probe.surface,
      path: probe.path,
      status: response?.status || null,
      body_bytes: bytes.byteLength,
      body_sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      header_sha256: crypto
        .createHash("sha256")
        .update(
          response
            ? [...response.headers.entries()]
                .filter(([name]) => name.toLowerCase() !== "set-cookie")
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([name, value]) => `${name.toLowerCase()}:${value}`)
                .join("\n")
            : "",
        )
        .digest("hex"),
      outcome: findings.length ? "FAIL" : "PASS",
      findings,
    });
  }
  return results;
}

export function stagingEvidence(config, results, startedAt, completedAt) {
  return {
    schema: stagingEvidenceSchema,
    environment: "staging",
    branch: config.branch,
    commit: config.commit,
    origins: {
      os: config.osOrigin,
      marketing: config.marketingOrigin,
    },
    started_at: startedAt,
    completed_at: completedAt,
    outcome: results.every((result) => result.outcome === "PASS")
      ? "PASS"
      : "FAIL",
    probes: results,
  };
}
