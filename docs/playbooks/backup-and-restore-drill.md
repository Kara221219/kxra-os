# Backup and restore drill

Run only against an authorized non-production environment. The automated local command is npm run test:restore.

It requires an initialized disposable KXRA PostgreSQL runtime. The command:

1. inventories migrations, all KXRA table counts, RLS/policies and critical operational state;
2. copies private objects and records byte length plus SHA-256;
3. creates a custom PostgreSQL dump;
4. creates an empty isolated target database and object directory;
5. restores and compares database/object evidence;
6. records a private runtime manifest with result, discrepancies, RPO and RTO;
7. destroys the restored database.

The generated dump, object copy and manifest live under .runtime/restore-drill (or the configured KXRA_RUNTIME) and are ignored. Never commit or transmit them.

A staging drill must additionally record the provider backup identifier, encryption/key owner, region, retention, exact restore target, operator and independent reviewer. It must verify Supabase Auth/Storage policy behavior through non-bypass identities after restore. Any discrepancy fails the release gate and requires a new clean drill.
