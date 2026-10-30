/** Owner direction30 October2026: customer-owned provider accounts and costs.
 * Product disclosure only; exact current workspace terms/publication remain a
 * separately reviewed legal artefact. No included credits or overages inferred.
 */
export const customerAiPolicy = Object.freeze({
  version: "CUSTOMER_BYOK_V1",
  billing:
    "AI credit is not included. Connect your own supported provider account and pay that provider directly for its usage.",
  dataFlow:
    "KXRA processes authorised content and sends it to your selected provider. Its terms, country availability and charges also apply.",
  keyHandling:
    "Keys are encrypted and omitted from connection listings. Never paste keys into room messages. Disconnect to stop new requests; revoke or rotate an exposed key with your provider.",
  acknowledgement:
    "I am authorised to use this provider account, and my business pays its charges directly.",
});
export type CustomerAiPolicy = typeof customerAiPolicy;
