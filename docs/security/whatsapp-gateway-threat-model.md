# WhatsApp gateway threat model

Status: local authority contract; Meta transport is disabled.

| Threat | Control | Evidence |
| --- | --- | --- |
| Phone impersonates an account | Authenticated account creates a one-use challenge bound to phone digest and exact WABA/number; worker completes exact match only | AT-15 SQL tests |
| Raw phone/token leakage | Only SHA-256 digests persist; raw pairing code is returned once | HTTP/database test |
| Challenge guessing/replay | Ten-minute expiry, five-attempt ceiling, membership-version binding and completed-state replay denial | AT-15 tests |
| Forged webhook persistence | Application must verify Meta HMAC over exact raw bytes before the worker function; browser roles cannot call ingress | Domain and grant tests |
| Duplicate provider delivery | Provider event and message ids are unique; three copies return one message | AT-16 test |
| Cross-project retrieval | One explicit active selection plus current membership/project reauthorization; no all-project fallback | Crafted-project and revocation tests |
| Model expands intent/authority | Closed intent enum; project and permissions are database facts; no model pairing or approval path | Schema/function audit |
| Hostile media enters context | Media starts `NOT_FETCHED`; production fetch, quarantine scan and extraction are absent; voice requires consent and clean scan before transcription | Media-state test |
| Reply after revoke/takeover | Pairing/access versions are snapshotted and rechecked; revocation cancels pending intents | Revocation test |
| Accidental external send | Adapter is constrained to `DISABLED`; delivered/sent state is impossible | Database constraints |

Remaining staging risks are Meta callback verification/rotation, encrypted system-user token custody, media-origin and redirect controls, production scanning/transcription retention, distributed delivery ambiguity, rate limits and human takeover operations.

