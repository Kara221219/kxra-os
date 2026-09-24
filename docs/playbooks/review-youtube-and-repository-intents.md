# Review YouTube and repository intents

Use this playbook for local acceptance and later staging review. It does not authorize publication or code execution.

## PROJECT-006

1. Confirm the actor has current contributor access to PROJECT-006.
2. Create a content package with complete source, claim, script, red-team, storyboard, rights, voice, render, QA and metadata evidence.
3. Have a different current actor compare every claim and asset to the supplied evidence and review the exact SHA-256.
4. Reject if any required check is false, evidence is incomplete, rights are unresolved or the version has changed.
5. Confirm the channel binding is current. In local mode this remains synthetic evidence; it is not OAuth proof.
6. Create the idempotent intent and verify `adapter=DISABLED`, `delivery_state=NOT_SENT` and no provider call occurred.
7. On revision or disconnect, confirm the previous intent becomes withdrawn.

## PROJECT-007

1. Record the exact GitHub owner/name URL, branch, commit and tree hashes. Never use a floating branch as the analyzed identity.
2. Acquire archives only in an approved future quarantine adapter. Keep hooks, submodules, lifecycle scripts, Actions, network and secrets disabled.
3. Record exact scanner/tool versions, signature date, findings and licence/provenance state. Describe only the tested scope and residual risk.
4. Stop on ambiguous licence/provenance, secret or malware finding, failed dependency/SAST/workflow/binary checks, suspicious binary, or any high/critical finding.
5. Scope an adoption proposal to the minimum concept/component, attribution, architecture, threat model, tests and rollback.
6. Have a different current actor review the exact proposal version/hash.
7. Create the intent and verify `git_execution_state=NOT_STARTED` and merge/release/deploy are false.
8. Treat any later implementation as a separate reviewed branch/PR task with fresh revalidation.
