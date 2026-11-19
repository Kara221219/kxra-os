import { readWebhookReconciliationStatus } from "../packages/integrations/billing-webhook-reconciliation";
async function main() {
  if (process.argv.slice(2).join(" ") !== "--once")
    throw Error("BILLING_RECONCILIATION_STATUS_USAGE");
  return readWebhookReconciliationStatus(process.env);
}
void main()
  .then((value) => console.log(JSON.stringify(value)))
  .catch((error: unknown) => {
    const code = error instanceof Error ? error.message : "";
    console.error(
      code === "BILLING_RECONCILIATION_STATUS_DISABLED"
        ? "Webhook reconciliation status is disabled; billing remains unchanged."
        : code === "BILLING_RECONCILIATION_STATUS_USAGE"
          ? "Use --once for read-only webhook reconciliation status."
          : "Webhook reconciliation status unavailable; no event was assigned or billing enabled.",
    );
    process.exitCode = 1;
  });
