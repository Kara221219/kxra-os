import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import {
  liveWorkspaceAccess,
  liveWorkspacePresentation,
  ownerLiveWorkspaceBilling,
} from "../packages/workspace/live-start";
const future = new Date(Date.now() + 300_000).toISOString();
const blocked = {
  lane: "LIVE" as const,
  entitled: false,
  reconciliation_required: true,
  quarantined: false,
  proof_valid_until: null,
};
const owner = {
  lane: "LIVE",
  offer: {
    offer_key: "KXRA_STARTER_V1",
    name: "KXRA Starter",
    currency: "GBP",
    monthly_amount_minor: 2900,
    people: 1,
  },
  customer_bound: true,
  subscription_bound: false,
  policy_ready: false,
  consent_required: true,
};
test("modern members fail closed on unpaid, pending, quarantine and reconciliation", () => {
  for (const value of [
    blocked,
    { ...blocked, lane: "PENDING" },
    { ...blocked, entitled: true },
    {
      ...blocked,
      entitled: true,
      reconciliation_required: false,
      quarantined: true,
    },
  ])
    assert.equal(
      liveWorkspacePresentation(liveWorkspaceAccess.parse(value)).blocked,
      true,
    );
  assert.throws(() =>
    liveWorkspaceAccess.parse({ ...blocked, lane: "PENDING", entitled: true }),
  );
  assert.equal(
    liveWorkspacePresentation(
      liveWorkspaceAccess.parse({
        ...blocked,
        entitled: true,
        reconciliation_required: false,
        proof_valid_until: future,
      }),
    ).blocked,
    false,
  );
});
test("member DTO rejects owner billing fields and owner summary requires actual approved catalogue", () => {
  for (const extra of [
    { customer_id: "cus_hidden" },
    { offer: owner.offer },
    { billing_admin: true },
    { available_actions: ["CHECKOUT"] },
  ])
    assert.throws(() => liveWorkspaceAccess.parse({ ...blocked, ...extra }));
  assert.equal(
    ownerLiveWorkspaceBilling(owner).offer!.monthly_amount_minor,
    2900,
  );
  assert.throws(() =>
    ownerLiveWorkspaceBilling({
      ...owner,
      offer: { ...owner.offer, monthly_amount_minor: 4900 },
    }),
  );
  assert.throws(() =>
    ownerLiveWorkspaceBilling({
      ...owner,
      offer: { ...owner.offer, offer_key: "WORKSPACE_PILOT_V1" },
    }),
  );
});
test("member presentation shows paid access honestly without admin checkout actions", async () => {
  const { createElement } = await import("react"),
    { renderToStaticMarkup } = await import("react-dom/server"),
    { LiveWorkspaceAccess } =
      await import("../apps/os/components/LiveWorkspaceAccess");
  const html = renderToStaticMarkup(
    createElement(LiveWorkspaceAccess, {
      access: blocked,
      billingAdmin: false,
      billing: null,
    }),
  );
  assert.match(html, /Paid access is pending/);
  assert.match(html, /New work is disabled/);
  assert.ok(!html.includes('href="/billing"'));
  assert.ok(!html.includes("£49"));
  assert.ok(!html.includes("test period"));
  const permitted = renderToStaticMarkup(
    createElement(LiveWorkspaceAccess, {
      access: {
        ...blocked,
        entitled: true,
        reconciliation_required: false,
        proof_valid_until: future,
      },
      billingAdmin: false,
      billing: null,
    }),
  );
  assert.match(permitted, /Your workspace is ready/);
  assert.ok(!permitted.includes('href="/billing"'));
  const pending = renderToStaticMarkup(
    createElement(LiveWorkspaceAccess, {
      access: { ...blocked, lane: "PENDING" },
      billingAdmin: false,
      billing: null,
    }),
  );
  assert.match(pending, /Payment setup is pending/);
  assert.ok(!pending.includes("Your workspace is ready"));
});
test("owner modern view links reviewed billing and never renders the legacy selector", async () => {
  const { createElement } = await import("react"),
    { renderToStaticMarkup } = await import("react-dom/server"),
    { LiveWorkspaceAccess } =
      await import("../apps/os/components/LiveWorkspaceAccess");
  const html = renderToStaticMarkup(
    createElement(LiveWorkspaceAccess, {
      access: blocked,
      billingAdmin: true,
      billing: ownerLiveWorkspaceBilling(owner),
    }),
  );
  assert.ok(html.includes('href="/billing"'));
  assert.ok(html.includes("£29"));
  assert.ok(!html.includes("£49"));
  assert.ok(!html.includes("Reviewed test billing"));
  assert.match(html, /requests do not confirm payment/);
});
test("legacy/fixture branch remains separate and new projection never depends on signup admission", () => {
  const source = fs.readFileSync("apps/os/lib/workspace-start.ts", "utf8"),
    ui = fs.readFileSync("apps/os/components/WorkspaceStart.tsx", "utf8"),
    sql = fs.readFileSync(
      "supabase/migrations/0108_own_member_live_workspace_access.sql",
      "utf8",
    );
  assert.ok(
    source.indexOf("own_member_live_workspace_access") <
      source.indexOf("const pilot ="),
  );
  assert.ok(
    source.indexOf("return {", source.indexOf("const access =")) <
      source.indexOf("const pilot ="),
  );
  assert.match(ui, /data\.billing_admin && !live/);
  assert.match(ui, /WorkspacePilot local=\{local\}/);
  assert.match(ui, /liveWorkspacePresentation\(live\)\.blocked/);
  assert.match(sql, /live_paid_entitled\(o\)/);
  assert.match(sql, /s\.auth_provider='SUPABASE'/);
  assert.match(sql, /l\.lane='LEGACY'/);
  assert.ok(!sql.includes("verified_supabase_identity"));
  assert.ok(!sql.includes("hosted_self_service_open"));
  assert.ok(!/insert into|update kxra|delete from|create table/i.test(sql));
});

test("expired or missing proof cannot leave modern work presented as open", () => {
  const access = liveWorkspaceAccess.parse({
    ...blocked,
    entitled: true,
    reconciliation_required: false,
    proof_valid_until: future,
  });
  assert.equal(
    liveWorkspacePresentation(access, Date.parse(future) + 1).blocked,
    true,
  );
  assert.equal(
    liveWorkspacePresentation({ ...access, proof_valid_until: null }).blocked,
    true,
  );
});
