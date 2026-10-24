import {
  createStagingSandboxWebhookHandler,
  stagingSandboxWebhookConfiguration,
} from "../../../../../../packages/integrations/live-webhook";
import { recordStagingSandboxWebhookWakeup } from "../../../../../../packages/integrations/live-webhook-worker";
import { loadModernBillingScopeConfiguration } from "../../../../../../packages/integrations/modern-billing-db";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Private stage-only configuration defaults unavailable; no HTTP mode switch or provisioning. */
export const POST = createStagingSandboxWebhookHandler({
  configuration: () => stagingSandboxWebhookConfiguration(),
  loadExecutionScope: loadModernBillingScopeConfiguration,
  record: recordStagingSandboxWebhookWakeup,
});
