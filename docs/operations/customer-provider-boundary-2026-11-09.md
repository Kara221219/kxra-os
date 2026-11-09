# Customer provider final-text boundary, 9 November 2026

## Scope and source

Local isolated successor from accepted `29364435d2702e2cfe0f41e1e34d31bc0e8b828b`. Changes are limited to the customer BYOK response/enablement boundary, synthetic regressions and exact offline source-composition transitions. No UI, SQL, grants, migrations, credentials, host settings, endpoint activation, tool execution, payments or deployment changed.

The room caller already requests a draft and explicitly says no tools are available. Responses now require supported final text: Google `thought: true` text is omitted; Anthropic thinking/redacted-thinking blocks and supported OpenRouter reasoning details are omitted. Thought-only output fails. Actual tool/function/server-tool/executable/media payloads, malformed markers and unsupported mixed content fail instead of silently becoming a completed text draft. Known metadata, including final-text Google thought signatures, nullable no-action chat fields and documented reasoning metadata, remains compatible. Multiple unsolicited choices/candidates fail. Existing bounded nonempty-output checks, credential-echo rejection, sanitized error codes and no-retry behavior remain.

Current Gemini requests do **not** request thought summaries. The proof is synthetic parser behavior, not an observed live disclosure. A thought summary is not necessarily raw private chain-of-thought. Final text is still untrusted prose: these structural checks do not prove its truth, stop invented claims in prose, or authorize any action.

Exact server enablement is checked again after successful awaited admission/DNS boundaries, before decryption/dispatch and before returning responses. A disabled flag observed before HTTPS construction prevents that socket. Withdrawal after dispatch suppresses output but cannot undo the provider call or any provider charge. This is not an in-flight cancellation or provider billing acceptance.

## Historical source lineage

All historical release manifests remain byte-identical. The provider-only test helper anchors the complete original and successor byte sequences and preserves the exact historical provider snapshot for existing composition checks. The shared test helper is itself pinned by the paired composition, so a separate offline-only mapping permits exactly its reviewed successor and the hosted paired verifier's narrowly required successor. Original GitHub, paired and hosted-setup manifest hashes are checked before accepting either source transition. No arbitrary source normalization or changed expected pin can authorize another source. Tamper tests cover byte edits, append/truncation, changed paths, mapping mutation, rewritten pins and original-manifest changes, including the composed verification entry points. Canonical contained regular files are required; alias/parent/absolute paths and symlink escapes fail. The selected root must contain the same mapping implementation, and there is no supplied-byte override for offline source acceptance.

## Verification and limits

The focused command covers provider/admission behavior, both new transition suites and existing composition guards:

```sh
node --import tsx --test --test-concurrency=1 tests/team-provider.test.ts tests/admission/ai-admission.test.ts tests/provider-boundary-transition.test.ts tests/provider-composition-transition.test.ts tests/production-github-integration.test.ts tests/production-paired-composition.test.ts tests/production-payment-integration.test.ts tests/hosted-paired-setup-payload.test.ts
npm run typecheck
```

All provider inputs and keys are synthetic. HTTPS and DNS are stubbed for socket tests; no real provider request or credential is used. Coverage includes valid multi-part final text, reasoning-only and reasoning-plus-final envelopes, malformed/action combinations, refusal/truncation, empty/oversized/secret-bearing text, metadata compatibility, transport errors/timeouts, each late-withdrawal boundary, one-dispatch behavior and source-pin tampering. Formatting and exact final-head evidence are retained in the external handoff packet.

Independent source review and exact frozen-source verification remain separate from author checks. No native fixture, browser, heavy build, canonical CI, live provider, hosted acceptance or release authorization is claimed here. Unknown token usage still becomes zero under the existing contract; the saved-connection readiness label is unchanged. Those accounting/readiness issues, the separate platform model adapter and broader customer integration activation remain separate gaps.

## Official protocol references checked during review

- [Google Part fields and union](https://aistudio.google.com/api-reference/caching), including thought markers, signatures, part/speech metadata and separate tool/function/code/media payloads.
- [Gemini thinking configuration](https://ai.google.dev/gemini-api/docs/generate-content/thinking?hl=en), including explicitly requested thought summaries.
- [Anthropic thinking](https://platform.claude.com/docs/en/build-with-claude/thinking) and [server tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/server-tools), separating final text, thinking/redacted blocks and actual server actions.
- [OpenAI Chat Completions response reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create), including stop/refusal/action fields and nullable tool-call metadata.
- [OpenRouter reasoning](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens) and [OpenAPI schema](https://openrouter.ai/openapi.json), including final content, supported reasoning variants, nullable placeholders and the unsupported `reasoning.server_tool_call` action variant.
