import { legalDocumentResponse } from "../../../lib/legal-html";

export function GET() {
  return legalDocumentResponse("custom-projects");
}
