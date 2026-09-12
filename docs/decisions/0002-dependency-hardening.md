# ADR 0002 — Patch the CSS dependency within the selected platform

Date: 2026-09-11. Classification: EXTERNAL RESEARCH for the advisory; DECISION for the engineering remedy.

The production dependency audit identified an old transitive PostCSS release under Next.js. Keep the selected Next.js platform and pin a compatible PostCSS 8.5.28 override; verify the installed tree, audit, production build and UI workflows after updating the lockfile.

The [maintainer advisory](https://github.com/postcss/postcss/security/advisories/GHSA-fxqj-rqcc-2cmp) identifies the incomplete source-map path validation fix and patched boundary (8.5.23). The [release history](https://github.com/postcss/postcss/releases) and npm registry were checked on the date above. Revisit the override when a tested Next.js release incorporates an unaffected dependency.

No user CSS is currently processed. This does not justify retaining an avoidable vulnerable dependency.
