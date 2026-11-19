import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import OwnerOverview, {
  OwnerOverviewUnavailable,
} from "../apps/os/components/OwnerOverview";
import {
  ownerOverviewFromRow,
  ownerOverviewSql,
} from "../packages/workspace/owner-overview-contract";
import { ownerNavigation } from "../packages/workspace/owner-navigation";
import {
  ownerOverview,
  ownerEnquiryInbox,
  ownerWorkLogEntry,
} from "../apps/os/lib/owner-overview";
import type { Actor } from "../apps/os/lib/auth";

const id = "20000000-0000-4000-8000-000000000001";
const stamp = "2026-11-08T12:00:00.000Z";
function input() {
  return {
    captured_at: new Date(stamp),
    enquiry_count: "67",
    approval_count: "2",
    task_count: "8",
    activity_count: "120",
    enquiries: [
      {
        id,
        company: "Synthetic business",
        form_kind: "CONTACT",
        status: "UNVERIFIED",
        occurred_at: stamp,
        email: "never-return@example.invalid",
        message: "Never return this message",
      },
    ],
    approvals: [
      {
        id,
        title: "Review the exact request",
        action: "record.accept",
        occurred_at: stamp,
      },
    ],
    decisions: [
      { id, title: "A draft decision", status: "draft", occurred_at: stamp },
    ],
    tasks: [{ id, title: "An assigned task", occurred_at: stamp }],
    activity: [
      {
        id,
        title: "A recorded event",
        status: "FAILED",
        entry_type: "AUDIT_EVENT",
        occurred_at: stamp,
      },
    ],
  };
}
const context = { organisation: "Synthetic KXRA", local: true };
test("owner snapshot retains exact totals instead of capped-preview lengths and excludes enquiry contact content", () => {
  const snapshot = ownerOverviewFromRow(input(), context);
  assert.equal(snapshot.counts.enquiries, 67);
  assert.equal(snapshot.enquiries.length, 1);
  assert.equal(snapshot.captured_at, stamp);
  assert.equal(snapshot.local, true);
  assert.equal(snapshot.organisation, context.organisation);
  assert.equal(
    snapshot.enquiries[0].href,
    `/os/enquiries?enquiry=${id}#public-enquiry-${id}`,
  );
  const json = JSON.stringify(snapshot);
  assert.ok(!json.includes("never-return"));
  assert.ok(!json.includes("Never return this message"));
  for (const section of [
    snapshot.enquiries,
    snapshot.approvals,
    snapshot.decisions,
    snapshot.tasks,
    snapshot.activity,
  ])
    for (const item of section) assert.match(item.href, /^\/os\//);
});
test("malformed or missing data is unavailable, never silently zero or an unsafe URL", () => {
  for (const bad of [
    undefined,
    null,
    -1,
    "-1",
    "1.5",
    "01",
    "Infinity",
    "9007199254740992",
  ])
    assert.throws(() =>
      ownerOverviewFromRow({ ...input(), enquiry_count: bad }, context),
    );
  for (const bad of [
    null,
    {},
    { ...input(), captured_at: "unknown" },
    { ...input(), tasks: null },
    { ...input(), tasks: Array(6).fill(input().tasks[0]) },
    { ...input(), tasks: [{ ...input().tasks[0], id: "../../admin" }] },
    {
      ...input(),
      activity: [{ ...input().activity[0], occurred_at: "invalid" }],
    },
  ])
    assert.throws(() => ownerOverviewFromRow(bad, context));
});
test("zero is displayed only from a successful complete empty snapshot", () => {
  const snapshot = ownerOverviewFromRow(
    {
      ...input(),
      enquiry_count: "0",
      approval_count: "0",
      task_count: "0",
      activity_count: "0",
      enquiries: [],
      approvals: [],
      decisions: [],
      tasks: [],
      activity: [],
    },
    context,
  );
  assert.deepEqual(Object.values(snapshot.counts), [0, 0, 0, 0]);
  const html = renderToStaticMarkup(createElement(OwnerOverview, { snapshot }));
  assert.match(html, /No enquiries are awaiting review/);
  assert.match(html, /Synthetic local records/);
  assert.ok(!html.includes("Revenue"));
});
test("rendered owner overview labels source, scope, time windows and bounded lists with usable destinations", () => {
  const snapshot = ownerOverviewFromRow(input(), context);
  const html = renderToStaticMarkup(createElement(OwnerOverview, { snapshot }));
  for (const label of [
    "Your operating overview",
    "Synthetic local records",
    "Organisation: Synthetic KXRA",
    "last 7 days",
    "Latest five",
    "not a live service-health check",
    "Cross-customer billing",
  ])
    assert.ok(html.includes(label), label);
  for (const href of [
    "/os/workspace",
    "/os/enquiries",
    "/os/approvals",
    "/os/tasks",
    "/os/work-log",
    "/os/support",
    "/os/admin#release-gate",
    "/os/venture-overview",
  ])
    assert.ok(html.includes(`href="${href}"`), href);
  assert.ok(!html.includes("never-return@example.invalid"));
  const hosted = renderToStaticMarkup(
    createElement(OwnerOverview, { snapshot: { ...snapshot, local: false } }),
  );
  assert.ok(hosted.includes("Recorded application data"));
  assert.ok(!hosted.includes("Synthetic local records"));
});
test("failure presentation omits counters and keeps real fallback links", () => {
  const html = renderToStaticMarkup(createElement(OwnerOverviewUnavailable));
  assert.match(html, /No activity counts are shown/);
  assert.ok(!html.includes("owner-metric"));
  assert.ok(html.includes('href="/os"'));
  assert.ok(html.includes('href="/os/enquiries"'));
});
test("new data adapters reject every non-platform-owner scope before opening a database", async () => {
  for (const security_role of [
    "KXRA_STAFF",
    "ORG_ADMIN",
    "ORG_MEMBER",
  ] as const) {
    const actor = {
      security_role,
      organisation_kind: "CUSTOMER",
      role: "owner",
    } as Actor;
    await assert.rejects(() => ownerWorkLogEntry(actor, id), { status: 403 });
    await assert.rejects(() => ownerOverview(actor), {
      status: 403,
      code: "OWNER_REQUIRED",
    });
    await assert.rejects(() => ownerEnquiryInbox(actor), {
      status: 403,
      code: "OWNER_REQUIRED",
    });
  }
  const wrongOrg = {
    security_role: "KXRA_OWNER",
    organisation_kind: "CUSTOMER",
    role: "owner",
  } as Actor;
  await assert.rejects(() => ownerOverview(wrongOrg), { status: 403 });
  await assert.rejects(() => ownerEnquiryInbox(wrongOrg, id), { status: 403 });
  await assert.rejects(
    () =>
      ownerEnquiryInbox(
        { ...wrongOrg, organisation_kind: "KXRA" },
        "../secret",
      ),
    { status: 404 },
  );
});
test("new overview has one bounded SELECT with explicit organisation filters and no mutating RPC", () => {
  assert.match(ownerOverviewSql, /^select now\(\)/);
  assert.ok(
    !/\b(insert|update|delete|refresh_expired|record_admin_view|review_operations|set_config)\b/i.test(
      ownerOverviewSql,
    ),
  );
  assert.equal((ownerOverviewSql.match(/where org_id=\$1/g) || []).length, 9);
  assert.match(
    ownerOverviewSql,
    /state='REQUESTED' and expires_at>now\(\) and consumed_at is null/,
  );
  assert.match(ownerOverviewSql, /occurred_at<=now\(\)/);
  assert.match(ownerOverviewSql, /limit 6/);
  const page = fs.readFileSync(
    "apps/os/app/os/[[...segments]]/page.tsx",
    "utf8",
  );
  const home = page
    .split('} else if (!section && a.role === "owner") {')[1]
    .split('} else if (section === "enquiries")')[0];
  assert.ok(home.includes("await ownerOverview(a)"));
  assert.ok(!home.includes("ownerDashboard"));
  assert.ok(!home.includes("adminSnapshot"));
});
test("owner navigation preserves every established destination and adds guarded operating destinations", () => {
  const paths = ownerNavigation.flatMap((group) =>
    group.links.map(([, path]) => path),
  );
  assert.equal(paths.length, new Set(paths).size);
  for (const path of [
    "",
    "start",
    "workspace",
    "operating-model",
    "improvements",
    "portfolio",
    "ideas",
    "projects",
    "tasks",
    "tools",
    "custom-projects",
    "support",
    "sources",
    "experiments",
    "decisions",
    "risks",
    "finance",
    "partners",
    "whatsapp",
    "agents",
    "skills",
    "routines",
    "runs",
    "work-log",
    "approvals",
    "knowledge",
    "files",
    "admin",
    "review-operations",
    "enquiries",
    "venture-overview",
  ])
    assert.ok(paths.includes(path), path);
  assert.ok(
    ownerNavigation
      .find((group) => group.title === "Partner operations")
      ?.links.some(([, path]) => path === "whatsapp"),
  );
});
