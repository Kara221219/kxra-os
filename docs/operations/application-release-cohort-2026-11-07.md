# Application migration cohort, 7 November 2026

The separate `database/releases/application-v1` directory materializes the exact canonical 117 migrations plus eight existing production payloads in dependency order: AI admission118, review119, GitHub outbox120, paired admission121, setup policy122, setup options123, custom apps124 and original-session attestation125. All bytes match their source at b763774. Canonical fixture118/119 and the original production payloads remain unchanged. External GitHub/paired fence SQL is separately pinned and must never be installed in the application database.

This is a concrete application migration artifact, not a complete hosted release. The existing hosted117 operator/guard is unchanged and cannot apply this cohort. No flags, credentials, customer policy, grants, seed approvals or hosted state were changed. Deploying the application still requires target ledger reconciliation, approved backup/restore and a reviewed target-bound executor; do not feed this directory to an initialization-only operator or rename a target's existing fixture history.

## Verified evidence

At combined source0b5d4535e62f7874c6e01b5801c162900f83da59 (including cancellation guard eb818e), the local-only native verifier passed:

- Exact canonical117 hash/provenance ledger and every118–125 payload.
- Injected failure after each migration's DDL and ledger insert, followed by exact catalogue/data/ACL/enum/role/membership/ledger rollback and successful retry.
- Committed-ledger reconciliation omits the just-committed migration. This is not an injected connection-loss test.
- Independently fresh125 installation matches upgraded117→125 catalogue and exact ledger.
- Dump/restore into a verified-empty database preserves the source catalogue, data, sequence state and ledger.
- No old-session backfill, fixture pairing schema or external-fence schema; owned cluster shutdown and fixture lease release confirmed.

The test uses synthetic Auth sessions and fresh databases within one owned Unix-socket-only cluster. Global roles are shared, not independently provisioned on another cluster. Data includes canonical migration data, a sentinel, one account and one preexisting Auth session; it does not populate every new feature. Prior feature-specific native acceptance remains separate. Real Supabase hook ordering, session lifecycle and hosted identity are unverified by this rehearsal.

The source verifier and 22 source/planner regressions pass, including altered/missing/extra files, symlinks, reordered manifest, external-domain mistakes and nonmatching ledger prefixes. Independent source review confirmed all125 byte copies and fixed a preflight lease-cleanup issue. No remote publication or hosting result is claimed. GitHub currently cannot resolve b763774; final combined source still needs aggregate acceptance and publication.

## Next composition

Hosted paired setup separately requires a live original-session fence and safe runtime composition. Do not enable it from this cohort alone. Integrate the reviewed additive session-aware setup payload and exact source transitions, then repeat final cohort and aggregate acceptance. Other missing service custody, independent fencing, provider and full signup/payment/use acceptance remain required for the full product.
