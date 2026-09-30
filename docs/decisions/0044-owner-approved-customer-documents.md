# ADR 0044: Owner-approved customer documents

Status: accepted by the owner on 1 October 2026.

## Decision

KXRA does not make solicitor approval a technical or commercial release prerequisite for its customer documents.

Before public sales or unrestricted customer onboarding, KXRA must still complete exact versions of the Terms, Privacy Notice, Cookie Notice, data-processing terms where applicable and custom-project terms. Each document must match the implemented product, data flows and commercial offer, be versioned and hashed, and receive explicit owner approval in the release evidence.

Independent legal review may be commissioned when the owner considers the audience, jurisdiction, regulated activity, contract value or risk to justify it. It is an optional risk-control decision, not a universal platform gate. Clinical, financial, employment, consumer-credit and other regulated project-specific hard stops are unchanged.

The mandatory NDA remains parked under ADR 0041.

## Consequences

- The release manifest requires exact document versions and owner approval, not a solicitor identity or solicitor approval record.
- Placeholders cannot become active agreements or be represented as final customer terms.
- Public copy must describe only implemented behavior, prices, limits, cancellation handling, retention and support routes.
- Material product, data-flow or commercial changes require document review and a new immutable version.
- The platform preserves presentation and acceptance evidence when an approved document is activated.
- Tax and accounting treatment remain separate owner decisions supported by appropriate accounting advice.
- Project-specific professional or regulatory review remains mandatory wherever an existing hard stop explicitly requires it.

## Superseded requirements

This decision supersedes generic requirements in earlier briefs, ADRs, playbooks and handovers that described solicitor-approved customer documents as a universal release blocker. Historical records remain unchanged as evidence of the decision history; current work follows this ADR.
