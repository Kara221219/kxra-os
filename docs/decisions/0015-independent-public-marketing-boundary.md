# ADR 0015 — Independent public marketing boundary

Date: 25 September 2026. Status: accepted for local implementation; publication disabled.

## Decision

KXRA's public website is a separate Next.js workspace at `apps/marketing`. It builds independently from the private OS and may import only its exact public snapshot and its narrow public-ingress module. It cannot import private OS pages, data loaders, fixtures, customer records or Genesis source material.

Public copy comes from `publication-v1.json`, whose exact SHA-256 is pinned in `publication-manifest.json`. Both declare `REVIEW_REQUIRED` and `publicationEnabled:false`; application source cannot switch publication on. Production indexing, Vercel release and DNS remain separate release decisions.

Public enquiries enter PostgreSQL only through `kxra.submit_public_enquiry`. The function validates a closed form type, path, content bounds, consent, opaque request digest, idempotency key and daily content fingerprint. PostgreSQL enforces a five-request hourly window. Anonymous callers receive no row visibility. Current KXRA owners can read accepted rows under RLS; the private Idea Inbox labels all entries `UNVERIFIED`.

The homepage uses original HTML/CSS depth planes. Its document order is the reading and focus order. Reduced-motion and narrow-screen media queries remove sticky/scroll-linked movement while preserving the same content. Forms retain a mail link when JavaScript is unavailable.

## Consequences

- Marketing and private OS require separate Vercel projects and least-privilege environments.
- Marketing receives no private OS database connection. A hosted deployment needs a dedicated login that can assume only the anonymous ingress role and execute the bounded RPC.
- Legal pages remain clear review placeholders and block public release.
- Public form email and message content are personal/untrusted data. They stay owner-only and must receive approved retention and response processes before launch.
- CSP currently permits framework inline scripts; a production nonce/hash policy remains a release-hardening task.

## Evidence

Migrations `0056`–`0057`, `tests/public-marketing.test.ts`, `tests/marketing-e2e/marketing.spec.ts`, the publication/source/build verifiers and the clean hermetic CI contract.
