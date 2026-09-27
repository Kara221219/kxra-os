# Staging migration threat model

## Protected assets

- the selected Supabase staging project and its PostgreSQL schema;
- the privileged, short-lived migrator credential;
- ordered migration history and source hashes;
- application RLS, policies, grants and restricted worker roles;
- the production database, which must never be a target.

## Threats and controls

| Threat                                                     | Control                                                                                                                          | Remaining boundary                                                                    |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Operator points at production or another project           | Exact staging flag, declared 20-character project reference, Supabase hostname/username binding and branch-specific confirmation | Account naming alone is not authority; owner must select the intended staging project |
| Serverless transaction pooler breaks session/DDL semantics | Only direct or session-pooler port 5432 is accepted                                                                              | Real provider connectivity remains untested                                           |
| Connection options alter session behavior                  | Only `sslmode=verify-full` is accepted in the URL; application name and statement timeout are set by code                        | Provider TLS chain and network path need hosted evidence                              |
| Dirty or unreviewed code reaches staging                   | Clean phase branch, pushed HEAD equality, contiguous manifest and exact source count                                             | GitHub branch protection remains an account setting                                   |
| Historical SQL changes after application                   | Stored SHA-256 per filename; any mismatch stops                                                                                  | Database administrator can still alter the database outside this workflow             |
| Partial migration becomes invisible                        | Migration and tracking row share one transaction; session advisory lock serializes operators                                     | Provider outage can leave a clean pending suffix that must be resumed                 |
| Existing manual schema is adopted accidentally             | Existing `kxra` schema without tracked history is rejected                                                                       | Intentional recovery needs a separate reviewed reconciliation procedure               |
| Credential leaks into application or logs                  | Operator variables are rejected by Vercel preflight; script prints counts only; no URL is written                                | Operator shell/history and password-manager hygiene remain owner responsibilities     |
| Incomplete RLS surface is treated as ready                 | Verification requires all 67 hashes, 168 protected tables with policies and 144 exposed functions                                | Hosted behavioral access tests still follow schema verification                       |

## Hard stops

- No project reference, exact TLS URL or exact apply confirmation means no mutation.
- Vercel execution, production configuration, transaction pooling, extra URL options, dirty worktree or unpushed HEAD means no connection or mutation.
- Unknown, changed or unmanaged schema history means no migration.
- Schema verification does not authorize seeds, owner creation, customer access, provider activation or production release.
