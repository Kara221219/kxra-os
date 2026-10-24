import { createBillingHttpHandler } from "../../../../../../packages/integrations/billing-http-controller";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Retain existing worker's60s ceiling:45s provider admission,10s receipt margin,1s body gate.
export const maxDuration = 60;
const handler = createBillingHttpHandler("dispatch");
export const GET = handler;
export const POST = handler;
export const HEAD = handler;
