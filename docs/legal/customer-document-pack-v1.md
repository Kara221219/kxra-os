# KXRA customer-document pack version 1

Status: owner review required; not in force.

The canonical draft is `apps/marketing/content/legal-draft-v1.json`. It contains the five release-gated document types:

- Business Subscription Terms;
- Privacy Notice;
- Cookie Notice;
- Data Processing Terms; and
- Custom Project Terms.

The pack identifies KXRA GROUP LTD, company number 17435511, at its Companies House registered office. It restricts the founding offer to business customers, records the £29 monthly/£290 annual offer and exact usage limits, and defines the proposed cancellation, refund, failed-payment, retrieval and retention policies in ADR 0047.

## Activation process

1. Review the rendered routes `/legal/terms`, `/legal/privacy`, `/legal/cookies`, `/legal/data-processing` and `/legal/custom-projects` on desktop and mobile.
2. Confirm VAT status and the final support, privacy and security contact routing.
3. Approve or amend ADR 0047.
4. Record explicit owner approval for the exact JSON bytes and generated document hashes.
5. Import immutable approved versions into `kxra.legal_documents`; do not mutate or replace the historical placeholders.
6. Bind the exact document references into the release manifest and run the complete release check.

Independent legal review is optional under ADR 0044. A material product, provider, data-flow, audience or commercial change requires a new document version.

## Research basis

- [Companies House public company record](https://find-and-update.company-information.service.gov.uk/company/17435511) for KXRA GROUP LTD, company 17435511.
- [ICO right-to-be-informed guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-privacy-information-should-we-provide/) for controller identity, purposes, lawful bases, recipients, transfers, retention, rights, complaint information and automated decision-making.
- [ICO PECR cookie guidance](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/cookies-and-similar-technologies/) requiring consent for non-essential storage and permitting the strictly necessary exemption only where storage is essential to the requested service.
- [GOV.UK online-selling guidance](https://www.gov.uk/online-and-distance-selling-for-businesses/online-selling) for clear pricing, payment obligation, reproducible terms, contract confirmation and rolling-contract termination information.
