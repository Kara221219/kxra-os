# Higgsfield visual production

User authorised API access and up to £25 total on 12 October 2026. Do not start subscriptions or repeat failed billable requests automatically. MCP workspace showed zero credits; this does not establish API-account balance. No API credentials were configured at initial inspection.

Official references: https://docs.higgsfield.ai/docs/how-to/sdk and https://console.higgsfield.ai/models/bytedance/seedance-2.5/text-to-video/api-reference . Model-specific parameters take precedence. SDK @higgsfield/client/v2 runs only server-side. Use HF_CREDENTIALS in ignored .env.local; never paste into chat, logs, browser bundles, Git or documentation.

Secure local entry: run scripts/higgsfield-local-setup.mjs, use its loopback page, enter key-id:key-secret and Save locally. The form saves with mode 0600, validates host/origin/token and never generates or charges. API account funding and permissions are checked separately.

## Hero video prompt

A single uninterrupted five-second cinematic camera move through an original architectural sculpture representing a business problem becoming a clear execution path. Deep midnight navy environment, brushed dark-metal rectangular planes and warm champagne-gold edge light. Begin with three elegantly offset planes at different depths; glide slowly forward along the central axis as they resolve visually into an ordered pathway leading to one illuminated opening. Refined editorial composition, restrained contrast, realistic material shading, soft volumetric depth, clean negative space across the left half for HTML headline. Camera level, no spinning, no sudden cuts, no flashing. No people, offices claiming to be ours, logos, typography, interface text, charts, money, recognisable brand assets or fabricated business results. End with a calm composition suitable for a gentle loop. Premium architectural photography, subtle motion, no neon gaming aesthetic, no exaggerated lens distortion.

Settings: bytedance/seedance-2.5/text-to-video; duration 5; resolution 720p; aspect ratio 16:9; MP4; generate_audio false. Request one result, review it before requesting another. Published “from” pricing is not an exact quote; verify this configuration's cost before a paid run and record expenditure against the £25 cap.

## Image direction

Derive an approved still from the completed video for a lightweight mobile/reduced-motion poster. Keep headlines, CTA and labels in accessible HTML rather than generated pixels. If the generated composition does not meet QA, retain the existing procedural sculpture and record the failed attempt; do not falsely attribute it to Higgsfield.

## QA

Check geometry, continuity, exposure, motion sickness, compression, text contrast, asset provenance and load size. Strip audio, create WebM/MP4 alternatives only where useful and use a poster with no autoplay for reduced motion. Store generation records privately; publish only approved derived assets. Never use client inputs in generation without explicit purpose-specific approval.


## Exact SDK setup example

`scripts/higgsfield-example/index.ts` is the server-only example for the documented sunset prompt, 5 seconds, 720p and 16:9. The established npm entry point loads `.env.local` at runtime. The 13 October verification attempt returned an authentication rejection, not a video URL. Connection verification remains blocked until a fresh ID and one-time secret are entered locally; the private ledger must be inspected before a deliberate retry. API funding is separate from plugin credits.


## Latest provider verification — 15 October 2026

The complete single copied credential was saved locally and accepted by the API. The exact SDK sunset example was submitted once and returned `nsfw` with no video URL (request `68a96053-9691-42aa-b172-5c0f2c522754`). Generation verification remains incomplete; do not automatically retry moderated requests or claim artwork is ready. Actual provider billing is unknown. No further credit purchase is needed merely to investigate this result.


## Consultancy artwork completed — 15 October 2026

A separate owner-requested architectural prompt completed successfully as request `fc9a38d0-1752-4585-8de0-72589451cda1`. Inspected footage is integrated locally into the consultancy homepage, with same-origin optimized MP4/poster, real forward/reverse scroll seeking, motion controls and failure fallbacks. This successful production artwork supersedes the earlier generation blocker; it does not change the historical sunset test moderation result. See `docs/architecture/consultancy-scroll-journey.md`. Actual provider cost remains unknown. No further generation or top-up is requested.


## Current direction supersedes dark artwork

The owner rejected the navy/brass/ivory treatment. The current homepage uses the completed twelve-second industry walkthrough a1ce194f-7f01-4444-a12e-45ac7f122a83 in white/graphite/signal red. The authoritative production brief, provenance, observed billing and acceptance are in docs/architecture/consultancy-scroll-journey.md and ADR 0054. Earlier prompts and rejected assets above are historical evidence, not instructions to repeat them. No additional generation is planned.
