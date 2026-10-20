# Kylon public-surface audit and KXRA implementation reference

Research date: 19 October 2026. Classification: EXTERNAL RESEARCH, supplied by the parent research thread. This is a structured repository reference preserving its findings, interaction ledger, requirements and limitations. Raw extractions, route manifests and screenshots were described by the researcher but have not been transferred into this checkout.

## Scope and evidence

Public content and harmless public demonstration interactions only. No account creation, login, booking/contact submission, purchases, private source extraction or access-control bypass. The 3D/parallax effect is excluded. KXRA keeps its own current design, branding, original copy, illustrations and examples. Do not copy Kylon logos, testimonials, compliance claims, legal text or unlicensed assets.

- [Sitemap](https://kylon.io/sitemap.xml): 434 routes, 236 English/non-Japanese and 198 Japanese.
- Root families before localization: homepage 1, product 16, use-cases 32, alternatives 32, blog 81, partner 19, integrations 18, solutions 13, apps 7, bring-your-own-agent 4, plus 13 standalone routes.
- HTML reads succeeded for 200 of 241 requested URLs. 41 returned tunnel 403; no bypass. The browser independently observed the help index, leaving 40 blocked manifest entries.
- Help lists 80 articles across eight categories plus separate contact, outside the main sitemap. All article links inventoried; not all read.
- Consolidated discovery: 521 unique routes, including sitemap, help, identified docs/app entry points and partner learning index. This is not all possible URLs or private functionality.
- Japanese routes were enumerated, not individually tested. Documentation subdomains, authentication and private backend behavior remain unverified.
- Desktop inspection: home, pricing, integrations, partner application, apps gallery, CRM template, use cases, product overview, blog and help. A genuine narrow/mobile viewport was not obtained; mobile tests below are KXRA requirements.

Primary public sources: [home](https://kylon.io/), [product](https://kylon.io/product), [workspace](https://kylon.io/product/workspace), [agents](https://kylon.io/product/agents), [pricing](https://kylon.io/pricing), [integrations](https://kylon.io/integrations), [apps](https://kylon.io/apps), [CRM](https://kylon.io/apps/crm), [use cases](https://kylon.io/use-cases), [partner application](https://kylon.io/partner/apply), [blog](https://kylon.io/blog), [help](https://kylon.io/help).

## Decision: three distinct delivery layers

1. Public website and content navigation.
2. Explicitly labelled interactive demonstrations.
3. Authenticated operational product with actual persistence, permissions and execution.

Success in either of the first two layers does not establish the third. The route inventory is a semantic feature reference, not a requirement to clone hundreds of SEO topics. Adapt to existing Next.js/PostgreSQL/Supabase/RLS architecture without a rewrite. [Parity plan](parity-plan.md) maps findings onto existing KXRA code and stages; [completion matrix](completion-matrix.md) records actual acceptance.

## Public information architecture

Shared desktop header: logo/home; Product, Solutions, Partners, Integrations, Resources, Pricing, Book a demo and Start free. Product opens a two-column menu; other menus group destinations. Footer repeats product, solutions, partners, integrations, resources, comparisons, company, social/legal/privacy choices and English/Japanese language switch.

Product destinations: overview, workspace, agents, bring-your-own agents, CLI docs, apps, workflows, skills and tools. Solutions separate technical users/business owners and link all solutions/use cases. Partner navigation covers registration, business setup, learning path, toolkit, materials, workshop and delivery. Integrations separate connected accounts from built-in capabilities. Resources include explanation, comparisons, blog, help, developer docs, FAQ and device downloads.

KXRA requirements: canonical internal destinations; keyboard menus, Escape/outside dismissal and focus restoration; active route; mobile nested drawer; descriptive labels; command/search discovery. Conversion links must never lead to competitor accounts.

Home composition: off-white surfaces, large dark typography, dual CTA, illustrated cutaway villa, rounded panels and restrained pale green in a product demo. This describes observation, not KXRA palette direction or licensed artwork. Sections: hero; multi-pane chat/app demonstration; personal/team agent comparison; customer evidence; external-agent collaboration; integration wall; four scenarios; security status; FAQ; conversion footer. Keep KXRA design. Prefer original product images and named scenario tabs/direct anchors. Omit unsupported proof.

Product hub presents identity/access, agent routing, connections, runtime, build/ship and governance. Detail templates contain breadcrumbs, overview, mechanics, diagrams/demos, related pages and FAQ. Workspace/agents add richer scenarios, day-one steps and comparisons. Sixteen routes: overview, workspace, agents, access, approvals, memory, credentials, models, sandbox, build-and-ship, workflows, run-history, usage, data-scoping, tools and skills. Duplicate generic pages do not supply semantic coverage.

Apps gallery: General CRM, Creator Management, Sampling Desk, Remodeling CRM, Recruiting Workspace, Travel Desk. Each offers preview, workflow-step controls, detail/fullscreen, build-intent conversion and demo-call CTA. Details add features/screens, configuration, FAQ, copy instructions and related templates. Public links refer to template archives; none downloaded or reused. Independently implement KXRA templates; embedded instructions are source material, not execution authority.

Catalogs:

- Integrations: search/result count, account/built-in groups, featured and full directory. Gmail search returned one match while other sections stayed visible. Improve consistent filtering, categories/source filters and no-results recovery.
- Use cases: scenario/industry/integration tabs replace panel links; CTA and all-case list. Scenarios include email operations, internal tools, outreach, content, research and talent. Industries included hospitality/travel, real estate, care and finance. Integration tab showed PLAUD and tl;dv.
- Solutions: hub and role/problem details with specific problem/workflow/features/example/related routes.
- Alternatives: hub/comparisons. KXRA needs dated evidence and caveats, not copied competitive claims.
- Blog: All, Featured, Product, Research, Stories, Guide, Compare, AI News. Research filtered the list. Cards expose title/summary/author/date/reading time; article templates need hierarchy, body, metadata, related content and CTA.
- Partner: 19 pages, four-stage path, registration/business model/learning/toolkit/workshop/materials/FDE delivery and next-step links.
- Help: search, suggested questions, eight expandable categories and 80 articles: Getting started 11, Rooms/threads 11, Account/members 7, Agents 21, Automations 7, Apps 10, Connections 5, Privacy/data 8. Separate support contact. Ask submission/answer generation not tested.
- Standalone/legal: what-is-kylon, company, brand, ipad, bot, pricing, liam, ai-crm, privacy, terms, dpa, subprocessors, account-deletion. KXRA-specific reviewed content required.
- Localization: English/Japanese structure exists. Decide KXRA languages; track translated metadata, equivalent routes and explicit untranslated fallback.

## Interaction ledger

TESTED means observed public-browser result. VISIBLE means present but unexercised. CLAIMED means described privately operational behavior without verification. PROPOSED means KXRA improvement.

| Surface | Evidence | Observation and KXRA acceptance |
|---|---|---|
| Product menu | TESTED | Two-column feature menu opened; accessible state required. |
| Cookie Reject all | TESTED | Banner dismissed; Accept all/Choose and footer Privacy choices visible. Persistence/tracking not audited. |
| Book demo | TESTED | Closable modal loaded embedded scheduler: 15 minutes, Google Meet, timezone, date/month, 12h/24h and slots. No booking. KXRA needs genuine authorised provider or honest unavailable/contact state. |
| Signup/device links | VISIBLE | App signup, Mac/iOS/Android and OS-specific CTAs; no onboarding/install acceptance. |
| Invoice Amount | TESTED | Amount ascending sort. KXRA should test descending toggle and stable order. |
| Invoice New record | TESTED | Added sample `New record 1`, Open; persistence not established. |
| Invoice tile/Close | VISIBLE | App card and side-panel controls; meaningful open/close required. |
| Hiring candidate | TESTED | Priya moved New→Screen, counts 2/2→1/3; demonstration, not applicant automation. |
| Sales dashboard | VISIBLE | Four KPIs, trend and opportunities; refresh unverified. |
| Warehouse count | VISIBLE | SKU, quantity, aisle A–D, counted-by, notes and Submit; not submitted. Validate and label demo. |
| Chat/sidebar/Publish | VISIBLE | Fields and disabled Send; many illustrative labels. No actual publishing inferred. |
| FAQ show all | TESTED | Five→twenty questions; first initially open; disclosure semantics. |
| Testimonial previous/next | VISIBLE | Present, not tested. |
| Core pricing tier | TESTED | $200/2,000 selected from six tiers while headline remained “from $50”; KXRA selected price/allowance must be clear. |
| BYO Codex checkbox | TESTED | Quote changed to $0/month and summary updated; concept preview, not final terms/eligibility. |
| Human slider | VISIBLE | Starts at 1; quote described as unchanged; not exercised. |
| Integration search | TESTED | Gmail returned one linked match. |
| Use-case tabs | TESTED | Industry/integration panel changed. |
| Blog categories | TESTED | Research reduced list. |
| Partner form | VISIBLE | Inspected fields/options, not submitted. |
| App workflow/fullscreen/copy | VISIBLE | Controls present, no claim every embedded app works. |
| Help expansion | TESTED | Category buttons revealed article links. |
| Help Ask/contact | VISIBLE | No question/message submitted. |
| Language/legal/social | VISIBLE | Destinations inventoried; contents not comprehensively audited. |

Partner form: required company/name/email/role; optional website/phone; industry multi-choice; sales/FDE/both; FDE capability; workshop timeframe; customer reach; notes; submit. KXRA needs field errors, consent, confirmation, spam/rate controls, validation and duplicate prevention.

Pricing snapshot only, not a KXRA recommendation: Core $50/500, $100/1,000, $200/2,000, $400/4,000, $600/6,000, $800/8,000 monthly credits; displayed 10% monthly bonus and up to ten agents; Pro/Ultra custom. Seven-day card-required trial described as 300 credits/five active agents and automatic conversion unless cancelled. BYO quote concept-only. Do not import these terms. KXRA subscription checkout remains paused.

## Operational specification: publicly described, backend unverified

Workspace: tenant/switcher; common people/agent directory; public/private rooms; two-member DMs; mentions/unread/activity/search/notifications. One anchored discussion per message/file/app/record/automation. Room guidelines apply on agent turns. Public docs describe 4,096 characters; KXRA can choose a justified limit. Files: PDF/image/CSV/text preview/search, versions/restore/export/discussion. Signed URLs and search snippets must be checked before retrieval/ranking, never filtered after exposure.

Agents: name/avatar/specialty/persona/member-admin access/skills/connections/status; private defaults and at least one human admin; limited directory discovery/access requests; one-agent routing, explicit mentions, mentioned-only rooms, handoffs, bounded chains. Job states distinguish queued/running/waiting approval/failed/completed/cancelled/offline.

Memory: typed preference/feedback/reference/context, scope, review/revalidation and provenance. Kylon warns private-room learning can travel and memory summaries are visible to agents. KXRA improvement: provenance-based checks both on retrieval and response; no global summary leak; separate shareable company knowledge from private memory.

Connections: OAuth accounts versus built-in tools; ownership/scopes/grants to people/agents/rooms/workspace; expiry/reconnect/disconnect/revoke; encrypted secrets, runtime injection, redacted logs and per-call server checks. Delegation must expire and be rechecked. Start with a small tested adapter set; planned entries stay labelled. Failures need safe retries/reconnect guidance and consequential actions need human approval.

Approvals: draft-first email/post/message; recipient/content preview/edit/approve/send/reject/cancel; actor receipt and immutable decision. Bind exact action/destination/content/version/expiry; changing drafts invalidates approval. Publishing/sharing/invitation/deletion require review. Approval cannot bypass underlying permission.

Automations: manual, one-time, interval/timezone, record event and signed webhook triggers. Public claims include overlap skipping, pause after three failures, warn/pause budgets, seven-day runs and held-webhook replay/discard. Improve with explicit skip/queue/coalesce, DST semantics, idempotency, retry/backoff, cancellation, dead letters and signature rotation. Store duration/output/usage/errors.

Execution: isolated runtime, scoped filesystem, allowlisted resources, browser handoff, bounded subagents, routing/failover and reusable skills are infrastructure, not switches. Start controlled jobs; sandbox/egress before arbitrary code. Traces/receipts remain permission-scoped. Public material says no separate audit-log export; KXRA can add redacted append-only export/retention without giving admins private-content access. Track latency/errors/costs/correlation IDs; unknown cost remains unknown.

App builder: app/schema/record database; draft/Git versions/build/private preview/reviewer/publish/rollback/access/room/custom domain. Isolate data and granted connections; versioned transactional schema changes and releases; preview cannot write live records. Link record/app threads across navigation.

Usage: metered-event credit ledger, outcome/provider cost/user charge, balance/period, scoped breakdowns by source/room/agent/person/automation. Daily/weekly/monthly budgets, caps/warnings/pause/resume/export and pre-work reservation. Real verified billing webhooks, tax/lifecycle/reconciliation required before checkout; no simulated payment controls.

### Six independent business templates

1. CRM: separate leads/opportunities; accounts/contacts; idempotent conversion transaction/source link; owner/stage/amount/probability/next action/date/tasks/dashboard/filter/follow-up drafts. Unqualified leads do not inflate pipeline.
2. Creator Management: roster/channel metrics/posts/outreach/benchmark/rates/attribution/reports; disclose freshness and unavailable sources.
3. Sampling Desk: creators/samples/shipment/delivery/post window; transparent overdue priority/outreach/escalation drafts/reply/performance.
4. Remodeling CRM: household/property/project/qualification/consultation/versioned estimates/scope approval/design-fee evidence/milestones/owner/date. No implied accounting integration.
5. Recruiting: jobs, candidates distinct from applications, stages, confidential scorecards, versioned offers/approvers/onboarding. AI must not autonomously decide consequential hiring.
6. Travel: enquiry/travellers/quotes/versioned proposals/approvals/bookings/deposit/balance/departure. No universal six-month passport rule: verified destination/nationality/transit requirements and human review. Protect identifiers/health/diet fields.

## Architecture and delivery gates

Public content model: Page, Article, Category, Integration, Solution, UseCase, Comparison, PartnerLesson, HelpArticle, LocaleVariant, NavigationGroup and SEO metadata; shared templates, no hundreds of hard-coded generic components.

Operational concepts: Workspace/Membership/Room/RoomMembership/Message/ThreadAnchor/FileVersion/Agent/AgentGrant/MemoryEntry/Connection/ConnectionGrant/SkillVersion/Task/Run/ToolCall/Approval/Automation/Trigger/App/AppVersion/AppRecord/Release/UsageEvent/Budget/AuditEvent. Tenant scope on every entity; server authorisation on every relevant operation. Client IDs never suffice. Real-time transport, durable queue, relational transactions, object storage, permission-filtered search, secrets boundary and billing adapter. Typed actions, request IDs, idempotency, rollback/reconciliation before optimistic success.

Proposed phases, adapted in [the KXRA plan](parity-plan.md):

- Assessment: preserve repository, inspect real routes/schema/auth/tests, distinguish placeholders. No broad redesign.
- Public architecture: original shell/content catalogs/pricing/partner/apps/help/legal/localization. Gate routes, all CTAs, keyboard menus/dialogs/tabs, forms/filter/no-results/404/metadata/sitemap/consent/responsive.
- Workspace: auth/tenancy/membership/rooms/DMs/anchors/messages/files/search/agents/tasks/approvals. Gate two users/two tenants, immediate removal, permission-scoped URLs/snippets, loading/error/retry.
- Execution: controlled runner, selected connectors, expiring grants, provenance memory, skills/traces/triggers/retry/usage. One actual business workflow before broad catalogs. Gate injection/access/revocation, version approvals, idempotency/duplicates/DST/overlap/budgets/cancel.
- Apps: independently deliver six modules on draft/release primitives. Gate lead conversion, offer/proposal history, concurrent edits/migration rollback/import/draft-live/export/mobile.
- Scale/trust: privacy/audit/admin/notifications/PWA/localization/performance/recovery. No unsupported SOC 2/ISO/GDPR badges.

Cross-cutting KXRA requirements: 360/390/768/1024/1440 widths; mobile drawers/detail sheets; tables that scroll locally or become cards; labels/44px targets/no page overflow; keyboard/screen reader/focus/contrast/headings/table semantics/aria-live/trapped dialogs/reduced motion. Static public content, original optimized images, lazy previews/scheduler, reserved sizes. Helpful empties/errors, breadcrumbs, consistent Automations/Workflows naming, honest connection states and demo undo. Security: least privilege, CSRF/XSS, redaction, signed events, limits and review evidence. Human financial/hiring/travel judgment remains necessary.

## Research artifacts and remaining limits

Researcher reports `route-manifest.csv`, `route-manifest.json` (521 discovered routes, locale/family/status and mechanical controls), `routes.txt` (434 sitemap URLs), screenshots `home-desktop.png`, `demo-booking.png`, `invoice-demo.png`, `pricing-desktop.png`, `integrations-search.png`. None has yet been transferred here. Raw `public-inventory.json` is research cache, not licensed KXRA content and should not be published. Mechanical control extraction does not mean every control was exercised.

Unverified: authenticated onboarding, backend writes, connector OAuth, payments, actual agent work, app build/publish, contact submissions, support AI, full docs subdomain, true mobile and Japanese content QA. These need authorised access or separate validation, not inference. No copied customer evidence, fake certification, unsupported integration counts or simulated sends represented as real.
