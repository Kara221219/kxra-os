# ADR 0016: Safe telemetry and recovery evidence

Status: accepted for local implementation; hosted providers remain disabled.

KXRA needs operational evidence without exporting customer, project, prompt, file, identity or credential data. It also needs recovery evidence stronger than restarting the same database.

Telemetry uses the closed KXRA_TELEMETRY_V1 envelope. Event names and metadata keys are allowlisted; values are bounded scalars; identity/content/secret-shaped keys and values fail closed. Provider adapters may receive only this validated envelope. Autocapture, session replay, request bodies and arbitrary exception context are outside this contract.

The local recovery drill creates a custom PostgreSQL dump and private-object hash manifest, restores into a newly created empty database and separate object directory, compares every KXRA table row count, migration history, RLS/policy state and selected operational-state counts, then deletes the target. The manifest records hashes, RPO/RTO, discrepancies and reviewer. Runtime backup material remains ignored and must never enter Git.

This proves the local contract. Hosted encryption, retention, geographic placement, scheduled backups, restore permissions and provider telemetry configuration require separate staging evidence.
