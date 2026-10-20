# Verification — workrooms and studio retirement

Date: 16 October 2026. Environment: isolated local PostgreSQL, generated fixture sessions and loopback-only application servers. No hosted environment or real credentials used.

Status: **PASS — local full verification**. `npm run test:ci` exited 0; `git diff --check` passed.

| Check | Observed result |
| --- | --- |
| Domain, database, HTTP and security | 257 passed, zero failures |
| RLS/migration inventory | 82 migrations; 174 protected tables |
| Private desktop/mobile browser journeys | 48 passed; 6 intentional project-specific skips |
| Public development browser journeys | 42 passed |
| Public optimized-production browser journeys | 42 passed |
| Restart and empty-target restore | Passed; 174 tables, 3,015 rows and 15 objects restored |
| Optimized application builds | OS, marketing and email-worker passed |
| CSP/SRI and bundle budgets | Passed; OS 167.6 KiB and marketing 118.8 KiB largest compressed page assets |
| Publication/secret scan | 546 files passed |
| Mobile home performance/accessibility | 98/100 and 100/100; LCP 2,304 ms; CLS 0 |
| Desktop contact performance/accessibility | 100/100 and 100/100 |

Local detailed output: `.runtime/workrooms/ci.log` (not for publication). Initial run caught obsolete pricing expectations; the corrected full run passed. These results describe this uncommitted workspace revision, not the baseline commit alone.

## Verified story

An assigned contributor opens a project workroom, creates a discussion and reply, reloads them from PostgreSQL and exports only that shared discussion. An owner prepares a private advisory brief, records a reviewed assessment, reloads the computed ranking and exports the review pack. Neither operation changes permissions, sends content externally or executes work.

## Tests

- `tests/workrooms.test.ts`: deterministic weights, ties, malformed scores, duplicate options, strict input fields and prompt boundaries.
- `tests/workrooms-http.test.ts`: anonymous access, unassigned project, viewer writes, forged author, idempotent replay/conflict, cross-project parent ID, private-note exclusion, authenticated SQL isolation, revocation, owner-only board, stale review and private exports.
- `tests/e2e/workrooms.spec.ts`: desktop/mobile discussion and review save → reload → export; no horizontal overflow.
- Retirement HTTP/browser tests: no studio links in catalogue; old API routes fail closed; plans unavailable and new checkout paused. Public retirement pages, sitemap and reviewed pricing tested on desktop/mobile.
- Legal regression: historical approved pack remains intact; current pricing no longer advertises retired allowances; rendered legal notice distinguishes history from current offer.

## Issues found and fixed

1. Saved review data contains server audit metadata. Strict request parsing was incorrectly reused when rendering that stored object, hiding the ranking after reload. Stored core fields are now validated while allowing the server metadata; external request schemas remain strict. Browser save/reload checks cover this.
2. Existing public tests required the removed £29 studio subscription and creative allowances. They now enforce paused subscription sales while retaining exact historical legal-pack expectations.

## Limits

These checks do not certify a production deployment or live AI deliberation. No AI provider, REA executable, desktop agent bridge, external email or billing transaction was activated. Historical hosted attestations predate this change.
