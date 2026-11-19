import { providerIdentity } from "../lib/provider-identity";
import type { CSSProperties } from "react";

const identityStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.5rem",
  minHeight: "2.5rem",
  maxWidth: "100%",
  verticalAlign: "middle",
  overflowWrap: "anywhere",
};
const markStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flex: "0 0 2.5rem",
  width: "2.5rem",
  height: "2.5rem",
  background: "#fff",
};

/** An identity label, never a connected/verified badge or an action control. */
export function ProviderIdentity({ provider }: { provider: string }) {
  const identity = providerIdentity(provider);
  return (
    <span style={identityStyle}>
      {identity.mark && (
        <span style={markStyle} aria-hidden="true">
          <img
            src={identity.mark.src}
            width={identity.mark.width}
            height={identity.mark.height}
            style={{ display: "block", maxWidth: "100%", objectFit: "contain" }}
            alt=""
            decoding="async"
          />
        </span>
      )}
      <span>{identity.label}</span>
    </span>
  );
}

export function ProviderIdentityNotice() {
  return (
    <p style={{ fontSize: "0.875rem", lineHeight: 1.5 }}>
      Provider names and logos identify services only, not a verified connection
      or endorsement. OpenAI marks belong to OpenAI; OpenRouter marks belong to
      OpenRouter.
    </p>
  );
}
