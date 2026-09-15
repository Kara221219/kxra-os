import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const nativeFetch = globalThis.fetch;
const fetch: typeof nativeFetch = (input, init) =>
  nativeFetch(input, { ...init, signal: AbortSignal.timeout(20000) });
const base = "http://127.0.0.1:3210";
const projects = {
  p1: "30000000-0000-4000-8000-000000000001",
  p2: "30000000-0000-4000-8000-000000000002",
  p3: "30000000-0000-4000-8000-000000000003",
  p4: "30000000-0000-4000-8000-000000000004",
  p5: "30000000-0000-4000-8000-000000000005",
};

async function login(fixture: string) {
  const response = await fetch(base + "/api/auth", {
    method: "POST",
    headers: { origin: base },
    body: new URLSearchParams({ fixture }),
    redirect: "manual",
  });
  assert.equal(response.status, 303);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  return cookie;
}

async function req(
  path: string,
  cookie?: string,
  payload?: unknown,
  method = "POST",
) {
  return fetch(`${base}/api/${path}`, {
    method: payload === undefined ? "GET" : method,
    headers: {
      ...(cookie ? { cookie } : {}),
      origin: base,
      "Content-Type": "application/json",
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
}

test("AT-23 HTTP workspace routes require identity and exact project access", async () => {
  for (const projectId of Object.values(projects)) {
    assert.equal((await req(`project-workspaces/${projectId}`)).status, 401);
    assert.equal(
      (
        await req(`project-workspaces/${projectId}/entries`, undefined, {
          module_key: "problem",
        })
      ).status,
      401,
    );
  }
  const partner = await login("partner");
  const assigned = await req(`project-workspaces/${projects.p2}`, partner);
  assert.equal(assigned.status, 200, await assigned.clone().text());
  assert.equal((await assigned.json()).project.code, "PROJECT-002");
  assert.equal(
    (await req(`project-workspaces/${projects.p3}`, partner)).status,
    404,
  );
  assert.equal(
    (
      await req(
        `project-workspaces/${projects.p3}/modules/property-inputs`,
        partner,
      )
    ).status,
    404,
  );
  const revoked = await login("revoked");
  assert.equal(
    (await req(`project-workspaces/${projects.p2}`, revoked)).status,
    403,
  );
});

test("AT-23 HTTP returns every exact module, gate, empty and denied state", async () => {
  const owner = await login("owner");
  const expected = [
    [projects.p1, "PROJECT-001", 26, "P001_REVISIT"],
    [projects.p2, "PROJECT-002", 30, "P002_LISTING"],
    [projects.p3, "PROJECT-003", 30, "P003_FAITHFUL_DELIVERY"],
    [projects.p4, "PROJECT-004", 31, "P004_PAPER_READINESS"],
    [projects.p5, "PROJECT-005", 34, "P005_LOCAL_PROTOTYPE"],
  ] as const;
  for (const [id, code, moduleCount, gate] of expected) {
    const response = await req(`project-workspaces/${id}`, owner);
    assert.equal(response.status, 200, await response.clone().text());
    const workspace = await response.json();
    assert.equal(workspace.project.code, code);
    assert.equal(workspace.modules.length, moduleCount);
    assert.deepEqual(
      workspace.gatePolicies.map(
        (item: { gate_code: string }) => item.gate_code,
      ),
      [gate],
    );
    assert.equal(workspace.module.module_key, "overview");
  }

  const empty = await (
    await req(
      `project-workspaces/${projects.p1}/modules/revisit-criteria`,
      owner,
    )
  ).json();
  assert.equal(empty.availability, "READY");
  assert.ok(Array.isArray(empty.clprReviews));

  const partner = await login("partner");
  const denied = await (
    await req(`project-workspaces/${projects.p2}/modules/approvals`, partner)
  ).json();
  assert.equal(denied.availability, "DENIED");
  assert.equal(denied.approvals.length, 0);
  assert.match(denied.unavailableReason, /owner-only/i);
  assert.equal(
    (
      await req(
        `project-workspaces/${projects.p2}/modules/not-a-module`,
        partner,
      )
    ).status,
    404,
  );
});

test("AT-23 HTTP typed entry workflow rejects forged scope and stale review", async () => {
  const partner = await login("partner");
  const marker = `HTTP typed ${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const createdResponse = await req(
    `project-workspaces/${projects.p2}/entries`,
    partner,
    {
      module_key: "problem",
      title: marker,
      summary: "Synthetic HTTP entry",
      classification: "USER-SUPPLIED INFORMATION",
      visibility: "project_shared",
      payload: { statement: "A bounded synthetic customer problem" },
      evidence: [],
    },
  );
  assert.equal(
    createdResponse.status,
    201,
    await createdResponse.clone().text(),
  );
  const created = await createdResponse.json();
  assert.equal(created.version, 1);
  assert.equal(
    (
      await req(`project-workspaces/${projects.p3}/entries`, partner, {
        module_key: "problem",
        title: "Forged scope",
        summary: "Denied",
        classification: "USER-SUPPLIED INFORMATION",
        visibility: "project_shared",
        payload: { statement: "Denied" },
        evidence: [],
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await req(`project-workspaces/${projects.p2}/entries`, partner, {
        module_key: "problem",
        title: "Forged private scope",
        summary: "Denied",
        classification: "USER-SUPPLIED INFORMATION",
        visibility: "owner_only",
        payload: { statement: "Denied" },
        evidence: [],
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await req(`project-workspaces/${projects.p2}/entries`, partner, {
        module_key: "problem",
        title: "Malformed payload",
        summary: "Denied",
        classification: "USER-SUPPLIED INFORMATION",
        visibility: "project_shared",
        payload: { arbitrary: true },
        evidence: [],
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await req(
        `project-workspaces/${projects.p2}/entries/${created.id}/review`,
        partner,
        { version: 1 },
      )
    ).status,
    403,
  );

  const owner = await login("owner");
  const reviewed = await req(
    `project-workspaces/${projects.p2}/entries/${created.id}/review`,
    owner,
    { version: 1 },
  );
  assert.equal(reviewed.status, 200, await reviewed.clone().text());
  assert.equal((await reviewed.json()).status, "REVIEWED");
  assert.equal(
    (
      await req(
        `project-workspaces/${projects.p2}/entries/${created.id}/review`,
        owner,
        { version: 1 },
      )
    ).status,
    409,
  );
});

test("AT-23 HTTP specialist workflows preserve fitment, provenance and paper-only boundaries", async () => {
  const owner = await login("owner");
  const fitmentResponse = await req(
    `project-workspaces/${projects.p2}/modules/fitment-matrix`,
    owner,
  );
  assert.equal(fitmentResponse.status, 200);
  const fitment = await fitmentResponse.json();
  assert.equal(fitment.vehicles.length, 3);
  assert.ok(
    fitment.vehicles.every(
      (row: { fitment_state: string; safety_state: string }) =>
        ["UNKNOWN", "VERIFIED"].includes(row.fitment_state) &&
        ["UNKNOWN", "VERIFIED"].includes(row.safety_state),
    ),
  );
  const unknown = fitment.vehicles.find(
    (row: { fitment_state: string }) => row.fitment_state === "UNKNOWN",
  );
  if (unknown)
    assert.equal(
      (
        await req(
          `project-workspaces/${projects.p2}/vehicle-compatibility/${unknown.id}/verify`,
          owner,
          {
            version: unknown.version,
            supplier_sku: "UNSUPPORTED",
            fitment_evidence_id: crypto.randomUUID(),
            fitment_evidence_version: 1,
            safety_evidence_id: crypto.randomUUID(),
            safety_evidence_version: 1,
          },
        )
      ).status,
      409,
    );

  const assetTitle = `Generated property asset ${crypto.randomUUID()}`;
  const assetResponse = await req(
    `project-workspaces/${projects.p3}/property-assets`,
    owner,
    {
      module_key: "photos",
      title: assetTitle,
      asset_kind: "PHOTO",
      origin: "AI_GENERATED",
    },
  );
  assert.equal(assetResponse.status, 201, await assetResponse.clone().text());
  const asset = await assetResponse.json();
  assert.equal(asset.origin, "AI_GENERATED");
  assert.equal(
    (
      await req(
        `project-workspaces/${projects.p2}/property-assets/${asset.id}/review`,
        owner,
        {
          version: asset.version,
          rights_evidence_id: crypto.randomUUID(),
          rights_evidence_version: 1,
          geometry_evidence_id: null,
          geometry_evidence_version: null,
        },
      )
    ).status,
    404,
  );
  const photos = await (
    await req(
      `project-workspaces/${projects.p3}/modules/photos`,
      await login("viewer"),
    )
  ).json();
  assert.ok(
    photos.propertyAssets.some(
      (row: { id: string; origin: string }) =>
        row.id === asset.id && row.origin === "AI_GENERATED",
    ),
  );

  const unsafeReport = await req(
    `project-workspaces/${projects.p4}/entries`,
    owner,
    {
      module_key: "midday-reports",
      title: "Unsafe report",
      summary: "Must fail",
      classification: "EXTERNAL RESEARCH",
      visibility: "project_shared",
      payload: {
        report_period: "Synthetic midday",
        summary: "Unsafe",
        paper_only: false,
      },
      evidence: [],
    },
  );
  assert.equal(unsafeReport.status, 409);
  const paperReport = await req(
    `project-workspaces/${projects.p4}/entries`,
    owner,
    {
      module_key: "midday-reports",
      title: `Paper report ${crypto.randomUUID()}`,
      summary: "Synthetic paper-only report",
      classification: "EXTERNAL RESEARCH",
      visibility: "project_shared",
      payload: {
        report_period: "Synthetic midday",
        summary: "No execution",
        paper_only: true,
      },
      evidence: [],
    },
  );
  assert.equal(paperReport.status, 201, await paperReport.clone().text());
  assert.equal((await paperReport.json()).payload.paper_only, true);
});

test("AT-23 HTTP P005 remains demand-first and has no creation or publication route", async () => {
  const owner = await login("owner");
  const created = await req(
    `project-workspaces/${projects.p5}/digital-opportunities`,
    owner,
    {
      title: `Demand discovery ${crypto.randomUUID()}`,
      buyer_problem: "A specific synthetic buyer problem",
    },
  );
  assert.equal(created.status, 201, await created.clone().text());
  const opportunity = await created.json();
  assert.equal(opportunity.stage, "DISCOVERY");
  assert.equal(opportunity.opportunity_score, null);
  assert.equal(opportunity.confidence_score, null);

  const research = await (
    await req(`project-workspaces/${projects.p5}/modules/research`, owner)
  ).json();
  const source = research.records.find(
    (row: { source_code?: string }) => row.source_code === "PROJECT-005-BRIEF",
  );
  assert.ok(source);
  const evidenced = await req(
    `project-workspaces/${projects.p5}/digital-opportunities/${opportunity.id}/evidence`,
    owner,
    {
      version: opportunity.version,
      evidence_id: source.id,
      evidence_version: source.version,
    },
  );
  assert.equal(evidenced.status, 200, await evidenced.clone().text());
  const current = await evidenced.json();
  assert.equal(current.stage, "EVIDENCE_REVIEW");
  assert.equal(
    (
      await req(
        `project-workspaces/${projects.p5}/digital-opportunities/${current.id}/authorize`,
        owner,
        {
          version: current.version,
          gate_authorization_id: crypto.randomUUID(),
        },
      )
    ).status,
    409,
  );
  assert.equal((await req("product-creation", owner)).status, 404);
  assert.equal((await req("publish", owner, {})).status, 404);
});
