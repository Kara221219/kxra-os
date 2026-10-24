import crypto from "node:crypto";
import type { PublishedWorkspaceTermsCatalogue } from "./published-workspace-terms.server";
const path = "/legal/workspace-terms";
const headers = {
  "Content-Type": "text/plain; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy":
    "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
};
const entryKeys = [
  "text",
  "state",
  "publication_type",
  "owner_approval_reference",
  "owner_approved_at",
].sort();
function approvedBytes(
  value: unknown,
  digest: string,
): Uint8Array<ArrayBuffer> | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join("|") !== entryKeys.join("|")
  )
    return null;
  const entry = value as Record<string, unknown>;
  if (
    typeof entry.text !== "string" ||
    !entry.text.length ||
    entry.state !== "OWNER_APPROVED_FOR_PUBLICATION" ||
    entry.publication_type !== "PUBLIC_WORKSPACE_TERMS_TEXT" ||
    typeof entry.owner_approval_reference !== "string" ||
    !entry.owner_approval_reference.trim() ||
    entry.owner_approval_reference.length > 200 ||
    typeof entry.owner_approved_at !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(
      entry.owner_approved_at,
    )
  )
    return null;
  const approved = new Date(entry.owner_approved_at);
  if (
    !Number.isFinite(approved.getTime()) ||
    approved.toISOString() !== entry.owner_approved_at ||
    approved.getTime() > Date.now()
  )
    return null;
  const bytes = Buffer.from(entry.text, "utf8");
  // Reject invalid Unicode rather than substituting replacement bytes. Preserve
  // every approved newline/BOM/Unicode byte; no trimming or normalization.
  if (
    bytes.length > 200_000 ||
    bytes.toString("utf8") !== entry.text ||
    crypto.createHash("sha256").update(bytes).digest("hex") !== digest
  )
    return null;
  return new Uint8Array(bytes);
}
/** Pure handler port for synthetic publication tests. The app route binds only the
 * explicit empty server catalogue; no request/header/env injection path exists. */
export function workspaceTermsResponse(
  request: Request,
  catalogue: PublishedWorkspaceTermsCatalogue,
): Response {
  const missing = () =>
    new Response("Not found\n", {
      status: 404,
      headers: { ...headers, "Cache-Control": "no-store" },
    });
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return missing();
  }
  if (
    request.method !== "GET" ||
    url.pathname !== path ||
    url.hash ||
    !/^\?sha256=[a-f0-9]{64}$/.test(url.search)
  )
    return missing();
  const digest = url.search.slice("?sha256=".length);
  if (!Object.hasOwn(catalogue, digest)) return missing();
  const bytes = approvedBytes(catalogue[digest], digest);
  if (!bytes) return missing();
  return new Response(bytes, {
    status: 200,
    headers: {
      ...headers,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
