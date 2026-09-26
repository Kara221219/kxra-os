# ADR 0020: Optimized marketing has a deterministic Lighthouse gate

Status: accepted locally on 26 September 2026. Field data and human assistive-technology evidence remain pending.

## Context

Static asset size and browser behavior do not prove loading speed, visual stability or automated accessibility in an optimized build. Google defines current good Core Web Vitals as LCP no more than 2.5 seconds, INP no more than 200 milliseconds and CLS no more than 0.1 at the 75th percentile. Google also states that INP cannot be measured in a lab and recommends TBT as its laboratory proxy.

Sources: [Web Vitals](https://web.dev/articles/vitals), [measuring Web Vitals](https://web.dev/articles/vitals-measurement-getting-started) and [Lighthouse](https://developer.chrome.com/docs/lighthouse/overview).

## Decision

- Lock Lighthouse 13.5.0 as a development dependency and audit only the optimized local marketing server.
- Refuse non-loopback targets and require the production-CSP test marker before launch.
- Audit the mobile homepage and desktop contact route.
- Require performance score at least 0.90, accessibility score 1.00, LCP no more than 2,500 ms, CLS no more than 0.1 and TBT no more than 200 ms.
- Keep the existing page-asset budgets, browser matrix, accessibility-tree assertions and no-JavaScript checks as separate gates.
- Treat the results as repeatable local laboratory evidence. They do not become field Web Vitals or human screen-reader evidence.

The locked transitive licence set adds BSD-2-Clause, MPL-2.0 and `(MIT OR CC0-1.0)` expressions. They are accepted for this development tool; the lockfile still rejects unreviewed sources, integrity gaps and install scripts.

## Consequences

- A performance or automated-accessibility regression fails the complete CI contract.
- Lighthouse audit identifiers and up to five affected selectors appear in a failed gate, making the defect reviewable.
- Real-user 75th-percentile metrics require hosted telemetry and traffic after an authorised staged release.
- Representative human assistive-technology review remains a release gate.
