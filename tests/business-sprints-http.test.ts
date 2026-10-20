import { sprintCustomerFixture } from "./support/sprint-customer";
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { testOrigin as base } from "./support/runtime";
async function login(fixture: string) {
  const response = await fetch(base + "/api/auth", {
    method: "POST",
    headers: {
      origin: base,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ fixture }),
    redirect: "manual",
  });
  assert.equal(response.status, 303);
  const cookies = response.headers
    .getSetCookie()
    .map((value) => value.split(";", 1)[0])
    .join("; ");
  return cookies;
}
test("sprint preparation enforces verified authority and never issues a proposal", async (t) => {
  const fixture = await sprintCustomerFixture();
  t.after(() => fixture.close());
  const org = fixture.org;
  let partner = await login("partner"),
    owner = await login("owner");
  for (const who of ["partner", "owner"]) {
    const current = who === "partner" ? partner : owner;
    const selected = await fetch(base + "/api/context", {
      method: "POST",
      headers: {
        origin: base,
        cookie: current,
        "content-type": "application/json",
      },
      body: JSON.stringify({ organisation_id: org }),
    });
    assert.equal(selected.status, 200, await selected.clone().text());
    const updated =
      current +
      "; " +
      selected.headers
        .getSetCookie()
        .map((value) => value.split(";", 1)[0])
        .join("; ");
    if (who === "partner") partner = updated;
    else owner = updated;
  }
  const submitted = await fetch(base + "/api/custom-projects", {
    method: "POST",
    headers: {
      origin: base,
      cookie: partner,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      problem: "Synthetic response-process assessment",
      desired_outcome: "A clear handoff",
      constraints: "No new spend",
      reuse_consent: false,
      request_id: crypto.randomUUID(),
    }),
  });
  assert.equal(submitted.status, 201);
  const id = (await submitted.json()).id;
  const path = `/api/custom-projects/${id}/sprint-draft?package=decision-review`;
  assert.equal((await fetch(base + path)).status, 401);
  assert.equal(
    (
      await fetch(base + path, {
        headers: { cookie: partner, "x-role": "owner" },
      })
    ).status,
    403,
  );
  const response = await fetch(base + path, { headers: { cookie: owner } });
  assert.equal(response.status, 200);
  const draft = await response.json();
  assert.equal(draft.review_required, true);
  assert.equal(draft.price_minor, 25000);
  assert.match(draft.scope, /Synthetic response-process/);
  assert.equal(
    (
      await fetch(
        base + `/api/custom-projects/${crypto.randomUUID()}/sprint-draft`,
        { headers: { cookie: owner } },
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await fetch(
        base + `/api/custom-projects/${id}/sprint-draft?package=forged`,
        { headers: { cookie: owner } },
      )
    ).status,
    400,
  );
  const records = await (
    await fetch(base + "/api/custom-projects", { headers: { cookie: partner } })
  ).json();
  assert.equal(
    records.find((item: { id: string }) => item.id === id).proposals.length,
    0,
  );
});
