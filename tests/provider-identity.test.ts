import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { aiSetupProviders } from "../packages/admission/ai-setup-status";
import { providerIdentity } from "../apps/os/lib/provider-identity";

const require = createRequire(import.meta.url);
const componentSource = fs.readFileSync(
  "apps/os/components/ProviderIdentity.tsx",
  "utf8",
);
const compiled = ts.transpileModule(componentSource, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
}).outputText;
const scope = {
  exports: {} as {
    ProviderIdentity: ComponentType<{ provider: string }>;
    ProviderIdentityNotice: ComponentType;
  },
  require(name: string) {
    if (name === "react/jsx-runtime") return require(name);
    if (name === "../lib/provider-identity") return { providerIdentity };
    throw Error("Unexpected identity component dependency: " + name);
  },
};
vm.runInNewContext(compiled, scope);
const renderIdentity = (provider: string) =>
  renderToStaticMarkup(
    createElement(scope.exports.ProviderIdentity, { provider }),
  );

test("official images supplement readable provider labels without connection claims", () => {
  for (const provider of ["OPENAI", "OPENROUTER"]) {
    const identity = providerIdentity(provider);
    const html = renderIdentity(provider);
    assert.match(html, /alt=""/);
    assert.match(html, /aria-hidden="true"/);
    assert.match(html, /width="\d+" height="\d+"/);
    assert.ok(html.includes(`src="${identity.mark!.src}"`));
    assert.ok(html.includes(identity.label));
    assert.doesNotMatch(html, /<button|<a\s|connected|verified|partner/i);
  }
  assert.match(renderIdentity("OPENAI"), /OpenAI API/);
  assert.doesNotMatch(renderIdentity("OPENAI"), /ChatGPT/);
});

test("unapproved, consumer, compatible and synthetic identities remain honest text", () => {
  for (const provider of [
    "ANTHROPIC",
    "GOOGLE",
    "COMPATIBLE",
    "FIXTURE",
    "CHATGPT_SUBSCRIPTION",
  ]) {
    assert.equal(providerIdentity(provider).mark, undefined);
    assert.doesNotMatch(renderIdentity(provider), /<img|<svg/);
    assert.ok(
      renderIdentity(provider).includes(providerIdentity(provider).label),
    );
  }
});

test("unknown identifiers cannot create remote logo requests or inherit a known brand", () => {
  for (const provider of [
    "https://example.invalid/logo.svg",
    "__proto__",
    "constructor",
    "claude-via-compatible",
    "gpt-via-compatible",
    '<img src="https://example.invalid/tracker">',
    "",
  ]) {
    assert.equal(providerIdentity(provider).mark, undefined);
    assert.doesNotMatch(renderIdentity(provider), /<img|<svg/);
  }
  assert.match(renderIdentity(""), /Unknown provider/);
  assert.match(renderIdentity("<script>"), /&lt;script&gt;/);
});

test("notice attributes the marks and explicitly separates identity from authority", () => {
  const html = renderToStaticMarkup(
    createElement(scope.exports.ProviderIdentityNotice),
  );
  assert.match(html, /not a verified connection or endorsement/);
  assert.match(html, /OpenAI marks belong to OpenAI/);
  assert.match(html, /OpenRouter marks belong to OpenRouter/);
});

test("local official assets are unmodified, self-contained and provenance-backed", () => {
  const expected = {
    "openai-blossom-black.svg":
      "75c1e9fffa5e8c437bec1d67197a73992bca45d166c6ff23215185dea8fae92a",
    "openrouter-glyph-ink.svg":
      "91be6b8a91745f089bfe42b89a5cbcd4b666fca6473610f9a6c11a31bd7523bc",
  };
  const manifest = JSON.parse(
    fs.readFileSync("apps/os/public/providers/provenance.json", "utf8"),
  );
  assert.equal(manifest.assets.length, 2);
  for (const asset of manifest.assets) {
    const bytes = fs.readFileSync("apps/os/public/providers/" + asset.file);
    const hash = createHash("sha256").update(bytes).digest("hex");
    assert.equal(hash, expected[asset.file as keyof typeof expected]);
    assert.equal(hash, asset.sha256);
    assert.equal(bytes.byteLength, asset.bytes);
    assert.match(
      asset.sourceUrl,
      /^https:\/\/(cdn\.openai\.com|openrouter\.ai)\//,
    );
    assert.match(
      asset.guidelinesUrl,
      /^https:\/\/(openai\.com|openrouter\.ai)\/brand\/?$/,
    );
    assert.doesNotMatch(
      bytes.toString(),
      /<script|<foreignObject|<image|(?:href|onload|onclick)=|<!ENTITY/i,
    );
    assert.ok(bytes.toString().startsWith("<svg "));
    assert.equal(
      providerIdentity(asset.provider).mark?.src,
      "/providers/" + asset.file,
    );
  }
});

test("identification is presentation-only and retains the original asset canvas", () => {
  const html = renderIdentity("OPENAI");
  assert.match(html, /object-fit:contain/);
  assert.match(html, /background:#fff/);
  assert.doesNotMatch(
    html,
    /filter:|mask:|transform:|object-fit:cover|overflow:hidden/,
  );
  assert.doesNotMatch(
    componentSource,
    /fetch\(|useEffect|useState|localStorage|onClick|onLoad|https:\/\//,
  );
});

test("native provider options retain exact protocol values and remain text-only", () => {
  assert.deepEqual(
    [...aiSetupProviders],
    ["OPENAI", "ANTHROPIC", "GOOGLE", "OPENROUTER", "COMPATIBLE"],
  );
  for (const file of ["ModelConnections", "AiConnectionSetup"]) {
    const source = fs.readFileSync(`apps/os/components/${file}.tsx`, "utf8");
    assert.match(
      source,
      /<option key=\{p\} value=\{p\}>\s*\{providerIdentity\(p\)\.label\}\s*<\/option>/,
    );
    assert.doesNotMatch(source, /<option[^>]*>\s*<(img|svg|ProviderIdentity)/);
  }
  const setup = fs.readFileSync(
    "apps/os/components/AiConnectionSetup.tsx",
    "utf8",
  );
  assert.match(setup, /defaultValue=\{status\?\.provider \|\| "OPENAI"\}/);
  assert.match(setup, /disabled=\{Boolean\(status\)\}/);
  assert.match(
    setup,
    /provider: status\?\.provider \|\| data\.get\("provider"\)/,
  );
  assert.match(setup, /<ProviderIdentity provider=\{status\.provider\}/);
  const connections = fs.readFileSync(
    "apps/os/components/ModelConnections.tsx",
    "utf8",
  );
  assert.match(connections, /<ProviderIdentity provider=\{c\.provider\}/);
  assert.match(
    connections,
    /c\.enabled \? "Available to attached agents" : "Disabled"/,
  );
});
