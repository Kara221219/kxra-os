# Source-only publication guard, 7 November 2026

## Scope and provenance

This candidate is based on accepted local source `fa49a0f1173c3d1896bf9b796c6b2d9ef78bc399`. It prepares source publication only. It does not authorize or perform a push, merge, deployment, provider setting change, database operation, credential change, payment or feature activation.

The candidate adds `git.deploymentEnabled: false` in `apps/os/vercel.json`, `apps/marketing/vercel.json` and `apps/email-worker/vercel.json`. All other application source, historical manifests and pins, SQL, package locks, workflow definitions and deployment allow boundaries remain unchanged. Documentation additions describe this candidate without changing historical acceptance claims.

The intended repository is the existing public [Kara221219/kxra-os](https://github.com/Kara221219/kxra-os), repository ID `1366664492`, default branch `codex/genesis-foundation`, confirmed through the GitHub connector on 7 November 2026. Publishing a new branch exposes its complete reachable source and history publicly; it is not a private backup.

## Why these three roots

Read-only Vercel API inspection found six projects in team `team_rcuJ4xQGKvLPetIFH3ceILH6`. The three staging projects link this repository, with roots `apps/os`, `apps/marketing` and `apps/email-worker` and production branch `codex/genesis-foundation`. Each currently has `commandForIgnoringBuildStep: "exit 0"`. The three corresponding production projects have the same roots and no Git `link` field in the API response. Absence is not a null-valued field.

Vercel documents project configuration at each app root and `git.deploymentEnabled: false` as preventing automatic deployments from commits. An ignored build command is weaker: deployment creation and entry into the build phase precede cancellation. The guard files use the boolean form to avoid an accidentally permissive branch pattern or conflicting true rule.

This is a documented suppression plan, locally validated. No first-push experiment has been performed. The current provider inventory should be rechecked immediately before any authorized publication; a newly linked project with a different root would require its own reviewed guard.

## First-push sequence, only after separate publication authorization

1. Obtain independent review of the exact candidate commit and full public-source scope. Compare its reachable commits and trees with currently verified remote refs, and review and secret-scan every newly published reachable commit/tree, including historical blobs, paths and commit metadata. A clean tip and a current-tree secret scan are not historical publication clearance: deleted secrets or private material can remain in an ancestor. If remote reachability cannot be established, conservatively review the entire reachable candidate history. STOP if this review is incomplete or finds content that is not cleared for public disclosure; do not silently rewrite history. Preserve the frozen release checkout. If another change is integrated, rerun affected validation and review the new exact SHA.
2. For this standalone candidate, confirm the working tree is clean, its sole parent is `fa49a0f1173c3d1896bf9b796c6b2d9ef78bc399`, and its six-file diff contains only the three guards, the new publication plan and the two append-only status notes. For any later combined candidate, establish a new independently reviewed base, exact SHA, intended file set and complete diff; the standalone parent and six-file assertions do not apply to a combined composition. Check all three JSON files still contain the literal boolean false. Recheck publication, marketing-boundary, dependency and current-tree secret scans without treating them as replacements for Step 1 history review.
3. Recheck GitHub repository ID, visibility and default branch, the current Vercel Git-linked project inventory/roots, and the absence of the intended new branch `codex/source-publication-guard-20261107`. STOP before any push unless actual GitHub artifact and cache controls, or other independently verified billing evidence, establish that the triggered workflows cannot create unauthorized paid overage. Standard public runner compute, low current usage and short artifact retention do not resolve this gate. The current cache/artifact cost gate remains unresolved as detailed below. Do not add skip-CI markers or change workflows, limits or budgets to bypass it without separate discussion and authorization. Do not change the default branch, Git links or build settings. The inherited local `origin` is an integration checkout, not GitHub; do not use it as the publication destination.
4. Determine the exact reviewed SHA with `git rev-parse HEAD`. Read-only `git ls-remote https://github.com/Kara221219/kxra-os.git refs/heads/codex/source-publication-guard-20261107` must return no matching ref before creation. Stop if the branch already exists; do not overwrite it.
5. Publish only that exact SHA to that one new branch using the explicit GitHub URL. Use an empty expected-value lease to reject a concurrent branch creation: `git push --porcelain --force-with-lease=refs/heads/codex/source-publication-guard-20261107: https://github.com/Kara221219/kxra-os.git REVIEWED_SHA:refs/heads/codex/source-publication-guard-20261107`. Replace `REVIEWED_SHA` with the independently reviewed full commit hash. This narrowly scoped lease requires the destination ref to be absent; never substitute blanket `--force`, `--all` or `--mirror`, and do not push an unguarded ancestor first. Do not create a separate remote branch at the base commit before pushing the guarded tip.
6. Read the remote ref back and require exact SHA equality. If the push outcome is uncertain, inspect the ref before any retry. Read GitHub checks/workflow runs and Vercel deployment inventory for that exact SHA in all currently linked projects. A missing deployment record immediately after a push is not final proof: repeat observation after Git integration processing has settled and retain the timestamps and results. If unexpected Vercel activity appears, stop further publication and report the exact state; cancellation or other provider action is a separate permission decision.
7. Report source publication and CI separately. Do not call source publication a deployment, a release, production readiness or customer acceptance. Do not merge, promote, attach domains or deploy as a side effect. Opening a pull request, if later authorized, should be draft and triggers its own workflow checks.

## GitHub workflow and cost implications

The unchanged CI and CodeQL workflows run on `codex/**` pushes and pull requests using standard `ubuntu-24.04` runners. Therefore this planned branch push triggers both workflows; the Vercel guard does not suppress GitHub Actions. CodeQL also has a Monday schedule, which runs from the default branch. Both workflows use pinned action commits. CI installs locked dependencies and Chromium, runs synthetic/local verification and audits, caches npm dependencies, and retains validated failure summaries for one day only on failure. None of these workflow definitions performs a Vercel deployment.

GitHub documents standard hosted runner compute as free for public repositories. Do not generalize that fact into a guarantee that all optional services or storage settings cost nothing. In particular, GitHub documents separate artifact/cache allowances and that cache overage is chargeable if its configured limit exceeds the included allowance. Any wider no-overage certification requires the relevant actual account controls or avoiding chargeable activity, not merely a public repository or a previous zero bill. This is an explicit pre-push STOP gate, not an optional post-publication check.

The current GitHub connector exposes repository metadata and workflow resources, but does not list repository cache-limit or account billing-budget reads among its permitted endpoints. GitHub documents `GET /repos/{owner}/{repo}/actions/cache/storage-limit`, which returns `max_cache_size_gb`; that endpoint is not supported by the available connector allowlist. No unsupported endpoint or alternate credential route was attempted. Actual cache limits and artifact paid-overage controls remain unverified. Resolving cache limits alone would not clear an independently unresolved artifact-storage gate.

## Deployment and spending remain separate

The guards disable only Git-triggered Vercel deployments evaluated with this source configuration. They do not disable manual CLI/API deployments, existing deployments, runtime traffic, schedules, provider usage or other branches whose source lacks these guards. They are not a spend cap and do not activate application features.

A later local `vercel build` plus `vercel deploy --prebuilt` avoids remote compilation, but publishing the output still creates a hosted deployment and can incur storage/runtime/provider usage. Target-specific settings and build-time variables must be verified separately; source guards do not make an artifact suitable for production.

The live team budget inspected for this review was an active USD 50 on-demand budget, `pause: false`; every 50/75/100 percent threshold had `pauseUsage: false`. It is notification-only. Vercel's documented spend checks occur every few minutes, so even automatic production pausing can lag threshold crossing. Pro budgets cover metered usage after included credit and exclude seats, integrations and separate add-ons. Existing controls do not guarantee literal zero paid overage. No paid deployment or spending authority is created by this source-only plan.

## Verification and review status

Local validation results and exact candidate SHA are supplied in the review handoff. Independent review and publication remain pending until explicitly recorded. No remote first-push behavior, hosted build or customer flow has been tested by this work. Existing local release acceptance is historical evidence for the base and is not represented as newly rerun on this guard commit.

## Official sources

- [Disable automatic Git deployments](https://vercel.com/docs/project-configuration/git-configuration#turning-off-all-automatic-deployments)
- [Per-app monorepo configuration](https://vercel.com/docs/monorepos)
- [Manual release workflow with Git auto-deploy disabled](https://vercel.com/kb/guide/can-you-deploy-based-on-tags-releases-on-vercel)
- [Ignored Build Step semantics](https://vercel.com/docs/project-configuration/project-settings#ignored-build-step)
- [Local Vercel build](https://vercel.com/docs/cli/build) and [prebuilt deployment](https://vercel.com/docs/cli/deploy#prebuilt)
- [Spend Management checks and scope](https://vercel.com/docs/spend-management)
- [Vercel pricing](https://vercel.com/pricing)
- [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- [Repository cache storage-limit API](https://docs.github.com/en/rest/actions/cache#get-github-actions-cache-storage-limit-for-a-repository)
- [Scheduled workflow behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onschedule)
