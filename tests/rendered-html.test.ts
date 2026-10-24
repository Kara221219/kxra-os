import assert from "node:assert/strict";
import test from "node:test";
import {
  renderedAnchorHrefs,
  renderedAbsoluteUrls,
} from "./support/rendered-html";

test("anchor assertion reads complete decoded href values", () => {
  const values = renderedAnchorHrefs(
    '<a href="https://kxra-group.com/contact">Contact</a><a href="/os?x=1&amp;y=2">Workspace</a>',
  );
  assert.deepEqual(values, ["https://kxra-group.com/contact", "/os?x=1&y=2"]);
  assert.equal(
    renderedAnchorHrefs(
      '<a href="https://kxra-group.com.evil.invalid/contact">Wrong</a>',
    ).some((value) => value === "https://kxra-group.com/contact"),
    false,
  );
});
test("URL rendering assertions inspect attributes, text and JSON script content", () => {
  const html =
    '<a href="https://checkout.stripe.com/session">Pay</a><span data-cache="https://checkout.stripe.com/other">https://checkout.stripe.com/text</span><script type="application/json">{"url":"https://checkout.stripe.com/cached"}</script>';
  assert.equal(
    renderedAbsoluteUrls(html).filter(
      (url) => url.hostname === "checkout.stripe.com",
    ).length,
    4,
  );
});
test("parsed host comparison rejects lookalikes and still sees nested URL strings", () => {
  const html =
    '<a href="https://checkout.stripe.com.evil.invalid/pay">Wrong</a><span data-cache="https://example.invalid?cached=https://checkout.stripe.com/hidden"></span>';
  const urls = renderedAbsoluteUrls(html);
  assert.equal(urls[0].hostname, "checkout.stripe.com.evil.invalid");
  assert.equal(
    urls.filter((url) => url.hostname === "checkout.stripe.com").length,
    1,
  );
});
