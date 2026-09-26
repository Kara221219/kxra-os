# ADR 0018: Static marketing CSP and subresource integrity

Status: accepted locally on 26 September 2026. Hosted deployment evidence remains pending.

## Context

The public marketing pages are prerendered for simple delivery and caching, but Next.js emits inline React Server Component bootstrap scripts. A request nonce would require dynamic rendering. Leaving production `script-src 'unsafe-inline'` would permit any injected inline script.

## Decision

The marketing build uses two isolated passes with one opaque build ID. The first pass collects SHA-256 hashes for every inline script in every generated HTML page. The second pass embeds that exact closed hash set in the production CSP. The build fails if the final inline scripts differ from the collected set.

Next.js SHA-256 subresource integrity is enabled. After the final build, every static HTML script reference receives the exact integrity value from the generated SRI manifest. Verification rejects missing or stale hashes, missing integrity attributes, script `unsafe-inline` or `unsafe-eval`, script attributes, and a CSP above the recorded header-size ceiling.

The complete marketing browser suite runs once against development and again against the optimized production server. The production pass asserts the exact-hash response policy and exercises hydration, forms, reduced motion, reflow, no-JavaScript fallback and the representative accessibility tree.

## Consequences

- Marketing builds intentionally run twice and take longer.
- Any framework or content change that alters inline bootstraps must produce a stable new hash set in the same build; drift fails closed.
- A direct production build outside the repository build wrapper receives no inline hashes and therefore blocks inline scripts. CI and release use the wrapper.
- The dynamic private OS continues to use per-request nonces. The public site remains prerendered.
- `style-src 'unsafe-inline'` remains because current React/Next rendering uses inline style behavior; script execution is the control closed by this decision.
- Vercel/Cloudflare header preservation and header-size behavior still require staging verification before publication.
