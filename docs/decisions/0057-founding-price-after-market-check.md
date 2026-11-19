# ADR 0057: Founding price kept after a November 2026 market check

Status: decided for this branch on 11 November 2026. It confirms ADR 0045 and ADR 0047. It does not turn on live card charges.

## Decision

The founding workspace price stays **£29 a month or £290 a year** for one organisation. VAT is not added, because KXRA is not VAT registered. Team remains £79 a month for up to five people. Business remains £199 a month for up to fifteen. Decision Review remains £250. A Business Improvement Sprint remains £750. Checkout, the pricing page and the current-offer notice on the terms must use these amounts and no others.

## Why this is still the best founding price

Checked on 11 November 2026:

- Kylon charges from $50 a month per workspace and includes model credits. [kylon.io/pricing](https://kylon.io/pricing)
- Dust charges about €30 a month per person for a Pro seat, with credits included. [dust.tt/home/pricing](https://dust.tt/home/pricing)
- Relevance AI Pro is $29 a month, or $19 if paid yearly. [relevanceai.com/docs/get-started/pricing](https://relevanceai.com/docs/get-started/pricing)
- ChatGPT Business is sold per person. OpenAI’s pricing page no longer prints a simple monthly figure in text. A 5 November 2026 comparison still cited about $25 a person each month.
- Lindy is priced per active person, about $50, in an 18 October 2026 comparison.

KXRA does not include model credits. The customer pays OpenAI, Anthropic or another provider directly. The software fee should therefore sit under Kylon’s $50 entry. £29 is about $38. £290 a year is ten months’ price, which is the usual two months free, and it is the annual price already decided in ADR 0045. Charging Kylon’s rate while asking the customer to pay for models as well would be the weaker offer.

## What this does not do

Live Stripe charges stay off until the owner sets live keys and the live flags. Test checkout must charge these same amounts and no studio prices.
