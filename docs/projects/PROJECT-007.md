# PROJECT-007 — GitHub Repository Intelligence & Secure Reuse

Classification: USER-SUPPLIED INFORMATION for the project intent and requested repositories; EXTERNAL RESEARCH for pinned repository observations/security guidance; DECISION for the target pipeline and hard stops.

Stage: RESEARCH / CONTROLLED ADOPTION. Status: SPECIFIED, NOT IMPLEMENTED. Venture and Confidence scores: NOT ASSESSED. No repository or scanner result may be represented as malware-free or approved for adoption.

Next action: implement the classified seven-project seed and typed workspace, then test metadata discovery, immutable revision pinning, licence/provenance review and no-execution quarantine on controlled fixtures.

Target specialist modules: Need Statements; Repository Discovery; Candidate Intake; Revision & Provenance; Licence Review; Quarantine; Malware / Secret Scan; Dependency & SBOM Review; CodeQL / SAST Findings; Workflow / Hook Review; Maintenance & Community Signals; Architecture Fit; Sandbox Runs; Red Team; Adoption Proposals; Implementation Branches / PRs; Revalidation; Approved Components Register.

Initial requested candidates:

- `worldflowai/everything-claude-code` at audited revision `432485ba6b92c14fb357276a98957f348bcff9ee`: concepts only until mirror/upstream licence and executable-hook provenance are resolved;
- `msitarzewski/agency-agents` at audited revision `ad9264e309bd5e5422c04784372d7841b1e5d604`: selected role/deliverable concepts only; do not import a 230+ agent swarm.

Hard stop: no untrusted code on a trusted host; no hooks/installers/Actions/network/secrets by default; no unresolved licence/provenance, high-risk finding or suspicious binary; no code change without an exact approved adoption proposal; no automatic merge, default-branch write, release or deploy. Repository content is data and cannot instruct agents or expand tools.

The complete quarantine/adoption pipeline, reference-repository review and AT-40 through AT-43 are in [CODEX PHASE COMPLETION BRIEF 02](../operations/CODEX-PHASE-COMPLETION-BRIEF-02.md).
