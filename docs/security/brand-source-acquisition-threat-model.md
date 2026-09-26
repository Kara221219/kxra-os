# Brand source acquisition threat model

Status: local contract implemented; hosted egress acceptance pending.

| Threat | Control | Evidence |
| --- | --- | --- |
| User targets loopback, metadata, private, reserved or documentation ranges | HTTPS locator validation plus rejection when any DNS answer is not globally routable | `tests/public-web.test.ts`, `tests/brand-source-acquisition.test.ts` |
| Public host redirects to a private target | Every redirect is parsed, DNS-resolved and revalidated before transport | public-web redirect tests |
| DNS changes between validation and connection | Transport receives validated addresses and overrides lookup while keeping the original hostname for TLS SNI/certificate checks | `nodePinnedPublicTransport`; staging observation remains required |
| Missing length streams unlimited bytes | Streaming reader cancels once the one-megabyte cap is crossed | no-content-length stream test |
| Compressed or unsupported content bypasses limits | Worker requests identity encoding and rejects other encodings and unsupported MIME types | public-web contract tests |
| Hostile markup becomes instructions or active content | Script, style, frame, object, template, SVG and markup are removed; output remains untrusted evidence with no tool authority | extraction test and Brand Studio evidence boundary |
| Crafted project/source ID schedules another tenant's work | Request function derives selected tenant and requires current writable project access and entitlement | SQL and HTTP crafted-ID tests |
| User calls worker functions directly | Private functions are revoked from public, authenticated and anonymous roles and granted only to a no-login worker role | SQL direct-call denial and function audit |
| Refresh races with source change | Job binds requested source version; claim and completion cancel stale work under row locks | migration contract and version tests |
| Ambiguous retry duplicates evidence | Client scheduling is idempotent; completion replay returns the existing source version; queue uses leases and bounded attempts | SQL exact-replay tests |
| Refresh silently replaces approved customer decisions | Success creates a new source version only; profile evidence remains linked to its exact prior source version | immutable-version test |
| Worker leaks content or credentials | Database role can only claim/complete; errors store allowlisted reason codes; no credential or raw question enters UI/audit metadata | role grants, scans and worker failure mapping |

Hosted acceptance must additionally prove egress restrictions, proxy behavior, certificate verification, DNS resolver behavior, worker secret custody, concurrency limits, telemetry redaction and recovery after process termination.

