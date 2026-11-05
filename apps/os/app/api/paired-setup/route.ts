import { pairedSetupRoute } from "#kxra/paired-setup-runtime";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return pairedSetupRoute(request);
}
