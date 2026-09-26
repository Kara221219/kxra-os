# Outbound public-source threat model

The public-source contract treats URLs, DNS, redirects, headers and response bytes as hostile. It grants no instruction, tool, publication or project authority.

| Threat | Local control | Required staging evidence |
| --- | --- | --- |
| Loopback/private metadata access | Literal IP hosts are rejected; every resolved address must be globally routable | Attempt cloud metadata, private IPv4/IPv6, alternate encodings and DNS rebinding through the selected transport |
| Redirect crosses into a private target | Every redirect is reparsed, re-resolved and reauthorized | Exercise absolute, relative, scheme-changing and multi-hop redirects |
| DNS changes after authorization | Transport contract receives approved addresses and must pin the connection | Prove the selected transport pins DNS/TLS correctly and preserves hostname certificate verification |
| Credential or port smuggling | Userinfo, non-HTTPS and non-443 URLs fail | Repeat through proxy/CDN configuration |
| Infinite redirect or slow origin | Redirects and elapsed time are bounded | Verify provider/worker cancellation and retry policy |
| Oversized or executable response | Content type, declared length and actual bytes are capped | Stream-limit before buffering and scan/parse in an isolated worker |
| Response content becomes an instruction | Returned bytes are evidence only | Verify extraction and model prompts keep source content in an untrusted evidence channel |
| Sensitive URL/content enters telemetry | Telemetry contract has no URL/content fields | Inspect staging PostHog/Sentry envelopes |

The local resolver and fake pinned transport tests prove contract decisions. They do not prove the behavior of Vercel networking, a proxy, DNS provider, TLS stack or future extraction service.
