# Public marketing and enquiry threat model

Status: local acceptance evidence as of 25 September 2026. No site is published and no real enquiry has been collected.

| Threat | Enforced local control | Remaining staging evidence |
| --- | --- | --- |
| Private project, fixture or customer data enters the public bundle | Separate workspace; no private import path; exact public snapshot; source-boundary and 21-marker artifact scans | Inspect Vercel output, source maps, caches, RSC/prefetch and error pages |
| Unreviewed copy becomes public | Hash-bound `REVIEW_REQUIRED` snapshot; robots no-index; publication flag fixed false | Owner/counsel copy approval and exact release manifest |
| Anonymous caller reads enquiries | No matching anonymous RLS policy; direct select returns zero; owner policy requires current selected-tenant owner | Hosted Data API and pooler verification |
| Caller bypasses the form | Closed database function validates all fields, source/type binding, consent, digests and UUID idempotency | Edge/WAF limits and abuse monitoring |
| CSRF or cross-origin submission | API requires exact configured Origin and JSON | Verify preview/production domains and proxy header behavior |
| Spam or replay floods the inbox | Honeypot discard, daily content fingerprint, idempotency key, transactional hourly digest limit and 20-request concurrent race evidence | Distributed edge rate limit, CAPTCHA decision and production-like load test |
| Caller spoofs rate-limit identity or raw IP becomes durable data | Hosted API accepts only one valid Vercel-overwritten address, ignores caller forwarding headers and HMAC-digests address plus bounded user agent with a server-only secret | Vercel WAF/header staging evidence, retention schedule, key rotation and privacy wording |
| SQL injection or malicious text executes | Parameterized SQL; React output encoding; values have strict lengths and closed enums; exact-hash production script CSP and SRI-protected static script references | Hosted DAST and operational content handling |
| JavaScript/CSS motion or responsive layout makes the site unusable | Server-rendered content, no-JS mail fallback, reduced-motion mode, mobile recomposition, 320 px/200% tests, desktop/mobile accessibility-tree assertions and compressed page-asset budgets | Human assistive-technology review and production-like Lighthouse/Web Vitals |
| Login redirect is abused | Server-owned exact target; only HTTP locally and HTTPS in production; request input cannot select destination | Verify final app domain and callback rules |
| Form storage fails silently | API returns a safe 503 and gives the public contact email | Alerting and provider-failure exercise |

Public enquiries are untrusted input, not evidence, project authority or customer identity. An owner must verify them before response, project creation, pricing or confidential exchange.
