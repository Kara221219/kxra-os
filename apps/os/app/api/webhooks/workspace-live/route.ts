import {
  createLiveWebhookHandler,
  liveWebhookConfiguration,
} from "../../../../../../packages/integrations/live-webhook";
import { recordLiveWebhookWakeup } from "../../../../../../packages/integrations/live-webhook-worker";
import { loadModernBillingScopeConfiguration } from "../../../../../../packages/integrations/modern-billing-db";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const POST = createLiveWebhookHandler({
  configuration: () => liveWebhookConfiguration(),
  record: recordLiveWebhookWakeup,
  loadExecutionScope: loadModernBillingScopeConfiguration,
});
