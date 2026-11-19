import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CustomerDirectory, {
  CustomerDirectoryUnavailable,
} from "../apps/os/components/CustomerDirectory";
import { workspacePresentation } from "../packages/workspace/workspace-presentation";
import { ownerNavigation } from "../packages/workspace/owner-navigation";
import type { CustomerDirectoryPage } from "../packages/workspace/customer-admin-contract";

const context = {
  organisation_kind: "CUSTOMER",
  security_role: "ORG_MEMBER",
  relationship_type: "CUSTOMER",
};
test("workspace labels use verified relationship, never the historical coarse partner role", () => {
  for (const [relationship, label] of Object.entries({
    INTERNAL: "Team workspace",
    PARTNER: "Partner workspace",
    CUSTOMER: "Customer workspace",
    CLIENT: "Client workspace",
  })) {
    for (const security_role of ["ORG_ADMIN", "ORG_MEMBER", "KXRA_STAFF"])
      assert.deepEqual(
        workspacePresentation({
          ...context,
          security_role,
          relationship_type: relationship,
        }),
        { label, heading: "Your workspace" },
      );
  }
  assert.equal(
    workspacePresentation({ ...context, relationship_type: "toString" }).label,
    "Your workspace",
  );
  assert.equal(
    workspacePresentation({ ...context, security_role: "KXRA_OWNER" }).label,
    "Customer workspace",
  );
  assert.deepEqual(
    workspacePresentation({
      ...context,
      organisation_kind: "KXRA",
      security_role: "KXRA_OWNER",
    }),
    { label: "Owner operations", heading: "Operating overview" },
  );
  const shell = fs.readFileSync("apps/os/components/Shell.tsx", "utf8");
  assert.ok(shell.includes("workspacePresentation(actor)"));
  assert.ok(!shell.includes("actor.role"));
  assert.ok(!shell.includes("Assigned projects"));
});
const page: CustomerDirectoryPage = {
  version: 1,
  consistency: "LIVE",
  sampled_at: "2026-11-09T12:00:00Z",
  page_size: 25,
  items: [
    {
      organisation_id: "10000000-0000-4000-8000-000000000001",
      name: "<script>private</script>",
      slug: "synthetic-org",
      relationship_type: "CUSTOMER",
      organisation_state: "ACTIVE",
      updated_at: "2026-11-09T11:00:00Z",
    },
  ],
  has_more: false,
  next_cursor: null,
};
test("metadata rendering escapes content, includes table semantics and invents no total or write controls", () => {
  const html = renderToStaticMarkup(
    createElement(CustomerDirectory, { page, continued: false }),
  );
  assert.ok(html.includes("&lt;script&gt;private&lt;/script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes('scope="col"'));
  assert.ok(html.includes('scope="row"'));
  assert.ok(html.includes("1 records on this page"));
  assert.ok(html.includes("No overall customer count"));
  assert.ok(!html.includes("Next page"));
  assert.ok(!html.includes('method="post"'));
  for (const label of [
    "Delete",
    "Suspend",
    "Manage customer",
    "Open workspace",
  ])
    assert.ok(!html.includes(">" + label + "<"));
});
test("next-page link preserves state and cursor; changing filter starts a fresh page", () => {
  const html = renderToStaticMarkup(
    createElement(CustomerDirectory, {
      page: { ...page, has_more: true, next_cursor: "opaqueCursor" },
      state: "ACTIVE",
      continued: true,
    }),
  );
  assert.ok(html.includes("organisation_state=ACTIVE&amp;cursor=opaqueCursor"));
  assert.ok(html.includes('aria-label="Customer directory pages"'));
  assert.ok(html.includes('method="get"'));
  assert.ok(!html.includes('name="cursor"'));
});
test("unavailable and disabled views never report zero or a falsely empty directory", () => {
  for (const disabled of [true, false]) {
    const html = renderToStaticMarkup(
      createElement(CustomerDirectoryUnavailable, { disabled }),
    );
    assert.ok(
      html.includes(
        disabled ? "Directory not enabled" : "Directory unavailable",
      ),
    );
    assert.ok(!html.includes("0 records"));
    assert.ok(!html.includes("No matching"));
    assert.ok(!html.includes("<table"));
    assert.ok(html.includes("does not enable customer management"));
  }
  for (const continued of [true, false]) {
    const html = renderToStaticMarkup(
      createElement(CustomerDirectory, {
        page: { ...page, items: [] },
        continued,
      }),
    );
    assert.ok(
      html.includes(
        continued
          ? "No further records on this live page"
          : "No matching organisation metadata was returned",
      ),
    );
  }
});
test("production route uses existing server actor/query seam and rejects non-platform owners before metadata read", () => {
  const adapter = fs.readFileSync("apps/os/lib/customer-directory.ts", "utf8");
  assert.ok(adapter.includes('import "server-only"'));
  assert.ok(adapter.includes("identity: actor, query"));
  for (const forbidden of ["getPool", "service_role", "set_config", "fetch("])
    assert.ok(!adapter.includes(forbidden));
  const route = fs.readFileSync(
    "apps/os/app/os/customer-directory/page.tsx",
    "utf8",
  );
  for (const guard of [
    'a.security_role !== "KXRA_OWNER"',
    'a.organisation_kind !== "KXRA"',
    'a.relationship_type !== "INTERNAL"',
  ])
    assert.ok(route.includes(guard));
  assert.ok(
    route.indexOf("notFound()") < route.indexOf("await customerDirectory("),
  );
  assert.ok(route.includes('dynamic = "force-dynamic"'));
  assert.ok(route.includes("page_size: 25"));
  assert.ok(!route.includes('"use client"'));
  assert.ok(
    ownerNavigation
      .flatMap((group) => group.links)
      .some(([, path]) => path === "customer-directory"),
  );
});
