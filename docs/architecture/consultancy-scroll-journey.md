# KXRA industry walkthrough

## Current direction

This specification supersedes the rejected navy/brass/ivory treatment. The homepage uses white, graphite and signal red, with a cinematic forward camera move through a bright architectural pavilion. The spaces show property and hospitality, retail and professional services; the final operations studio supports an accessible HTML demonstration of KXRA OS. All premises and examples are illustrative. They are not claimed as KXRA offices, clients or measured results.

See ADR 0054 for research sources, owner direction and design judgments. This design takes principles from service clarity and sector-specific storytelling; it does not copy another site's identity.

## Route and scene map

| Top navigation | Homepage location | Behavior |
| --- | --- | --- |
| KXRA | /#overview | Entry to the continuous journey |
| Industries | /#industries | Property, then retail and professional-services chapters |
| Platform | /#platform | Interactive, synthetic KXRA OS demonstration |
| Our approach | /#approach | Assess, agree scope and deliver |
| Start a project | /#contact | Structured assessment form on the same page |

Normal scrolling moves through all six scenes. The primary links smoothly move the existing timeline, update the URL hash and preserve browser history. Direct platform links initialise the correct scene. Reading and reduced-motion modes expose the whole document and retain anchor navigation. Login and legal/detail pages are distinct functional destinations, not chapters disguised as new top-navigation pages.

## Generated media

Model: bytedance/seedance-2.5/text-to-video. Completed request: `a1ce194f-7f01-4444-a12e-45ac7f122a83`. Source: 1280 × 720 H.264, approximately 12.04 seconds, without audio. The prompt specifies one continuous daylight architectural move through a property scale model/lounge, retail display area, work studio and a blank-screen operations area, with neutral materials and signal-red accents. It excludes people, brands, generated UI lettering, navy, brass and ivory. The original source, complete prompt and provider URL remain in ignored .runtime/industry-walkthrough/.

Only inspected, optimized same-origin derivatives are used by the page:

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| industry-walkthrough-v2.jpg | 36868 | `a0de00a9b640d2eb26454b431d231250ae392f609669fd97eafa0a2e0d6e4c80` |
| industry-walkthrough-v2.mp4 | 2859202 | `ccfb374ff889e54ebba6d88d6606750db752de95cc3f9c2ed37b012b72e160d4` |

The rejected journey-v1 assets are preserved privately in .runtime/consultancy-journey/retired-public-assets/ and are no longer public assets or referenced by journey-media.ts. No further media generation is planned for this revision.

## Browser architecture

ImmersiveJourney.tsx maintains one master scroll progress, perspective content layers and chapter visibility/inert states. JourneyFilm.ts seeks a paused same-origin MP4 to the matching time in either direction. The static poster appears immediately; video loading starts only after the visitor travels into the journey. It is not an autoplay video background or a visitor-triggered generation. Reduced motion, reading mode and Data Saver avoid movie loading. A light procedural architectural world is the media-failure fallback.

PlatformTour.tsx is a local demonstration. Its Projects, Ask KXRA and Workrooms controls change synthetic examples. The sample answer is fixed, explicitly labelled and performs no API call. Real platform permissions, feature availability and access remain authoritative elsewhere.

The /#contact form reuses the existing protected public enquiry ingress. Homepage CUSTOM_PROJECT submissions use the canonical /submit-opportunity source path, bounded structured fields, consent, origin checks and idempotency. No account, accepted proposal, payment or project commitment is created by submitting an enquiry.

## Security and accessibility

No credential, private context or provider request URL is exposed to the client. Existing same-origin media CSP remains intact. HTML carries headings, controls, navigation and copy; invisible chapters cannot retain interactive focus. Keyboard, direct-link/history, no-JavaScript reading, 320-pixel reflow, zoom and media-error paths are acceptance requirements. No auth/RLS or financial permissions are weakened by the demo.

## Budget evidence

An initial automatic review refused the new paid call because historical spend was unknown. Read-only authenticated billing then showed $1.96 net usage and $38.04 credit. Published model pricing capped the fixed twelve-second text-to-video request at a conservative $9.56 upper bound. The operator added this bound against a stricter $20 project ceiling, a one-request ledger and no automatic submission retries; review subsequently allowed the request.

After completion, the console displayed the new usage transaction as $4.71, total monthly usage as $6.68, remaining credit $33.32 and automatic top-ups off. These are separately reported provider values; do not silently force their displayed rounding to reconcile. The owner's authorisation remains £25 total API spend. No exact GBP charge or currency conversion is claimed. No further funding or generation is requested.

## Verification and release

The focused 28-check desktop/mobile design suite passed, including actual media seeking, same-page navigation, direct links, browser history, synthetic demo/no POST, reflow, reading and media failure. Full isolated CI passed: 254 database/domain/HTTP tests, 44 private browser journeys (six intentional skips), and 46 public browser checks in both development and optimized builds. All builds, dependency checks, persistence/restore, CSP/SRI, artifact/source boundaries, secret scans and bundle budgets passed. Mobile home Lighthouse: performance 0.98, accessibility 1.00, LCP 2312ms, CLS 0, TBT 8ms. Both homepage and dedicated sprint intake persisted successfully against the isolated test database. Additional scene-fit checks passed at 320×720 and 1440×900.

The optimized design preview is http://127.0.0.1:3243/ while its local server runs. Its production enquiry connection is not configured; actual storage acceptance used isolated local infrastructure. The review build is local. No production deployment is authorised by the current workspace instructions. Physical iOS/Safari and hosted release acceptance remain separate.
