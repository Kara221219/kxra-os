import { parseFragment, type DefaultTreeAdapterMap } from "parse5";
import assert from "node:assert/strict";

/** Privacy invariant over every rendered/cache byte, including comments and
 * escaped JSON. This is deliberately not URL sanitization or a host allowlist. */
export function assertNoRenderedCheckoutBytes(html: string): void {
  assert.equal(
    Buffer.from(html, "utf8").indexOf(
      Buffer.from("checkout.stripe.com", "ascii"),
    ),
    -1,
    "No checkout marker bytes are rendered or cached anywhere in HTML",
  );
}

type Node = DefaultTreeAdapterMap["node"];
function walk(html: string, visit: (node: Node) => void) {
  const inspect = (node: Node) => {
    visit(node);
    if ("childNodes" in node)
      for (const child of node.childNodes) inspect(child);
    if ("content" in node) inspect(node.content);
  };
  inspect(parseFragment(html));
}
export function renderedAnchorHrefs(html: string): string[] {
  const hrefs: string[] = [];
  walk(html, (node) => {
    if ("tagName" in node && node.tagName === "a") {
      const href = node.attrs.find((attribute) => attribute.name === "href");
      if (href) hrefs.push(href.value);
    }
  });
  return hrefs;
}
/** Extract URL candidates from parsed attributes/text, then compare parsed URL
 * components. This is a rendering assertion helper, never a host allowlist. */
export function renderedAbsoluteUrls(html: string): URL[] {
  const urls: URL[] = [];
  walk(html, (node) => {
    const values =
      "attrs" in node ? node.attrs.map((attribute) => attribute.value) : [];
    if (node.nodeName === "#text" && "value" in node) values.push(node.value);
    for (const value of values)
      for (const start of value.matchAll(/https?:\/\//g)) {
        const candidate = value.slice(start.index).split(/[\s"'<>]/, 1)[0];
        try {
          urls.push(new URL(candidate));
        } catch {
          /* Not a URL candidate. */
        }
      }
  });
  return urls;
}
