// Fresh owned app + independent fence clusters under one serial lease. No URLs/credentials.
process.env.KXRA_GITHUB_EXTERNAL_FENCE_PROOF = "true";
await import("./verify-github-production-outbox.mjs");
