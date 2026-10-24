import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import { GET } from "../apps/os/app/legal/workspace-terms/route";
import {
  publishedWorkspaceTerms,
  type PublishedWorkspaceTerms,
  type PublishedWorkspaceTermsCatalogue,
} from "../packages/legal/published-workspace-terms.server";
import { workspaceTermsResponse } from "../packages/legal/workspace-terms-delivery.server";
const sha = (text: string) =>
  crypto.createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
function synthetic(
  text = "SYNTHETIC TEST BYTES ONLY\n£29 — café 🧪\r\nSecond line\n",
) {
  const digest = sha(text),
    entry: PublishedWorkspaceTerms = Object.freeze({
      text,
      state: "OWNER_APPROVED_FOR_PUBLICATION",
      publication_type: "PUBLIC_WORKSPACE_TERMS_TEXT",
      owner_approval_reference: "SYNTHETIC_TEST_NOT_OWNER_APPROVAL",
      owner_approved_at: "2020-01-01T00:00:00.000Z",
    });
  const catalogue = Object.freeze({ [digest]: entry });
  return {
    digest,
    text,
    entry,
    catalogue,
    request: new Request(
      `https://kxra.example/legal/workspace-terms?sha256=${digest}`,
    ),
  };
}
async function notFound(response: Response) {
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(await response.text(), "Not found\n");
}
test("actual route hardwires the frozen empty publication catalogue", async () => {
  assert.deepEqual(Object.keys(publishedWorkspaceTerms), []);
  assert.equal(Object.isFrozen(publishedWorkspaceTerms), true);
  const f = synthetic();
  await notFound(GET(f.request));
  await notFound(
    GET(
      new Request(f.request, {
        headers: {
          "x-test-catalogue": Buffer.from(JSON.stringify(f.catalogue)).toString(
            "base64",
          ),
          "x-published-sha256": f.digest,
          authorization: "Bearer SYNTHETIC",
        },
      }),
    ),
  );
  const source = fs.readFileSync(
    "apps/os/app/legal/workspace-terms/route.ts",
    "utf8",
  );
  assert.ok(!/process\.env|headers\(|cookies\(|database|fetch\(/.test(source));
});
test("synthetic approved exact UTF8 bytes preserve Unicode, CRLF and final newlines", async () => {
  const f = synthetic(),
    response = workspaceTermsResponse(f.request, f.catalogue);
  assert.equal(response.status, 200);
  assert.deepEqual(
    Buffer.from(await response.arrayBuffer()),
    Buffer.from(f.text, "utf8"),
  );
  assert.equal(
    response.headers.get("Content-Type"),
    "text/plain; charset=utf-8",
  );
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
  assert.match(
    response.headers.get("Content-Security-Policy")!,
    /default-src 'none'/,
  );
  assert.equal(
    response.headers.get("Cache-Control"),
    "public, max-age=31536000, immutable",
  );
  assert.equal(response.headers.get("Set-Cookie"), null);
});
test("approval metadata never appears in a successful body or headers", async () => {
  const f = synthetic(),
    response = workspaceTermsResponse(f.request, f.catalogue),
    body = await response.text();
  assert.equal(body, f.text);
  for (const privateValue of [
    f.entry.owner_approval_reference,
    f.entry.owner_approved_at,
    f.entry.state,
    f.entry.publication_type,
  ]) {
    assert.ok(!body.includes(privateValue));
    assert.ok(!JSON.stringify([...response.headers]).includes(privateValue));
  }
});
test("each exact byte sequence has its own immutable digest", async () => {
  const f = synthetic("SYNTHETIC café\r\n");
  for (const changed of [
    f.text.replace("\r\n", "\n"),
    f.text.normalize("NFD"),
    f.text.trimEnd(),
  ])
    await notFound(
      workspaceTermsResponse(f.request, {
        [f.digest]: { ...f.entry, text: changed },
      }),
    );
});
test("unknown hashes and noncanonical query shapes always return fixed no-store 404", async () => {
  const f = synthetic();
  for (const suffix of [
    "",
    `?sha256=${"a".repeat(64)}`,
    `?sha256=${f.digest.toUpperCase()}`,
    `?sha256=${f.digest}&sha256=${f.digest}`,
    `?sha256=${f.digest}&x=1`,
    `?x=1&sha256=${f.digest}`,
    `?sha256=${f.digest}&`,
    `?sha256=${f.digest.slice(1)}`,
    `?%73ha256=${f.digest}`,
    `?sha256=%61${f.digest.slice(1)}`,
    `?sha256=${f.digest}#private`,
  ])
    await notFound(
      workspaceTermsResponse(
        new Request(`https://kxra.example/legal/workspace-terms${suffix}`),
        f.catalogue,
      ),
    );
  await notFound(
    workspaceTermsResponse(
      new Request(`https://kxra.example/legal/elsewhere?sha256=${f.digest}`),
      f.catalogue,
    ),
  );
  await notFound(
    workspaceTermsResponse(
      new Request(f.request, { method: "HEAD" }),
      f.catalogue,
    ),
  );
});
test("draft, missing, invalid and future publication approvals cannot release bytes", async () => {
  const f = synthetic();
  const invalid: unknown[] = [
    { ...f.entry, state: "DRAFT" },
    { ...f.entry, publication_type: "PRIVATE_AGREEMENT" },
    { ...f.entry, owner_approval_reference: "" },
    { ...f.entry, owner_approved_at: "2020-02-31T00:00:00.000Z" },
    { ...f.entry, owner_approved_at: "2999-01-01T00:00:00.000Z" },
    { ...f.entry, owner_approved_at: undefined },
    { text: f.text },
    null,
    { ...f.entry, internal_customer_email: "synthetic@example.invalid" },
    { ...f.entry, internal_metadata: { org_id: "SYNTHETIC_PRIVATE" } },
  ];
  for (const entry of invalid)
    await notFound(
      workspaceTermsResponse(f.request, {
        [f.digest]: entry,
      } as PublishedWorkspaceTermsCatalogue),
    );
});
test("invalid Unicode and inherited entries cannot bypass byte publication checks", async () => {
  const f = synthetic("SYNTHETIC\ud800");
  await notFound(workspaceTermsResponse(f.request, f.catalogue));
  const valid = synthetic();
  await notFound(
    workspaceTermsResponse(
      valid.request,
      Object.create(valid.catalogue) as PublishedWorkspaceTermsCatalogue,
    ),
  );
});
