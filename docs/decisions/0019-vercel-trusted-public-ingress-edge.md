# ADR 0019: Vercel is the trusted public-ingress edge

Status: accepted locally on 26 September 2026. Vercel WAF configuration and hosted evidence remain pending.

## Context

The public enquiry limit needs a stable client-address digest without storing a raw address. An arbitrary `x-forwarded-for` value is caller-controlled unless the hosting edge overwrites it. Vercel documents that it overwrites `x-forwarded-for` to prevent spoofing and provides the equivalent `x-vercel-forwarded-for`. Vercel also documents that a proxy in front of Vercel prevents the external client address from being forwarded unless the Enterprise Trusted Proxy feature is enabled.

Sources: [Vercel request headers](https://vercel.com/docs/headers/request-headers) and [Vercel WAF rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting).

## Decision

- A hosted public-ingress request is trusted only when `VERCEL=1` and `x-vercel-forwarded-for` contains one valid IPv4 or IPv6 address.
- A caller-supplied `x-forwarded-for` never supplies hosted rate-limit identity.
- Missing, malformed or multi-value Vercel identity fails with the bounded unavailable response before database access.
- The local fixture may read the first `x-forwarded-for` hop only when the configured marketing origin is loopback and the isolated runtime is present. Every fixture value must still be a valid network address.
- Cloudflare remains DNS-only for the initial Vercel deployment. It must not proxy application traffic unless Vercel Trusted Proxy is purchased, configured and verified in staging.
- Vercel WAF must add an IP/JA4 rate rule for `/api/enquiries` before publication. PostgreSQL's five-per-hour HMAC-digest window remains the authoritative application backstop.

## Consequences

- The application does not support an unreviewed self-hosted production edge.
- The deployment checklist must record the Vercel WAF rule, window, limit, action, owner and rollback evidence.
- A future edge change requires a new decision and spoofing tests; adding another header fallback is prohibited.
- Raw client addresses remain transient. Only the existing server-secret HMAC digest is stored.
