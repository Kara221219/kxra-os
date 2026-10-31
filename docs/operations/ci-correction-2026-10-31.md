# Local CI/security correction — 2026-10-31

Based on exact release candidate `8319b0159474d8b8172b2000d24df209ac7e97a9`; no hosted changes or publication are included.

GitHub CI 41174809303 failed the unchanged 200 KiB OS budget: room operations measured 205,088 compressed bytes against 204,800. Marketing passed. The local baseline measured 204,530 bytes for that route, so local passage did not establish remote passage.

Move the existing ActionButton and readiness hook unchanged into their own client module. Existing Forms imports remain compatible through a re-export; the room recovery server component imports the button directly. This removes unrelated form code from that page without changing confirmation, concurrency, revocation or authorization behavior. All original asset coverage checks and byte limits remain intact.

Update only the follow-redirects lock entry from 1.16.1 to 1.16.2 for GHSA-mrwp-f3q8-3g9p. Axios's existing range permits the patch. The official npm distribution metadata supplied the integrity; a private script-disabled npm ci installed the exact lock. No account/provider credentials were supplied. Synthetic loopback tests cover same/cross-realm sensitive-header arrays, object/array request headers and same/cross-origin redirects, including built-in Authorization/Cookie handling. They contact no provider and send no real secrets.

The initial restricted test invocation stopped at loopback-listen EPERM; it did not establish a product regression. The authorized loopback-capable run passed all 28 focused checks. Broader validation receipts are held outside source. Real hosted recovery, remote Linux size acceptance and exact-source CodeQL analysis remain separate gates. No remote CI rerun, settings change, upload, email or account action was performed.
