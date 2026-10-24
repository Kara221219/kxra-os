import { createBillingHttpHandler } from "../../../../../../packages/integrations/billing-http-controller";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
const handler = createBillingHttpHandler("refresh");
export const GET = handler;
export const POST = handler;
export const HEAD = handler;
