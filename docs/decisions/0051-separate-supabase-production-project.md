# ADR 0051: Separate Supabase production project

Date: 5 October 2026  
Status: Accepted

## Context

The governed staging release candidate is evidence-only `READY`, but staging contains synthetic identities, provider test state and release evidence that must not become customer production data. A commercial KXRA launch needs a separate database, Auth tenant, Storage boundary, API credentials, backups and usage ledger.

The owner approved the approximately $10 monthly compute charge after reviewing the expected platform costs. Supabase project creation is infrastructure provisioning only; it is not authority to migrate data, connect an application, enable live billing, publish a domain or onboard customers.

## Decision

KXRA uses Supabase project `lhbgeucifxxcdoyrnesf`, named **KXRA Production**, as the only intended production Supabase target. It uses Micro compute in `eu-west-2` (West Europe, London). The Data API is enabled, automatic exposure of new tables is disabled and automatic RLS for new public tables is enabled.

Staging project `jlebgsxcvhvpueuibekd` remains a separate non-production environment. Production receives schema and approved canonical data through a dedicated guarded bootstrap; staging databases, Auth users, provider test records and Storage objects are never copied wholesale.

The production project reference is not a credential. Database passwords, publishable/secret keys, connection strings and certificates remain outside Git and chat. Runtime services receive only their own least-privilege credentials through provider secret stores.

## Consequences

- Supabase organisation cost increases by approximately $10 per active month, billed hourly and subject to applicable tax and overages.
- Production is currently empty and healthy. No KXRA migrations, roles, owner identity, canonical seeds, customer documents, commercial plans or provider configuration have been applied.
- The existing staging operators remain staging-only and must reject this project reference.
- Production initialization requires a separately reviewed operator, exact target binding, immutable migration hashes, verified TLS, clean reviewed source, a dry-run plan, recovery evidence and explicit release authority.
- Vercel Pro was subsequently activated under ADR 0052. Separate production environment configuration is still required before public customer use.
- Live Stripe, external AI, WhatsApp, public email campaigns, generated-media spend and customer onboarding remain separately gated.
