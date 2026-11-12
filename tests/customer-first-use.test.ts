import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import WorkspaceEntry from "../apps/os/components/WorkspaceEntry";
import OnboardingStepForm from "../apps/os/components/OnboardingStepForm";
import { customerWorkspace } from "../packages/workspace/workspace-presentation";
import { onboardingPresentation } from "../packages/workspace/onboarding-presentation";
const read = (file: string) => fs.readFileSync(file, "utf8");
const hash = (value: string | Buffer) =>
  crypto.createHash("sha256").update(value).digest("hex");
const customer = {
  organisation_kind: "CUSTOMER",
  relationship_type: "CUSTOMER",
  security_role: "ORG_MEMBER",
};

test("selected customer/client membership chooses workspace presentation independently of legacy roles or admin status", () => {
  for (const relationship_type of ["CUSTOMER", "CLIENT"])
    for (const security_role of ["ORG_ADMIN", "ORG_MEMBER"])
      for (const role of ["partner", "owner"])
        assert.equal(
          customerWorkspace({
            ...customer,
            relationship_type,
            security_role,
            role,
          } as typeof customer),
          true,
        );
  for (const context of [
    { ...customer, relationship_type: "PARTNER" },
    { ...customer, relationship_type: "INTERNAL", security_role: "KXRA_STAFF" },
    { ...customer, organisation_kind: "KXRA", security_role: "KXRA_OWNER" },
    { ...customer, organisation_kind: "KXRA", relationship_type: "CLIENT" },
    { ...customer, relationship_type: "toString" },
    { ...customer, organisation_kind: "UNKNOWN" },
  ])
    assert.equal(customerWorkspace(context), false);
  // Switching selected organisation must recompute presentation, not retain prior state.
  const partner = { ...customer, relationship_type: "PARTNER" };
  assert.equal(customerWorkspace(customer), true);
  assert.equal(customerWorkspace(partner), false);
  assert.equal(customerWorkspace(customer), true);
});
test("public OS entry only offers registration when the server gate is open", () => {
  for (const registration of [false, true]) {
    const html = renderToStaticMarkup(
      createElement(WorkspaceEntry, { registration }),
    );
    assert.match(html, /href="\/login"/);
    assert.match(html, /href="\/os"/);
    assert.equal(html.includes('href="/signup"'), registration);
    assert.equal(
      html.includes("registration is currently unavailable"),
      !registration,
    );
    assert.doesNotMatch(
      html,
      /Partner sign in|Local preview|Lasting businesses/,
    );
  }
  const page = read("apps/os/app/page.tsx");
  assert.match(page, /registration=\{await hostedSignupAvailable\(\)\}/);
  assert.match(page, /dynamic = "force-dynamic"/);
});
const projects = [
  {
    project_id: "project",
    project_code: "FIRST",
    project_name: "First workspace",
    project_role: "contributor" as const,
    access_expires_at: null,
    summary: "Permitted work",
    permissions: ["Read shared records", "Contribute"],
  },
];
function onboarding(step: number, context = customer) {
  return renderToStaticMarkup(
    createElement(OnboardingStepForm, {
      presentation: onboardingPresentation(context),
      step,
      currentStep: 9,
      completedSteps: [1, 2, 3, 4, 5, 6, 7, 8],
      projects,
      agreements: [
        {
          id: "agreement",
          document_key: "terms",
          version: 1,
          title: "Approved terms",
          body: "Exact approved agreement",
          status: "APPROVED",
        },
      ],
      profile: {
        first_name: "Test",
        last_name: "Member",
        job_title: null,
        company: null,
        phone: null,
        mfa_state: "NOT_ENROLLED",
      },
      preferences: {
        timezone: "UTC",
        email_notifications: false,
        whatsapp_notifications: false,
        display_density: "comfortable",
      },
      recipientHint: "t***@example.invalid",
    }),
  );
}
test("all nine onboarding steps retain submitted controls while customer/client copy reflects the actual workspace", () => {
  const controls = [
    "acknowledged",
    "first_name",
    "security_acknowledged",
    "access_acknowledged",
    "working_acknowledged",
    "whatsapp_choice",
    "timezone",
    "agreements_reviewed",
    "complete",
  ];
  for (const relationship_type of ["CUSTOMER", "CLIENT"])
    for (const security_role of ["ORG_ADMIN", "ORG_MEMBER"]) {
      const context = { ...customer, relationship_type, security_role };
      const copy = onboardingPresentation(context);
      assert.equal(copy.titles.length, 9);
      assert.doesNotMatch(
        copy.welcome + copy.features.join(" "),
        /venture|partner|investment|included credit/i,
      );
      for (let step = 1; step <= 9; step++) {
        const html = onboarding(step, context);
        assert.ok(html.includes(`name="${controls[step - 1]}"`));
        assert.match(html, new RegExp(`Step ${step} of 9`));
        if (step > 1)
          assert.ok(html.includes(`href="/onboarding?step=${step - 1}"`));
        if (step < 9)
          assert.match(html, /Saving again updates permitted values/);
      }
    }
  assert.match(onboarding(4), /contributor/);
  assert.doesNotMatch(onboarding(4), /read-only project roles/);
  assert.match(onboarding(6), /value="SKIP"/);
  assert.match(onboarding(6), /value="CONNECT_LATER"/);
  assert.match(onboarding(6), /currently unavailable/);
  assert.match(onboarding(8), /name="agreement_id"/);
  assert.match(onboarding(8), /Exact approved agreement/);
  assert.match(
    onboarding(5, { ...customer, relationship_type: "PARTNER" }),
    /assigned ventures only/,
  );
});
test("onboarding payloads, repeated-save guard and all authority-bearing sources remain unchanged", () => {
  const form = read("apps/os/components/OnboardingStepForm.tsx");
  const submit = form.slice(
    form.indexOf("  async function submit("),
    form.indexOf("\n  return (\n    <form"),
  );
  assert.equal(
    hash(submit),
    "bf5d5d98b70c16732885abbfa9aaeb85d5e0b5d0fac0e66a4b43ad4cdae33fbc",
  );
  const page = read("apps/os/app/onboarding/page.tsx");
  assert.match(page, /a = await account\(\)/);
  assert.match(page, /onboardingPresentation\(a\)/);
  assert.match(
    page,
    /TENANT_SELECTION_REQUIRED[\s\S]*?redirect\("\/select-organisation"\)/,
  );
  assert.match(page, /key=\{step\}/);
  assert.match(
    page,
    /!progress\[0\] \|\| !profile\[0\] \|\| !preferences\[0\] \|\| !projects.length/,
  );
  const unchanged = {
    "apps/os/lib/auth.ts":
      "ddce14732e58257f45b55499b8545b5cfb9eeb612d4292cc13abfd41b1896270",
    "apps/os/app/api/onboarding/step/route.ts":
      "9191fac5cde924f91e4b1e3684a5d3a28e556f84b52f536aed1956b913836c02",
    "apps/os/lib/workspace-start.ts":
      "321bc8131a8134f8f44d25e2e5ef6e4ed7aadf4d7b662ea9b59be7c8043bce02",
    "apps/os/lib/team-workspace.ts":
      "77137f708ba4e790eeff2a97114ee3b0671d8fcf997ec26fb358985d55feb452",
    "apps/os/lib/hosted-self-service.ts":
      "c2527df73d0d9318ff53141ef0e3e2ea09a5a56169b65dc1e5d59247a0bbd310",
    "apps/os/components/LiveWorkspaceAccess.tsx":
      "0d4abcfefb2667675dd5ee4f82ad9ab0fc83833fa7a2411085101bd255af37b0",
    "apps/os/components/CustomerConnections.production.tsx":
      "6a8cbc859d19345d44bc08ff9b52a0970c2332221bd7d26642d66cefdcf01429",
    "apps/marketing/app/page.tsx":
      "160199cf59dfb6e5e8512e7de0650a84798bc4346f4ac08699c8c8a10ab6e88e",
    "scripts/verify-build-budgets.mjs":
      "5f8492c4c352f26026bff3637add0472229e39c5a4c16d0281e805a32f38761d",
  };
  for (const [file, expected] of Object.entries(unchanged))
    assert.equal(hash(fs.readFileSync(file)), expected, file);
});
test("customer landing bypasses only the empty legacy route, outside catch blocks, and retains tour navigation", () => {
  const page = read("apps/os/app/os/[[...segments]]/page.tsx");
  const branch = page.indexOf("if (!section && customerWorkspace(a))");
  assert.ok(branch > page.indexOf("a = await actor()"));
  assert.ok(branch < page.indexOf("const projects = await listProjects(a)"));
  assert.ok(branch < page.indexOf('if (section === "start")'));
  assert.match(
    page.slice(branch, page.indexOf("const filter", branch)),
    /\/os\/workspace\?tour=1/,
  );
  assert.match(page, /!section && a.role === "owner"/);
  assert.match(
    page,
    /!section \|\| \(section === "projects" && !segments\[1\]\)/,
  );
  assert.match(page, /projects=\{writableProjects\}/);
  assert.match(page, /where kxra_private.can_project\(id,true\)/);
  assert.match(page, /roomCreationUnavailable=\{/);
  assert.match(page, /href="\/os\/start">Check workspace access/);
  assert.doesNotMatch(
    page.slice(
      page.indexOf('section === "workspace"'),
      page.indexOf('section === "workrooms"'),
    ),
    /href="\/billing"|href="\/os\/connections"/,
  );
  const shell = read("apps/os/components/Shell.tsx");
  assert.match(shell, /customerWorkspace\(actor\)[\s\S]*?path !== "whatsapp"/);
});
test("zero writable projects suppress both create calls to action and the form, without a relationship permission shortcut", () => {
  const component = read("apps/os/components/TeamWorkspace.tsx");
  assert.match(component, /!rooms.length && projects.length > 0/);
  assert.match(
    component,
    /projects.length > 0 && \([\s\S]*?<Link href="\/os\/workspace">＋ Create a room/,
  );
  assert.match(
    component,
    /projects.length > 0 \? \([\s\S]*?title="Create room"[\s\S]*?\) : \(\s*roomCreationUnavailable/,
  );
  assert.doesNotMatch(component, /relationship_type|security_role/);
  assert.match(component, /<ConnectionManager/);
});
