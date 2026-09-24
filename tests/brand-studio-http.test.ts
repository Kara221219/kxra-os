import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { testOrigin } from "./support/runtime";

const base = testOrigin;
const projectTwo = "30000000-0000-4000-8000-000000000002";
const projectThree = "30000000-0000-4000-8000-000000000003";

async function login(fixture: string) {
  const response = await fetch(base + "/api/auth", {
    method: "POST",
    headers: { origin: base },
    body: new URLSearchParams({ fixture }),
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  });
  assert.equal(response.status, 303);
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(cookie);
  return cookie;
}

async function request(
  path: string,
  cookie?: string,
  payload?: unknown,
  method = "POST",
) {
  return fetch(base + "/api/brand-studio" + path, {
    method: payload === undefined ? "GET" : method,
    headers: {
      ...(cookie ? { cookie } : {}),
      origin: base,
      "content-type": "application/json",
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  });
}

function sourceInput(projectId: string) {
  return {
    project_id: projectId,
    source_type: "WEBSITE",
    website_url: "https://northstar.example/about",
    source_text:
      "Northstar Workshop helps UK small businesses improve how work gets done.",
    rights_basis:
      "Synthetic fixture owner attests rights to use this supplied content.",
    consent: true,
    request_id: crypto.randomUUID(),
  };
}

test("Brand Studio HTTP denies anonymous, crafted-project and viewer writes", async () => {
  assert.equal((await request("")).status, 401);
  assert.equal(
    (await request("/sources", undefined, sourceInput(projectTwo))).status,
    401,
  );

  const partner = await login("partner");
  assert.equal(
    (await request("/sources", partner, sourceInput(projectThree))).status,
    404,
  );

  const viewer = await login("viewer");
  const denied = await request("/sources", viewer, sourceInput(projectThree));
  assert.equal(denied.status, 409, await denied.clone().text());
});

test("Brand Studio HTTP completes an exact source-to-export journey without cross-project leakage", async () => {
  const partner = await login("partner");
  const marker = crypto.randomUUID().slice(0, 8);

  const before = await request("", partner);
  assert.equal(before.status, 200, await before.clone().text());
  const initial = await before.json();
  assert.equal(initial.entitlements.access.allowed, true);
  assert.equal(initial.generation_available, true);
  for (const collection of [
    initial.sources,
    initial.profiles,
    initial.campaigns,
    initial.variants,
    initial.exports,
  ])
    assert.ok(
      collection.every(
        (item: { project_id: string }) => item.project_id === projectTwo,
      ),
    );

  const sourceResponse = await request("/sources", partner, {
    ...sourceInput(projectTwo),
    source_text: `Northstar ${marker} helps UK small businesses improve operations.`,
  });
  assert.equal(sourceResponse.status, 201, await sourceResponse.clone().text());
  const source = await sourceResponse.json();

  const profileResponse = await request("/profiles", partner, {
    project_id: projectTwo,
    source_version_id: source.source_version_id,
    name: `Northstar ${marker}`,
    business_name: `Northstar ${marker}`,
    tone: "clear, credible, practical",
    audiences: "UK small business owners",
    offers: "A structured operating review",
    request_id: crypto.randomUUID(),
  });
  assert.equal(
    profileResponse.status,
    201,
    await profileResponse.clone().text(),
  );
  const profile = await profileResponse.json();
  assert.equal(profile.version, 1);

  const profileApproval = await request(
    `/profiles/${profile.profile_id}/decision`,
    partner,
    {
      version: 1,
      decision: "APPROVE",
      note: "Synthetic customer approval of this exact profile version.",
    },
  );
  assert.equal(
    profileApproval.status,
    200,
    await profileApproval.clone().text(),
  );

  const campaignResponse = await request("/campaigns", partner, {
    project_id: projectTwo,
    profile_id: profile.profile_id,
    profile_version: 1,
    name: `Operating review ${marker}`,
    objective: "Introduce the operating review to qualified prospects.",
    audience: "UK small business owners",
    offer: "A structured operating review",
    channels: ["LINKEDIN"],
    constraints: "Do not promise customer outcomes.",
    claims: [],
    success_measure: "Qualified replies",
    request_id: crypto.randomUUID(),
  });
  assert.equal(
    campaignResponse.status,
    201,
    await campaignResponse.clone().text(),
  );
  const campaign = await campaignResponse.json();

  const campaignApproval = await request(
    `/campaigns/${campaign.brief_id}/decision`,
    partner,
    {
      version: 1,
      decision: "APPROVE",
      note: "Synthetic customer approval of this exact campaign version.",
    },
  );
  assert.equal(
    campaignApproval.status,
    200,
    await campaignApproval.clone().text(),
  );

  const generationResponse = await request("/generate", partner, {
    project_id: projectTwo,
    profile_id: profile.profile_id,
    profile_version: 1,
    brief_id: campaign.brief_id,
    brief_version: 1,
    channels: ["LINKEDIN"],
    variant_count: 1,
    request_id: crypto.randomUUID(),
  });
  assert.equal(
    generationResponse.status,
    201,
    await generationResponse.clone().text(),
  );
  const generation = await generationResponse.json();
  assert.equal(generation.state, "SUCCEEDED");
  assert.equal(generation.variants.length, 1);
  const variant = generation.variants[0];

  const incompleteReview = await request(
    `/variants/${variant.id}/review`,
    partner,
    {
      expected_sha256: variant.content_sha256,
      checks: {
        brand: true,
        claims: true,
        rights: true,
        accessibility: true,
        compliance: false,
      },
      decision: "APPROVE_EXPORT",
      note: "Synthetic incomplete review must not authorize export.",
      request_id: crypto.randomUUID(),
    },
  );
  assert.equal(incompleteReview.status, 409);

  const reviewResponse = await request(
    `/variants/${variant.id}/review`,
    partner,
    {
      expected_sha256: variant.content_sha256,
      checks: {
        brand: true,
        claims: true,
        rights: true,
        accessibility: true,
        compliance: true,
      },
      decision: "APPROVE_EXPORT",
      note: "All five synthetic review checks passed.",
      request_id: crypto.randomUUID(),
    },
  );
  assert.equal(reviewResponse.status, 201, await reviewResponse.clone().text());
  const review = await reviewResponse.json();

  const exportResponse = await request("/exports", partner, {
    variant_id: variant.id,
    expected_sha256: variant.content_sha256,
    review_id: review.id,
    format: "MARKDOWN",
    request_id: crypto.randomUUID(),
  });
  assert.equal(exportResponse.status, 201, await exportResponse.clone().text());
  const createdExport = await exportResponse.json();

  const download = await request(`/exports/${createdExport.id}`, partner);
  assert.equal(download.status, 200, await download.clone().text());
  assert.match(download.headers.get("content-type") || "", /^text\/markdown/);
  assert.equal(download.headers.get("x-content-type-options"), "nosniff");
  assert.equal(download.headers.get("cache-control"), "private, no-store");
  assert.match(download.headers.get("content-disposition") || "", /attachment/);
  assert.match(await download.text(), /^# /);

  const after = await request("", partner);
  assert.equal(after.status, 200, await after.clone().text());
  const snapshot = await after.json();
  assert.ok(
    snapshot.profiles.some(
      (item: { id: string }) => item.id === profile.profile_id,
    ),
  );
  assert.ok(
    snapshot.exports.some(
      (item: { id: string }) => item.id === createdExport.id,
    ),
  );
  for (const collection of [
    snapshot.sources,
    snapshot.profiles,
    snapshot.campaigns,
    snapshot.variants,
    snapshot.exports,
  ])
    assert.ok(
      collection.every(
        (item: { project_id: string }) => item.project_id === projectTwo,
      ),
    );

  const viewer = await login("viewer");
  const viewerSnapshot = await request("", viewer);
  assert.equal(viewerSnapshot.status, 200, await viewerSnapshot.clone().text());
  const viewerData = await viewerSnapshot.json();
  assert.ok(
    viewerData.sources.every(
      (item: { project_id: string }) => item.project_id === projectThree,
    ),
  );
  assert.equal(
    viewerData.profiles.some(
      (item: { id: string }) => item.id === profile.profile_id,
    ),
    false,
  );
});
