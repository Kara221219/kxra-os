# ADR 0047: Founding commercial policy

Status: accepted by the owner on 1 October 2026.

## Decision

Launch the founding subscription to business customers only at £29 per organisation per month or £290 per year, exclusive of applicable VAT or other tax. Do not offer a free trial at launch. The subscription renews automatically until cancelled.

Cancellation is available at any time and takes effect at the end of the paid period. Fees for a started period are not refundable except for duplicate or incorrect charges, a legal requirement, or an expressly agreed remedy for material service failure. A failed renewal receives a seven-calendar-day payment grace period. If payment remains overdue, generation and export stop; read-only recovery may continue for up to 30 days before workspace suspension.

Ordinary customer content is scheduled for deletion or irreversible anonymisation within 90 days after workspace closure. Encrypted backups expire within a further 35 days unless a legal hold applies. Custom projects remain separately scoped and priced.

## Rationale

This keeps the launch offer understandable, avoids an unproved free-trial abuse path and gives a small-business customer a practical cancellation and recovery window. Business-only contracting avoids representing the current checkout as consumer-ready. A later consumer offer requires a separate review of pre-contract information, cancellation rights, digital-content consent and renewal controls.

## Activation boundary

The owner approved customer-document pack version 1 at SHA-256 `8277d2cbad017feaf4fea238d9eecedd1e7cfff0aaab6fa80fca5a239a8783a9`. KXRA confirmed that it is not VAT registered. The approved tax wording therefore adds no VAT to the current £29 monthly or £290 annual price; a future registration or other chargeable tax treatment requires an updated commercial decision and customer-facing configuration before collection.

Activation still requires the immutable customer-document database import, complete Stripe test acceptance and release-manifest evidence. This decision does not authorize production publication or live charging.
