import { publishedWorkspaceTerms } from "../../../../../packages/legal/published-workspace-terms.server";
import { workspaceTermsResponse } from "../../../../../packages/legal/workspace-terms-delivery.server";

export const runtime = "nodejs";
export function GET(request: Request) {
  return workspaceTermsResponse(request, publishedWorkspaceTerms);
}
