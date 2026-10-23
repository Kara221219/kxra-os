import assert from "node:assert/strict";
import { parse } from "parse5";

// Inspect generated HTML with browser-compatible tokenization. Preserve original
// script-body bytes for CSP hashes; parsing must never normalize the payload.
export function scriptElements(html) {
  const document = parse(html, { sourceCodeLocationInfo: true });
  const pending = [document];
  const scripts = [];
  while (pending.length) {
    const node = pending.pop();
    if (node.tagName === "script") {
      assert.equal(
        node.namespaceURI,
        "http://www.w3.org/1999/xhtml",
        "Unsupported foreign script",
      );
      const location = node.sourceCodeLocation;
      assert(location?.startTag && location.endTag, "Unclosed static script");
      scripts.push({
        attributes: new Map(node.attrs.map(({ name, value }) => [name, value])),
        body: html.slice(
          location.startTag.endOffset,
          location.endTag.startOffset,
        ),
        start: location.startTag.startOffset,
        openingEnd: location.startTag.endOffset,
      });
    }
    // Template and noscript contents are inert with scripting enabled. parse5
    // keeps template content separate from childNodes; do not authorize it.
    pending.push(...(node.childNodes || []));
  }
  return scripts.sort((a, b) => a.start - b.start);
}

export function applyScriptIntegrity(html, manifest) {
  let result = html;
  for (const script of scriptElements(html).reverse()) {
    if (!script.attributes.has("src")) continue;
    const src = script.attributes.get("src");
    assert(src.startsWith("/_next/"), "Non-local static script");
    const asset = src.slice("/_next/".length).split(/[?#]/, 1)[0];
    const integrity = manifest[asset] || manifest[decodeURIComponent(asset)];
    assert(
      typeof integrity === "string" &&
        /^sha256-[A-Za-z0-9+/]+=*$/.test(integrity),
      "Missing static script integrity",
    );
    if (script.attributes.has("integrity")) {
      assert.equal(
        script.attributes.get("integrity"),
        integrity,
        "Conflicting static script integrity",
      );
      continue;
    }
    const tag = html.slice(script.start, script.openingEnd);
    const insertion = script.openingEnd - (tag.endsWith("/>") ? 2 : 1);
    result =
      result.slice(0, insertion) +
      ` integrity="${integrity}"` +
      result.slice(insertion);
  }
  return result;
}
