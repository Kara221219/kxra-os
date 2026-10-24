# Workspace terms delivery source

The app route `/legal/workspace-terms?sha256=<64 lowercase hex>` serves only exact
UTF-8 text from `packages/legal/published-workspace-terms.server.ts`. Its frozen
published catalogue is empty. The route currently returns a fixed 404 with
`Cache-Control: no-store`; no terms have been drafted, approved or published.

An entry requires the owner's exact final text bytes, a publication approval
reference and canonical UTC approval date, and explicit
`OWNER_APPROVED_FOR_PUBLICATION` / `PUBLIC_WORKSPACE_TERMS_TEXT` markers. Its key
must equal the SHA-256 of those bytes. Preserve Unicode, byte order marks, line
endings and final newlines. A future explicit owner-reviewed source commit may add
approved public bytes and their approval record. No request, header, environment
variable, private legal-document row or remote source can populate this catalogue.
Only the text bytes are returned; publication records stay in the server module.

Actual workspace terms, VAT treatment and public publication approval remain owner
inputs. This route does not approve agreements, activate policies or billing, or
configure the provider. After exact bytes and public release are approved, use the
app's own origin and the exact hash URL when reviewing checkout presentation and
the provider account's terms URL. Root owns build/browser verification, including
final response headers through the existing middleware, which remains unchanged.
