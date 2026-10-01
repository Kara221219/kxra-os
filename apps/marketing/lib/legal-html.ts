import type { LegalDocument } from "./legal";
import { legalDocument, legalPack } from "./legal";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function navigation(): string {
  return `<header class="site-header">
    <a class="mark" href="/">KXRA<span>GROUP</span></a>
    <nav aria-label="Primary navigation">
      <a href="/platform">Platform</a>
      <a href="/brand-studio">Brand Studio</a>
      <a href="/pricing">Pricing</a>
      <a href="/custom-projects">Custom projects</a>
      <a href="/industries">Industries</a>
      <a href="/about">About</a>
      <a href="/contact">Contact</a>
    </nav>
    <a class="header-login" href="/login">Sign in</a>
  </header>`;
}

function footer(): string {
  return `<footer class="site-footer">
    <div><strong>KXRA GROUP LTD</strong><p>Controlled systems for useful business work.</p></div>
    <nav aria-label="Legal navigation">
      <a href="/legal/privacy">Privacy</a>
      <a href="/legal/terms">Terms</a>
      <a href="/legal/cookies">Cookies</a>
      <a href="/legal">Customer documents</a>
    </nav>
    <p class="preview-note">Private build preview · publication is disabled</p>
  </footer>`;
}

function documentHtml(document: LegalDocument): string {
  const sections = document.sections
    .map(
      (section) => `<section>
        <h2>${escapeHtml(section.heading)}</h2>
        ${section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
      </section>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <meta name="description" content="${escapeHtml(document.summary)}">
    <title>${escapeHtml(document.title)} · KXRA Group</title>
    <link rel="stylesheet" href="/legal-documents.css">
  </head>
  <body>
    <a class="skip" href="#main">Skip to content</a>
    ${navigation()}
    <main id="main">
      <header class="page-hero">
        <p class="eyebrow">Owner review draft</p>
        <h1>${escapeHtml(document.title)}</h1>
        <p>${escapeHtml(document.summary)}</p>
      </header>
      <article class="section prose legal-document">
        <p class="notice">Draft version ${escapeHtml(String(legalPack.version))}, updated ${escapeHtml(legalPack.updatedAt)}. This document is not yet in force and cannot be accepted or used for live sales until the KXRA owner approves its exact version and hash.</p>
        <dl class="legal-meta">
          <div><dt>Entity</dt><dd>${escapeHtml(legalPack.entity.legalName)} · Company ${escapeHtml(legalPack.entity.companyNumber)}</dd></div>
          <div><dt>Audience</dt><dd>${escapeHtml(document.audience)}</dd></div>
        </dl>
        ${sections}
        <p>Related documents: <a href="/legal">customer document index</a>.</p>
      </article>
    </main>
    ${footer()}
  </body>
</html>`;
}

export function legalDocumentResponse(slug: LegalDocument["slug"]): Response {
  return new Response(documentHtml(legalDocument(slug)), {
    headers: {
      "Cache-Control":
        "private, no-cache, no-store, max-age=0, must-revalidate",
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
