/** Server-owned public publication catalogue. Intentionally EMPTY: no workspace
 * terms bytes or public publication approval have been supplied by the owner.
 * Adding an entry requires an explicit owner-reviewed source commit for the exact
 * UTF-8 bytes AND their public publication. Private legal_documents are unrelated.
 * Never populate this catalogue from requests, environment variables or a DB. */
export type PublishedWorkspaceTerms = Readonly<{
  text: string;
  state: "OWNER_APPROVED_FOR_PUBLICATION";
  publication_type: "PUBLIC_WORKSPACE_TERMS_TEXT";
  owner_approval_reference: string;
  owner_approved_at: string;
}>;
export type PublishedWorkspaceTermsCatalogue = Readonly<
  Record<string, PublishedWorkspaceTerms>
>;
export const publishedWorkspaceTerms: PublishedWorkspaceTermsCatalogue =
  Object.freeze({});
