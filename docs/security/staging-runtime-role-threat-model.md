# Staging runtime-role threat model

Updated: 27 September 2026.

| Threat | Enforced control | Remaining evidence |
| --- | --- | --- |
| Private OS runs as administrator | Preflight requires `kxra_app`; operator enforces non-superuser/non-owner/non-bypass attributes | Hosted connection and pooled request evidence pending |
| Public site can assume authenticated | `kxra_public_ingress` is a member only of `anon`; hosted ingress always executes `SET LOCAL ROLE anon` | Hosted crafted-call test pending |
| Login silently inherits role authority | Both logins are `NOINHERIT`; request transaction must explicitly select the bounded role | Hosted transaction-reset test pending |
| Existing compromised role is taken over | Unknown memberships, owned objects or direct grants stop apply | Operator must investigate instead of repairing authority |
| Password appears in source, output or tracking | Apply-only environment values, strict base64url length, bound query values and non-secret event record | Provider secret-store inspection and rotation drill pending |
| One secret opens both applications | Passwords must be distinct; OS and marketing environment allowlists reject cross-credentials | Vercel environment inspection pending |
| Pool leakage preserves role or claims | Each application transaction begins, sets a local role and local claims, then commits/rolls back and releases | Hosted pooler concurrency/revocation test pending |
| Worker authority is accidentally activated | Core role operator creates only the app and public-ingress logins | Worker profiles remain separately disabled |

Runtime-role provisioning does not create users, memberships, legal acceptance, entitlements, customers, provider credentials or production authority.
