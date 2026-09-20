# File and knowledge threat model

Date: 20 September 2026. Scope: Phase 2 Slice 2 local implementation.

## Protected assets

- private source bytes, filenames, hashes and derived text;
- tenant, project, audience, classification and exact source-version boundaries;
- storage and worker credentials;
- query, citation and delivery authorization evidence;
- processing/reconciliation state and audit history.

## Controls and residual work

| Threat                                                                             | Enforced control                                                                                                          | Residual or staging check                                         |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Caller selects another tenant/project/object key                                   | Server identity plus selected-tenant transaction; project RLS; database-generated opaque key                              | Repeat through hosted pooler and Storage                          |
| Duplicate or ambiguous upload creates multiple objects                             | Stable request UUID, immutable-property comparison, create-only write and hash-based retry recovery                       | Exercise provider timeout/ambiguous Storage responses in staging  |
| Malware, executable, macro, active PDF, archive or MIME deception enters retrieval | Quarantine state, worker-only promotion, bounded local adversarial scanner contract; rejected/failed files have no chunks | Connect and validate a production malware engine/signature feed   |
| Extraction escapes or consumes unbounded resources                                 | Local adapter caps bytes, characters, chunks and accepted types; production processing fails closed                       | Deploy a disposable no-network worker with CPU/memory/time limits |
| Document text instructs the model or expands tools                                 | Chunks are labelled untrusted evidence; no tool-capable model adapter exists                                              | Preserve the boundary in AI capability-broker tests               |
| Partner discovers owner-only or cross-project bytes/chunks                         | Parent record RLS, exact file/version links, current assignment and indexed-state checks                                  | Hosted Storage policy test; no browser bucket listing             |
| Revocation occurs after retrieval authorization                                    | Membership version, project, parent record, source version, hash and state are checked again before byte/answer delivery  | Repeat across distributed staging workers                         |
| Permanent URL survives revocation                                                  | Server-mediated private response only; no signed/public URL is returned                                                   | Confirm CDN and Storage logs/cache behavior in staging            |
| Object and database diverge                                                        | Manifest reconciliation verifies hashes, recovers exact orphan, fails missing/mismatch and quarantines unknown objects    | Complete an empty-target database-plus-object restore drill       |
| Browser forges worker result or lifecycle promotion                                | Worker functions are private to `kxra_worker`; authenticated/anonymous calls are denied                                   | Provision a restricted hosted worker login and rotate it          |
| Sensitive content appears in logs                                                  | Query run stores a SHA-256 and version references; failures redact evidence; worker logs counts/IDs rather than content   | Verify Sentry/PostHog redaction before activation                 |

## Release boundary

Local acceptance uses synthetic bytes and a deterministic scanner/extractor test double. It proves state, authorization, retry and failure behavior only. It is not evidence of a hosted malware service, extraction sandbox, Supabase Storage policy, backup restore, incident response or production data handling.
