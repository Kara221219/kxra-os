import test from "node:test";
import assert from "node:assert/strict";
import {
  applyScriptIntegrity,
  scriptElements,
} from "../scripts/marketing-script-elements.mjs";

test("static script inspection follows HTML case, quote and end-tag tokenization", () => {
  for (const ending of [
    "</SCRIPT>",
    "</script >",
    "</script\t\n bar>",
    '</script extra=">">',
  ]) {
    const html = `<SCRIPT data-label=">" SRC = '/_next/static/a.js?dpl=x&amp;y=1'>${ending}<script data-src="inert">const raw = '&amp;';</script>`;
    const scripts = scriptElements(html);
    assert.equal(scripts.length, 2);
    assert.equal(
      scripts[0].attributes.get("src"),
      "/_next/static/a.js?dpl=x&y=1",
    );
    assert.equal(scripts[1].attributes.has("src"), false);
    assert.equal(scripts[1].body, "const raw = '&amp;';");
  }
});

test("inert HTML and script-like text cannot create static script authorizations", () => {
  const scripts = scriptElements(
    `<!-- <script>comment</script> --><textarea><script>text</script></textarea><noscript><script>fallback</script></noscript><template><script>template</script></template><script>real</script>`,
  );
  assert.deepEqual(
    scripts.map((s) => s.body),
    ["real"],
  );
  assert.throws(
    () => scriptElements("<script>unclosed"),
    /Unclosed static script/,
  );
  assert.throws(
    () => scriptElements("<svg><script>foreign</script></svg>"),
    /Unsupported foreign script/,
  );
});

test("SRI insertion preserves raw script bytes and rejects missing or conflicting integrity", () => {
  const integrity = "sha256-" + "A".repeat(43) + "=";
  const html = `<SCRIPT data-label=">" SRC='/_next/static/a.js?dpl=test'></script\t bar><script>const raw='&amp;';</script>`;
  const secured = applyScriptIntegrity(html, { "static/a.js": integrity });
  assert.equal(
    scriptElements(secured)[0].attributes.get("integrity"),
    integrity,
  );
  assert.equal(scriptElements(secured)[1].body, "const raw='&amp;';");
  assert.equal(
    applyScriptIntegrity(secured, { "static/a.js": integrity }),
    secured,
  );
  assert.throws(
    () => applyScriptIntegrity(html, {}),
    /Missing static script integrity/,
  );
  assert.throws(
    () =>
      applyScriptIntegrity(secured.replace(integrity, "sha256-other"), {
        "static/a.js": integrity,
      }),
    /Conflicting static script integrity/,
  );
  assert.throws(
    () =>
      applyScriptIntegrity(
        '<script src="https://example.invalid/a.js"></script>',
        {},
      ),
    /Non-local static script/,
  );
});
