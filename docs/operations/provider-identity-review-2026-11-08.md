# Provider identity review — 8 November 2026

## Scope and inventory

Local presentation-only branch based on `7f1d1112f81a35d304a7e8810d4f68a5e4b2572c`. The release candidate is not modified in place. No publication, provider request, credential setup, account activation, purchase, payment or hosted change is part of this work.

There were no named-provider logo components or assets in this base. The homepage M/✣/A/◈/+ strip is labelled “People and agents, illustrated”; the preview's ✣ avatar and the OS workspace header identify KXRA. Integration-wall glyphs identify capability categories. These decorative people, KXRA-agent and category symbols are not provider logos and are unchanged. Main landing artwork, layout, commercial wording and all owner-shell files remain unchanged.

Named provider references in `ModelConnections`, `AiConnectionSetup`, `PairedSetupForm` and `RoomBridge` were plain text. This patch adds provider identity only to existing saved-connection and AI-review cards in the first two components. It does not modify paired setup or RoomBridge. Native `<select>` options remain text and preserve exact protocol values with explicit `value={p}` attributes. `OPENAI` is labelled **OpenAI API**, not ChatGPT.

## Authentic assets and rights

The machine-readable asset provenance, original sizes and SHA-256 digests are in `apps/os/public/providers/provenance.json`. The images are unchanged bytes from the provider's own public asset distribution, served locally with no remote image fetch or new third-party dependency.

- OpenAI: [official current logo archive](https://cdn.openai.com/brand/openai-logos.zip), entry `OpenAI-logos/SVGs/OAI_OpenAI-Blossom_Black.svg`, under the [OpenAI design and mark usage guidelines](https://openai.com/brand/). The downloaded archive has SHA-256 `c54e85ab5884228f89f0230dd8effa8d588cad78166fe954135f4afa553222db`. The included asset is 2,415 bytes, SHA-256 `75c1e9fffa5e8c437bec1d67197a73992bca45d166c6ff23215185dea8fae92a`. Use is subject to OpenAI's mark usage terms, not an open-source image license. Its original canvas preserves the supplied clear space. The mark is subordinate provider identification, not KXRA branding or a partnership lockup.
- OpenRouter: [official public Ink glyph SVG](https://openrouter.ai/brand/logos/transparent/glyph/svg/glyph-ink.svg), offered by the [official brand page](https://openrouter.ai/brand). The included asset is 563 bytes, SHA-256 `91be6b8a91745f089bfe42b89a5cbcd4b666fca6473610f9a6c11a31bd7523bc`. No separate open-source logo license was found. The mark is used unchanged on a plain white backing, with its original proportions and owner attribution.

The component provides one concise connection-panel notice attributing both marks and distinguishing service identity from verification or endorsement. It does not claim a partnership. Existing enabled/disabled/review state text and all action gates remain authoritative.

## Deliberate text fallbacks

- **Anthropic / Claude:** [Anthropic's trademark guidelines](https://assets.claude.com/f7874b435aabdaee5f836e888b4439b9b56a934b.pdf) require specific permission and prior approval of materials. An [official press kit](https://www.anthropic.com/press-kit) exists, but it does not establish KXRA's approval. Existing factual Anthropic text remains. No Claude logo is invented, traced, recolored, scraped from a third-party library or represented as approved.
- **Google / Gemini:** [Google's API and product compatibility guidance](https://partnermarketinghub.withgoogle.com/brands/google/use-cases/product-co-branding/) calls for plain-text API references. [Gemini brand resources](https://partnermarketinghub.withgoogle.com/brands/google-gemini/brand-introduction/) redirected to a login. No KXRA asset-use approval was found. Existing Google text remains; there is no generic Google G or fabricated sparkle substitute.
- **ChatGPT subscription:** a consumer product route, distinct from OpenAI API. Existing confirmation-required text and the entire setup form are unchanged. No additional availability claim is made.
- **Compatible provider, local fixture and unknown identifiers:** text only. A provider logo is never inferred from a user-controlled connection name, model name or endpoint. Unknown text is React-escaped and cannot cause a remote image request.

## Component semantics

`ProviderIdentity` is a passive inline label, not a badge or control. Both real marks occupy a consistent 40px slot on a white surface; the supplied image dimensions plus `object-fit: contain` retain aspect ratios. The adjacent visible provider text is always present, including when image loading fails. Images have `alt=""` inside an `aria-hidden="true"` wrapper to avoid duplicate screen-reader output. Long unknown labels wrap.

Static styles are self-contained to preserve the existing in-memory `verify-ai-resume-mocked.mjs` bundling workflow. No shared helper, historical composition manifest, release authority pin, database definition, server handler, environment flag or lockfile is changed.

## Verification

- 70 focused offline tests pass: provider identity rendering/accessibility/source hashes and safe text fallbacks; existing AI status, admission, resume API and provider boundary tests; application release cohort; hosted release guard; production apps/GitHub/paired composition; and release strategy.
- Root `npm run typecheck` passes.
- Existing mocked AI UI bundle mode passes without editing its script.
- Whole-repository `npm run format:check`, `npm run test:secrets` (1,541 files, six credential patterns), and `git diff --check` pass.
- Isolated `npm run build:os` passes (Next.js 16.4.3). The existing middleware-deprecation and webpack-cache warnings remain; no build errors occurred.
- Headless Chromium component QA passes at 1280px and 320px. All requests were fulfilled locally by the harness; no listening server, database, fixture lease, real provider call or external network request was used. Official images load, pending review has no key form, resumed provider selection stays locked to `OPENAI`, fresh native selection retains exact `OPENROUTER`, and no horizontal overflow occurs. Zero page errors and zero POSTs. Browser process was closed.
- Desktop/mobile screenshots and the synthetic summary remain in ignored `.runtime/provider-identity-qa/`, not in published application assets. Screenshots were visually inspected. The harness renders the actual identity component and AI review form; it is not a full authenticated workspace acceptance test.
- Non-presentation arrow-function bodies in both edited components match the accepted base. All server/auth/provider code and environment examples are byte-identical to the base.
- Full repository aggregate checks and native/authenticated acceptance were not run in this branch. These source/unit/build checks do not establish hosted provider acceptance, real authentication or a full release gate.

## Progress and handover summary

Authentic local OpenAI API/OpenRouter identity was added to existing connection/review cards, while generic landing art and KXRA avatars remain unchanged. Anthropic/Claude and Google/Gemini remain text pending appropriate asset-use evidence. All activation, enabled/disabled state, form payloads and native provider values are unchanged. No historical pin transition is needed for these files. Parent release composition owns append-only progress/handover updates and combined verification with owner UI changes.
