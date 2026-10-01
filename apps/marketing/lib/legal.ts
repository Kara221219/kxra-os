import pack from "../content/legal-draft-v1.json";

export type LegalDocument = (typeof pack.documents)[number];

export const legalPack = pack;

export function legalDocument(slug: LegalDocument["slug"]): LegalDocument {
  const document = pack.documents.find((entry) => entry.slug === slug);
  if (!document) throw new Error(`Unknown legal document: ${slug}`);
  return document;
}
