# Brand Studio review and export playbook

Status: local operating playbook. It does not authorize remote fetching, external generation, publication or customer use in production.

## Before starting

1. Select the correct organization and project.
2. Confirm the account has a current writable project assignment and current `brand-studio.access` entitlement.
3. Use only content the customer owns or is authorized to process. Record a concrete rights basis and obtain the in-product consent.
4. Do not paste confidential third-party material merely because it is publicly accessible.

## Source and profile

1. For a website source, enter its public HTTPS locator and paste the exact source snapshot. KXRA does not fetch the site in the current product.
2. Review the inferred business name, summary, tone, audiences and offers against the source.
3. Add prohibited claims, required disclaimers, palette and typography through a corrected profile version where needed.
4. Approve only the exact profile version shown. If it is wrong, reject it or create a new draft. Never treat an earlier approval as applying to corrected content.

## Campaign and generation

1. Select the exact approved profile version.
2. State the objective, audience, offer, channels, constraints, success measure and every claim that needs evidence.
3. Approve the exact campaign brief version before generation.
4. Generation reserves the displayed usage before work. If the entitlement is unavailable or exhausted, stop; do not bypass it with another project or manual database edit.
5. Treat every generated variant as a draft. The current adapter is deterministic local text generation and makes no external model or publication call.

## Required export review

Review the exact variant hash and confirm all five checks:

- **Brand:** wording matches the approved profile and campaign.
- **Claims:** each claim is supported, appropriately qualified or removed.
- **Rights:** source inputs, generated treatment and intended use have appropriate rights.
- **Accessibility:** alt text and planned presentation are adequate for the intended channel.
- **Compliance:** required disclaimers and any sector/customer policy are addressed.

If any check fails, choose Request changes or Reject. Edit creates a new child variant; repeat the review on the new exact content. An old review cannot authorize edited text.

## Export and use

1. Create text, Markdown or JSON export only after an exact `APPROVE_EXPORT` review.
2. Download while the membership, project access and `brand.export` entitlement remain current. KXRA rechecks them immediately before returning bytes.
3. Store or use the export according to the customer's approved retention and channel process.
4. Export does not authorize sending, scheduling, spending or publication. Those actions remain outside KXRA OS until a separate provider workflow and approval gate are implemented.

## Failure or suspected misuse

- Revoke the project membership or entitlement to stop the next protected action and download.
- Preserve the source, profile, brief, variant, review, export and delivery IDs for investigation; do not copy private content into general logs or messages.
- Inspect delivery outcomes and Brand Studio product events under the authorized tenant/project context.
- Escalate rights, claims or legal uncertainty to the accountable human reviewer. The five recorded checks are evidence of review, not legal advice.
