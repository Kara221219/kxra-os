import {
  createLiveWebhookHandler,
  liveWebhookConfiguration,
} from "../../../../../../packages/integrations/live-webhook";
import { recordLiveWebhookWakeup } from "../../../../../../packages/integrations/live-webhook-worker";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const POST = createLiveWebhookHandler({
  configuration: () => liveWebhookConfiguration(),
  record: recordLiveWebhookWakeup,
});
