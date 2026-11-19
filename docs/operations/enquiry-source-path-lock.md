# Why a new enquiry path cannot be added yet

11 November 2026.

The homepage and Let’s connect forms should store `/` and `/lets-connect` as the enquiry source. The database check written in migration `0056_public_marketing_ingress.sql` allows only `/partner`, `/submit-opportunity` and `/contact`.

An additive migration `0120` would be the correct change. It would not edit migration 0056. It would add `/` and `/lets-connect` to the check and to `kxra.submit_public_enquiry`.

That file is rejected before it can be applied:

1. `scripts/staging-migrations-core.mjs` `migrationManifest` lists every SQL file in `supabase/migrations` and hashes it.
2. `scripts/production-release-strategy.mjs` `integrationReleaseSource` requires that list to equal, name and hash, the 117 hosted migrations plus the two pinned fixture files `0118` and `0119`.
3. A new `0120_*.sql` is not in that list, so the function throws `RELEASE_STRATEGY_SOURCE_HASH_OR_SET_CHANGED`.
4. Putting `0120` into the expected list means editing `production-release-strategy.mjs`.
5. `packages/release/production-github-integration-v1.json` pins the hash of that script.
6. `tests/support/composition-policy-bytes.ts` then refuses the changed JSON. The only file allowed to differ from its historical hash is `.env.example`.

So the lock forbids even an additive migration. Owner approval that would unlock it is a reviewed change to all three of those pins together: the expected migration set, the strategy script hash, and the composition allow-list. Until that review, the forms keep a legal source path and write the real page into the message: `Submitted from /` or `Submitted from /lets-connect`.
