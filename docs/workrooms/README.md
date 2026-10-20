# Workrooms and owner tools

Implementation checkpoint: 16 October 2026. Read ADR 0055 for permissions and retirement decisions. This document describes local code, not a production release.

## Use

1. Open **Workrooms**, then an assigned project. Start a discussion with a specific goal and evidence. Assigned contributors and owners can reply; viewers can read. Refresh to see replies from others.
2. Use the linked files, tasks and Ask KXRA tools with the same project scope. Download a discussion only when a handoff is useful. The export is a point-in-time copy: later revocation cannot recall an already downloaded file.
3. Owners open **Advisory Board**, enter a decision, two to five distinct options, evidence and constraints. Save the prepared prompt pack. No content is automatically sent to an AI provider.
4. Record reviewed scores from zero to five, identify whether the assessment is yours or an AI draft you reviewed, explain disagreements and state the next validation test. KXRA computes weighted totals. Ties require further evidence; results never approve execution.
5. **Operating Model** connects Context, Connections, Capabilities, Cadence, Control, Confidence, Compliance and Continuity to the existing registers.

## Research and provenance

External research, accessed 16 October 2026:

- [Kylon public product site](https://kylon.io): public examples of rooms, threads, shared context and visible agent activity informed the workroom concept. Public demonstrations are not evidence of hidden implementation, security or performance. KXRA uses original code and its existing permission architecture.
- [REA README](https://github.com/morluto/rea) and [browser observation documentation](https://github.com/morluto/rea/blob/main/docs/browser-observation.md): separate observations, source evidence and untested inference. The repository's [MIT licence](https://github.com/morluto/rea/blob/main/LICENSE) was inspected. No REA code was installed, executed or copied.
- [AI board of advisors](https://www.youtube.com/watch?v=7GTWAXCTy0o): transcript reviewed. Adopt structured dissent and reviewed comparisons; do not impersonate famous advisors or suggest they participated.
- [AI operating system](https://www.youtube.com/watch?v=K70Qf06XBLE): transcript reviewed. Apply context, connections, capabilities and cadence alongside KXRA's existing governance. Video statistics were not independently validated or adopted as facts.
- [Multiplayer agents](https://www.youtube.com/watch?v=KZiF2J83zaY): transcript reviewed; sponsored Kylon walkthrough. Use as a feature demonstration, not independent proof of outcomes.
- [REA review](https://www.youtube.com/watch?v=rL5tw6h78zo): title verified; transcript unavailable. Primary repository evidence used instead; no claims about unseen video content.

The four links appear in the private owner reference library. Full transcripts and third-party source code are not bundled in the application.

## Scope and remaining work

Implemented: persistent project discussions/replies, restricted handoff exports, private owner prompt packs, reviewed scoring, operating-model navigation, studio retirement.

Not implemented by this change: autonomous board deliberation, streamed agent replies, desktop-agent bridge, external app OAuth connections, agent sandbox execution, realtime presence or automatic recurring workroom execution. Existing agent/skill/routine registries remain in place; registry entries alone are not proof that a worker is connected.

Next useful increment: connect one existing approved provider adapter to one bounded read-only advisory run, validate its output, reserve a budget, recheck project access before retrieval, write real start/completion/failure logs, and require owner review before any action. Do not create simulated agent runs to make this appear complete.

## Retired studios

Both studio entrypoints now explain retirement. Their creation/generation APIs and new subscription checkout fail closed. Archived records, old implementation modules and billing history are preserved. Approved customer-document pack v1 remains unchanged for historical integrity; it does not establish that retired services remain offered. Review any active customer commitments and provider subscriptions before deploying this retirement. Do not silently cancel or replace them.

Current bounds: 100 most recent discussions per project, first 200 replies per discussion and 50 most recent owner reviews. There is no pagination in this increment. Use bounded follow-up discussions; extend pagination before high-volume use.

## Release status

This increment has not been deployed. Earlier hosted acceptance evidence does not certify these new changes. Deployment requires a new release review and smoke tests of the selected environment; no existing release attestation is treated as approval for this change.

Verification details are recorded in [verification.md](verification.md). Historical staging founding-plan operators still describe the former studio offer; do not use them to reactivate sales during this retirement.
