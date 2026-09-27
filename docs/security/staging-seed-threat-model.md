# Staging canonical seed threat model

Updated: 27 September 2026.

| Threat | Enforced control | Remaining evidence |
| --- | --- | --- |
| Local fixture users or authority enter staging | Canonical-only importer returns before all fixture/executable contracts; integration test proves sensitive tables stay empty | Hosted verification follows connection |
| Seed targets the wrong database | Same exact Supabase project, operator role, TLS, port, branch and clean/pushed-head guards as schema migration | Owner must supply the separate staging project |
| Source registers change after review | Profile hash binds every included file; changed hash or profile stops | A future register revision needs a new profile decision |
| Existing unmanaged portfolio data is adopted | Fixed organization, project source and canonical record presence without tracking fails closed | Operator investigates rather than overwriting |
| Concurrent operators duplicate or partially import | Session advisory lock, state recalculation under lock and one transaction for import plus tracking | Hosted interruption/retry evidence remains pending |
| Tracking marker exists while data drifted | Verification checks project IDs/data hashes, exact record code set and reruns importer validation inside a rolled-back transaction | Database administrator compromise remains outside app controls |
| Browser reads or changes seed history | Explicit revoke from PUBLIC, `anon` and `authenticated`; table is outside `kxra` API schema | Hosted grant inspection remains pending |
| Seed activates AI, routines, legal terms, billing or providers | Fixture/model/budget/routine/legal checks remain empty and no activation data is imported | Each future capability needs its own approval and acceptance evidence |

The seed operator does not create owner accounts, login passwords, approved legal content, paid plans, entitlements, customers, subscriptions, secrets or external side effects.
