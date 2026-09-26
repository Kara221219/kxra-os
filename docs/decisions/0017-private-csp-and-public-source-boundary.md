# ADR 0017: Private CSP and public-source boundary

Status: accepted and verified locally; staging transport evidence pending.

KXRA OS renders private customer and project data and therefore needs a script policy that does not authorize arbitrary inline JavaScript. Future Brand Studio website refresh also needs an SSRF boundary that survives redirects and DNS answers.

The dynamic private OS issues a new UUID nonce in middleware for every document request. The nonce is supplied to Next.js through the request CSP and returned in the response CSP. Script execution is limited to self, the nonce and strict-dynamic; script attributes are disabled. Development alone permits unsafe-eval for framework tooling. Inline script is not allowed. Existing inline React styles mean style-src still permits inline styles and remains a later hardening item.

Static marketing delivery keeps its separate policy. It will not be silently converted to dynamic rendering merely to share the OS nonce strategy. A reviewed hash/SRI approach or framework-supported static nonce alternative is required before removing its current script unsafe-inline allowance.

Remote public-source acquisition uses a transport-neutral contract. Every initial URL and redirect must be public HTTPS without credentials or a nonstandard port. Every hostname is resolved at each hop; empty, private, loopback, link-local, carrier-grade NAT, documentation, multicast and reserved answers fail closed. The eventual transport receives the approved addresses and must pin its connection to one of them. Redirect count, timeout, content type, declared length and actual body size are bounded. No production transport is connected by this decision.
