import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  enquiryFilters,
  enquiryHref,
  enquiryQueryValues,
  enquiryMaxPage,
  ownerEnquiriesSql,
} from "../packages/workspace/owner-enquiry-contract";
import OwnerEnquiryInbox from "../apps/os/components/OwnerEnquiryInbox";
import EnquiryDocumentBoundary from "../apps/os/components/EnquiryDocumentBoundary";
import { ownerEnquiries } from "../apps/os/lib/owner-enquiries";
import type { Actor } from "../apps/os/lib/auth";
const id = "20000000-0000-4000-8000-000000000001";
const row = {
  id,
  form_kind: "CONTACT" as const,
  status: "UNVERIFIED" as const,
  name: "<script>sender</script>",
  company: "A & B",
  email: "private@example.invalid",
  message: "Private enquiry message not shown in list",
  source_path: "/contact",
  received_at: "2026-11-09T00:00:00Z",
  consent_recorded_at: "2026-11-09T00:00:00Z",
};
test("strict bounded inbox filters reject arrays, injection, fractions and ambiguous pages", () => {
  assert.deepEqual(enquiryFilters({}), {
    status: undefined,
    type: undefined,
    page: 1,
    enquiry: undefined,
  });
  for (const page of [
    "0",
    "-1",
    "1.5",
    "01",
    "1e2",
    "1000001",
    "999999999999999999",
    "Infinity",
    " ",
    "1;select",
  ])
    assert.throws(() => enquiryFilters({ page }));
  for (const key of ["page", "status", "type", "enquiry"])
    assert.throws(() => enquiryFilters({ [key]: ["1", "2"] }));
  assert.throws(() => enquiryFilters({ status: "__proto__" }));
  assert.throws(() => enquiryFilters({ type: "CONTACT' OR true" }));
  assert.throws(() => enquiryFilters({ enquiry: "https://example.invalid" }));
  assert.equal(
    enquiryFilters({ page: String(enquiryMaxPage) }).page,
    enquiryMaxPage,
  );
  assert.deepEqual(
    enquiryQueryValues(
      "org",
      enquiryFilters({ status: "AWAITING_REVIEW", type: "CONTACT", page: "3" }),
    ),
    ["org", "AWAITING_REVIEW", "CONTACT", 50],
  );
});
test("only canonical relative non-PII filter context enters detail/return URLs", () => {
  const filters = enquiryFilters({
    status: "CLOSED",
    type: "CONTACT",
    page: "3",
    email: row.email,
    returnTo: "https://bad.invalid",
  });
  const url = enquiryHref(filters, { enquiry: id });
  assert.equal(
    url,
    `/os/enquiries?status=CLOSED&type=CONTACT&page=3&enquiry=${id}#public-enquiry-${id}`,
  );
  assert.equal(
    enquiryHref({ ...filters, enquiry: id }, { enquiry: undefined }),
    "/os/enquiries?status=CLOSED&type=CONTACT&page=3",
  );
  assert.equal(
    enquiryHref(filters, { page: 1, status: undefined, type: undefined }),
    "/os/enquiries",
  );
  assert.ok(!url.includes(row.email));
  assert.throws(() => enquiryHref({ ...filters, page: NaN }));
});
test("SQL uses selected organisation, parameterized enum filters and deterministic same-statement empty-page totals", () => {
  assert.match(ownerEnquiriesSql, /where org_id=\$1/);
  assert.match(ownerEnquiriesSql, /status=\$2/);
  assert.match(ownerEnquiriesSql, /form_kind=\$3/);
  assert.match(
    ownerEnquiriesSql,
    /order by received_at desc,id desc limit 25 offset \$4/,
  );
  assert.match(ownerEnquiriesSql, /select count\(\*\)::text from matching/);
  assert.match(ownerEnquiriesSql, /coalesce/);
  assert.doesNotMatch(
    ownerEnquiriesSql,
    /\b(update|insert|delete|grant|security definer)\b/i,
  );
});
test("inbox HTML has native GET controls, live-pagination disclosure and privacy-minimized summaries", () => {
  const filters = enquiryFilters({ page: "3", status: "AWAITING_REVIEW" });
  const html = renderToStaticMarkup(
    createElement(OwnerEnquiryInbox, {
      filters,
      result: { rows: [row], total: 51 },
    }),
  );
  assert.match(html, /method="get"/);
  assert.match(html, /Showing 51–51 of 51/);
  assert.match(html, /not a saved snapshot/);
  assert.match(html, /Previous page/);
  assert.ok(!html.includes(row.email));
  assert.ok(!html.includes(row.message));
  assert.ok(html.includes(`enquiry=${id}`));
  assert.ok(!html.includes("Next page"));
  const detail = renderToStaticMarkup(
    createElement(OwnerEnquiryInbox, {
      filters: { ...filters, enquiry: id },
      result: { rows: [row], total: 1 },
    }),
  );
  assert.ok(detail.includes(row.email));
  assert.ok(detail.includes(row.message));
  assert.ok(detail.includes("&lt;script&gt;sender&lt;/script&gt;"));
  assert.ok(
    detail.includes('href="/os/enquiries?status=AWAITING_REVIEW&amp;page=3"'),
  );
  assert.ok(detail.includes(`id="public-enquiry-${id}"`));
  assert.ok(!detail.includes("mailto:"));
});
test("empty/out-of-range states retain exact count and first-page recovery", () => {
  for (const total of [0, 51]) {
    const html = renderToStaticMarkup(
      createElement(OwnerEnquiryInbox, {
        filters: enquiryFilters({ page: "4", type: "CONTACT" }),
        result: { rows: [], total },
      }),
    );
    assert.ok(html.includes(`${total} matching enquiries.`));
    assert.ok(html.includes('href="/os/enquiries?type=CONTACT"'));
    assert.ok(
      html.includes(
        total
          ? "This page has no enquiries"
          : "No enquiries match these filters",
      ),
    );
  }
});
test("unauthorized actors fail before database access", async () => {
  for (const actor of [
    { security_role: "ORG_ADMIN", organisation_kind: "CUSTOMER" },
    { security_role: "KXRA_OWNER", organisation_kind: "CUSTOMER" },
    { security_role: "PARTNER", organisation_kind: "KXRA" },
  ])
    await assert.rejects(
      ownerEnquiries(actor as Actor, enquiryFilters({})),
      /Access unavailable/,
    );
});
test("private enquiry content starts concealed and reuses reviewed document lifecycle", () => {
  const html = renderToStaticMarkup(
    createElement(EnquiryDocumentBoundary, {
      children: createElement("p", null, "private content"),
    }),
  );
  assert.ok(html.includes("visibility:hidden"));
  assert.ok(html.includes("JavaScript may be disabled or failed to load"));
  const source = fs.readFileSync(
    "apps/os/components/EnquiryDocumentBoundary.tsx",
    "utf8",
  );
  assert.match(source, /installDirectoryDocumentLifecycle/);
  const page = fs.readFileSync("apps/os/app/os/enquiries/page.tsx", "utf8");
  assert.match(page, /force-dynamic/);
  assert.match(page, /documentNavigation/);
  assert.ok(!page.includes('from "next/link"'));
});

test("exact inbox owns its route and extra segments have a no-data guard", async () => {
  const { getSortedRoutes } =
    await import("next/dist/shared/lib/router/utils/sorted-routes");
  assert.deepEqual(
    getSortedRoutes([
      "/os/[[...segments]]",
      "/os/enquiries",
      "/os/enquiries/[...invalid]",
    ]),
    ["/os/enquiries", "/os/enquiries/[...invalid]", "/os/[[...segments]]"],
  );
  const guard = fs.readFileSync(
    "apps/os/app/os/enquiries/[...invalid]/page.tsx",
    "utf8",
  );
  assert.match(guard, /notFound\(\)/);
  assert.doesNotMatch(guard, /ownerEnquiries|query\(|actor\(/);
});

test("acceptance runner requires a clean full tracked tree and guarded local ownership", () => {
  const runner = fs.readFileSync("scripts/verify-owner-enquiries.mjs", "utf8");
  for (const marker of [
    "--reviewed-local-window",
    "CLEAN_COMMITTED_SOURCE_REQUIRED",
    "ls-tree",
    "TRACKED_EXECUTABLE_MODE_CHANGED",
    "UNEXPECTED_WORKTREE_CHANGE",
    "AMBIENT_ENV_FILE_REJECTED",
    "assertGeneratedNextEnv",
    "assertPostgresOwnership",
    "WORKTREE_BYTES_DIFFER_FROM_HEAD",
    "observeOwnedProcesses",
    "OWNED_DESCENDANT_REMAINS",
    "POSTGRES_SOCKET_REMAINS",
    "HOME: home",
    "SIGINT",
    "SIGTERM",
  ])
    assert.ok(runner.includes(marker), marker);
  assert.ok(!runner.includes("HOME: process.env.HOME"));
  assert.ok(!runner.includes("spawnSync(process.execPath"));
});
