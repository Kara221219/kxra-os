/** Presentation only. Values must come from the server-resolved selected membership.
 * These labels confer no permissions and intentionally ignore the legacy role.
 */
export function workspacePresentation(context: {
  organisation_kind: string;
  security_role: string;
  relationship_type: string;
}) {
  if (
    context.organisation_kind === "KXRA" &&
    context.security_role === "KXRA_OWNER"
  )
    return { label: "Owner operations", heading: "Operating overview" };
  const labels: Record<string, string> = {
    INTERNAL: "Team workspace",
    PARTNER: "Partner workspace",
    CUSTOMER: "Customer workspace",
    CLIENT: "Client workspace",
  };
  return {
    label: Object.hasOwn(labels, context.relationship_type)
      ? labels[context.relationship_type]
      : "Your workspace",
    heading: "Your workspace",
  };
}

/** Navigation and copy only, never a write or billing permission. */
export function customerWorkspace(context: {
  organisation_kind: string;
  relationship_type: string;
}) {
  return (
    context.organisation_kind === "CUSTOMER" &&
    ["CUSTOMER", "CLIENT"].includes(context.relationship_type)
  );
}
