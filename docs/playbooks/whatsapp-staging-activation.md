# WhatsApp staging activation playbook

Keep transport disabled until every step has evidence.

1. Create or select the Meta Business portfolio and WhatsApp Business Account owned by KXRA.
2. Add the intended business phone number, record its WABA id and phone-number id, and complete Meta business/display-name eligibility checks.
3. Create a least-privilege system user and store its token and app secret only in the staging provider secret store. Never paste them into chat or Git.
4. Register an HTTPS staging webhook. Verify Meta's challenge and every POST signature against the exact raw request bytes before any durable write.
5. Map the webhook worker to only the private pairing/ingress functions. It must not use a browser or service-role bypass for application data.
6. Configure allowlisted Meta media origins, strict size/type limits, private quarantine storage, trusted malware scanning and consent/retention rules before enabling media or voice.
7. Connect a scoped model policy only after project evidence retrieval and delivery-time reauthorization tests pass. Sol is ordinary; Astra requires separate owner approval and budget.
8. Add a disabled sender, then prove idempotency, revocation, takeover, ambiguous provider results and reconciliation in staging before enabling one test recipient.
9. Record provider ids, policy versions, test evidence, rollback owner and token-rotation date in the Asset/Risk/Decision registers.

Current local status: pairing and message authority pass; webhook, media, model and send transport are absent.
