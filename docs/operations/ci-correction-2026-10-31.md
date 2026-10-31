# Local CI/security correction — 2026-10-31

Based on exact release candidate `8319b0159474d8b8172b2000d24df209ac7e97a9`; no hosted changes or publication are included.

GitHub CI 41174809303 failed the unchanged 200 KiB OS budget: room operations measured 205,088 compressed bytes against 204,800. Marketing passed. The local baseline measured 204,530 bytes for that route, so local passage did not establish remote passage.

Move the existing ActionButton and readiness hook unchanged into their own client module. Existing Forms imports remain compatible through a re-export; the room recovery server component imports the button directly. This removes unrelated form code from that page without changing confirmation, concurrency, revocation or authorization behavior. All original asset coverage checks and byte limits remain intact.

Update only the follow-redirects lock entry from 1.16.1 to 1.16.2 for GHSA-mrwp-f3q8-3g9p. Axios's existing range permits the patch. The official npm distribution metadata supplied the integrity; a private script-disabled npm ci installed the exact lock. No account/provider credentials were supplied. Synthetic loopback tests cover same/cross-realm sensitive-header arrays, object/array request headers and same/cross-origin redirects, including built-in Authorization/Cookie handling. They contact no provider and send no real secrets.

The initial restricted test invocation stopped at loopback-listen EPERM; it did not establish a product regression. The authorized loopback-capable run passed all 28 focused checks. Broader validation receipts are held outside source. Real hosted recovery, remote Linux size acceptance and exact-source CodeQL analysis remain separate gates. No remote CI rerun, settings change, upload, email or account action was performed.

## Compact sprint choices follow-up

The OS commercial client now imports canonical key/name sprint choices and constraint formatting directly from `packages/business-sprints/options.ts`. The full marketing catalogue spreads those same choices; the package index retains its existing `sprintConstraints` API. A serialized comparison with `4bc14c7` found the full catalogue identical, including prices, scope, milestones and order. Four focused sprint tests passed, covering draft behavior, compact/full equivalence, exact constraint formatting, whitespace trimming and invalid keys.

A private copy-on-write dependency clone supported an offline OS production build with a scrubbed environment. The unchanged strict budget parser checked all 17 OS pages: room recovery measured 204,302 bytes, the OS catchall 203,454, and every other page at most 173,213, against the original 204,800-byte limit. Relative to the preceding reported room measurement of 204,726 bytes, this is a 424-byte reduction and leaves 498 bytes of headroom. This margin remains smaller than the historical 558-byte remote/local difference; remote size acceptance is still unproven. No budget parser, authentication, server authorization, financial calculation, price or proposal terms changed. No service, database, browser, network or hosted action was used for this follow-up.
